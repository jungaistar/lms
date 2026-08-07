import { createInterface } from 'node:readline/promises';
import { config } from '../config.js';
import { getDb, now } from '../db/index.js';
import { parseArgs, requireArg } from './args.js';

/**
 * 사람 검토 단계. 여기를 통과하지 않은 초안은 제출 단계로 갈 수 없다.
 * AI 초안은 초안일 뿐이고, 최종 책임은 교수자에게 있다.
 */
async function main(): Promise<void> {
  const args = parseArgs();
  const courseId = requireArg(args, 'course', config.courseId);
  const reportNo = Number(requireArg(args, 'report'));

  const db = getDb();
  const drafts = db
    .prepare(
      `SELECT g.*, s.body, s.original_score, st.name
         FROM gradings g
         JOIN submissions s USING (course_id, report_no, report_seq, user_no)
         JOIN students st ON st.course_id = g.course_id AND st.user_no = g.user_no
        WHERE g.course_id=? AND g.report_no=? AND g.status='draft'
        ORDER BY g.user_no`,
    )
    .all(courseId, reportNo) as Array<Record<string, unknown>>;

  if (drafts.length === 0) {
    console.log('검토할 초안이 없습니다.');
    return;
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const approve = db.prepare(
    `UPDATE gradings SET final_score=?, final_feedback=?, status='approved', reviewed_by=?, reviewed_at=? WHERE id=?`,
  );
  const reject = db.prepare(`UPDATE gradings SET status='rejected', reviewed_at=? WHERE id=?`);

  const reviewer = (args['by'] as string) ?? 'professor';

  for (const [i, d] of drafts.entries()) {
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`[${i + 1}/${drafts.length}] ${d['name']} (${d['user_no']})`);
    console.log(`${'─'.repeat(60)}`);
    console.log(`제출물:\n${String(d['body'] ?? '').slice(0, 800)}\n`);
    console.log(`현재 LMS 점수 : ${d['original_score'] ?? '미채점'}`);
    console.log(`초안 점수     : ${d['draft_score']}`);
    console.log(`근거          : ${d['draft_reasoning']}`);
    console.log(`피드백        : ${d['draft_feedback']}`);
    console.log(`${'─'.repeat(60)}`);

    const input = await rl.question('Enter=승인 / 숫자=점수 수정 후 승인 / r=반려 / q=종료: ');
    const cmd = input.trim().toLowerCase();

    if (cmd === 'q') break;
    if (cmd === 'r') {
      reject.run(now(), d['id']);
      console.log('  → 반려');
      continue;
    }

    const score = cmd === '' ? Number(d['draft_score']) : Number(cmd);
    if (Number.isNaN(score)) {
      console.log('  → 인식할 수 없는 입력. 건너뜁니다.');
      continue;
    }

    approve.run(score, d['draft_feedback'], reviewer, now(), d['id']);
    console.log(`  → 승인 (${score}점)`);
  }

  rl.close();

  const approved = db
    .prepare(`SELECT COUNT(*) c FROM gradings WHERE course_id=? AND report_no=? AND status='approved'`)
    .get(courseId, reportNo) as { c: number };

  console.log(`\n승인 ${approved.c}건.`);
  console.log(`다음: npm run submit -- --report ${reportNo} --dry-run`);
  console.log('(첫 실행은 --limit 1 로 한 명만 처리해 보세요.)');
}

main().catch((e) => {
  console.error(`\n⛔ ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
