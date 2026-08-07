import { readFileSync } from 'node:fs';
import { chromium, type Page } from 'playwright';
import { createInterface } from 'node:readline/promises';
import { config, url } from '../config.js';
import { ENDPOINTS } from '../lms/endpoints.js';
import { audit } from '../db/index.js';

/**
 * 동료평가 결과(CSV) → 학교 LMS 성적 입력.
 *
 * 이 파일이 이 저장소에서 학교 LMS 를 **바꾸는 유일한 경로**다.
 * 원칙은 bridge/README 와 같다: 저장 API 를 추측해 호출하지 않고,
 * 사람이 하는 것과 똑같이 화면을 열어 입력하고 저장 버튼을 누른다.
 *
 * ⚠️ 성적산출 화면(courseScoreManage)의 입력 마크업은 아직 확인하지 못했다.
 *    아래 TODO(selector) 지점은 화면을 직접 보고 채워야 한다.
 *    그 전까지는 --dry-run 으로만 쓰고, 실제 입력은 화면에서 직접 하세요.
 */

/**
 * 성적산출 화면의 입력 셀렉터를 실제로 확인하고 fillRow() 를 고친 뒤 true 로 바꾼다.
 * false 인 동안에는 어떤 값도 화면에 넣지 않는다 — 잘못된 칸에 성적을 쓰는 사고를 막기 위해.
 */
const SELECTORS_VERIFIED = false;

export interface CsvRow {
  studentNo: string;
  name: string;
  score: number;
}

/** 웹앱에서 내려받은 CSV 를 읽는다. 엑셀 호환 BOM 과 CRLF 를 모두 처리한다. */
export function parseGradeCsv(path: string): CsvRow[] {
  const text = readFileSync(path, 'utf8').replace(/^﻿/, '');
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lines.length < 2) throw new Error('CSV 에 데이터 줄이 없습니다.');

  const header = lines[0]!.split(',').map((h) => h.trim());
  const iNo = header.findIndex((h) => h.includes('학번'));
  const iName = header.findIndex((h) => h.includes('이름'));
  // "최종(100점)" 같은 헤더를 찾는다.
  const iScore = header.findIndex((h) => h.startsWith('최종'));
  if (iNo < 0 || iScore < 0) {
    throw new Error(`CSV 헤더에서 학번/최종 컬럼을 찾지 못했습니다: ${header.join(', ')}`);
  }

  return lines.slice(1).map((line, idx) => {
    const cols = line.split(',');
    const score = Number(cols[iScore]);
    if (!cols[iNo] || Number.isNaN(score)) {
      throw new Error(`${idx + 2}번째 줄을 읽을 수 없습니다: ${line}`);
    }
    return { studentNo: cols[iNo]!.trim(), name: (cols[iName] ?? '').trim(), score };
  });
}

async function confirm(q: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const a = await rl.question(`${q} [y/N] `);
  rl.close();
  return a.trim().toLowerCase() === 'y';
}

export interface PushOptions {
  csvPath: string;
  courseId: string;
  classNo: string;
  dryRun?: boolean;
  limit?: number;
}

export async function pushFromCsv(opts: PushOptions): Promise<void> {
  const dryRun = config.dryRun || opts.dryRun === true;
  const rows = parseGradeCsv(opts.csvPath);
  const queue = opts.limit ? rows.slice(0, opts.limit) : rows;

  console.log(`\n${opts.csvPath}`);
  console.log(`대상 ${queue.length}명${dryRun ? '  ⚠️  DRY RUN — 저장하지 않습니다' : '  🔴 실제 저장 모드'}\n`);
  for (const r of queue) console.log(`  ${r.studentNo}  ${r.name}  ${r.score}`);

  if (!(await confirm('\n이 내용으로 진행할까요?'))) return;

  const browser = await chromium.launch({ headless: false }); // 눈으로 확인해야 하므로 headless 금지
  const context = await browser.newContext({ storageState: config.authStatePath });
  const page = await context.newPage();

  try {
    const target = new URL(url(ENDPOINTS.scoreList.path));
    target.searchParams.set('course_id', opts.courseId);
    target.searchParams.set('class_no', opts.classNo);
    await page.goto(target.toString(), { waitUntil: 'domcontentloaded' });

    console.log('\n성적산출 화면을 열었습니다.');

    if (dryRun) {
      console.log('DRY RUN 이므로 여기서 멈춥니다. 화면 구조를 확인한 뒤');
      console.log('pushFromCsv.ts 의 TODO(selector) 지점을 채우세요.');
      await confirm('브라우저를 닫을까요?');
      return;
    }

    if (!SELECTORS_VERIFIED) {
      throw new Error(
        '성적산출 화면의 입력 셀렉터를 아직 확인하지 못했습니다.\n' +
          '화면을 열어 구조를 확인한 뒤 pushFromCsv.ts 의 fillRow() 를 실제 셀렉터로 고치고,\n' +
          'SELECTORS_VERIFIED 를 true 로 바꾸세요.\n' +
          '그 전까지는 CSV 를 보고 화면에서 직접 입력하시는 편이 안전합니다.',
      );
    }

    for (const r of queue) {
      const ok = await fillRow(page, r.studentNo, r.score);
      if (!ok) {
        console.error(`  ⛔ ${r.studentNo} 행을 화면에서 찾지 못했습니다. 중단합니다.`);
        audit({ action: 'push_grade', userNo: r.studentNo, result: 'failed', detail: '행 없음' });
        break;
      }
      console.log(`  ✅ ${r.studentNo} ${r.name} → ${r.score}`);
    }

    console.log('\n입력을 마쳤습니다. 화면에서 값을 확인한 뒤 저장 버튼을 직접 눌러 주세요.');
    await confirm('브라우저를 닫을까요?');
  } finally {
    await browser.close();
  }
}

/** TODO(selector): 실제 그리드 구조에 맞춰 구현할 것. */
async function fillRow(page: Page, studentNo: string, score: number): Promise<boolean> {
  const row = page.locator(`tr:has-text("${studentNo}")`).first();
  if ((await row.count()) === 0) return false;
  const input = row.locator('input[type="text"], input[type="number"]').last();
  await input.fill(String(score));
  audit({ action: 'push_grade', userNo: studentNo, after: String(score), result: 'ok' });
  return true;
}
