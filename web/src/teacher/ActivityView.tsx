import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { teacherClient } from '../lib/supabase';
import {
  KIND_LABEL, STATUS_LABEL, isRubricKind,
  type Activity, type ActivityStatus, type ResultRow, type Student, type Target, type Team,
} from '../lib/types';
import PageHero from '../components/PageHero';
import { errText } from '../lib/errors';

interface Progress { assigned: number; submitted: number; targets: number; evaluators: number; min_per_target: number }

export default function ActivityView() {
  const { activityId } = useParams<{ activityId: string }>();
  const nav = useNavigate();

  const [act, setAct] = useState<Activity | null>(null);
  const [targets, setTargets] = useState<Target[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [results, setResults] = useState<ResultRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data: a, error: aErr } = await teacherClient
      .from('activities').select('*').eq('id', activityId!).single();
    if (aErr) return setError(aErr.message);
    const activity = a as Activity;
    setAct(activity);

    const [t, s, tm, r, p] = await Promise.all([
      teacherClient.from('targets').select('*').eq('activity_id', activityId!).order('ord'),
      teacherClient.from('students').select('*').eq('course_id', activity.course_id).eq('active', true).order('student_no'),
      teacherClient.from('teams').select('*').eq('course_id', activity.course_id).order('name'),
      teacherClient.from('results').select('*').eq('activity_id', activityId!),
      teacherClient.rpc('activity_progress', { p_activity: activityId! }),
    ]);
    setTargets((t.data ?? []) as Target[]);
    setStudents((s.data ?? []) as Student[]);
    setTeams((tm.data ?? []) as Team[]);
    setResults((r.data ?? []) as ResultRow[]);
    setProgress(((p.data ?? [])[0] ?? null) as Progress | null);
  }, [activityId]);

  useEffect(() => {
    (async () => {
      const { data: s } = await teacherClient.auth.getSession();
      if (!s.session) return nav('/teacher/login', { replace: true });
      await load();
    })();
  }, [load, nav]);

  async function run<T>(key: string, fn: () => Promise<T>, ok: string) {
    setBusy(key); setError(null); setNotice(null);
    try {
      await fn();
      setNotice(ok);
      await load();
    } catch (e) {
      setError(errText(e, '실패했습니다.'));
    } finally {
      setBusy(null);
    }
  }

  /** 팀/학생 목록에서 평가 대상을 한 번에 만든다. 하나씩 손으로 넣는 건 현실적이지 않다. */
  async function autoTargets() {
    if (!act) return;
    const rows =
      act.target_kind === 'team'
        ? teams.map((t, i) => ({ activity_id: act.id, team_id: t.id, title: t.name, ord: i }))
        : students.map((s, i) => ({ activity_id: act.id, student_id: s.id, title: `${s.name} (${s.student_no})`, ord: i }));
    if (rows.length === 0) throw new Error('명단 탭에서 학생·팀을 먼저 등록하세요.');
    const existing = new Set(targets.map((t) => t.team_id ?? t.student_id));
    const fresh = rows.filter((r: any) => !existing.has(r.team_id ?? r.student_id));
    if (fresh.length === 0) throw new Error('이미 모두 만들어져 있습니다.');
    const { error: err } = await teacherClient.from('targets').insert(fresh);
    if (err) throw err;
  }

  async function setStatus(status: ActivityStatus) {
    const { error: err } = await teacherClient.from('activities').update({ status }).eq('id', activityId!);
    if (err) throw err;
  }

  async function saveOverride(row: ResultRow, value: string) {
    const v = value.trim() === '' ? null : Number(value);
    await teacherClient.from('results').update({ override_score: v }).eq('id', row.id);
    await load();
  }

  async function approveAll() {
    const { error: err } = await teacherClient
      .from('results').update({ status: 'approved' }).eq('activity_id', activityId!);
    if (err) throw err;
    await setStatus('finalized');
  }

  function exportCsv() {
    if (!act) return;
    const nameOf = new Map(students.map((s) => [s.id, s]));
    const header = ['학번', '이름', '원점수(100)', '보정점수(100)', '평가참여율', '평가자수', `최종(${Number(act.max_points)}점)`];
    const lines = results
      .map((r) => ({ r, s: nameOf.get(r.student_id) }))
      .filter((x) => x.s)
      .sort((a, b) => a.s!.student_no.localeCompare(b.s!.student_no))
      .map(({ r, s }) =>
        [
          s!.student_no,
          s!.name,
          r.raw_score ?? '',
          r.adjusted_score ?? '',
          r.participation_rate == null ? '' : Math.round(r.participation_rate * 100) + '%',
          r.evaluator_count ?? '',
          r.override_score ?? r.final_score ?? '',
        ].join(','),
      );
    // 엑셀이 UTF-8 CSV를 깨뜨리지 않도록 BOM 을 붙인다.
    const blob = new Blob(['﻿' + [header.join(','), ...lines].join('\r\n')], {
      type: 'text/csv;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${act.title.replace(/[\\/:*?"<>|]/g, '_')}_성적.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!act) return <div className="container"><div className="empty">{error ?? '불러오는 중…'}</div></div>;

  const nameOf = new Map(students.map((s) => [s.id, s]));
  const rubricBased = isRubricKind(act.kind);
  const pct = progress && progress.assigned > 0 ? Math.round((progress.submitted / progress.assigned) * 100) : 0;

  return (
    <>
    <PageHero
      crumbs={['교수', '평가 활동']}
      title={act.title}
      en={`${KIND_LABEL[act.kind]} · ${STATUS_LABEL[act.status]} · 만점 ${Number(act.max_points)}점`}
      actions={
        <Link className="btn btn-on-hero btn-sm" to={`/teacher/course/${act.course_id}`}>
          ← 과목으로
        </Link>
      }
    />
    <div className="container wide">
      {error && <div className="alert alert-error">{error}</div>}
      {notice && <div className="alert alert-ok">{notice}</div>}

      {/* ── 1단계: 대상 ── */}
      {rubricBased && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>1. 평가 대상 ({targets.length})</h3>
          <p className="small muted">
            {act.target_kind === 'team' ? '팀' : '학생'} 하나가 평가 대상 하나가 됩니다.
          </p>
          {targets.length > 0 && (
            <ul className="list">
              {targets.map((t) => (
                <li key={t.id}><div className="grow"><div className="name">{t.title}</div></div></li>
              ))}
            </ul>
          )}
          <button className="btn-ghost btn-block" disabled={busy !== null}
                  onClick={() => run('targets', autoTargets, '평가 대상을 만들었습니다.')}>
            {act.target_kind === 'team' ? '팀 목록으로 대상 만들기' : '학생 목록으로 대상 만들기'}
          </button>
        </div>
      )}

      {/* ── 2단계: 배정 ── */}
      {rubricBased && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>2. 평가자 배정</h3>
          <p className="small muted">
            대상 하나당 {act.evaluators_per_target}명을 무작위로 배정합니다.
            자기 자신과 자기 팀은 자동으로 빠지고, 학생별 평가 개수는 고르게 나뉩니다.
            다시 눌러도 기존 배정은 유지되고 모자란 것만 채웁니다.
          </p>
          <button className="btn-ghost btn-block" disabled={busy !== null || targets.length === 0}
                  onClick={() => run('assign',
                    async () => {
                      const { error: err } = await teacherClient.rpc('generate_assignments', { p_activity: act.id });
                      if (err) throw err;
                    }, '배정을 만들었습니다.')}>
            배정 생성
          </button>
        </div>
      )}

      {/* ── 3단계: 열기/마감 ── */}
      <div className="card">
        <h3 style={{ marginTop: 0 }}>3. 진행</h3>
        {progress && progress.assigned > 0 && (
          <>
            <div className="progress"><i style={{ width: `${pct}%` }} /></div>
            <div className="small muted" style={{ margin: '8px 0 14px' }}>
              제출 {progress.submitted} / {progress.assigned}건 ({pct}%) · 대상 {progress.targets}개 · 평가자 {progress.evaluators}명
              {progress.min_per_target < 3 && progress.submitted > 0 && (
                <div style={{ color: 'var(--warn)', marginTop: 4 }}>
                  ⚠️ 평가가 {progress.min_per_target}건뿐인 대상이 있습니다. 이 상태로 확정하면 그 대상의 점수는 신뢰도가 낮습니다.
                </div>
              )}
            </div>
          </>
        )}
        <div className="btn-row">
          <button className="btn-primary" disabled={busy !== null || act.status === 'open'}
                  onClick={() => run('open', () => setStatus('open'), '학생에게 열렸습니다.')}>
            열기
          </button>
          <button className="btn-ghost" disabled={busy !== null || act.status === 'draft'}
                  onClick={() => run('close', () => setStatus('closed'), '마감했습니다.')}>
            마감
          </button>
        </div>
        {act.status === 'open' && (
          <p className="small muted" style={{ marginTop: 10, marginBottom: 0 }}>
            학생 화면에 뜹니다. 수업코드를 알려주세요.
          </p>
        )}
      </div>

      {/* ── 4단계: 결과 ── */}
      <div className="card">
        <h3 style={{ marginTop: 0 }}>4. 결과</h3>
        <p className="small muted">
          보정 방식: {act.normalize === 'trim' ? '최고·최저 1개씩 제외' : act.normalize === 'zscore' ? '평가자 관대함 보정' : '보정 없음'}
          {' · '}미평가 감점 {Math.round(Number(act.participation_penalty) * 100)}%
        </p>
        <div className="btn-row" style={{ marginBottom: 12 }}>
          <button className="btn-navy" disabled={busy !== null}
                  onClick={() => run('compute',
                    async () => {
                      const { error: err } = await teacherClient.rpc('compute_results', { p_activity: act.id });
                      if (err) throw err;
                    }, '집계했습니다.')}>
            집계하기
          </button>
          <button className="btn-ghost" onClick={exportCsv} disabled={results.length === 0}>
            CSV 내려받기
          </button>
        </div>

        {results.length === 0 ? (
          <div className="empty small">아직 집계하지 않았습니다.</div>
        ) : (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>학번</th><th>이름</th>
                    <th className="num">원점수</th>
                    <th className="num">보정</th>
                    <th className="num">참여율</th>
                    <th className="num">평가자</th>
                    <th className="num">최종</th>
                    <th className="num" style={{ width: 110 }}>덮어쓰기</th>
                  </tr>
                </thead>
                <tbody>
                  {results
                    .map((r) => ({ r, s: nameOf.get(r.student_id) }))
                    .sort((a, b) => (a.s?.student_no ?? '').localeCompare(b.s?.student_no ?? ''))
                    .map(({ r, s }) => (
                      <tr key={r.id}>
                        <td className="mono">{s?.student_no ?? '—'}</td>
                        <td>{s?.name ?? '—'}</td>
                        <td className="num">{r.raw_score ?? '—'}</td>
                        <td className="num">{r.adjusted_score ?? '—'}</td>
                        <td className="num" style={{ color: (r.participation_rate ?? 1) < 1 ? 'var(--danger)' : undefined }}>
                          {r.participation_rate == null ? '—' : `${Math.round(r.participation_rate * 100)}%`}
                        </td>
                        <td className="num">{r.evaluator_count ?? 0}</td>
                        <td className="num"><b>{r.override_score ?? r.final_score ?? '—'}</b></td>
                        <td className="num">
                          <input
                            type="number" step="0.1" defaultValue={r.override_score ?? ''}
                            style={{ padding: '5px 8px', fontSize: 14, textAlign: 'right' }}
                            onBlur={(e) => saveOverride(r, e.target.value)}
                            disabled={r.status === 'approved'}
                          />
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>

            <div className="alert alert-warn small" style={{ marginTop: 14 }}>
              확정하면 이후 집계로 값이 덮이지 않습니다. 최종 점수는 교수님 책임 아래 확정됩니다.
            </div>
            <button className="btn-primary btn-block" disabled={busy !== null || act.status === 'finalized'}
                    onClick={() => run('approve', approveAll, '확정했습니다.')}>
              {act.status === 'finalized' ? '확정됨' : '결과 확정'}
            </button>
          </>
        )}
      </div>
    </div>
    </>
  );
}
