import { useCallback, useEffect, useState } from 'react';
import { teacherClient } from '../lib/supabase';
import { downloadCsv, downloadXlsx, printTable, type SheetTable } from '../lib/exporters';
import {
  DEDUCTION_SOURCE_LABEL,
  type DeductionKind,
  type DeductionSource,
  type DeductionSummaryRow,
  type Student,
} from '../lib/types';

/**
 * 감점 요소와 학생별 감점 현황.
 *
 * 지각·조퇴·과제미제출·과제 지각제출은 출결·과제에서 자동으로 센다.
 * 태도 불량처럼 세어 줄 근거가 없는 항목만 사람이 건수를 넣는다.
 * 세는 일은 전부 DB 의 deduction_summary() 가 한다 — 화면에서 합치지 않는다.
 */
export default function DeductionTab({ courseId, courseTitle }: { courseId: string; courseTitle: string }) {
  const [kinds, setKinds] = useState<DeductionKind[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [summary, setSummary] = useState<DeductionSummaryRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [k, s, sum] = await Promise.all([
      teacherClient.from('deduction_kinds').select('*').eq('course_id', courseId).order('ord'),
      teacherClient.from('students').select('*').eq('course_id', courseId).eq('active', true).order('student_no'),
      teacherClient.rpc('deduction_summary', { p_course: courseId }),
    ]);
    if (k.error) setError(k.error.message);
    setKinds((k.data ?? []) as DeductionKind[]);
    setStudents((s.data ?? []) as Student[]);
    if (sum.error) setError(sum.error.message);
    else setSummary((sum.data ?? []) as DeductionSummaryRow[]);
  }, [courseId]);

  useEffect(() => { load(); }, [load]);

  async function seedDefaults() {
    setBusy(true);
    const { error: err } = await teacherClient.rpc('seed_deduction_kinds', { p_course: courseId });
    setBusy(false);
    if (err) setError(err.message);
    else { setNotice('기본 감점 항목을 넣었습니다.'); await load(); }
  }

  async function patchKind(id: string, patch: Partial<DeductionKind>) {
    const { error: err } = await teacherClient.from('deduction_kinds').update(patch).eq('id', id);
    if (err) setError(err.message);
    else await load();
  }

  async function addKind() {
    const label = prompt('감점 항목 이름 (예: 무단 이석)');
    if (!label?.trim()) return;
    const code = `manual_${Date.now().toString(36)}`;
    const { error: err } = await teacherClient
      .from('deduction_kinds')
      .insert({ course_id: courseId, code, label: label.trim(), points: 1, source: 'manual', ord: kinds.length });
    if (err) setError(err.message);
    else await load();
  }

  /** 직접 입력 항목의 건수를 저장한다. 자동 항목은 여기로 오지 않는다. */
  async function setManualCount(kindId: string, studentId: string, raw: string) {
    const count = raw.trim() === '' ? 0 : Number(raw);
    if (Number.isNaN(count) || count < 0) return setError('건수는 0 이상의 숫자여야 합니다.');
    setError(null);

    const { data: existing } = await teacherClient
      .from('deductions')
      .select('id')
      .eq('kind_id', kindId)
      .eq('student_id', studentId)
      .maybeSingle();

    const err = count === 0
      ? existing
        ? (await teacherClient.from('deductions').delete().eq('id', existing.id)).error
        : null
      : existing
        ? (await teacherClient.from('deductions').update({ count }).eq('id', existing.id)).error
        : (await teacherClient.from('deductions').insert({ kind_id: kindId, student_id: studentId, count })).error;

    if (err) setError(err.message);
    else await load();
  }

  // student_id → kind_id → 요약
  const cell = new Map<string, DeductionSummaryRow>();
  summary.forEach((r) => cell.set(`${r.student_id}:${r.kind_id}`, r));
  const totalOf = (sid: string) =>
    summary.filter((r) => r.student_id === sid).reduce((a, r) => a + Number(r.subtotal), 0);

  /** 내보내기용 표. 화면에 보이는 것과 같은 모양으로 만든다. */
  function buildSheet(): SheetTable {
    const head = ['학번', '이름', ...kinds.map((k) => `${k.label} (건)`), ...kinds.map((k) => `${k.label} (점)`), '감점 합계'];
    const rows = students.map((s) => [
      s.student_no,
      s.name,
      ...kinds.map((k) => Number(cell.get(`${s.id}:${k.id}`)?.cnt ?? 0)),
      ...kinds.map((k) => Number(cell.get(`${s.id}:${k.id}`)?.subtotal ?? 0)),
      totalOf(s.id),
    ]);
    return { name: '감점 현황', rows: [head, ...rows] };
  }

  const fileBase = `${courseTitle}_감점현황`;

  return (
    <>
      {error && <div className="alert alert-error">{error}</div>}
      {notice && <div className="alert alert-ok">{notice}</div>}

      <div className="section-title">감점 항목</div>
      <div className="card tight">
        <div className="row" style={{ alignItems: 'center' }}>
          <div style={{ flex: 1 }} className="muted small">
            자동 항목은 출결·과제에서 건수를 세어 옵니다. 점수만 정해 주세요.
          </div>
          {kinds.length === 0 && (
            <button className="btn-primary btn-sm" style={{ flex: '0 0 auto' }} disabled={busy} onClick={seedDefaults}>
              기본 항목 넣기
            </button>
          )}
          <button className="btn-sm btn-ghost" style={{ flex: '0 0 auto' }} onClick={addKind}>+ 항목 추가</button>
        </div>
      </div>

      {kinds.length === 0 ? (
        <div className="empty">감점 항목이 없습니다.</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>항목</th><th style={{ width: 110 }}>1건당 점수</th><th>집계 방식</th><th>사용</th></tr>
            </thead>
            <tbody>
              {kinds.map((k) => (
                <tr key={k.id}>
                  <td>
                    <input
                      defaultValue={k.label}
                      onBlur={(e) => e.target.value.trim() && patchKind(k.id, { label: e.target.value.trim() })}
                      aria-label={`${k.label} 이름`}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      min={0}
                      step="0.5"
                      defaultValue={k.points}
                      onBlur={(e) => patchKind(k.id, { points: Number(e.target.value) })}
                      aria-label={`${k.label} 점수`}
                    />
                  </td>
                  <td className="muted small">{DEDUCTION_SOURCE_LABEL[k.source as DeductionSource]}</td>
                  <td>
                    <button
                      className={k.active ? 'btn-sm btn-navy' : 'btn-sm btn-ghost'}
                      onClick={() => patchKind(k.id, { active: !k.active })}
                    >
                      {k.active ? '사용중' : '중지'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="section-title" style={{ marginTop: 28 }}>학생별 감점</div>
      <div className="card tight">
        <div className="row" style={{ alignItems: 'center', gap: 8 }}>
          <div style={{ flex: 1 }} className="muted small">
            흰 칸은 직접 입력, 회색 칸은 출결·과제에서 자동으로 센 건수입니다.
          </div>
          <button className="btn-sm btn-ghost" style={{ flex: '0 0 auto' }} onClick={() => downloadCsv(buildSheet().rows, fileBase)}>CSV</button>
          <button className="btn-sm btn-ghost" style={{ flex: '0 0 auto' }} onClick={() => downloadXlsx([buildSheet()], fileBase)}>XLSX</button>
          <button
            className="btn-sm btn-ghost"
            style={{ flex: '0 0 auto' }}
            onClick={() => { if (!printTable(fileBase, [buildSheet()])) setError('팝업이 막혀 있습니다. 주소창 오른쪽에서 팝업을 허용해 주세요.'); }}
          >
            PDF(인쇄)
          </button>
        </div>
      </div>

      {students.length === 0 ? (
        <div className="empty">명단이 없습니다.</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>학번</th><th>이름</th>
                {kinds.filter((k) => k.active).map((k) => <th key={k.id}>{k.label}</th>)}
                <th>합계</th>
              </tr>
            </thead>
            <tbody>
              {students.map((s) => (
                <tr key={s.id}>
                  <td className="mono">{s.student_no}</td>
                  <td>{s.name}</td>
                  {kinds.filter((k) => k.active).map((k) => {
                    const row = cell.get(`${s.id}:${k.id}`);
                    const cnt = Number(row?.cnt ?? 0);
                    return (
                      <td key={k.id}>
                        {k.source === 'manual' ? (
                          <input
                            type="number"
                            min={0}
                            style={{ width: 70 }}
                            defaultValue={cnt || ''}
                            onBlur={(e) => setManualCount(k.id, s.id, e.target.value)}
                            aria-label={`${s.name} ${k.label} 건수`}
                          />
                        ) : (
                          <span className="muted">{cnt || '—'}</span>
                        )}
                      </td>
                    );
                  })}
                  <td><b>{totalOf(s.id).toFixed(1)}</b></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
