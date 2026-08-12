import { useCallback, useEffect, useMemo, useState } from 'react';
import { teacherClient } from '../lib/supabase';
import { downloadCsv, downloadXlsx, printTable, type SheetTable } from '../lib/exporters';
import {
  KIND_LABEL,
  PHASE_LABEL,
  STATUS_LABEL,
  type Activity,
  type EvalPhase,
  type ProjectEvalRow,
  type ProjectEvalTotal,
} from '../lib/types';
import type { MenuKey } from './adminMenu';

/**
 * 프로젝트 사전평가 · 결과평가 집계표.
 *
 * 같은 루브릭으로 학기 초(사전)와 학기 말(결과)을 두 번 평가하고,
 * 그 결과를 **대상 × 항목** 표로 눕히는 자리다.
 *
 * 어느 활동이 사전이고 어느 활동이 결과인지는 사람이 정한다.
 * 활동에 붙인 `phase` 하나로 갈린다 — 제목으로 짐작하지 않는다.
 *
 * 평균과 등수는 전부 DB 함수가 만든다. 화면에서 다시 더하지 않는다.
 */
export default function ProjectEvalTab({
  courseId,
  courseTitle,
  phase,
  onGo,
}: {
  courseId: string;
  courseTitle: string;
  phase: Exclude<EvalPhase, 'none'>;
  onGo: (key: MenuKey) => void;
}) {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [rows, setRows] = useState<ProjectEvalRow[]>([]);
  const [totals, setTotals] = useState<ProjectEvalTotal[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [a, r, t] = await Promise.all([
      teacherClient.from('activities').select('*').eq('course_id', courseId).order('created_at'),
      teacherClient.rpc('project_eval_summary', { p_course: courseId, p_phase: phase }),
      teacherClient.rpc('project_eval_totals', { p_course: courseId, p_phase: phase }),
    ]);
    if (a.error) setError(a.error.message);
    if (r.error) setError(r.error.message);
    setActivities((a.data ?? []) as Activity[]);
    setRows((r.data ?? []) as ProjectEvalRow[]);
    setTotals((t.data ?? []) as ProjectEvalTotal[]);
  }, [courseId, phase]);

  useEffect(() => { load(); }, [load]);

  async function setPhase(a: Activity, next: EvalPhase) {
    setBusy(true);
    const { error: err } = await teacherClient.from('activities').update({ phase: next }).eq('id', a.id);
    setBusy(false);
    if (err) setError(err.message);
    else await load();
  }

  /** 활동 하나를 표 하나로 만든다. 활동이 여럿이면 표도 여럿이다. */
  const tables = useMemo(() => {
    const byActivity = new Map<string, ProjectEvalRow[]>();
    rows.forEach((r) => {
      const list = byActivity.get(r.activity_id) ?? [];
      list.push(r);
      byActivity.set(r.activity_id, list);
    });

    return [...byActivity.entries()].map(([activityId, list]) => {
      const title = list[0]!.activity_title;
      // 항목과 대상 순서는 RPC 가 정렬해 준 순서를 그대로 쓴다.
      const items: Array<{ id: string; label: string; max: number }> = [];
      const targets: Array<{ id: string; label: string }> = [];
      list.forEach((r) => {
        if (!items.some((i) => i.id === r.item_id)) items.push({ id: r.item_id, label: r.item_label, max: Number(r.item_max) });
        if (!targets.some((t) => t.id === r.target_id)) targets.push({ id: r.target_id, label: r.target_label });
      });
      const cell = new Map(list.map((r) => [`${r.target_id}:${r.item_id}`, r]));
      const total = new Map(
        totals.filter((t) => t.activity_id === activityId).map((t) => [t.target_id, t]),
      );
      return { activityId, title, items, targets, cell, total };
    });
  }, [rows, totals]);

  function buildSheet(t: (typeof tables)[number]): SheetTable {
    const head = ['대상', ...t.items.map((i) => `${i.label} (/${i.max})`), '평가자', '총점(100)', '등수'];
    const body = t.targets.map((tg) => {
      const tot = t.total.get(tg.id);
      return [
        tg.label,
        ...t.items.map((i) => t.cell.get(`${tg.id}:${i.id}`)?.avg_score ?? ''),
        tot?.raters ?? 0,
        tot?.avg_total ?? '',
        tot?.rank_no ?? '',
      ];
    });
    return { name: t.title.slice(0, 28), rows: [head, ...body] };
  }

  const tagged = activities.filter((a) => a.phase === phase);
  const untagged = activities.filter((a) => a.phase === 'none');

  return (
    <>
      {error && <div className="alert alert-error">{error}</div>}

      <div className="card tight">
        <p className="small" style={{ marginTop: 0 }}>
          <b>{PHASE_LABEL[phase]}</b> 로 표시한 활동만 이 집계표에 들어옵니다.
          같은 루브릭으로 사전·결과를 각각 만들어 두면 두 표를 나란히 비교할 수 있습니다.
        </p>
        <div className="btn-row">
          <button className="btn-sm btn-ghost" onClick={() => onGo('activity')}>평가 활동 만들기</button>
          <button className="btn-sm btn-ghost" onClick={() => onGo('rubric')}>루브릭 보기</button>
        </div>
      </div>

      {/* ── 어떤 활동을 이 단계로 볼 것인가 ─────────────── */}
      <div className="section-title">이 단계로 표시한 활동 <span className="count">{tagged.length}</span></div>
      {activities.length === 0 ? (
        <div className="empty">평가 활동이 없습니다. 먼저 활동을 만들어 주세요.</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>활동</th><th>종류</th><th>상태</th><th>단계</th></tr></thead>
            <tbody>
              {[...tagged, ...untagged].map((a) => (
                <tr key={a.id}>
                  <td>{a.title}</td>
                  <td className="small">{KIND_LABEL[a.kind]}</td>
                  <td><span className={`badge badge-${a.status}`}>{STATUS_LABEL[a.status]}</span></td>
                  <td>
                    <select
                      value={a.phase ?? 'none'}
                      disabled={busy}
                      onChange={(e) => setPhase(a, e.target.value as EvalPhase)}
                      aria-label={`${a.title} 단계`}
                    >
                      {(Object.keys(PHASE_LABEL) as EvalPhase[]).map((p) => (
                        <option key={p} value={p}>{PHASE_LABEL[p]}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── 집계표 ──────────────────────────────────────── */}
      {tables.length === 0 ? (
        <div className="empty" style={{ marginTop: 20 }}>
          {tagged.length === 0
            ? '이 단계로 표시한 활동이 없습니다. 위 표에서 단계를 골라 주세요.'
            : '아직 들어온 평가가 없습니다.'}
        </div>
      ) : (
        tables.map((t) => (
          <div key={t.activityId}>
            <div className="section-title" style={{ marginTop: 28 }}>{t.title}</div>

            <div className="card tight">
              <div className="row" style={{ alignItems: 'center' }}>
                <div style={{ flex: 1 }} className="small muted">
                  대상 {t.targets.length} · 항목 {t.items.length} · 칸 값은 평가자 평균입니다.
                </div>
                <button className="btn-sm btn-ghost" style={{ flex: '0 0 auto' }}
                  onClick={() => downloadCsv(buildSheet(t).rows, `${courseTitle}_${PHASE_LABEL[phase]}_${t.title}`)}>CSV</button>
                <button className="btn-sm btn-ghost" style={{ flex: '0 0 auto' }}
                  onClick={() => downloadXlsx([buildSheet(t)], `${courseTitle}_${PHASE_LABEL[phase]}_${t.title}`)}>XLSX</button>
                <button className="btn-sm btn-ghost" style={{ flex: '0 0 auto' }}
                  onClick={() => { if (!printTable(`${courseTitle} ${PHASE_LABEL[phase]}`, [buildSheet(t)])) setError('팝업이 막혀 있습니다.'); }}>
                  PDF(인쇄)
                </button>
              </div>
            </div>

            <div className="table-wrap">
              <table className="pivot">
                <thead>
                  <tr>
                    <th>대상</th>
                    {t.items.map((i) => (
                      <th key={i.id}>{i.label}<div className="small" style={{ opacity: 0.7 }}>/{i.max}</div></th>
                    ))}
                    <th>평가자</th>
                    <th>총점</th>
                    <th>등수</th>
                  </tr>
                </thead>
                <tbody>
                  {t.targets.map((tg) => {
                    const tot = t.total.get(tg.id);
                    return (
                      <tr key={tg.id}>
                        <td><b>{tg.label}</b></td>
                        {t.items.map((i) => {
                          const c = t.cell.get(`${tg.id}:${i.id}`);
                          return (
                            <td key={i.id}>
                              {c?.avg_score === null || c?.avg_score === undefined
                                ? <span className="muted">—</span>
                                : c.avg_score}
                            </td>
                          );
                        })}
                        <td className="muted small">{tot?.raters ?? 0}명</td>
                        <td>{tot?.avg_total === null || tot?.avg_total === undefined ? <span className="muted">—</span> : <b>{tot.avg_total}</b>}</td>
                        <td>{tot?.avg_total === null || tot?.avg_total === undefined ? <span className="muted">—</span> : `${tot.rank_no}위`}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}
    </>
  );
}
