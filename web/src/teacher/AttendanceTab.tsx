import { useCallback, useEffect, useMemo, useState } from 'react';
import { teacherClient } from '../lib/supabase';
import {
  ATTENDANCE_LABEL,
  matchRoster,
  parseHeyYoungCsv,
  type AttendanceStatus,
  type HeyYoungParseResult,
} from '../lib/heyyoung';
import type { AttendanceRow, CourseSession, CourseWeek, Student } from '../lib/types';

const STATUSES: AttendanceStatus[] = ['present', 'late', 'absent', 'excused'];

/**
 * 출결일지 + 헤이영 파일 가져오기.
 *
 * 헤이영에는 공개 API 가 없어서 교수가 내려받은 CSV 를 올리는 방식이다.
 * 파일 → 미리보기 → 확인 후 적재 순서로 간다. 바로 넣지 않는 이유는
 * 학번이 안 맞는 줄이 조용히 사라지면 결석이 통째로 빠진 채 성적이 나가기 때문이다.
 */
export default function AttendanceTab({ courseId }: { courseId: string }) {
  const [weeks, setWeeks] = useState<CourseWeek[]>([]);
  const [sessions, setSessions] = useState<CourseSession[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [rows, setRows] = useState<AttendanceRow[]>([]);
  const [sessionId, setSessionId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [parsed, setParsed] = useState<HeyYoungParseResult | null>(null);
  const [fileName, setFileName] = useState('');

  const load = useCallback(async () => {
    const [w, s] = await Promise.all([
      teacherClient.from('course_weeks').select('*').eq('course_id', courseId).order('week_no'),
      teacherClient.from('students').select('*').eq('course_id', courseId).eq('active', true).order('student_no'),
    ]);
    const wl = (w.data ?? []) as CourseWeek[];
    setWeeks(wl);
    setStudents((s.data ?? []) as Student[]);

    if (wl.length === 0) return setSessions([]);
    const { data: cs } = await teacherClient
      .from('course_sessions')
      .select('*')
      .in('week_id', wl.map((x) => x.id))
      .order('session_no');
    setSessions((cs ?? []) as CourseSession[]);
  }, [courseId]);

  useEffect(() => { load(); }, [load]);

  const loadRows = useCallback(async (sid: string) => {
    if (!sid) return setRows([]);
    const { data, error: err } = await teacherClient.from('attendance').select('*').eq('session_id', sid);
    if (err) setError(err.message);
    else setRows((data ?? []) as AttendanceRow[]);
  }, []);

  useEffect(() => { loadRows(sessionId); }, [sessionId, loadRows]);

  /** "3주차 1회차 (26.03.23)" 처럼 사람이 고르기 쉬운 이름을 만든다. */
  const sessionLabel = useCallback(
    (s: CourseSession) => {
      const w = weeks.find((x) => x.id === s.week_id);
      const date = s.meets_on ? ` (${s.meets_on})` : '';
      return `${w ? w.week_no : '?'}주차 ${s.session_no}회차${date}`;
    },
    [weeks],
  );

  const orderedSessions = useMemo(() => {
    const weekNo = new Map(weeks.map((w) => [w.id, w.week_no]));
    return [...sessions].sort(
      (a, b) => (weekNo.get(a.week_id) ?? 0) - (weekNo.get(b.week_id) ?? 0) || a.session_no - b.session_no,
    );
  }, [sessions, weeks]);

  async function setStatus(studentId: string, status: AttendanceStatus) {
    if (!sessionId) return;
    const existing = rows.find((r) => r.student_id === studentId);
    const payload = { session_id: sessionId, student_id: studentId, status, source: 'manual' as const };
    const { error: err } = existing
      ? await teacherClient.from('attendance').update(payload).eq('id', existing.id)
      : await teacherClient.from('attendance').insert(payload);
    if (err) setError(err.message);
    else await loadRows(sessionId);
  }

  /** 아직 아무 표시도 없는 학생을 한 번에 출석으로 채운다. */
  async function fillPresent() {
    if (!sessionId) return;
    const done = new Set(rows.map((r) => r.student_id));
    const missing = students.filter((s) => !done.has(s.id));
    if (missing.length === 0) return setNotice('이미 전원 표시되어 있습니다.');

    setBusy(true);
    const { error: err } = await teacherClient.from('attendance').insert(
      missing.map((s) => ({ session_id: sessionId, student_id: s.id, status: 'present', source: 'manual' })),
    );
    setBusy(false);
    if (err) setError(err.message);
    else {
      setNotice(`${missing.length}명을 출석으로 채웠습니다.`);
      await loadRows(sessionId);
    }
  }

  async function onFile(file: File) {
    setError(null);
    setNotice(null);
    setFileName(file.name);
    try {
      const text = await file.text();
      const result = parseHeyYoungCsv(text);
      if (result.rows.length === 0 && result.skipped.length === 0) {
        setError('읽을 수 있는 줄이 없습니다. 헤이영에서 내려받은 파일을 엑셀에서 "CSV UTF-8"로 저장했는지 확인해 주세요.');
      }
      setParsed(result);
    } catch {
      setError('파일을 읽지 못했습니다.');
    }
  }

  const preview = useMemo(() => {
    if (!parsed) return null;
    return matchRoster(
      parsed.rows,
      students.map((s) => ({ id: s.id, student_no: s.student_no, name: s.name })),
    );
  }, [parsed, students]);

  /** 미리보기에서 확인한 뒤에만 적재한다. */
  async function applyImport() {
    if (!parsed || !preview || !sessionId) return;
    setBusy(true);
    setError(null);
    try {
      const session = sessions.find((s) => s.id === sessionId);
      const payload = preview.matched.map(({ row, studentId }) => ({
        session_id: sessionId,
        student_id: studentId,
        status: row.status,
        // 파일에 날짜가 없으면 회차의 수업일을 쓴다.
        checked_in_at:
          row.time && (row.date || session?.meets_on)
            ? new Date(`${row.date ?? session?.meets_on}T${row.time}:00`).toISOString()
            : null,
        source: 'heyyoung' as const,
      }));

      if (payload.length > 0) {
        const { error: err } = await teacherClient
          .from('attendance')
          .upsert(payload, { onConflict: 'session_id,student_id' });
        if (err) throw err;
      }

      await teacherClient.from('attendance_imports').insert({
        course_id: courseId,
        filename: fileName || null,
        row_count: parsed.rows.length,
        matched: preview.matched.length,
        unmatched: preview.unmatched.map((r) => ({ student_no: r.studentNo, name: r.name })),
      });

      setNotice(
        `${preview.matched.length}명 적재했습니다.` +
          (preview.unmatched.length ? ` 명단에 없는 학번 ${preview.unmatched.length}건은 넣지 않았습니다.` : ''),
      );
      setParsed(null);
      setFileName('');
      await loadRows(sessionId);
    } catch (e) {
      setError(e instanceof Error ? e.message : '적재하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  }

  const byStudent = new Map(rows.map((r) => [r.student_id, r]));

  return (
    <>
      {error && <div className="alert alert-error">{error}</div>}
      {notice && <div className="alert alert-ok">{notice}</div>}

      {orderedSessions.length === 0 && (
        <div className="alert alert-warn">
          회차가 없습니다. <b>주차</b> 탭에서 주차와 회차를 먼저 만들어 주세요. 출석은 회차에 붙습니다.
        </div>
      )}

      <div className="card tight">
        <label className="small muted" htmlFor="att-session">회차 선택</label>
        <select id="att-session" value={sessionId} onChange={(e) => setSessionId(e.target.value)}>
          <option value="">— 고르세요 —</option>
          {orderedSessions.map((s) => (
            <option key={s.id} value={s.id}>{sessionLabel(s)}</option>
          ))}
        </select>
      </div>

      {sessionId && (
        <>
          {/* ── 헤이영 파일 ─────────────────────────────── */}
          <div className="section-title">헤이영 파일 가져오기</div>
          <div className="card tight">
            <p className="muted small" style={{ marginTop: 0 }}>
              헤이영에서 출결을 엑셀로 내려받은 뒤 <b>다른 이름으로 저장 → CSV UTF-8</b> 로 바꿔서 올려 주세요.
            </p>
            <input
              type="file"
              accept=".csv,.tsv,.txt,text/csv"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }}
              aria-label="헤이영 출결 파일"
            />

            {parsed && preview && (
              <div style={{ marginTop: 12 }}>
                <div className="alert alert-info">
                  <b>{fileName}</b> — 읽은 줄 {parsed.rows.length} · 명단과 맞음 <b>{preview.matched.length}</b>
                  {preview.unmatched.length > 0 && <> · 명단에 없음 {preview.unmatched.length}</>}
                  {preview.missing.length > 0 && <> · 파일에 안 나온 학생 {preview.missing.length}</>}
                  {parsed.skipped.length > 0 && <> · 못 읽은 줄 {parsed.skipped.length}</>}
                  <div className="small muted" style={{ marginTop: 6 }}>
                    인식한 열 — 학번: {parsed.mapping.studentNo ?? '못 찾음'} · 출결: {parsed.mapping.status ?? '못 찾음'}
                    {parsed.mapping.time && <> · 체크인: {parsed.mapping.time}</>}
                  </div>
                </div>

                {parsed.skipped.length > 0 && (
                  <details>
                    <summary className="small">못 읽은 줄 {parsed.skipped.length}개 보기</summary>
                    <ul className="small muted">
                      {parsed.skipped.slice(0, 20).map((s) => (
                        <li key={s.line}>{s.line}번째 줄 — {s.reason}</li>
                      ))}
                    </ul>
                  </details>
                )}

                {preview.unmatched.length > 0 && (
                  <details>
                    <summary className="small">명단에 없는 학번 {preview.unmatched.length}개 보기</summary>
                    <ul className="small muted">
                      {preview.unmatched.slice(0, 20).map((r, i) => (
                        <li key={`${r.studentNo}-${i}`}>{r.studentNo} {r.name ?? ''}</li>
                      ))}
                    </ul>
                  </details>
                )}

                <div className="btn-row" style={{ marginTop: 10 }}>
                  <button className="btn-primary btn-sm" disabled={busy || preview.matched.length === 0} onClick={applyImport}>
                    {preview.matched.length}명 적재하기
                  </button>
                  <button className="btn-sm btn-ghost" onClick={() => { setParsed(null); setFileName(''); }}>취소</button>
                </div>
              </div>
            )}
          </div>

          {/* ── 출결일지 ────────────────────────────────── */}
          <div className="section-title" style={{ marginTop: 28 }}>출결일지</div>
          <div className="card tight">
            <div className="row" style={{ alignItems: 'center' }}>
              <div style={{ flex: 1 }} className="small muted">
                {STATUSES.map((s) => (
                  <span key={s} style={{ marginRight: 12 }}>
                    {ATTENDANCE_LABEL[s]} <b>{rows.filter((r) => r.status === s).length}</b>
                  </span>
                ))}
                · 미표시 <b>{students.length - rows.length}</b>
              </div>
              <button className="btn-sm btn-ghost" style={{ flex: '0 0 auto' }} disabled={busy} onClick={fillPresent}>
                미표시 전원 출석
              </button>
            </div>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>학번</th><th>이름</th><th>체크인</th><th>출결</th></tr>
              </thead>
              <tbody>
                {students.map((s) => {
                  const r = byStudent.get(s.id);
                  return (
                    <tr key={s.id}>
                      <td className="mono">{s.student_no}</td>
                      <td>{s.name}</td>
                      <td className="muted small">
                        {r?.checked_in_at ? new Date(r.checked_in_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : '—'}
                        {r?.source === 'heyyoung' && <span className="badge" style={{ marginLeft: 6 }}>헤이영</span>}
                      </td>
                      <td>
                        <div className="btn-row">
                          {STATUSES.map((st) => (
                            <button
                              key={st}
                              className={r?.status === st ? 'btn-sm btn-navy' : 'btn-sm btn-ghost'}
                              onClick={() => setStatus(s.id, st)}
                            >
                              {ATTENDANCE_LABEL[st]}
                            </button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
