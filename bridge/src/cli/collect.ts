import { config } from '../config.js';
import { LmsClient } from '../lms/client.js';
import { collectCourses } from '../collect/courses.js';
import { collectStudents, collectScoreItems } from '../collect/students.js';
import { collectReports, collectMarkList, collectSubmission } from '../collect/reports.js';
import { getDb, now } from '../db/index.js';
import { parseArgs, requireArg } from './args.js';

/**
 * 읽기 전용 수집. 이 명령은 LMS 의 어떤 데이터도 변경하지 않는다.
 * 완료 기준: LMS 에 다시 접속하지 않고도 로컬 데이터만으로 채점할 수 있다.
 */
async function main(): Promise<void> {
  const args = parseArgs();
  const client = new LmsClient();

  if (!(await client.checkSessionAlive())) {
    throw new Error('세션이 만료되었습니다. "npm run auth" 로 다시 로그인하세요.');
  }

  // --list 만 주면 담당 과목 목록만 보여준다 (course_id 확인용)
  if (args['list']) {
    for (const c of await collectCourses(client)) {
      console.log(`${c.courseId}  ${c.classNo}  ${c.title}`);
    }
    return;
  }

  const courseId = requireArg(args, 'course', config.courseId);
  const classNo = requireArg(args, 'class', config.classNo);
  const db = getDb();

  console.log(`수집 시작: ${courseId} / ${classNo}`);

  // 1) 학생 명단 + 평가항목
  const students = await collectStudents(client, courseId, classNo);
  console.log(`  학생 ${students.length}명`);

  const insertStudent = db.prepare(
    `INSERT OR REPLACE INTO students (course_id, user_no, name, dept) VALUES (?, ?, ?, ?)`,
  );
  db.prepare(
    `INSERT OR REPLACE INTO courses (course_id, class_no, term, title, collected_at) VALUES (?, ?, ?, ?, ?)`,
  ).run(courseId, classNo, courseId.slice(0, 6), args['title'] ?? courseId, now());
  for (const s of students) insertStudent.run(courseId, s.userNo, s.name, s.dept);

  try {
    const items = await collectScoreItems(client, courseId, classNo);
    const insertItem = db.prepare(
      `INSERT OR REPLACE INTO score_items (course_id, item_key, label, weight, max_score) VALUES (?, ?, ?, ?, ?)`,
    );
    for (const i of items) insertItem.run(courseId, i.itemKey, i.label, i.weight, i.maxScore);
    console.log(`  평가항목 ${items.length}개`);
  } catch (e) {
    // 평가기준 미설정이면 여기서 실패한다. 치명적이지 않으므로 경고만 남기고 계속.
    console.warn(`  ⚠️ 평가항목 수집 건너뜀: ${e instanceof Error ? e.message : e}`);
  }

  // 2) 과제 목록
  const reports = await collectReports(client, courseId, classNo);
  console.log(`  과제 ${reports.length}건`);
  const insertReport = db.prepare(
    `INSERT OR REPLACE INTO reports (course_id, report_no, report_seq, title, week, max_score, due_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const r of reports) {
    insertReport.run(courseId, r.reportNo, r.reportSeq, r.title, r.week, r.maxScore, r.dueAt);
  }

  // 3) 특정 과제만 상세 수집 (--report N). 전체를 한 번에 긁지 않는다.
  const only = args['report'];
  if (typeof only !== 'string') {
    console.log('\n제출물 상세를 받으려면 --report <report_no> 를 지정하세요.');
    return;
  }

  const reportNo = Number(only);
  const target = reports.find((r) => r.reportNo === reportNo);
  if (!target) throw new Error(`과제 ${reportNo} 를 찾을 수 없습니다.`);

  const marks = await collectMarkList(client, courseId, classNo, reportNo);
  const submitted = marks.filter((m) => m.submitted);
  console.log(`\n과제 ${reportNo} — 제출 ${submitted.length}/${marks.length}명`);

  const insertSubmission = db.prepare(
    `INSERT OR REPLACE INTO submissions
       (course_id, report_no, report_seq, user_no, submitted_at, body, attachments,
        original_score, original_comment, raw_html, collected_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  for (const m of submitted) {
    const d = await collectSubmission(client, courseId, classNo, reportNo, target.reportSeq, m.userNo);
    insertSubmission.run(
      courseId, reportNo, target.reportSeq, m.userNo,
      d.submittedAt, d.body, JSON.stringify(d.attachments),
      d.currentScore, d.currentComment, d.rawHtml, now(),
    );
    process.stdout.write(`  ${m.name} (${m.userNo}) 수집 완료\n`);
  }

  console.log('\n✅ 수집 완료. 다음: npm run grade -- --report ' + reportNo);
}

main().catch((e) => {
  console.error(`\n⛔ ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
