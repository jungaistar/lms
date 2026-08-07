-- LMS 채점 보조 도구 로컬 스키마
-- 이 DB에는 실제 학생 데이터가 들어갑니다. data/ 는 .gitignore 처리되어 있습니다.

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ── 과목 ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS courses (
  course_id   TEXT PRIMARY KEY,          -- 학기+과목코드+분반 (예: 202610UN0060****Y2)
  class_no    TEXT NOT NULL,             -- 분반코드 (Y1~Y6)
  term        TEXT NOT NULL,             -- course_id 앞 6자리. 학기 전환 시 필터 기준
  title       TEXT NOT NULL,
  collected_at TEXT NOT NULL
);

-- ── 학생 ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS students (
  course_id  TEXT NOT NULL REFERENCES courses(course_id) ON DELETE CASCADE,
  user_no    TEXT NOT NULL,              -- 학번
  name       TEXT NOT NULL,
  dept       TEXT,
  PRIMARY KEY (course_id, user_no)
);

-- ── 평가항목 (doGetPageInfo.dunet) ──────────────────────
CREATE TABLE IF NOT EXISTS score_items (
  course_id  TEXT NOT NULL REFERENCES courses(course_id) ON DELETE CASCADE,
  item_key   TEXT NOT NULL,              -- 항목 식별자
  label      TEXT NOT NULL,              -- 출석/과제/중간/기말 등
  weight     REAL,                       -- 가중치(%)
  max_score  REAL,
  PRIMARY KEY (course_id, item_key)
);

-- ── 과제 ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reports (
  course_id   TEXT NOT NULL REFERENCES courses(course_id) ON DELETE CASCADE,
  report_no   INTEGER NOT NULL,
  report_seq  INTEGER NOT NULL,
  title       TEXT NOT NULL,
  week        INTEGER,
  max_score   REAL,
  due_at      TEXT,
  PRIMARY KEY (course_id, report_no, report_seq)
);

-- ── 제출물 ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS submissions (
  course_id      TEXT NOT NULL,
  report_no      INTEGER NOT NULL,
  report_seq     INTEGER NOT NULL,
  user_no        TEXT NOT NULL,
  submitted_at   TEXT,
  body           TEXT,                   -- 제출 본문
  attachments    TEXT,                   -- JSON 배열: [{name, url, localPath}]
  -- 손대기 전 LMS의 현재 점수. 되돌릴 때의 기준값이므로 덮어쓰지 말 것.
  original_score REAL,
  original_comment TEXT,
  raw_html       TEXT NOT NULL,          -- 원본 스냅샷. 파서만 고쳐 재처리할 수 있게 보존
  collected_at   TEXT NOT NULL,
  PRIMARY KEY (course_id, report_no, report_seq, user_no),
  FOREIGN KEY (course_id, report_no, report_seq)
    REFERENCES reports(course_id, report_no, report_seq) ON DELETE CASCADE
);

-- ── 채점 초안 / 승인 ────────────────────────────────────
CREATE TABLE IF NOT EXISTS gradings (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  course_id      TEXT NOT NULL,
  report_no      INTEGER NOT NULL,
  report_seq     INTEGER NOT NULL,
  user_no        TEXT NOT NULL,

  draft_score    REAL,                   -- AI 초안 점수
  draft_feedback TEXT,
  draft_reasoning TEXT,                  -- 왜 이 점수인지 — 사람 검토의 근거
  rubric_id      TEXT,
  model          TEXT,

  final_score    REAL,                   -- 사람이 확정한 점수
  final_feedback TEXT,

  -- draft: 초안 생성됨 / approved: 사람이 승인 / submitted: LMS 반영 완료 / rejected: 반려
  status         TEXT NOT NULL DEFAULT 'draft'
                 CHECK (status IN ('draft','approved','submitted','rejected')),
  reviewed_by    TEXT,
  reviewed_at    TEXT,
  submitted_at   TEXT,
  created_at     TEXT NOT NULL,

  UNIQUE (course_id, report_no, report_seq, user_no),
  FOREIGN KEY (course_id, report_no, report_seq, user_no)
    REFERENCES submissions(course_id, report_no, report_seq, user_no) ON DELETE CASCADE
);

-- ── 감사 로그 ───────────────────────────────────────────
-- 모든 쓰기 시도(성공/실패/dry-run 모두)를 기록한다.
CREATE TABLE IF NOT EXISTS audit_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  at          TEXT NOT NULL,
  action      TEXT NOT NULL,             -- submit_score / verify / abort 등
  course_id   TEXT,
  report_no   INTEGER,
  user_no     TEXT,
  before_value TEXT,
  after_value  TEXT,
  dry_run     INTEGER NOT NULL,
  result      TEXT NOT NULL,             -- ok / failed / skipped
  detail      TEXT
);

CREATE INDEX IF NOT EXISTS idx_gradings_status ON gradings(status);
CREATE INDEX IF NOT EXISTS idx_submissions_report ON submissions(course_id, report_no, report_seq);
CREATE INDEX IF NOT EXISTS idx_audit_at ON audit_log(at);
