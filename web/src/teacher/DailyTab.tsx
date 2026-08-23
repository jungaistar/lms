import { useCallback, useEffect, useMemo, useState } from 'react';
import { teacherClient } from '../lib/supabase';
import { downloadCsv, downloadXlsx, printTable, type SheetTable } from '../lib/exporters';
import { errText } from '../lib/errors';
import {
  UNMARKED_LABEL,
  type AttendanceRow,
  type AttendanceStatusValue,
  type CourseSession,
  type CourseWeek,
  type MarkPolicy,
  type SessionMark,
  type SessionMarkSummaryRow,
  type Student,
} from '../lib/types';

/**
 * 일자별 기록 — 출결 · 수업태도 · 과제를 하루치씩.
 *
 * 왜 출석 화면과 따로 있나
 *   · 출석 관리 = 헤이영 파일을 올려 학기 전체를 정리하는 자리
 *   · 수업 중 체크 = 수업 도중 서서 출결만 빠르게 누르는 자리
 *   · 여기 = **날짜 하나를 펴 놓고 네 가지를 다 적는** 자리다.
 *     출결만이 아니라 그날의 수업태도와 과제까지 한 줄에 남긴다.
 *
 * 무엇이 어디에 저장되나
 *   · 출결        → attendance      (학생이 본인 것만 읽을 수 있다)
 *   · 태도 · 과제 → session_marks   (**교수만** 읽는다)
 *
 * 두 표로 갈라 둔 이유가 있다. attendance 에는 '본인 것만 읽기' 정책이
 * 있어서, 거기에 점수 칸을 더하면 학생이 자기 태도 점수를 읽게 된다.
 * 확정된 정책은 점수 비공개다. 화면에서 가리는 방식으로는 못 막는다.
 *
 * 누른 즉시 저장된다. 저장 버튼이 없다 — 같은 버튼을 다시 누르면 지워진다.
 * 점수 합계는 화면이 세지 않는다. session_mark_summary() 가 유일한 셈 경로다.
 */

const QUICK: Array<[AttendanceStatusValue, string]> = [
  ['present', '출석'],
  ['late', '지각'],
  ['absent', '결석'],
  ['early_leave', '조퇴'],
  ['excused', '인정결석'],
];

const todayStr = () => new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD

/** 0 부터 만점까지의 눈금. 만점이 10 이하일 때만 버튼으로 그린다. */
const steps = (max: number) => Array.from({ length: Math.floor(max) + 1 }, (_, i) => i);

export default function DailyTab({ courseId }: { courseId: string }) {
  const [weeks, setWeeks] = useState<CourseWeek[]>([]);
  const [sessions, setSessions] = useState<CourseSession[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [policy, setPolicy] = useState<MarkPolicy | null>(null);

  const [sessionId, setSessionId] = useState('');
  const [att, setAtt] = useState<AttendanceRow[]>([]);
  const [marks, setMarks] = useState<SessionMark[]>([]);
  const [summary, setSummary] = useState<SessionMarkSummaryRow[]>([]);

  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showPolicy, setShowPolicy] = useState(false);

  // 만점 정책이 아직 없는 과목도 있다. DB 기본값과 같은 값으로 본다.
  const attitudeMax = policy?.attitude_max ?? 5;
  const taskMax = policy?.task_max ?? 5;

  // ── 불러오기 ───────────────────────────────────────────────
  const load = useCallback(async () => {
    const [w, s, p] = await Promise.all([
      teacherClient.from('course_weeks').select('*').eq('course_id', courseId).order('week_no'),
      teacherClient.from('students').select('*').eq('course_id', courseId).eq('active', true).order('student_no'),
      teacherClient.from('mark_policies').select('*').eq('course_id', courseId).maybeSingle(),
    ]);
    const wl = (w.data ?? []) as CourseWeek[];
    setWeeks(wl);
    setStudents((s.data ?? []) as Student[]);
    setPolicy((p.data ?? null) as MarkPolicy | null);

    if (wl.length === 0) return setSessions([]);
    const { data: cs } = await teacherClient
      .from('course_sessions')
      .select('*')
      .in('week_id', wl.map((x) => x.id))
      .order('session_no');
    const list = (cs ?? []) as CourseSession[];
    setSessions(list);

    // 오늘 수업이 있으면 그 회차를 먼저 편다. 수업 직후에 여는 화면이라
    // 매번 날짜를 고르게 하면 손이 하나 더 간다.
    const today = list.filter((x) => x.meets_on === todayStr());
    if (today.length > 0) setSessionId((prev) => prev || today[0]!.id);
  }, [courseId]);

  useEffect(() => { load(); }, [load]);

  const loadDay = useCallback(async (sid: string) => {
    if (!sid) { setAtt([]); setMarks([]); return; }
    const [a, m] = await Promise.all([
      teacherClient.from('attendance').select('*').eq('session_id', sid),
      teacherClient.from('session_marks').select('*').eq('session_id', sid),
    ]);
    if (a.error) setError(a.error.message);
    if (m.error) setError(m.error.message);
    setAtt((a.data ?? []) as AttendanceRow[]);
    setMarks((m.data ?? []) as SessionMark[]);
  }, []);

  useEffect(() => { loadDay(sessionId); }, [sessionId, loadDay]);

  const loadSummary = useCallback(async () => {
    const { data, error: err } = await teacherClient.rpc('session_mark_summary', { p_course: courseId });
    if (err) setError(errText(err, '누계를 불러오지 못했습니다.'));
    else setSummary((data ?? []) as SessionMarkSummaryRow[]);
  }, [courseId]);

  useEffect(() => { loadSummary(); }, [loadSummary]);

  // ── 회차 이름 ──────────────────────────────────────────────
  const sessionLabel = useCallback(
    (s: CourseSession) => {
      const w = weeks.find((x) => x.id === s.week_id);
      const d = s.meets_on ? `${s.meets_on}${s.meets_on === todayStr() ? ' · 오늘' : ''}` : '날짜 없음';
      return `${d} — ${w ? w.week_no : '?'}주차 ${s.session_no}회차`;
    },
    [weeks],
  );

  const orderedSessions = useMemo(() => {
    const no = new Map(weeks.map((w) => [w.id, w.week_no]));
    return [...sessions].sort(
      (a, b) => (no.get(a.week_id) ?? 0) - (no.get(b.week_id) ?? 0) || a.session_no - b.session_no,
    );
  }, [sessions, weeks]);

  const attOf = useMemo(() => new Map(att.map((r) => [r.student_id, r])), [att]);
  const markOf = useMemo(() => new Map(marks.map((r) => [r.student_id, r])), [marks]);

  const shown = useMemo(() => {
    const key = q.trim().toLowerCase();
    if (!key) return students;
    return students.filter((s) => s.name.toLowerCase().includes(key) || s.student_no.includes(key));
  }, [students, q]);

  // ── 출결 ───────────────────────────────────────────────────
  /** 한 칸을 그 자리에서 바꾼다. 같은 버튼을 다시 누르면 지워진다. */
  async function mark(studentId: string, status: AttendanceStatusValue) {
    if (!sessionId) return setError('날짜를 먼저 고르세요.');
    setError(null);
    setPending(studentId);

    const existing = attOf.get(studentId);
    const undo = existing?.status === status;
    const err = undo
      ? (await teacherClient.from('attendance').delete().eq('id', existing.id)).error
      : existing
        ? (await teacherClient.from('attendance')
            .update({ status, source: 'manual' }).eq('id', existing.id)).error
        : (await teacherClient.from('attendance')
            .insert({ session_id: sessionId, student_id: studentId, status, source: 'manual' })).error;

    setPending(null);
    if (err) setError(err.message);
    else await loadDay(sessionId);
  }

  // ── 태도 · 과제 ────────────────────────────────────────────
  /**
   * 점수 한 칸을 저장한다.
   *
   * RPC 는 한 줄을 통째로 덮어쓴다. 그래서 지금 화면에 있는 나머지 값을
   * 함께 실어 보낸다 — 태도를 눌렀다고 과제 점수가 지워지면 안 된다.
   */
  async function saveMark(
    studentId: string,
    patch: Partial<Pick<SessionMark, 'attitude' | 'task' | 'note'>>,
  ) {
    if (!sessionId) return setError('날짜를 먼저 고르세요.');
    setError(null);
    setPending(studentId);

    const cur = markOf.get(studentId);
    const row = {
      student_id: studentId,
      attitude: patch.attitude !== undefined ? patch.attitude : cur?.attitude ?? null,
      task: patch.task !== undefined ? patch.task : cur?.task ?? null,
      note: patch.note !== undefined ? patch.note : cur?.note ?? null,
    };

    const { error: err } = await teacherClient.rpc('save_session_marks', {
      p_session: sessionId,
      p_rows: [row],
    });

    setPending(null);
    if (err) setError(errText(err, '저장하지 못했습니다.'));
    else {
      await loadDay(sessionId);
      loadSummary();
    }
  }

  /** 같은 점수를 다시 누르면 지운다. '아직 안 매김' 과 0점은 다른 값이다. */
  const toggleScore = (studentId: string, field: 'attitude' | 'task', value: number) => {
    const cur = markOf.get(studentId);
    const now = field === 'attitude' ? cur?.attitude : cur?.task;
    return saveMark(studentId, { [field]: Number(now) === value ? null : value });
  };

  // ── 한 번에 ────────────────────────────────────────────────
  /** 아직 아무 표시도 없는 학생을 출석으로 채운다. */
  async function fillPresent() {
    if (!sessionId) return;
    const done = new Set(att.map((r) => r.student_id));
    const missing = students.filter((s) => !done.has(s.id));
    if (missing.length === 0) return setNotice('이미 전원 표시되어 있습니다.');

    setBusy(true);
    const { error: err } = await teacherClient.from('attendance').insert(
      missing.map((s) => ({ session_id: sessionId, student_id: s.id, status: 'present', source: 'manual' })),
    );
    setBusy(false);
    if (err) setError(err.message);
    else { setNotice(`${missing.length}명을 출석으로 채웠습니다.`); await loadDay(sessionId); }
  }

  /** 아직 안 매긴 학생에게 같은 점수를 한 번에 준다. 이미 매긴 칸은 안 건드린다. */
  async function fillScore(field: 'attitude' | 'task', value: number) {
    if (!sessionId) return;
    const rows = students
      .filter((s) => {
        const cur = markOf.get(s.id);
        return (field === 'attitude' ? cur?.attitude : cur?.task) == null;
      })
      .map((s) => {
        const cur = markOf.get(s.id);
        return {
          student_id: s.id,
          attitude: field === 'attitude' ? value : cur?.attitude ?? null,
          task: field === 'task' ? value : cur?.task ?? null,
          note: cur?.note ?? null,
        };
      });

    if (rows.length === 0) return setNotice('이미 전원 매겨져 있습니다.');

    setBusy(true);
    const { error: err } = await teacherClient.rpc('save_session_marks', { p_session: sessionId, p_rows: rows });
    setBusy(false);
    if (err) setError(errText(err, '저장하지 못했습니다.'));
    else {
      setNotice(`${rows.length}명에게 ${field === 'attitude' ? '수업태도' : '과제'} ${value}점을 넣었습니다.`);
      await loadDay(sessionId);
      loadSummary();
    }
  }

  /** 이 날짜의 태도 · 과제 점수를 통째로 지운다. 출결은 그대로 둔다. */
  async function clearDay() {
    if (!sessionId) return;
    if (!window.confirm('이 날짜의 수업태도 · 과제 점수를 모두 지웁니다. 출결은 그대로 둡니다. 계속할까요?')) return;
    setBusy(true);
    const { error: err } = await teacherClient.from('session_marks').delete().eq('session_id', sessionId);
    setBusy(false);
    if (err) setError(err.message);
    else { setNotice('이 날짜의 점수를 지웠습니다.'); await loadDay(sessionId); loadSummary(); }
  }

  // ── 만점 정책 ──────────────────────────────────────────────
  async function savePolicy(patch: Partial<MarkPolicy>) {
    setError(null);
    const next = {
      course_id: courseId,
      attitude_max: patch.attitude_max ?? attitudeMax,
      task_max: patch.task_max ?? taskMax,
      unmarked: patch.unmarked ?? policy?.unmarked ?? 'skip',
    };
    const { error: err } = await teacherClient.from('mark_policies').upsert(next, { onConflict: 'course_id' });
    if (err) return setError(errText(err, '만점을 저장하지 못했습니다.'));
    await load();
    loadSummary();
    setNotice('만점을 바꿨습니다.');
  }

  // ── 내보내기 ───────────────────────────────────────────────
  /** 오늘 하루치. 수업 끝나고 바로 뽑아 보는 표다. */
  function daySheet(): SheetTable {
    const s = orderedSessions.find((x) => x.id === sessionId);
    const head = ['학번', '이름', '출결', `수업태도 (/${attitudeMax})`, `과제 (/${taskMax})`, '메모'];
    const rows = students.map((st) => {
      const a = attOf.get(st.id);
      const m = markOf.get(st.id);
      return [
        st.student_no,
        st.name,
        a ? (QUICK.find(([k]) => k === a.status)?.[1] ?? a.status) : '미표시',
        m?.attitude ?? '',
        m?.task ?? '',
        m?.note ?? '',
      ];
    });
    return { name: s ? sessionLabel(s).replace(/[\\/:*?"<>|]/g, '-') : '일자별 기록', rows: [head, ...rows] };
  }

  /** 학기 누계. 셈은 전부 DB 가 한 값을 그대로 옮긴다. */
  function summarySheet(): SheetTable {
    const head = [
      '학번', '이름', '회차수',
      '출석', '지각', '결석', '조퇴', '인정결석',
      '태도 매긴칸', '태도 합', '태도 평균', '태도 %',
      '과제 매긴칸', '과제 합', '과제 평균', '과제 %',
    ];
    const rows = summary.map((r) => [
      r.student_no, r.name, r.sessions_total,
      r.present_cnt, r.late_cnt, r.absent_cnt, r.early_leave_cnt, r.excused_cnt,
      r.attitude_marked, r.attitude_sum ?? '', r.attitude_avg ?? '', r.attitude_pct ?? '',
      r.task_marked, r.task_sum ?? '', r.task_avg ?? '', r.task_pct ?? '',
    ]);
    return { name: '학기 누계', rows: [head, ...rows] };
  }

  const marked = (field: 'attitude' | 'task') =>
    students.filter((s) => {
      const m = markOf.get(s.id);
      return (field === 'attitude' ? m?.attitude : m?.task) != null;
    }).length;

  return (
    <>
      {error && <div className="alert alert-error">{error}</div>}
      {notice && <div className="alert alert-ok">{notice}</div>}

      <div className="alert alert-info">
        <b>이 화면은 교수만 봅니다.</b>
        <p className="small" style={{ margin: '6px 0 0' }}>
          수업태도 · 과제 점수는 <code>session_marks</code> 에 들어가고, 그 표에는
          <b> 학생용 권한 정책이 아예 없습니다</b>. 학생이 로그인해서 직접 요청해도 한 줄도 나오지 않습니다.
          출결은 지금까지처럼 <b>본인 것만</b> 학생이 볼 수 있습니다.
        </p>
      </div>

      {orderedSessions.length === 0 && (
        <div className="alert alert-warn">
          날짜(회차)가 없습니다. <b>주/회차 관리</b>에서 주차와 회차를 먼저 만들어 주세요.
          기록은 회차에 붙습니다 — 회차에 <b>수업일</b>을 적어 두면 여기서 날짜로 보입니다.
        </div>
      )}

      {/* ── 날짜 고르기 ─────────────────────────────── */}
      <div className="card tight">
        <div className="row" style={{ gap: 8, alignItems: 'flex-end' }}>
          <label className="small muted" style={{ flex: '2 1 280px' }}>
            날짜
            <select value={sessionId} onChange={(e) => setSessionId(e.target.value)} aria-label="날짜 고르기">
              <option value="">— 고르세요 —</option>
              {orderedSessions.map((s) => <option key={s.id} value={s.id}>{sessionLabel(s)}</option>)}
            </select>
          </label>
          <label className="small muted" style={{ flex: '1 1 180px' }}>
            이름 · 학번으로 찾기
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="김…" aria-label="학생 찾기" />
          </label>
        </div>
      </div>

      {!sessionId ? (
        <div className="empty">날짜를 고르면 명단이 나옵니다.</div>
      ) : (
        <>
          {/* ── 오늘 현황 · 한 번에 ───────────────────── */}
          <div className="card tight">
            <div className="small" style={{ marginBottom: 10 }}>
              {QUICK.map(([st, label]) => (
                <span key={st} style={{ marginRight: 12 }}>
                  {label} <b>{att.filter((r) => r.status === st).length}</b>
                </span>
              ))}
              <span className="muted">· 미표시 <b>{students.length - att.length}</b></span>
              <span className="muted" style={{ marginLeft: 12 }}>
                · 태도 매김 <b>{marked('attitude')}</b>/{students.length}
                · 과제 매김 <b>{marked('task')}</b>/{students.length}
              </span>
            </div>

            <div className="btn-row">
              <button className="btn-sm btn-ghost" disabled={busy} onClick={fillPresent}>미표시 전원 출석</button>
              <button className="btn-sm btn-ghost" disabled={busy} onClick={() => fillScore('attitude', attitudeMax)}>
                안 매긴 태도 전원 만점
              </button>
              <button className="btn-sm btn-ghost" disabled={busy} onClick={() => fillScore('task', taskMax)}>
                안 매긴 과제 전원 만점
              </button>
              <button className="btn-sm btn-danger" disabled={busy} onClick={clearDay}>이 날짜 점수 지우기</button>
            </div>

            <div className="btn-row" style={{ marginTop: 8 }}>
              <button className="btn-sm btn-ghost" onClick={() => downloadCsv(daySheet().rows, daySheet().name)}>CSV</button>
              <button className="btn-sm btn-ghost" onClick={() => downloadXlsx([daySheet()], daySheet().name)}>XLSX</button>
              <button
                className="btn-sm btn-ghost"
                onClick={() => { if (!printTable(daySheet().name, [daySheet()])) setError('팝업이 막혀 있습니다.'); }}
              >
                PDF(인쇄)
              </button>
              <button className="btn-sm btn-ghost" onClick={() => setShowPolicy((v) => !v)} aria-expanded={showPolicy}>
                만점 {showPolicy ? '접기' : `설정 (태도 ${attitudeMax} · 과제 ${taskMax})`}
              </button>
            </div>

            {showPolicy && (
              <div className="row" style={{ marginTop: 12, gap: 8, alignItems: 'flex-end' }}>
                <label className="small muted" style={{ flex: '1 1 150px' }}>
                  수업태도 만점
                  <input
                    type="number" min={1} max={100} step={1} defaultValue={attitudeMax}
                    onBlur={(e) => {
                      const v = Number(e.target.value);
                      if (v >= 1 && v <= 100 && v !== attitudeMax) savePolicy({ attitude_max: v });
                    }}
                  />
                </label>
                <label className="small muted" style={{ flex: '1 1 150px' }}>
                  과제 만점
                  <input
                    type="number" min={1} max={100} step={1} defaultValue={taskMax}
                    onBlur={(e) => {
                      const v = Number(e.target.value);
                      if (v >= 1 && v <= 100 && v !== taskMax) savePolicy({ task_max: v });
                    }}
                  />
                </label>
                <label className="small muted" style={{ flex: '2 1 220px' }}>
                  안 매긴 칸을 어떻게 셀까
                  <select
                    value={policy?.unmarked ?? 'skip'}
                    onChange={(e) => savePolicy({ unmarked: e.target.value as MarkPolicy['unmarked'] })}
                  >
                    {(['skip', 'zero'] as const).map((k) => (
                      <option key={k} value={k}>{UNMARKED_LABEL[k]}</option>
                    ))}
                  </select>
                </label>
                <p className="small muted" style={{ flex: '1 1 100%', margin: 0 }}>
                  만점이 <b>10 이하</b>면 아래에 버튼이 나옵니다. 그보다 크면 숫자 칸으로 바뀝니다 —
                  휴대폰에서 버튼이 열 개를 넘으면 한 화면에 안 들어갑니다.
                </p>
              </div>
            )}
          </div>

          {/* ── 학생 한 명 = 한 줄 ────────────────────── */}
          {shown.map((s) => {
            const a = attOf.get(s.id);
            const m = markOf.get(s.id);
            return (
              <div
                key={s.id}
                className={a || m ? 'mark-row marked' : 'mark-row'}
                style={{ opacity: pending === s.id ? 0.5 : 1 }}
              >
                <div className="who">
                  <b>{s.name}</b>
                  <span>{s.student_no}</span>
                </div>

                <div className="mark-group">
                  <span className="k">출결</span>
                  <div className="btn-row">
                    {QUICK.map(([st, label]) => (
                      <button
                        key={st}
                        className={a?.status === st ? 'btn-sm btn-navy' : 'btn-sm btn-ghost'}
                        onClick={() => mark(s.id, st)}
                        aria-pressed={a?.status === st}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <ScoreField
                  label="수업태도" max={attitudeMax} value={m?.attitude ?? null}
                  studentName={s.name}
                  onPick={(v) => toggleScore(s.id, 'attitude', v)}
                  onType={(v) => saveMark(s.id, { attitude: v })}
                />
                <ScoreField
                  label="과제" max={taskMax} value={m?.task ?? null}
                  studentName={s.name}
                  onPick={(v) => toggleScore(s.id, 'task', v)}
                  onType={(v) => saveMark(s.id, { task: v })}
                />

                <div className="mark-group mark-group-wide">
                  <span className="k">메모</span>
                  <input
                    defaultValue={m?.note ?? ''}
                    placeholder="발표 잘함 · 졸음 …"
                    aria-label={`${s.name} 메모`}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v !== (m?.note ?? '')) saveMark(s.id, { note: v || null });
                    }}
                  />
                </div>

                {a?.source === 'heyyoung' && <span className="badge">헤이영</span>}
                {m && (
                  <span className="small muted" style={{ flex: '0 0 auto' }}>
                    {new Date(m.updated_at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })} 고침
                  </span>
                )}
              </div>
            );
          })}

          {shown.length === 0 && <div className="empty">찾는 학생이 없습니다.</div>}
        </>
      )}

      {/* ── 학기 누계 ───────────────────────────────── */}
      <div className="section-title" style={{ marginTop: 28 }}>학기 누계</div>
      <div className="card tight">
        <p className="small muted" style={{ marginTop: 0 }}>
          합계와 평균은 <b>DB 함수</b>(<code>session_mark_summary</code>)가 셉니다. 이 화면이 따로 세지 않습니다 —
          화면을 고칠 때마다 성적이 달라지면 안 되기 때문입니다.
          안 매긴 칸은 지금 <b>{UNMARKED_LABEL[policy?.unmarked ?? 'skip']}</b> 으로 되어 있습니다.
        </p>
        <div className="btn-row">
          <button className="btn-sm btn-ghost" onClick={() => downloadCsv(summarySheet().rows, summarySheet().name)}>CSV</button>
          <button className="btn-sm btn-ghost" onClick={() => downloadXlsx([summarySheet()], summarySheet().name)}>XLSX</button>
          <button
            className="btn-sm btn-ghost"
            onClick={() => { if (!printTable('학기 누계', [summarySheet()])) setError('팝업이 막혀 있습니다.'); }}
          >
            PDF(인쇄)
          </button>
        </div>
      </div>

      <div className="table-wrap">
        <table className="pivot">
          <thead>
            <tr>
              <th>이름</th><th>학번</th>
              <th>출석</th><th>지각</th><th>결석</th><th>조퇴</th><th>인정</th>
              <th>태도 평균</th><th>태도 %</th>
              <th>과제 평균</th><th>과제 %</th>
            </tr>
          </thead>
          <tbody>
            {summary.map((r) => (
              <tr key={r.student_id}>
                <td>{r.name}</td>
                <td className="mono small">{r.student_no}</td>
                <td>{r.present_cnt}</td>
                <td>{r.late_cnt}</td>
                <td>{r.absent_cnt}</td>
                <td>{r.early_leave_cnt}</td>
                <td>{r.excused_cnt}</td>
                <td>{r.attitude_avg ?? '—'}</td>
                <td>{r.attitude_pct != null ? `${r.attitude_pct}%` : '—'}</td>
                <td>{r.task_avg ?? '—'}</td>
                <td>{r.task_pct != null ? `${r.task_pct}%` : '—'}</td>
              </tr>
            ))}
            {summary.length === 0 && (
              <tr><td colSpan={11} className="muted center">아직 기록이 없습니다.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

/**
 * 점수 한 칸.
 *
 * 만점이 10 이하면 버튼으로 고르게 한다 — 수업 중에 휴대폰으로 누르는 자리라
 * 숫자 키보드를 띄우면 손이 두 배로 간다. 그보다 크면 버튼이 화면을 넘기므로
 * 숫자 칸으로 바꾼다.
 */
function ScoreField({
  label, max, value, studentName, onPick, onType,
}: {
  label: string;
  max: number;
  value: number | null;
  studentName: string;
  onPick: (v: number) => void;
  onType: (v: number | null) => void;
}) {
  return (
    <div className="mark-group">
      <span className="k">{label} <span className="muted">/{max}</span></span>
      {max <= 10 ? (
        <div className="score-picker">
          {steps(max).map((n) => (
            <button
              key={n}
              type="button"
              aria-pressed={Number(value) === n}
              aria-label={`${studentName} ${label} ${n}점`}
              onClick={() => onPick(n)}
            >
              {n}
            </button>
          ))}
        </div>
      ) : (
        <input
          type="number" min={0} max={max} step="any"
          defaultValue={value ?? ''}
          aria-label={`${studentName} ${label} 점수`}
          onBlur={(e) => {
            const raw = e.target.value.trim();
            if (raw === '') return onType(null);
            const v = Number(raw);
            if (!Number.isNaN(v) && v >= 0 && v <= max) onType(v);
          }}
        />
      )}
    </div>
  );
}
