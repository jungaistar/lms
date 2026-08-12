import { useCallback, useEffect, useMemo, useState } from 'react';
import { teacherClient } from '../lib/supabase';
import type {
  AttendanceRow,
  AttendanceStatusValue,
  CourseSession,
  CourseWeek,
  DeductionKind,
  DeductionSummaryRow,
  Student,
} from '../lib/types';

/**
 * 수업 중 체크.
 *
 * 왜 출석 화면과 따로 있나 —
 * 출석 화면은 수업이 끝난 뒤 헤이영 파일을 올려 정리하는 자리다.
 * 이 화면은 **수업 도중에 서서 누르는** 자리다. 그래서
 *
 *  · 오늘 회차를 알아서 고르고
 *  · 이름으로 바로 걸러 찾고
 *  · 한 번 누르면 그 자리에서 저장된다 (저장 버튼이 없다)
 *
 * 헤이영은 지문·QR 로 "출석" 만 찍는다. 늦게 들어온 학생도 출석으로 남는다.
 * 여기서 지각을 누르면 그 칸을 직접 입력(manual)으로 덮어쓴다. 덮어썼다는 표시가
 * 남으므로 나중에 헤이영 파일을 다시 올려도 무엇을 고쳤는지 알 수 있다.
 *
 * 태도 불량은 세어 줄 근거가 없다. 그래서 누른 만큼만 쌓인다.
 */
const QUICK: Array<[AttendanceStatusValue, string]> = [
  ['present', '출석'],
  ['late', '지각'],
  ['absent', '결석'],
  ['early_leave', '조퇴'],
  ['excused', '인정결석'],
];

const todayStr = () => new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD

export default function LiveCheckTab({ courseId }: { courseId: string }) {
  const [weeks, setWeeks] = useState<CourseWeek[]>([]);
  const [sessions, setSessions] = useState<CourseSession[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [rows, setRows] = useState<AttendanceRow[]>([]);
  const [kinds, setKinds] = useState<DeductionKind[]>([]);
  const [counts, setCounts] = useState<Map<string, number>>(new Map()); // `${kindId}:${studentId}`
  const [sessionId, setSessionId] = useState('');
  const [q, setQ] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [w, s, k] = await Promise.all([
      teacherClient.from('course_weeks').select('*').eq('course_id', courseId).order('week_no'),
      teacherClient.from('students').select('*').eq('course_id', courseId).eq('active', true).order('student_no'),
      teacherClient.from('deduction_kinds').select('*').eq('course_id', courseId).eq('source', 'manual').eq('active', true).order('ord'),
    ]);
    const wl = (w.data ?? []) as CourseWeek[];
    setWeeks(wl);
    setStudents((s.data ?? []) as Student[]);
    setKinds((k.data ?? []) as DeductionKind[]);

    if (wl.length === 0) return setSessions([]);
    const { data: cs } = await teacherClient
      .from('course_sessions')
      .select('*')
      .in('week_id', wl.map((x) => x.id))
      .order('session_no');
    const list = (cs ?? []) as CourseSession[];
    setSessions(list);

    // 오늘 수업이 있으면 그 회차를 먼저 편다. 없으면 고르게 둔다.
    const today = list.filter((x) => x.meets_on === todayStr());
    if (today.length > 0) setSessionId((prev) => prev || today[0]!.id);
  }, [courseId]);

  useEffect(() => { load(); }, [load]);

  const refreshCounts = useCallback(async () => {
    const { data } = await teacherClient.rpc('deduction_summary', { p_course: courseId });
    const m = new Map<string, number>();
    ((data ?? []) as DeductionSummaryRow[]).forEach((r) => m.set(`${r.kind_id}:${r.student_id}`, Number(r.cnt)));
    setCounts(m);
  }, [courseId]);

  useEffect(() => { refreshCounts(); }, [refreshCounts]);

  const loadRows = useCallback(async (sid: string) => {
    if (!sid) return setRows([]);
    const { data, error: err } = await teacherClient.from('attendance').select('*').eq('session_id', sid);
    if (err) setError(err.message);
    else setRows((data ?? []) as AttendanceRow[]);
  }, []);

  useEffect(() => { loadRows(sessionId); }, [sessionId, loadRows]);

  const sessionLabel = useCallback(
    (s: CourseSession) => {
      const w = weeks.find((x) => x.id === s.week_id);
      const d = s.meets_on ? ` (${s.meets_on}${s.meets_on === todayStr() ? ' · 오늘' : ''})` : '';
      return `${w ? w.week_no : '?'}주차 ${s.session_no}회차${d}`;
    },
    [weeks],
  );

  const orderedSessions = useMemo(() => {
    const no = new Map(weeks.map((w) => [w.id, w.week_no]));
    return [...sessions].sort((a, b) => (no.get(a.week_id) ?? 0) - (no.get(b.week_id) ?? 0) || a.session_no - b.session_no);
  }, [sessions, weeks]);

  const byStudent = useMemo(() => new Map(rows.map((r) => [r.student_id, r])), [rows]);

  const shown = useMemo(() => {
    const key = q.trim().toLowerCase();
    if (!key) return students;
    return students.filter((s) => s.name.toLowerCase().includes(key) || s.student_no.includes(key));
  }, [students, q]);

  /** 출결 한 칸을 그 자리에서 바꾼다. 되돌리려면 같은 버튼을 다시 누른다. */
  async function mark(student: Student, status: AttendanceStatusValue) {
    if (!sessionId) return setError('회차를 먼저 고르세요.');
    setError(null);
    setPending(student.id);

    const existing = byStudent.get(student.id);
    const undo = existing?.status === status;

    const err = undo
      ? (await teacherClient.from('attendance').delete().eq('id', existing.id)).error
      : existing
        ? (await teacherClient.from('attendance')
            .update({ status, source: 'manual', checked_in_at: existing.checked_in_at })
            .eq('id', existing.id)).error
        : (await teacherClient.from('attendance')
            .insert({ session_id: sessionId, student_id: student.id, status, source: 'manual' })).error;

    setPending(null);
    if (err) setError(err.message);
    else await loadRows(sessionId);
  }

  /** 감점 건수를 1 올리거나 내린다. 0 이 되면 기록을 지운다. */
  async function bump(kind: DeductionKind, student: Student, delta: number) {
    const key = `${kind.id}:${student.id}`;
    const next = Math.max(0, (counts.get(key) ?? 0) + delta);
    setError(null);
    setPending(student.id);

    const { data: existing } = await teacherClient
      .from('deductions')
      .select('id')
      .eq('kind_id', kind.id)
      .eq('student_id', student.id)
      .maybeSingle();

    const err = next === 0
      ? existing ? (await teacherClient.from('deductions').delete().eq('id', existing.id)).error : null
      : existing
        ? (await teacherClient.from('deductions').update({ count: next }).eq('id', existing.id)).error
        : (await teacherClient.from('deductions')
            .insert({ kind_id: kind.id, student_id: student.id, count: next, occurred_on: todayStr() })).error;

    setPending(null);
    if (err) setError(err.message);
    else setCounts((prev) => new Map(prev).set(key, next));
  }

  const tally = (st: AttendanceStatusValue) => rows.filter((r) => r.status === st).length;

  return (
    <>
      {error && <div className="alert alert-error">{error}</div>}

      {orderedSessions.length === 0 && (
        <div className="alert alert-warn">
          회차가 없습니다. <b>주/회차 관리</b>에서 먼저 회차를 만들어 주세요.
        </div>
      )}

      <div className="card tight">
        <div className="row" style={{ gap: 8, alignItems: 'flex-end' }}>
          <label className="small muted" style={{ flex: '1 1 260px' }}>
            회차
            <select value={sessionId} onChange={(e) => setSessionId(e.target.value)}>
              <option value="">— 고르세요 —</option>
              {orderedSessions.map((s) => <option key={s.id} value={s.id}>{sessionLabel(s)}</option>)}
            </select>
          </label>
          <label className="small muted" style={{ flex: '1 1 200px' }}>
            이름 · 학번으로 찾기
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="김…" aria-label="학생 찾기" />
          </label>
        </div>
      </div>

      {!sessionId ? (
        <div className="empty">회차를 고르면 명단이 나옵니다.</div>
      ) : (
        <>
          <div className="card tight">
            <div className="small">
              {QUICK.map(([st, label]) => (
                <span key={st} style={{ marginRight: 12 }}>
                  {label} <b>{tally(st)}</b>
                </span>
              ))}
              <span className="muted">· 미표시 <b>{students.length - rows.length}</b></span>
            </div>
            <p className="small muted" style={{ margin: '8px 0 0' }}>
              누르면 바로 저장됩니다. 같은 버튼을 다시 누르면 표시가 지워집니다.
              헤이영이 <b>출석</b>으로 찍은 학생을 <b>지각</b>으로 바꾸면 <b>직접</b> 표시가 붙습니다.
            </p>
          </div>

          {kinds.length === 0 && (
            <div className="alert alert-info">
              직접 입력하는 감점 항목이 없습니다. <b>기타 · 감점</b>에서 <b>태도 불량</b> 같은 항목을 먼저 만들어 주세요.
            </div>
          )}

          {shown.map((s) => {
            const r = byStudent.get(s.id);
            return (
              <div className={r ? 'live-row marked' : 'live-row'} key={s.id} style={{ opacity: pending === s.id ? 0.5 : 1 }}>
                <div className="who">
                  <b>{s.name}</b>
                  <span>{s.student_no}</span>
                </div>

                <div className="btn-row" style={{ flex: '2 1 320px' }}>
                  {QUICK.map(([st, label]) => (
                    <button
                      key={st}
                      className={r?.status === st ? 'btn-sm btn-navy' : 'btn-sm btn-ghost'}
                      onClick={() => mark(s, st)}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <div className="btn-row" style={{ flex: '1 1 200px' }}>
                  {r?.source === 'heyyoung' && <span className="badge">헤이영</span>}
                  {r?.source === 'manual' && <span className="badge badge-kind">직접</span>}
                  {kinds.map((k) => {
                    const n = counts.get(`${k.id}:${s.id}`) ?? 0;
                    return (
                      <span key={k.id} className="btn-row" style={{ gap: 4, alignItems: 'center' }}>
                        <button
                          className="btn-sm btn-ghost"
                          onClick={() => bump(k, s, -1)}
                          disabled={n === 0}
                          aria-label={`${s.name} ${k.label} 줄이기`}
                        >
                          −
                        </button>
                        <b className="small" style={{ minWidth: 58, textAlign: 'center' }}>
                          {k.label} {n}
                        </b>
                        <button
                          className={n > 0 ? 'btn-sm btn-navy' : 'btn-sm btn-ghost'}
                          onClick={() => bump(k, s, +1)}
                          aria-label={`${s.name} ${k.label} 올리기`}
                        >
                          +
                        </button>
                      </span>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {shown.length === 0 && <div className="empty">찾는 학생이 없습니다.</div>}
        </>
      )}
    </>
  );
}
