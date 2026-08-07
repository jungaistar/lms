import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { teacherClient } from '../lib/supabase';
import {
  KIND_LABEL, STATUS_LABEL, isRubricKind,
  type Activity, type ActivityKind, type Rubric,
} from '../lib/types';

export default function ActivityTab({ courseId }: { courseId: string }) {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [rubrics, setRubrics] = useState<Rubric[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);

  const [form, setForm] = useState({
    kind: 'presentation' as ActivityKind,
    title: '',
    instruction: '',
    rubric_id: '',
    target_kind: 'team' as 'student' | 'team',
    evaluators_per_target: 5,
    max_points: 100,
    normalize: 'trim' as 'none' | 'trim' | 'zscore',
    participation_penalty: 0.3,
    closes_at: '',
  });

  const load = useCallback(async () => {
    const [a, r] = await Promise.all([
      teacherClient.from('activities').select('*').eq('course_id', courseId).order('created_at'),
      teacherClient.from('rubrics').select('*').eq('course_id', courseId).order('created_at'),
    ]);
    if (a.error) setError(a.error.message);
    else setActivities((a.data ?? []) as Activity[]);
    if (!r.error) setRubrics((r.data ?? []) as Rubric[]);
  }, [courseId]);

  useEffect(() => { load(); }, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const needsRubric = isRubricKind(form.kind);
      if (needsRubric && !form.rubric_id) throw new Error('루브릭을 먼저 고르세요.');

      const { error: err } = await teacherClient.from('activities').insert({
        course_id: courseId,
        kind: form.kind,
        title: form.title.trim(),
        instruction: form.instruction.trim() || null,
        rubric_id: needsRubric ? form.rubric_id : null,
        target_kind: form.kind === 'team_contribution' ? 'student' : form.target_kind,
        evaluators_per_target: form.evaluators_per_target,
        max_points: form.max_points,
        normalize: form.normalize,
        participation_penalty: form.participation_penalty,
        closes_at: form.closes_at ? new Date(form.closes_at).toISOString() : null,
        // 확정된 정책: 코멘트만 익명 공개, 점수는 비공개
        show_scores_to_students: false,
        show_comments_to_students: true,
        status: 'draft',
      });
      if (err) throw err;
      setCreating(false);
      setForm({ ...form, title: '', instruction: '', closes_at: '' });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : '만들지 못했습니다.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {error && <div className="alert alert-error">{error}</div>}

      {activities.length === 0 && !creating && (
        <div className="empty"><div className="big">📋</div>아직 평가 활동이 없습니다.</div>
      )}

      <ul className="list">
        {activities.map((a) => (
          <li key={a.id}>
            <div className="grow">
              <div className="name">{a.title}</div>
              <div className="sub">
                <span className="badge badge-kind">{KIND_LABEL[a.kind]}</span>{' '}
                <span className={`badge badge-${a.status}`}>{STATUS_LABEL[a.status]}</span>
                {' · '}만점 {Number(a.max_points)}점
                {a.closes_at && <> · 마감 {new Date(a.closes_at).toLocaleString('ko-KR')}</>}
              </div>
            </div>
            <Link className="btn btn-navy btn-sm" to={`/teacher/activity/${a.id}`}>관리</Link>
          </li>
        ))}
      </ul>

      {creating ? (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>새 평가 활동</h3>
          <form onSubmit={create}>
            <label className="field">
              <span>종류</span>
              <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as ActivityKind })}>
                {(Object.keys(KIND_LABEL) as ActivityKind[]).map((k) => (
                  <option key={k} value={k}>{KIND_LABEL[k]}</option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>제목</span>
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required placeholder="예: 3주차 조별 발표" />
            </label>

            <label className="field">
              <span>학생 안내 문구</span>
              <textarea value={form.instruction} onChange={(e) => setForm({ ...form, instruction: e.target.value })} placeholder="평가할 때 무엇을 봐야 하는지 알려주세요." />
            </label>

            {isRubricKind(form.kind) ? (
              <>
                <label className="field">
                  <span>루브릭</span>
                  <select value={form.rubric_id} onChange={(e) => setForm({ ...form, rubric_id: e.target.value })} required>
                    <option value="">— 고르세요 —</option>
                    {rubrics.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
                  </select>
                  {rubrics.length === 0 && <small style={{ color: 'var(--danger)' }}>루브릭 탭에서 먼저 하나 만드세요.</small>}
                </label>

                <div className="row">
                  <label className="field">
                    <span>평가 대상</span>
                    <select value={form.target_kind} onChange={(e) => setForm({ ...form, target_kind: e.target.value as 'student' | 'team' })}>
                      <option value="team">팀 (조별 발표 등)</option>
                      <option value="student">개인</option>
                    </select>
                  </label>
                  <label className="field">
                    <span>대상당 평가자 수</span>
                    <input type="number" min={1} max={30} value={form.evaluators_per_target}
                           onChange={(e) => setForm({ ...form, evaluators_per_target: Number(e.target.value) })} />
                    <small>많을수록 점수가 안정적입니다. 5명 이상 권장.</small>
                  </label>
                </div>
              </>
            ) : (
              <div className="alert alert-info small">
                팀 기여도는 루브릭 대신 <b>100점 배분</b> 방식입니다. 팀원끼리만 서로 배분하므로
                평가자 배정도 따로 필요 없습니다. 명단에 팀이 지정돼 있어야 합니다.
              </div>
            )}

            <div className="row">
              <label className="field">
                <span>성적 만점</span>
                <input type="number" min={1} value={form.max_points}
                       onChange={(e) => setForm({ ...form, max_points: Number(e.target.value) })} />
              </label>
              <label className="field">
                <span>마감</span>
                <input type="datetime-local" value={form.closes_at}
                       onChange={(e) => setForm({ ...form, closes_at: e.target.value })} />
              </label>
            </div>

            <label className="field">
              <span>점수 보정</span>
              <select value={form.normalize} onChange={(e) => setForm({ ...form, normalize: e.target.value as any })}>
                <option value="trim">최고·최저 1개씩 제외 (권장)</option>
                <option value="zscore">평가자 관대함 보정</option>
                <option value="none">보정 없음</option>
              </select>
              <small>
                <b>제외</b>: 몰아주기·찍어내리기 한 표를 버립니다(평가자 4명 이상일 때).{' '}
                <b>관대함 보정</b>: 짜게 주는 평가자와 후한 평가자를 같은 기준으로 맞춥니다.
              </small>
            </label>

            <label className="field">
              <span>미평가 감점 비율</span>
              <input type="number" min={0} max={1} step={0.1} value={form.participation_penalty}
                     onChange={(e) => setForm({ ...form, participation_penalty: Number(e.target.value) })} />
              <small>0.3이면 배정받은 평가를 하나도 안 한 학생은 자기 점수의 30%가 깎입니다.</small>
            </label>

            <div className="btn-row">
              <button type="button" className="btn-ghost" style={{ flex: 1 }} onClick={() => setCreating(false)}>취소</button>
              <button className="btn-primary" style={{ flex: 2 }} disabled={busy}>{busy ? '만드는 중…' : '만들기'}</button>
            </div>
          </form>
        </div>
      ) : (
        <button className="btn-primary btn-block" onClick={() => setCreating(true)}>+ 새 평가 활동</button>
      )}
    </>
  );
}
