import { useCallback, useEffect, useMemo, useState } from 'react';
import { teacherClient } from '../lib/supabase';
import {
  ATTENDANCE_LABEL,
  matchRoster,
  parseHeyYoungCsv,
  parseHeyYoungMatrix,
  type HeyYoungParseResult,
  type MatrixParseResult,
  type MatrixStatus,
} from '../lib/heyyoung';
import { downloadCsv, downloadXlsx, printTable, type SheetTable } from '../lib/exporters';
import type {
  AttendanceRow,
  CourseSession,
  CourseWeek,
  DeductionKind,
  DeductionSummaryRow,
  Student,
} from '../lib/types';

const STATUSES: MatrixStatus[] = ['present', 'late', 'absent', 'excused', 'early_leave'];

const STATUS_LABEL: Record<MatrixStatus, string> = { ...ATTENDANCE_LABEL, early_leave: '조퇴' };

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

  // 헤이영 출석부는 학기 전체가 한 파일에 가로로 들어 있다.
  // 회차 하나짜리 세로형과 달리 주차·교시 열을 모두 훑어 한 번에 적재한다.
  const [matrix, setMatrix] = useState<MatrixParseResult | null>(null);

  // 태도 불량은 출석을 정리하면서 바로 넣는 게 자연스럽다.
  // 지각·조퇴는 출결에서 자동으로 세므로 여기서 따로 넣지 않는다.
  const [attitudeKind, setAttitudeKind] = useState<DeductionKind | null>(null);
  const [attitude, setAttitude] = useState<Map<string, number>>(new Map());

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

    // 태도 불량 항목과 현재 건수를 함께 읽는다.
    const { data: kinds } = await teacherClient
      .from('deduction_kinds')
      .select('*')
      .eq('course_id', courseId)
      .eq('source', 'manual')
      .eq('active', true)
      .order('ord');
    const first = ((kinds ?? []) as DeductionKind[])[0] ?? null;
    setAttitudeKind(first);

    if (first) {
      const { data: sum } = await teacherClient.rpc('deduction_summary', { p_course: courseId });
      const m = new Map<string, number>();
      ((sum ?? []) as DeductionSummaryRow[])
        .filter((r) => r.kind_id === first.id)
        .forEach((r) => m.set(r.student_id, Number(r.cnt)));
      setAttitude(m);
    }
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

  async function setStatus(studentId: string, status: MatrixStatus) {
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

  /** 태도 불량 건수를 바로 저장한다. 0 이면 기록을 지운다. */
  async function saveAttitude(studentId: string, raw: string) {
    if (!attitudeKind) return;
    const count = raw.trim() === '' ? 0 : Number(raw);
    if (Number.isNaN(count) || count < 0) return setError('건수는 0 이상이어야 합니다.');
    setError(null);

    const { data: existing } = await teacherClient
      .from('deductions')
      .select('id')
      .eq('kind_id', attitudeKind.id)
      .eq('student_id', studentId)
      .maybeSingle();

    const err = count === 0
      ? existing ? (await teacherClient.from('deductions').delete().eq('id', existing.id)).error : null
      : existing
        ? (await teacherClient.from('deductions').update({ count }).eq('id', existing.id)).error
        : (await teacherClient.from('deductions').insert({ kind_id: attitudeKind.id, student_id: studentId, count })).error;

    if (err) setError(err.message);
    else setAttitude((prev) => new Map(prev).set(studentId, count));
  }

  // ── 헤이영 출석부(가로형) ──────────────────────────────────
  async function onMatrixFile(file: File) {
    setError(null);
    setNotice(null);
    setFileName(file.name);
    try {
      const text = await file.text();
      // 주차 시작일에서 연도를 가져온다. 없으면 올해로 본다.
      const year = weeks.find((w) => w.starts_on)?.starts_on?.slice(0, 4);
      const result = parseHeyYoungMatrix(text, year ? Number(year) : undefined);
      if (result.students.length === 0) {
        setError('출석부를 읽지 못했습니다. 헤이영 "엑셀다운" 파일을 엑셀에서 "CSV UTF-8"로 저장했는지 확인해 주세요.');
      }
      setMatrix(result);
    } catch {
      setError('파일을 읽지 못했습니다.');
    }
  }

  /** 주차·교시로 회차를 찾아 학기 전체를 한 번에 적재한다. */
  async function applyMatrix() {
    if (!matrix) return;
    setBusy(true);
    setError(null);
    try {
      const weekNo = new Map(weeks.map((w) => [w.week_no, w.id]));
      const sessionOf = new Map<string, string>();
      sessions.forEach((s) => {
        const w = weeks.find((x) => x.id === s.week_id);
        if (w) sessionOf.set(`${w.week_no}:${s.session_no}`, s.id);
      });

      const roster = new Map(students.map((s) => [s.student_no.replace(/\s/g, ''), s.id]));
      const payload: Array<Record<string, unknown>> = [];
      const missingSessions = new Set<string>();
      let unmatchedStudents = 0;

      for (const st of matrix.students) {
        const sid = roster.get(st.studentNo);
        if (!sid) { unmatchedStudents += 1; continue; }
        for (const c of st.cells) {
          const key = `${c.week}:${c.session}`;
          const sessionId2 = sessionOf.get(key);
          if (!sessionId2) { missingSessions.add(key); continue; }
          payload.push({
            session_id: sessionId2,
            student_id: sid,
            status: c.status,
            source: 'heyyoung',
            checked_in_at: null,
          });
        }
      }

      if (payload.length > 0) {
        // 한 번에 다 보내면 요청이 너무 커진다. 500 개씩 끊는다.
        for (let i = 0; i < payload.length; i += 500) {
          const { error: err } = await teacherClient
            .from('attendance')
            .upsert(payload.slice(i, i + 500), { onConflict: 'session_id,student_id' });
          if (err) throw err;
        }
      }

      await teacherClient.from('attendance_imports').insert({
        course_id: courseId,
        filename: fileName || null,
        row_count: matrix.students.length,
        matched: matrix.students.length - unmatchedStudents,
        unmatched: { unmatchedStudents, missingSessions: [...missingSessions] },
      });

      const parts = [`출결 ${payload.length}칸을 적재했습니다.`];
      if (unmatchedStudents) parts.push(`명단에 없는 학생 ${unmatchedStudents}명은 건너뛰었습니다.`);
      if (missingSessions.size) {
        parts.push(`회차가 없어 넣지 못한 칸: ${[...missingSessions].slice(0, 6).join(', ')}${missingSessions.size > 6 ? ' …' : ''} — 주차 탭에서 회차를 만들어 주세요.`);
      }
      setNotice(parts.join(' '));
      setMatrix(null);
      setFileName('');
      await loadRows(sessionId);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : '적재하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  }

  const byStudent = new Map(rows.map((r) => [r.student_id, r]));

  /** 현재 회차의 출결일지를 내보내기용 표로 만든다. */
  function buildSheet(): SheetTable {
    const s = orderedSessions.find((x) => x.id === sessionId);
    const head = ['학번', '이름', '출결', '체크인', '출처'];
    if (attitudeKind) head.push(`${attitudeKind.label} (건)`);
    const rows2 = students.map((st) => {
      const r = byStudent.get(st.id);
      const base: Array<string | number | null> = [
        st.student_no,
        st.name,
        r ? STATUS_LABEL[r.status as MatrixStatus] : '미표시',
        r?.checked_in_at ? new Date(r.checked_in_at).toLocaleString('ko-KR') : '',
        r?.source === 'heyyoung' ? '헤이영' : r ? '직접' : '',
      ];
      if (attitudeKind) base.push(attitude.get(st.id) ?? 0);
      return base;
    });
    return { name: s ? sessionLabel(s) : '출결일지', rows: [head, ...rows2] };
  }

  return (
    <>
      {error && <div className="alert alert-error">{error}</div>}
      {notice && <div className="alert alert-ok">{notice}</div>}

      {orderedSessions.length === 0 && (
        <div className="alert alert-warn">
          회차가 없습니다. <b>주차</b> 탭에서 주차와 회차를 먼저 만들어 주세요. 출석은 회차에 붙습니다.
        </div>
      )}

      {/* ── 학기 전체 출석부 (가로형) ─────────────────── */}
      <div className="section-title">헤이영 출석부 통째로 가져오기</div>
      <div className="card tight">
        <p className="muted small" style={{ marginTop: 0 }}>
          헤이영 <b>강좌별 출석관리 → 교과목명 클릭 → 엑셀다운</b> 으로 받은 파일입니다.
          학생 한 명이 한 줄이고 주차마다 교시 칸이 붙은 표라 <b>학기 전체가 한 번에</b> 들어갑니다.
          엑셀에서 <b>CSV UTF-8</b> 로 저장해 올려 주세요.
        </p>
        <input
          type="file"
          accept=".csv,.tsv,.txt,text/csv"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onMatrixFile(f); }}
          aria-label="헤이영 출석부 파일"
        />

        {matrix && (
          <div style={{ marginTop: 12 }}>
            <div className="alert alert-info">
              <b>{fileName}</b> — 학생 {matrix.students.length}명 · 열 {matrix.columns.length}개
              {matrix.columns.length > 0 && (
                <> ({matrix.columns[0]?.week}주 {matrix.columns[0]?.session}회차 ~ {matrix.columns[matrix.columns.length - 1]?.week}주 {matrix.columns[matrix.columns.length - 1]?.session}회차)</>
              )}
              <div className="small muted" style={{ marginTop: 6 }}>
                기호 — O 출석 · ◎ <b>유고결석</b> · △ 지각 · X 결석 · □ 조퇴 · - 미정(넣지 않음)
              </div>
            </div>

            {Object.keys(matrix.unknownSymbols).length > 0 && (
              <div className="alert alert-warn">
                뜻을 모르는 기호가 있습니다 —{' '}
                {Object.entries(matrix.unknownSymbols).map(([sym, n]) => `${sym}(${n}건)`).join(', ')}.
                이 칸은 넣지 않습니다.
              </div>
            )}
            {matrix.skipped.length > 0 && (
              <details>
                <summary className="small">못 읽은 줄 {matrix.skipped.length}개 보기</summary>
                <ul className="small muted">
                  {matrix.skipped.slice(0, 20).map((s) => <li key={s.line}>{s.line}번째 줄 — {s.reason}</li>)}
                </ul>
              </details>
            )}

            <div className="btn-row" style={{ marginTop: 10 }}>
              <button className="btn-primary btn-sm" disabled={busy} onClick={applyMatrix}>학기 전체 적재</button>
              <button className="btn-sm btn-ghost" onClick={() => { setMatrix(null); setFileName(''); }}>취소</button>
            </div>
          </div>
        )}
      </div>

      <div className="section-title" style={{ marginTop: 28 }}>회차별 출결일지</div>
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
                    {STATUS_LABEL[s]} <b>{rows.filter((r) => r.status === s).length}</b>
                  </span>
                ))}
                · 미표시 <b>{students.length - rows.length}</b>
              </div>
              <button className="btn-sm btn-ghost" style={{ flex: '0 0 auto' }} disabled={busy} onClick={fillPresent}>
                미표시 전원 출석
              </button>
              <button className="btn-sm btn-ghost" style={{ flex: '0 0 auto' }} onClick={() => downloadCsv(buildSheet().rows, buildSheet().name)}>CSV</button>
              <button className="btn-sm btn-ghost" style={{ flex: '0 0 auto' }} onClick={() => downloadXlsx([buildSheet()], buildSheet().name)}>XLSX</button>
              <button className="btn-sm btn-ghost" style={{ flex: '0 0 auto' }} onClick={() => { if (!printTable(buildSheet().name, [buildSheet()])) setError('팝업이 막혀 있습니다.'); }}>PDF(인쇄)</button>
            </div>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>학번</th><th>이름</th><th>체크인</th><th>출결</th>{attitudeKind && <th>{attitudeKind.label}</th>}</tr>
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
                              {STATUS_LABEL[st]}
                            </button>
                          ))}
                        </div>
                      </td>
                      {attitudeKind && (
                        <td>
                          <input
                            type="number"
                            min={0}
                            style={{ width: 70 }}
                            defaultValue={attitude.get(s.id) || ''}
                            onBlur={(e) => saveAttitude(s.id, e.target.value)}
                            aria-label={`${s.name} ${attitudeKind.label} 건수`}
                          />
                        </td>
                      )}
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
