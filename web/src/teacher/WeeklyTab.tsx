import { useCallback, useEffect, useMemo, useState } from 'react';
import { teacherClient } from '../lib/supabase';
import { downloadCsv, downloadXlsx, printTable, type SheetTable } from '../lib/exporters';
import {
  ABSENCE_LABEL,
  TASK_MISS_LABEL,
  absences,
  hasReachablePhone,
  phoneText,
  summarize,
  taskMisses,
  type WeeklyStudent,
} from '../lib/weekly';
import type {
  AttendanceRow,
  CourseSession,
  CourseWeek,
  Student,
  StudentContact,
  Task,
  TaskSubmission,
} from '../lib/types';
import type { MenuKey } from './adminMenu';
import { errText } from '../lib/errors';

/**
 * 주차별 명단 — 안 낸 사람 · 안 온 사람 · 전화번호.
 *
 * 주차를 하나 고르면 그 주의 과제 미제출과 결석을 한 화면에 모으고,
 * 줄마다 전화번호를 붙인다. 지금까지 이걸 하려면 화면 셋(과제 관리 ·
 * 출석 관리 · 연락처 관리)을 오가며 학번으로 눈대중 맞춰야 했다.
 *
 * **출결 미기록을 결석과 섞지 않는다.** 아직 출석을 안 부른 회차를 결석으로
 * 보고 학생에게 연락하면 그 한 번으로 신뢰를 잃는다. 화면에서도 파일에서도
 * 따로 둔다. 판정 규칙은 `lib/weekly.ts` 에 있고 시험이 붙어 있다.
 */
export default function WeeklyTab({
  courseId,
  courseTitle,
  onGo,
}: {
  courseId: string;
  courseTitle: string;
  onGo: (key: MenuKey) => void;
}) {
  const [weeks, setWeeks] = useState<CourseWeek[]>([]);
  const [weekId, setWeekId] = useState('');
  const [students, setStudents] = useState<Student[]>([]);
  const [contacts, setContacts] = useState<StudentContact[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [subs, setSubs] = useState<TaskSubmission[]>([]);
  const [sessions, setSessions] = useState<CourseSession[]>([]);
  const [att, setAtt] = useState<AttendanceRow[]>([]);
  const [onlyContact, setOnlyContact] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // ── 과목 단위로 한 번만 받는 것 ───────────────────────────
  const loadCourse = useCallback(async () => {
    setLoading(true);
    try {
      const [w, s, c] = await Promise.all([
        teacherClient.from('course_weeks').select('*').eq('course_id', courseId).order('week_no'),
        teacherClient.from('students').select('*').eq('course_id', courseId).eq('active', true).order('student_no'),
        teacherClient.from('student_contacts').select('*').eq('course_id', courseId),
      ]);
      if (w.error) throw w.error;
      if (s.error) throw s.error;
      const wl = (w.data ?? []) as CourseWeek[];
      setWeeks(wl);
      setStudents((s.data ?? []) as Student[]);
      // 연락처 표는 0012 가 안 올라간 프로젝트에는 아예 없다. 없으면 번호만 빈다.
      setContacts(c.error ? [] : ((c.data ?? []) as StudentContact[]));
      setWeekId((prev) => prev || wl[0]?.id || '');
    } catch (e) {
      setError(errText(e, '주차 정보를 불러오지 못했습니다.'));
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    loadCourse();
  }, [loadCourse]);

  // ── 고른 주차만 받는 것 ──────────────────────────────────
  const loadWeek = useCallback(async () => {
    if (!weekId) return;
    try {
      const [t, se] = await Promise.all([
        teacherClient.from('tasks').select('*').eq('course_id', courseId).eq('week_id', weekId),
        teacherClient.from('course_sessions').select('*').eq('week_id', weekId).order('session_no'),
      ]);
      const tl = (t.data ?? []) as Task[];
      const sl = (se.data ?? []) as CourseSession[];
      setTasks(tl);
      setSessions(sl);

      // `.in()` 에 빈 배열을 주면 Postgrest 가 오류를 낸다. 미리 끊는다.
      if (tl.length === 0) setSubs([]);
      else {
        const r = await teacherClient.from('task_submissions').select('*').in('task_id', tl.map((x) => x.id));
        setSubs((r.data ?? []) as TaskSubmission[]);
      }

      if (sl.length === 0) setAtt([]);
      else {
        const r = await teacherClient.from('attendance').select('*').in('session_id', sl.map((x) => x.id));
        setAtt((r.data ?? []) as AttendanceRow[]);
      }
    } catch (e) {
      setError(errText(e, '이 주차 자료를 불러오지 못했습니다.'));
    }
  }, [courseId, weekId]);

  useEffect(() => {
    loadWeek();
  }, [loadWeek]);

  // ── 계산 ────────────────────────────────────────────────
  const roster = useMemo<WeeklyStudent[]>(() => {
    const byId = new Map(contacts.map((c) => [c.student_id, c]));
    return students.map((s) => {
      const c = byId.get(s.id);
      return {
        id: s.id,
        student_no: s.student_no,
        name: s.name,
        grade: s.grade ?? null,
        dept: s.dept ?? null,
        phone: c?.phone ?? null,
        phone_raw: c?.phone_raw ?? null,
        masked: c?.masked ?? false,
      };
    });
  }, [students, contacts]);

  const misses = useMemo(
    () =>
      taskMisses(
        roster,
        tasks.map((t) => ({ id: t.id, title: t.title, week_id: t.week_id, due_at: t.due_at })),
        subs,
      ),
    [roster, tasks, subs],
  );

  const absents = useMemo(
    () =>
      absences(
        roster,
        sessions.map((s) => ({ id: s.id, week_id: s.week_id, session_no: s.session_no, meets_on: s.meets_on })),
        att.map((a) => ({ session_id: a.session_id, student_id: a.student_id, status: a.status })),
      ),
    [roster, sessions, att],
  );

  const rollup = useMemo(() => summarize(roster, misses, absents), [roster, misses, absents]);

  const contactList = useMemo(
    () =>
      rollup
        .filter((r) => (onlyContact ? r.needsContact : true))
        .sort((a, b) => a.student.student_no.localeCompare(b.student.student_no)),
    [rollup, onlyContact],
  );

  const week = weeks.find((w) => w.id === weekId) ?? null;
  const taskMissing = misses.filter((m) => m.state === 'missing');
  const taskLate = misses.filter((m) => m.state === 'late');
  const absent = absents.filter((a) => a.state === 'absent');
  const attLate = absents.filter((a) => a.state === 'late');
  const unmarked = absents.filter((a) => a.state === 'unmarked');
  const shown = absents.filter((a) => a.state !== 'unmarked');
  const needContact = rollup.filter((r) => r.needsContact);
  const noPhone = needContact.filter((r) => !hasReachablePhone(r.student));

  // ── 내보내기 ────────────────────────────────────────────
  const who = (s: WeeklyStudent) => [s.student_no, s.name, s.dept ?? '', s.grade ?? '', phoneText(s)];
  const head = ['학번', '이름', '학과', '학년', '전화번호'];

  function sheets(): SheetTable[] {
    return [
      {
        name: '연락 대상',
        rows: [
          [...head, '과제 미제출', '지각 제출', '결석', '지각'],
          ...contactList.map((r) => [...who(r.student), r.taskMissing, r.taskLate, r.absent, r.attendLate]),
        ],
      },
      {
        name: '과제 미제출',
        rows: [
          [...head, '과제', '상태'],
          ...misses.map((m) => [...who(m.student), m.taskTitle, TASK_MISS_LABEL[m.state]]),
        ],
      },
      {
        name: '미출석',
        rows: [
          [...head, '회차', '수업일', '상태'],
          ...shown.map((a) => [...who(a.student), `${a.sessionNo}교시`, a.meetsOn ?? '', ABSENCE_LABEL[a.state]]),
        ],
      },
    ];
  }

  const fileBase = `${courseTitle}_${week ? `${week.week_no}주차` : '주차'}_명단`;

  if (loading) return <div className="empty">불러오는 중…</div>;

  if (weeks.length === 0) {
    return (
      <div className="empty">
        주차가 아직 없습니다. <b>주/회차 관리</b>에서 15주를 먼저 만들어 주세요.
        <div className="btn-row" style={{ justifyContent: 'center', marginTop: 12 }}>
          <button className="btn-sm btn-ghost" onClick={() => onGo('weeks')}>
            주/회차 관리로
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      {error && <div className="alert alert-error">{error}</div>}

      {/* ── 주차 고르기 ─────────────────────────────────── */}
      <div className="card tight">
        <label className="small muted" style={{ display: 'block' }}>
          주차
          <select value={weekId} onChange={(e) => setWeekId(e.target.value)} aria-label="주차 고르기" style={{ marginTop: 6 }}>
            {weeks.map((w) => (
              <option key={w.id} value={w.id}>
                {w.week_no}주차{w.title ? ` — ${w.title}` : ''}
              </option>
            ))}
          </select>
        </label>
        <p className="small muted" style={{ marginBottom: 0 }}>
          이 주차에 걸린 과제 <b>{tasks.length}</b>개 · 회차 <b>{sessions.length}</b>개 · 명단 <b>{roster.length}</b>명
        </p>
      </div>

      {/* ── 한 눈에 ────────────────────────────────────── */}
      <div className="stat-grid">
        <div className="stat">
          <b>{taskMissing.length}</b>
          <span>과제 미제출</span>
        </div>
        <div className="stat">
          <b>{taskLate.length}</b>
          <span>지각 제출</span>
        </div>
        <div className="stat">
          <b>{absent.length}</b>
          <span>결석</span>
        </div>
        <div className="stat">
          <b>{attLate.length}</b>
          <span>지각</span>
        </div>
        <div className="stat">
          <b>{unmarked.length}</b>
          <span>출결 미기록</span>
        </div>
        <div className="stat">
          <b>{needContact.length}</b>
          <span>연락 대상</span>
        </div>
      </div>

      {tasks.length === 0 && (
        <div className="alert alert-warn">
          이 주차에 걸린 과제가 없습니다. <b>과제 관리</b>에서 과제를 만들 때 <b>주차</b>를 골라 주세요 — 주차를
          지정해야 이 화면에 잡힙니다.
          <div className="btn-row" style={{ marginTop: 8 }}>
            <button className="btn-sm btn-ghost" onClick={() => onGo('tasks')}>
              과제 관리로
            </button>
          </div>
        </div>
      )}

      {unmarked.length > 0 && (
        <div className="alert alert-info">
          아직 출석을 안 부른 칸이 <b>{unmarked.length}</b>개 있습니다. 이 칸은 <b>결석으로 세지 않고</b> 내보내는
          파일에도 넣지 않습니다.
          <div className="btn-row" style={{ marginTop: 8 }}>
            <button className="btn-sm btn-ghost" onClick={() => onGo('attendance')}>
              출석 관리로
            </button>
          </div>
        </div>
      )}

      {noPhone.length > 0 && (
        <div className="alert alert-warn">
          연락해야 할 <b>{needContact.length}</b>명 가운데 <b>{noPhone.length}</b>명은 전화번호가 없습니다. 헤이영에서
          번호를 받아 <b>연락처 관리</b>에 넣어야 문자를 보낼 수 있습니다.
          <div className="btn-row" style={{ marginTop: 8 }}>
            <button className="btn-sm btn-ghost" onClick={() => onGo('contacts')}>
              연락처 관리로
            </button>
            <button className="btn-sm btn-ghost" onClick={() => onGo('message')}>
              문자 · 알림으로
            </button>
          </div>
        </div>
      )}

      {/* ── 연락 대상 ──────────────────────────────────── */}
      <div className="section-title">연락 대상</div>
      <div className="card">
        <div className="btn-row" style={{ marginBottom: 10 }}>
          <label className="small muted">
            <input type="checkbox" checked={onlyContact} onChange={(e) => setOnlyContact(e.target.checked)} /> 안 냈거나
            안 온 학생만
          </label>
          <span style={{ flex: 1 }} />
          <button className="btn-sm btn-ghost" onClick={() => downloadCsv(sheets()[0]!.rows, `${fileBase}.csv`)}>
            CSV
          </button>
          <button className="btn-sm btn-ghost" onClick={() => downloadXlsx(sheets(), `${fileBase}.xlsx`)}>
            XLSX
          </button>
          <button className="btn-sm btn-ghost" onClick={() => printTable(fileBase, sheets())}>
            PDF(인쇄)
          </button>
        </div>

        {contactList.length === 0 ? (
          <div className="empty">이 주차에는 연락할 학생이 없습니다.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>학번</th>
                  <th>이름</th>
                  <th>학과</th>
                  <th>학년</th>
                  <th>전화번호</th>
                  <th>과제 미제출</th>
                  <th>지각 제출</th>
                  <th>결석</th>
                  <th>지각</th>
                </tr>
              </thead>
              <tbody>
                {contactList.map((r) => (
                  <tr key={r.student.id}>
                    <td className="mono">{r.student.student_no}</td>
                    <td>{r.student.name}</td>
                    <td className="small muted">{r.student.dept ?? '—'}</td>
                    <td className="small muted">{r.student.grade ?? '—'}</td>
                    <td className="mono">
                      {phoneText(r.student) || <span className="muted small">번호 없음</span>}
                      {r.student.masked && <span className="small muted"> (가림)</span>}
                    </td>
                    <td>{r.taskMissing || ''}</td>
                    <td>{r.taskLate || ''}</td>
                    <td>{r.absent || ''}</td>
                    <td>{r.attendLate || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── 과제 미제출 ────────────────────────────────── */}
      <div className="section-title">과제 미제출 · 지각</div>
      <div className="card">
        {misses.length === 0 ? (
          <div className="empty">{tasks.length === 0 ? '이 주차 과제가 없습니다.' : '전원 제출했습니다.'}</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>학번</th>
                  <th>이름</th>
                  <th>학과</th>
                  <th>전화번호</th>
                  <th>과제</th>
                  <th>상태</th>
                </tr>
              </thead>
              <tbody>
                {misses.map((m) => (
                  <tr key={`${m.taskId}:${m.student.id}`}>
                    <td className="mono">{m.student.student_no}</td>
                    <td>{m.student.name}</td>
                    <td className="small muted">{m.student.dept ?? '—'}</td>
                    <td className="mono">{phoneText(m.student) || <span className="muted small">번호 없음</span>}</td>
                    <td>{m.taskTitle}</td>
                    <td>{TASK_MISS_LABEL[m.state]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── 미출석 ────────────────────────────────────── */}
      <div className="section-title">결석 · 지각</div>
      <div className="card">
        {shown.length === 0 ? (
          <div className="empty">{sessions.length === 0 ? '이 주차 회차가 없습니다.' : '결석 · 지각이 없습니다.'}</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>학번</th>
                  <th>이름</th>
                  <th>학과</th>
                  <th>전화번호</th>
                  <th>회차</th>
                  <th>수업일</th>
                  <th>상태</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((a) => (
                  <tr key={`${a.sessionId}:${a.student.id}`}>
                    <td className="mono">{a.student.student_no}</td>
                    <td>{a.student.name}</td>
                    <td className="small muted">{a.student.dept ?? '—'}</td>
                    <td className="mono">{phoneText(a.student) || <span className="muted small">번호 없음</span>}</td>
                    <td>{a.sessionNo}교시</td>
                    <td className="small muted">{a.meetsOn ?? '—'}</td>
                    <td>{ABSENCE_LABEL[a.state]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
