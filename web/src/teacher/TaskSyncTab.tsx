import { useCallback, useEffect, useMemo, useState } from 'react';
import { teacherClient } from '../lib/supabase';
import { downloadCsv, downloadXlsx, printTable, type SheetTable } from '../lib/exporters';
import {
  matchByStudentNo,
  parseTaskCounts,
  parseTaskDetail,
  type CountParseResult,
  type DetailParseResult,
  type ExtState,
} from '../lib/extTasks';
import {
  EXT_STATE_LABEL,
  type DeductionKind,
  type DeductionSummaryRow,
  type Student,
  type Task,
  type TaskSubmission,
} from '../lib/types';
import type { MenuKey } from './adminMenu';
import { errText } from '../lib/errors';

/**
 * 과제 제출현황 — 학교 LMS 에서 가져오기.
 *
 * 학교 LMS 가 원본이다. 학생은 거기에 과제를 낸다. 이쪽은 그 결과를 받아
 * **기타 점수(감점)** 로 바꾸는 자리다.
 *
 * 학교 LMS 과제 화면은 두 모양으로 나온다. 주는 정보가 서로 달라서
 * 반영하는 곳도 다르다.
 *
 *  ① 학생별 과제 — "학번 · 이름 · 제출수 3/3"
 *     어느 과제인지도, 늦었는지도 모른다. → 미제출 **건수**만 감점 항목에 넣는다.
 *     과제를 이 사이트에 등록하지 않아도 된다. 학기 중 아무 때나 덮어쓰면 된다.
 *
 *  ② 과제별 제출 목록 — "학번 · 이름 · 제출일시"
 *     과제 하나에 대해 누가 언제 냈는지 안다. → 그 과제의 제출 기록으로 넣고
 *     마감과 비교해 지각까지 가른다.
 *
 * 둘을 같은 과제에 겹쳐 쓰면 **두 번 깎인다**. 아래에서 지금 무엇이 세어지고
 * 있는지 그대로 보여 주고, 겹치면 경고한다.
 */

/** ① 이 만드는 감점 항목. 자동 집계와 부딪히지 않게 코드를 따로 쓴다. */
const EXT_MISSING_CODE = 'ext_task_missing';

type Mode = 'counts' | 'detail';

export default function TaskSyncTab({
  courseId,
  courseTitle,
  onGo,
}: {
  courseId: string;
  courseTitle: string;
  onGo: (key: MenuKey) => void;
}) {
  const [students, setStudents] = useState<Student[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [subs, setSubs] = useState<TaskSubmission[]>([]);
  const [kinds, setKinds] = useState<DeductionKind[]>([]);
  const [summary, setSummary] = useState<DeductionSummaryRow[]>([]);
  const [lastSync, setLastSync] = useState<string | null>(null);

  const [mode, setMode] = useState<Mode>('counts');
  const [paste, setPaste] = useState('');
  const [taskId, setTaskId] = useState('');
  const [markRest, setMarkRest] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [s, t, k, sum, log] = await Promise.all([
      teacherClient.from('students').select('*').eq('course_id', courseId).eq('active', true).order('student_no'),
      teacherClient.from('tasks').select('*').eq('course_id', courseId).order('due_at', { nullsFirst: false }),
      teacherClient.from('deduction_kinds').select('*').eq('course_id', courseId).order('ord'),
      teacherClient.rpc('deduction_summary', { p_course: courseId }),
      teacherClient.from('task_sync_log').select('synced_at').eq('course_id', courseId)
        .order('synced_at', { ascending: false }).limit(1),
    ]);
    if (s.error) setError(s.error.message);
    const tl = (t.data ?? []) as Task[];
    setStudents((s.data ?? []) as Student[]);
    setTasks(tl);
    setKinds((k.data ?? []) as DeductionKind[]);
    setSummary((sum.data ?? []) as DeductionSummaryRow[]);
    setLastSync(((log.data ?? []) as Array<{ synced_at: string }>)[0]?.synced_at ?? null);

    const ids = tl.map((x) => x.id);
    if (ids.length === 0) return setSubs([]);
    const { data: sub } = await teacherClient.from('task_submissions').select('*').in('task_id', ids);
    setSubs((sub ?? []) as TaskSubmission[]);
  }, [courseId]);

  useEffect(() => { load(); }, [load]);

  const roster = useMemo(
    () => students.map((s) => ({ id: s.id, student_no: s.student_no, name: s.name })),
    [students],
  );

  const counted = useMemo<CountParseResult | null>(
    () => (mode === 'counts' && paste.trim() ? parseTaskCounts(paste) : null),
    [mode, paste],
  );

  const task = tasks.find((t) => t.id === taskId) ?? null;

  const detail = useMemo<DetailParseResult | null>(
    () => (mode === 'detail' && paste.trim() ? parseTaskDetail(paste, task?.due_at ?? null) : null),
    [mode, paste, task?.due_at],
  );

  const countMatch = counted ? matchByStudentNo(counted.rows, roster) : null;
  const detailMatch = detail ? matchByStudentNo(detail.rows, roster) : null;

  // 이 사이트에 등록된 과제로도 미제출이 세어지고 있는지.
  const localGraded = tasks.filter((t) => t.status !== 'draft');
  const extKind = kinds.find((k) => k.code === EXT_MISSING_CODE) ?? null;
  const overlap = mode === 'counts' && localGraded.length > 0;

  // ── ① 제출수 반영 ────────────────────────────────────────
  async function applyCounts() {
    if (!counted || !countMatch) return;
    setBusy(true);
    setError(null);
    try {
      // 감점 항목이 없으면 만든다. 점수는 기존 '과제 미제출' 항목을 따라간다.
      let kind = extKind;
      if (!kind) {
        const base = kinds.find((k) => k.code === 'task_missing');
        const { data, error: err } = await teacherClient
          .from('deduction_kinds')
          .insert({
            course_id: courseId,
            code: EXT_MISSING_CODE,
            label: '학교 LMS 과제 미제출',
            points: base?.points ?? 5,
            source: 'manual',
            ord: kinds.length,
          })
          .select()
          .single();
        if (err) throw err;
        kind = data as DeductionKind;
      }

      // 붙여넣은 학생만 덮어쓴다. 안 나온 학생은 손대지 않는다 —
      // 표를 일부만 긁어 왔을 때 나머지가 0 이 되면 안 된다.
      for (const { row, studentId } of countMatch.matched) {
        const { data: existing } = await teacherClient
          .from('deductions')
          .select('id')
          .eq('kind_id', kind.id)
          .eq('student_id', studentId)
          .maybeSingle();

        if (row.missing === 0) {
          if (existing) await teacherClient.from('deductions').delete().eq('id', existing.id);
          continue;
        }
        const payload = {
          kind_id: kind.id,
          student_id: studentId,
          count: row.missing,
          note: `학교 LMS 제출 ${row.submitted}/${row.total}`,
        };
        const { error: err } = existing
          ? await teacherClient.from('deductions').update(payload).eq('id', existing.id)
          : await teacherClient.from('deductions').insert(payload);
        if (err) throw err;
      }

      await teacherClient.from('task_sync_log').insert({
        course_id: courseId,
        shape: 'roster',
        row_count: counted.rows.length,
        matched: countMatch.matched.length,
        missing: countMatch.matched.reduce((a, m) => a + m.row.missing, 0),
        unmatched: countMatch.unmatched.map((r) => ({ student_no: r.studentNo, name: r.name })),
      });

      setNotice(
        `${countMatch.matched.length}명 반영했습니다.` +
          (countMatch.unmatched.length ? ` 명단에 없는 학번 ${countMatch.unmatched.length}건은 넣지 않았습니다.` : '') +
          (countMatch.missing.length ? ` 붙여넣기에 안 나온 학생 ${countMatch.missing.length}명은 그대로 뒀습니다.` : ''),
      );
      setPaste('');
      await load();
    } catch (e) {
      setError(errText(e, '반영하지 못했습니다.'));
    } finally {
      setBusy(false);
    }
  }

  // ── ② 과제별 제출 목록 반영 ──────────────────────────────
  async function applyDetail() {
    if (!detail || !detailMatch || !task) return;
    if (task.mode === 'team') {
      return setError('팀 과제에는 학생별 목록을 붙일 수 없습니다. 개인 과제만 됩니다.');
    }
    setBusy(true);
    setError(null);
    try {
      const now = new Date().toISOString();
      const payload = detailMatch.matched.map(({ row, studentId }) => ({
        task_id: task.id,
        student_id: studentId,
        team_id: null,
        submitted_at: row.submittedAt,
        origin: 'ext_lms',
        ext_state: row.state,
        ext_synced_at: now,
      }));

      // 붙여넣기에 안 나온 학생을 미제출로 볼지는 사람이 정한다.
      // 표를 다 긁어 왔으면 켜고, 일부만 긁었으면 끈다.
      if (markRest) {
        detailMatch.missing.forEach((s) =>
          payload.push({
            task_id: task.id,
            student_id: s.id,
            team_id: null,
            submitted_at: null,
            origin: 'ext_lms',
            ext_state: 'missing' as ExtState,
            ext_synced_at: now,
          }),
        );
      }

      /*
       * upsert 를 쓰지 못한다.
       *
       * task_submissions 의 유니크 인덱스는 **부분 인덱스**다
       * (`... (task_id, student_id) where student_id is not null`).
       * Postgres 는 부분 인덱스를 ON CONFLICT 의 판단 근거로 삼지 못해서
       * "there is no unique or exclusion constraint matching the ON CONFLICT
       * specification" 으로 통째로 실패한다. 실제로 그래서 한 줄도 안 들어갔다.
       *
       * 그래서 있는 줄은 고치고 없는 줄만 넣는다.
       * 지우고 다시 넣지 않는 이유 — 이미 매긴 점수와 피드백이 날아간다.
       */
      const { data: existing, error: exErr } = await teacherClient
        .from('task_submissions')
        .select('id, student_id')
        .eq('task_id', task.id);
      if (exErr) throw exErr;

      const idOf = new Map(
        ((existing ?? []) as Array<{ id: string; student_id: string | null }>)
          .filter((r) => r.student_id)
          .map((r) => [r.student_id as string, r.id]),
      );

      const toInsert = payload.filter((p) => !idOf.has(p.student_id));
      const toUpdate = payload.filter((p) => idOf.has(p.student_id));

      for (let i = 0; i < toInsert.length; i += 200) {
        const { error: err } = await teacherClient
          .from('task_submissions')
          .insert(toInsert.slice(i, i + 200));
        if (err) throw err;
      }

      for (const p of toUpdate) {
        const { error: err } = await teacherClient
          .from('task_submissions')
          .update({
            submitted_at: p.submitted_at,
            origin: p.origin,
            ext_state: p.ext_state,
            ext_synced_at: p.ext_synced_at,
          })
          .eq('id', idOf.get(p.student_id)!);
        if (err) throw err;
      }

      const tally = (st: ExtState) => payload.filter((p) => p.ext_state === st).length;
      await teacherClient.from('task_sync_log').insert({
        course_id: courseId,
        task_id: task.id,
        shape: 'detail',
        row_count: detail.rows.length,
        matched: detailMatch.matched.length,
        submitted: tally('submitted'),
        late: tally('late'),
        missing: tally('missing'),
        unmatched: detailMatch.unmatched.map((r) => ({ student_no: r.studentNo, name: r.name })),
      });

      setNotice(
        `"${task.title}" — 제출 ${tally('submitted')} · 지각 ${tally('late')} · 미제출 ${tally('missing')} 반영했습니다.` +
          (detailMatch.unmatched.length ? ` 명단에 없는 학번 ${detailMatch.unmatched.length}건은 넣지 않았습니다.` : ''),
      );
      setPaste('');
      await load();
    } catch (e) {
      setError(errText(e, '반영하지 못했습니다.'));
    } finally {
      setBusy(false);
    }
  }

  // ── 현황판 ───────────────────────────────────────────────
  /** 과제 한 칸의 최종 판정. DB 의 deduction_summary() 와 같은 규칙이다. */
  function stateOf(t: Task, s: Student): ExtState {
    // 팀 과제는 팀 줄 하나가 팀원 전원의 판정이 된다. 팀이 없으면 낼 곳이 없으니 미제출.
    const row = subs.find(
      (x) => x.task_id === t.id && (t.mode === 'team' ? x.team_id === s.team_id : x.student_id === s.id),
    );
    if (!row) return 'missing';
    if (row.ext_state) return row.ext_state;
    if (!row.submitted_at) return 'missing';
    if (t.due_at && new Date(row.submitted_at).getTime() > new Date(t.due_at).getTime()) return 'late';
    return 'submitted';
  }

  const extCount = (sid: string) =>
    Number(summary.find((r) => r.student_id === sid && r.code === EXT_MISSING_CODE)?.cnt ?? 0);

  function buildSheet(): SheetTable {
    const head = ['학번', '이름', ...localGraded.map((t) => t.title), '미제출', '지각', '학교 LMS 미제출(건)'];
    const rows = students.map((s) => {
      const states = localGraded.map((t) => stateOf(t, s));
      return [
        s.student_no,
        s.name,
        ...states.map((st) => EXT_STATE_LABEL[st]),
        states.filter((x) => x === 'missing').length,
        states.filter((x) => x === 'late').length,
        extCount(s.id),
      ];
    });
    return { name: '과제 제출현황', rows: [head, ...rows] };
  }

  const fileBase = `${courseTitle}_과제제출현황`;

  return (
    <>
      {error && <div className="alert alert-error">{error}</div>}
      {notice && <div className="alert alert-ok">{notice}</div>}

      <div className="card tight">
        <p className="small" style={{ marginTop: 0 }}>
          마지막 반영:{' '}
          {lastSync ? <b>{new Date(lastSync).toLocaleString('ko-KR')}</b> : <span className="muted">아직 없음</span>}
          {' · '}반영한 결과는 <b>기타 · 감점</b>을 거쳐 기말 <b>성적 산출</b> 한 번에 들어갑니다.
        </p>
        <div className="btn-row">
          <button className="btn-sm btn-ghost" onClick={() => onGo('deduction')}>기타 · 감점 보기</button>
          <button className="btn-sm btn-ghost" onClick={() => onGo('grades')}>성적 산출로</button>
        </div>
      </div>

      <div className="section-title">가져오기</div>
      <div className="tabs">
        <button aria-selected={mode === 'counts'} onClick={() => { setMode('counts'); setPaste(''); }}>
          ① 학생별 과제 (제출수)
        </button>
        <button aria-selected={mode === 'detail'} onClick={() => { setMode('detail'); setPaste(''); }}>
          ② 과제별 제출 목록
        </button>
      </div>

      {mode === 'counts' ? (
        <div className="card">
          <p className="small muted" style={{ marginTop: 0 }}>
            학교 LMS <b>과제관리 → 학생별 과제</b> 표를 통째로 긁어 붙이세요.
            줄에서 <b>학번</b>과 <b>제출수(3/3)</b>만 찾습니다. 열 순서는 상관없습니다.
            <br />
            못 낸 개수가 <b>{extKind?.label ?? '학교 LMS 과제 미제출'}</b> 감점 건수가 됩니다.
            과제별 지각 여부는 이 표에 없어서 알 수 없습니다.
          </p>

          {overlap && (
            <div className="alert alert-warn">
              이 사이트에도 진행중·마감된 과제가 <b>{localGraded.length}개</b> 있습니다.
              그쪽에서도 미제출이 자동으로 세어지므로 <b>같은 과제를 두 번 깎을 수 있습니다.</b>{' '}
              학교 LMS 과제를 이 방식으로 셀 거라면, 그 과제들은 <b>준비중</b>으로 돌려 두거나
              <b> 기타 · 감점</b>에서 <b>과제 미제출</b> 항목을 0 점으로 두세요.
            </div>
          )}

          <textarea
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            rows={8}
            className="mono"
            style={{ fontSize: 14 }}
            placeholder={'1\t학부\t3\t202126002\t고재욱\t\t3/3\t조회\n2\t학부\t3\t202415002\t고채연\t\t2/3\t조회'}
          />

          {counted && countMatch && (
            <>
              <div className="alert alert-info" style={{ marginTop: 12 }}>
                읽은 줄 <b>{counted.rows.length}</b> · 명단과 맞음 <b>{countMatch.matched.length}</b>
                {countMatch.unmatched.length > 0 && <> · 명단에 없음 {countMatch.unmatched.length}</>}
                {countMatch.missing.length > 0 && <> · 붙여넣기에 없음 {countMatch.missing.length}</>}
                {counted.total !== null && <> · 과제 총 {counted.total}개</>}
                {counted.total === null && counted.rows.length > 0 && (
                  <> · <b>줄마다 분모가 다릅니다</b> — 표를 확인하세요</>
                )}
              </div>

              {counted.skipped.length > 0 && (
                <details>
                  <summary className="small">못 읽은 줄 {counted.skipped.length}개 보기</summary>
                  <ul className="small muted">
                    {counted.skipped.slice(0, 20).map((s) => <li key={s.line}>{s.line}번째 줄 — {s.reason}</li>)}
                  </ul>
                </details>
              )}
              {countMatch.unmatched.length > 0 && (
                <details>
                  <summary className="small">명단에 없는 학번 {countMatch.unmatched.length}개 보기</summary>
                  <ul className="small muted">
                    {countMatch.unmatched.slice(0, 20).map((r) => <li key={r.studentNo}>{r.studentNo} {r.name ?? ''}</li>)}
                  </ul>
                </details>
              )}

              <div className="table-wrap" style={{ marginTop: 10 }}>
                <table>
                  <thead><tr><th>학번</th><th>이름</th><th>제출</th><th>미제출</th></tr></thead>
                  <tbody>
                    {countMatch.matched.slice(0, 12).map(({ row }) => (
                      <tr key={row.studentNo}>
                        <td className="mono">{row.studentNo}</td>
                        <td>{row.name ?? '—'}</td>
                        <td>{row.submitted}/{row.total}</td>
                        <td>{row.missing > 0 ? <b>{row.missing}</b> : <span className="muted">0</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {countMatch.matched.length > 12 && (
                <p className="small muted">…앞 12줄만 미리 보입니다. 반영은 {countMatch.matched.length}명 모두 됩니다.</p>
              )}

              <button
                className="btn-primary btn-block"
                style={{ marginTop: 12 }}
                disabled={busy || countMatch.matched.length === 0}
                onClick={applyCounts}
              >
                {busy ? '반영 중…' : `${countMatch.matched.length}명 반영`}
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="card">
          <p className="small muted" style={{ marginTop: 0 }}>
            학교 LMS <b>과제관리(출제/채점) → 채점하기</b> 목록을 긁어 붙이세요.
            줄에서 <b>학번</b>과 <b>제출일시</b>(또는 제출·미제출 같은 상태 낱말)를 찾습니다.
            마감시각과 비교해 <b>지각 제출</b>을 스스로 가릅니다.
          </p>

          <label className="small muted">
            어느 과제인가
            <select value={taskId} onChange={(e) => setTaskId(e.target.value)}>
              <option value="">— 고르세요 —</option>
              {tasks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title} {t.due_at ? `(마감 ${new Date(t.due_at).toLocaleString('ko-KR')})` : '(마감 없음)'}
                </option>
              ))}
            </select>
          </label>

          {tasks.length === 0 && (
            <div className="alert alert-warn" style={{ marginTop: 10 }}>
              이 사이트에 등록된 과제가 없습니다. <b>과제 관리</b>에서 같은 제목·마감으로 먼저 만들어 주세요.
              {' '}과제를 등록하기 싫으면 <b>①</b> 방식을 쓰세요.
            </div>
          )}
          {task && !task.due_at && (
            <div className="alert alert-info" style={{ marginTop: 10 }}>
              이 과제에 마감시각이 없어 <b>지각을 가릴 수 없습니다.</b> 붙여넣기에 "지각" 같은 낱말이
              들어 있으면 그건 그대로 씁니다.
            </div>
          )}

          <textarea
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            rows={8}
            className="mono"
            style={{ fontSize: 14, marginTop: 10 }}
            placeholder={'202126002\t고재욱\t2026-03-16 21:04\n202415002\t고채연\t2026-03-17 09:12\n202439003\t권시온\t미제출'}
          />

          <label className="small" style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10 }}>
            <input type="checkbox" checked={markRest} onChange={(e) => setMarkRest(e.target.checked)} style={{ width: 'auto' }} />
            붙여넣기에 안 나온 학생을 <b>미제출</b>로 표시 (표를 다 긁어 왔을 때만 켜세요)
          </label>

          {detail && detailMatch && task && (
            <>
              <div className="alert alert-info" style={{ marginTop: 12 }}>
                읽은 줄 <b>{detail.rows.length}</b> · 명단과 맞음 <b>{detailMatch.matched.length}</b>
                {detailMatch.unmatched.length > 0 && <> · 명단에 없음 {detailMatch.unmatched.length}</>}
                {' · '}제출 {detailMatch.matched.filter((m) => m.row.state === 'submitted').length}
                {' · '}지각 <b>{detailMatch.matched.filter((m) => m.row.state === 'late').length}</b>
                {' · '}미제출 <b>{detailMatch.matched.filter((m) => m.row.state === 'missing').length}
                {markRest && detailMatch.missing.length > 0 && ` (+${detailMatch.missing.length})`}</b>
              </div>

              {detail.skipped.length > 0 && (
                <details>
                  <summary className="small">못 읽은 줄 {detail.skipped.length}개 보기</summary>
                  <ul className="small muted">
                    {detail.skipped.slice(0, 20).map((s) => <li key={s.line}>{s.line}번째 줄 — {s.reason}</li>)}
                  </ul>
                </details>
              )}

              <div className="table-wrap" style={{ marginTop: 10 }}>
                <table>
                  <thead><tr><th>학번</th><th>이름</th><th>제출일시</th><th>판정</th></tr></thead>
                  <tbody>
                    {detailMatch.matched.slice(0, 12).map(({ row }) => (
                      <tr key={row.studentNo}>
                        <td className="mono">{row.studentNo}</td>
                        <td>{row.name ?? '—'}</td>
                        <td className="muted small">
                          {row.submittedAt ? new Date(row.submittedAt).toLocaleString('ko-KR') : '—'}
                        </td>
                        <td>
                          <span className={row.state === 'submitted' ? 'badge badge-open' : row.state === 'late' ? 'badge badge-closed' : 'badge badge-draft'}>
                            {EXT_STATE_LABEL[row.state ?? 'missing']}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <button
                className="btn-primary btn-block"
                style={{ marginTop: 12 }}
                disabled={busy || detailMatch.matched.length === 0}
                onClick={applyDetail}
              >
                {busy ? '반영 중…' : `"${task.title}" 에 반영`}
              </button>
            </>
          )}
        </div>
      )}

      {/* ── 현황판 ─────────────────────────────────────── */}
      <div className="section-title" style={{ marginTop: 28 }}>학생별 현황</div>
      <div className="card tight">
        <div className="row" style={{ alignItems: 'center' }}>
          <div style={{ flex: 1 }} className="small muted">
            이 사이트에 등록된 과제 {localGraded.length}개 + 학교 LMS 에서 받은 미제출 건수입니다.
          </div>
          <button className="btn-sm btn-ghost" style={{ flex: '0 0 auto' }} onClick={() => downloadCsv(buildSheet().rows, fileBase)}>CSV</button>
          <button className="btn-sm btn-ghost" style={{ flex: '0 0 auto' }} onClick={() => downloadXlsx([buildSheet()], fileBase)}>XLSX</button>
          <button
            className="btn-sm btn-ghost"
            style={{ flex: '0 0 auto' }}
            onClick={() => { if (!printTable(fileBase, [buildSheet()])) setError('팝업이 막혀 있습니다.'); }}
          >
            PDF(인쇄)
          </button>
        </div>
      </div>

      {students.length === 0 ? (
        <div className="empty">명단이 없습니다.</div>
      ) : (
        <div className="table-wrap">
          <table className="pivot">
            <thead>
              <tr>
                <th>이름</th>
                {localGraded.map((t) => <th key={t.id}>{t.title}</th>)}
                <th>미제출</th>
                <th>지각</th>
                <th>학교 LMS 미제출</th>
              </tr>
            </thead>
            <tbody>
              {students.map((s) => {
                const states = localGraded.map((t) => stateOf(t, s));
                const miss = states.filter((x) => x === 'missing').length;
                const late = states.filter((x) => x === 'late').length;
                return (
                  <tr key={s.id}>
                    <td>
                      {s.name}
                      <div className="small muted mono">{s.student_no}</div>
                    </td>
                    {localGraded.map((t, i) => (
                      <td key={t.id}>
                        <span className={states[i] === 'submitted' ? 'badge badge-open' : states[i] === 'late' ? 'badge badge-closed' : 'badge badge-draft'}>
                          {EXT_STATE_LABEL[states[i]!]}
                        </span>
                      </td>
                    ))}
                    <td>{miss ? <b>{miss}</b> : <span className="muted">0</span>}</td>
                    <td>{late ? <b>{late}</b> : <span className="muted">0</span>}</td>
                    <td>{extCount(s.id) ? <b>{extCount(s.id)}</b> : <span className="muted">0</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
