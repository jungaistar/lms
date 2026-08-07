import { chromium, type Page } from 'playwright';
import { createInterface } from 'node:readline/promises';
import { config, url } from '../config.js';
import { ENDPOINTS } from '../lms/endpoints.js';
import { approvedGradings, audit, getDb, now } from '../db/index.js';

/**
 * 점수 입력 — 이 프로젝트에서 유일한 쓰기 경로.
 *
 * 왜 API 를 직접 호출하지 않는가 (docs/03-architecture.md §3.3):
 *   (a) 저장 API 의 파라미터와 서버측 검증 로직을 파악하지 못했다.
 *       잘못 호출하면 성적이 0으로 덮이거나 다른 회차에 기록될 수 있다.
 *   (b) 학교 IT 정책상 비공식 API 호출이 허용되지 않을 수 있다.
 *
 * 그래서 사람이 하는 것과 동일하게 화면을 열고, 입력창을 채우고, 저장 버튼을 누른다.
 * 느리지만 성적 데이터에서는 느린 게 맞다.
 */

async function confirm(question: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`${question} [y/N] `);
  rl.close();
  return answer.trim().toLowerCase() === 'y';
}

export interface SubmitOptions {
  courseId: string;
  classNo: string;
  reportNo: number;
  /** true 면 저장 버튼을 누르지 않는다. config.dryRun 과 OR 로 결합된다. */
  dryRun?: boolean;
  /** 한 번에 처리할 최대 인원. 첫 실행은 반드시 1로 시작할 것. */
  limit?: number;
}

export async function submitScores(opts: SubmitOptions): Promise<void> {
  const dryRun = config.dryRun || opts.dryRun === true;
  const targets = approvedGradings(opts.courseId, opts.reportNo);

  if (targets.length === 0) {
    console.log('승인된(approved) 채점이 없습니다. 먼저 "npm run review" 로 검토·승인하세요.');
    return;
  }

  const queue = opts.limit ? targets.slice(0, opts.limit) : targets;
  console.log(`\n대상 ${queue.length}명${dryRun ? '  ⚠️  DRY RUN — 저장하지 않습니다' : '  🔴 실제 저장 모드'}\n`);

  const browser = await chromium.launch({ headless: false }); // 사람이 눈으로 확인해야 하므로 headless 금지
  const context = await browser.newContext({ storageState: config.authStatePath });
  const page = await context.newPage();

  try {
    for (const g of queue) {
      const userNo = String(g['user_no']);
      const name = String(g['name'] ?? '');
      const before = g['original_score'] as number | null;
      const after = g['final_score'] as number;

      await openMarkForm(page, opts, userNo, String(g['report_seq']));

      const shotPath = `./data/screenshots/${opts.reportNo}-${userNo}.png`;
      await page.screenshot({ path: shotPath, fullPage: true });

      console.log(`\n─── ${name} (${userNo}) ───`);
      console.log(`  현재 점수 : ${before ?? '미채점'}`);
      console.log(`  입력할 점수: ${after}`);
      console.log(`  피드백    : ${String(g['final_feedback'] ?? '').slice(0, 120)}`);
      console.log(`  화면 캡처  : ${shotPath}`);

      // 학생 단위 확인 — 이 프롬프트를 제거하지 말 것. (CLAUDE.md 규칙 4)
      if (!(await confirm('이 학생의 점수를 저장할까요?'))) {
        audit({ action: 'submit_score', courseId: opts.courseId, reportNo: opts.reportNo, userNo, result: 'skipped', detail: '사용자가 건너뜀' });
        console.log('  → 건너뜀');
        continue;
      }

      await fillScore(page, after, String(g['final_feedback'] ?? ''));

      if (dryRun) {
        audit({ action: 'submit_score', courseId: opts.courseId, reportNo: opts.reportNo, userNo, before: String(before), after: String(after), result: 'skipped', detail: 'dry-run' });
        console.log('  → DRY RUN: 입력까지만 하고 저장하지 않았습니다.');
        continue;
      }

      await clickSave(page);

      // 저장 후 검증 — 화면을 다시 읽어 의도한 값이 들어갔는지 확인한다.
      const verified = await verifySaved(page, after);
      audit({
        action: 'submit_score',
        courseId: opts.courseId,
        reportNo: opts.reportNo,
        userNo,
        before: String(before),
        after: String(after),
        result: verified ? 'ok' : 'failed',
        detail: verified ? undefined : '저장 후 값이 일치하지 않음',
      });

      if (!verified) {
        console.error('  ⛔ 저장 후 값이 일치하지 않습니다. 중단합니다. 화면을 직접 확인하세요.');
        break;
      }

      getDb()
        .prepare(`UPDATE gradings SET status='submitted', submitted_at=? WHERE id=?`)
        .run(now(), g['id']);
      console.log('  ✅ 저장 및 검증 완료');
    }
  } finally {
    await browser.close();
  }
}

// ── 화면 조작 (TODO(phase-5): 실제 마크업에 맞춰 셀렉터 고정) ──────────

async function openMarkForm(page: Page, opts: SubmitOptions, userNo: string, reportSeq: string): Promise<void> {
  const target = new URL(url(ENDPOINTS.reportSubmission.path));
  target.searchParams.set('course_id', opts.courseId);
  target.searchParams.set('class_no', opts.classNo);
  target.searchParams.set('report_no', String(opts.reportNo));
  target.searchParams.set('report_seq', reportSeq);
  target.searchParams.set('user_no', userNo);
  target.searchParams.set('gubun', 'mark');
  await page.goto(target.toString(), { waitUntil: 'domcontentloaded' });
}

async function fillScore(page: Page, score: number, feedback: string): Promise<void> {
  const scoreInput = page.locator('input[name*="score"]').first();
  await scoreInput.waitFor({ state: 'visible', timeout: 10_000 });
  await scoreInput.fill(String(score));

  if (feedback) {
    const commentBox = page.locator('textarea[name*="comment"]').first();
    if (await commentBox.count()) await commentBox.fill(feedback);
  }
}

async function clickSave(page: Page): Promise<void> {
  // 저장 버튼은 화면마다 문구가 다를 수 있다. 확인된 문구로 좁힐 것.
  await page.getByRole('button', { name: /저장|등록/ }).first().click();
  await page.waitForLoadState('networkidle');
}

async function verifySaved(page: Page, expected: number): Promise<boolean> {
  await page.reload({ waitUntil: 'domcontentloaded' });
  const value = await page.locator('input[name*="score"]').first().inputValue();
  return Number(value) === expected;
}
