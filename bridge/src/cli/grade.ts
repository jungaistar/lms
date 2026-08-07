import { readFileSync, existsSync } from 'node:fs';
import { config } from '../config.js';
import { getDb, now } from '../db/index.js';
import { generateDraft, type Rubric } from '../grade/draft.js';
import { parseArgs, requireArg } from './args.js';

/**
 * 채점 초안 생성. LMS 에 접속하지 않는다 — 로컬에 수집된 데이터만 사용한다.
 * 생성 결과는 status='draft' 로 저장되며, 사람 검토 전에는 제출 단계로 갈 수 없다.
 */
async function main(): Promise<void> {
  const args = parseArgs();
  const courseId = requireArg(args, 'course', config.courseId);
  const reportNo = Number(requireArg(args, 'report'));

  const rubricPath = (args['rubric'] as string) ?? `./src/grade/rubrics/report-${reportNo}.md`;
  if (!existsSync(rubricPath)) {
    throw new Error(
      `루브릭 파일이 없습니다: ${rubricPath}\n` +
        `채점 기준은 사람이 직접 작성해야 합니다. src/grade/rubrics/TEMPLATE.md 를 복사해 만드세요.`,
    );
  }

  const criteria = readFileSync(rubricPath, 'utf8');
  const maxScore = Number(criteria.match(/만점\s*[:：]\s*(\d+)/)?.[1] ?? args['max'] ?? 100);

  const db = getDb();
  const report = db
    .prepare(`SELECT * FROM reports WHERE course_id=? AND report_no=?`)
    .get(courseId, reportNo) as Record<string, unknown> | undefined;
  if (!report) throw new Error(`과제 ${reportNo} 가 로컬에 없습니다. 먼저 npm run collect 를 실행하세요.`);

  const rubric: Rubric = {
    id: rubricPath,
    title: String(report['title']),
    maxScore,
    criteria,
  };

  const submissions = db
    .prepare(`SELECT * FROM submissions WHERE course_id=? AND report_no=? ORDER BY user_no`)
    .all(courseId, reportNo) as Array<Record<string, unknown>>;

  if (submissions.length === 0) throw new Error('수집된 제출물이 없습니다.');

  const upsert = db.prepare(
    `INSERT INTO gradings
       (course_id, report_no, report_seq, user_no, draft_score, draft_feedback, draft_reasoning,
        rubric_id, model, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?)
     ON CONFLICT (course_id, report_no, report_seq, user_no) DO UPDATE SET
       draft_score=excluded.draft_score,
       draft_feedback=excluded.draft_feedback,
       draft_reasoning=excluded.draft_reasoning,
       rubric_id=excluded.rubric_id,
       model=excluded.model,
       status='draft'
     WHERE gradings.status = 'draft'`,
    // 이미 승인·제출된 항목은 초안 재생성으로 덮이지 않는다.
  );

  console.log(`\n채점 초안 생성 — ${submissions.length}명 (만점 ${maxScore}점, 모델 ${config.anthropicModel})\n`);

  for (const s of submissions) {
    const userNo = String(s['user_no']);
    try {
      const draft = await generateDraft(rubric, {
        userNo,
        submittedAt: (s['submitted_at'] as string) ?? null,
        body: String(s['body'] ?? ''),
        attachments: JSON.parse(String(s['attachments'] ?? '[]')),
        currentScore: s['original_score'] as number | null,
        currentComment: String(s['original_comment'] ?? ''),
        rawHtml: '',
      });
      upsert.run(
        courseId, reportNo, s['report_seq'], userNo,
        draft.score, draft.feedback, draft.reasoning,
        rubric.id, config.anthropicModel, now(),
      );
      console.log(`  ${userNo}  ${draft.score}/${maxScore}`);
    } catch (e) {
      console.error(`  ${userNo}  ⛔ ${e instanceof Error ? e.message : e}`);
    }
  }

  console.log('\n⚠️  이건 초안입니다. LMS 에는 아무것도 쓰지 않았습니다.');
  console.log('다음: npm run review');
}

main().catch((e) => {
  console.error(`\n⛔ ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
