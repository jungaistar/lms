import Database from 'better-sqlite3';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';

const here = dirname(fileURLToPath(import.meta.url));

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;
  mkdirSync(dirname(config.dbPath), { recursive: true });
  db = new Database(config.dbPath);
  db.exec(readFileSync(join(here, 'schema.sql'), 'utf8'));
  return db;
}

export function now(): string {
  return new Date().toISOString();
}

export interface AuditEntry {
  action: string;
  courseId?: string;
  reportNo?: number;
  userNo?: string;
  before?: string;
  after?: string;
  result: 'ok' | 'failed' | 'skipped';
  detail?: string;
}

/** 모든 쓰기 시도를 기록한다. dry-run 도 기록한다 — 무엇을 하려 했는지가 중요하다. */
export function audit(e: AuditEntry): void {
  getDb()
    .prepare(
      `INSERT INTO audit_log (at, action, course_id, report_no, user_no, before_value, after_value, dry_run, result, detail)
       VALUES (@at, @action, @courseId, @reportNo, @userNo, @before, @after, @dryRun, @result, @detail)`,
    )
    .run({
      at: now(),
      action: e.action,
      courseId: e.courseId ?? null,
      reportNo: e.reportNo ?? null,
      userNo: e.userNo ?? null,
      before: e.before ?? null,
      after: e.after ?? null,
      dryRun: config.dryRun ? 1 : 0,
      result: e.result,
      detail: e.detail ?? null,
    });
}

/** 승인된 채점만 반환한다. 제출 단계는 이 함수 외의 경로로 대상을 고르지 말 것. */
export function approvedGradings(courseId: string, reportNo: number) {
  return getDb()
    .prepare(
      `SELECT g.*, s.original_score, st.name
         FROM gradings g
         JOIN submissions s USING (course_id, report_no, report_seq, user_no)
         JOIN students st ON st.course_id = g.course_id AND st.user_no = g.user_no
        WHERE g.course_id = ? AND g.report_no = ? AND g.status = 'approved'
        ORDER BY g.user_no`,
    )
    .all(courseId, reportNo) as Array<Record<string, unknown>>;
}
