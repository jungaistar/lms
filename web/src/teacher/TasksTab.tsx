import { useCallback, useEffect, useState } from 'react';
import { teacherClient } from '../lib/supabase';
import { errText } from '../lib/errors';
import {
  TASK_STATUS_LABEL,
  type CourseWeek,
  type Student,
  type Task,
  type TaskMode,
  type TaskStatus,
  type TaskSubmission,
  type Team,
} from '../lib/types';

/**
 * 과제 등록과 채점.
 *
 * 과목이 팀 프로젝트라도 과제마다 개인/팀을 따로 정한다 — 팀 과제 사이에
 * 개인 과제를 섞는 경우가 흔해서다. 팀 과제는 팀 하나가 한 번 내고,
 * 그 점수가 팀원 전원에게 간다 (성적 계산이 그렇게 되어 있다).
 *
 * 점수는 여기서만 들어간다. 학생 쪽 UPDATE 는 RLS 의 with check 에서
 * score/feedback 을 채우지 못하게 막혀 있다.
 */
export default function TasksTab({ courseId }: { courseId: string }) {
  const [weeks, setWeeks] = useState<CourseWeek[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [subs, setSubs] = useState<TaskSubmission[]>([]);
  const [gradingId, setGradingId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [form, setForm] = useState({
    title: '',
    instruction: '',
    mode: 'individual' as TaskMode,
    max_points: 100,
    due_at: '',
    week_id: '',
  });

  const load = useCallback(async () => {
    const [w, t, s, tm] = await Promise.all([
      teacherClient.from('course_weeks').select('*').eq('course_id', courseId).order('week_no'),
      teacherClient.from('tasks').select('*').eq('course_id', courseId).order('due_at', { nullsFirst: false }),
      teacherClient.from('students').select('*').eq('course_id', courseId).eq('active', true).order('student_no'),
      teacherClient.from('teams').select('*').eq('course_id', courseId).order('name'),
    ]);
    if (t.error) setError(t.error.message);
    setWeeks((w.data ?? []) as CourseWeek[]);
    setTasks((t.data ?? []) as Task[]);
    setStudents((s.data ?? []) as Student[]);
    setTeams((tm.data ?? []) as Team[]);
  }, [courseId]);

  useEffect(() => { load(); }, [load]);

  const loadSubs = useCallback(async (taskId: string) => {
    const { data, error: err } = await teacherClient
      .from('task_submissions')
      .select('*')
      .eq('task_id', taskId);
    if (err) setError(err.message);
    else setSubs((data ?? []) as TaskSubmission[]);
  }, []);

  async function createTask() {
    if (!form.title.trim()) return setError('과제 제목을 적어 주세요.');
    setBusy(true);
    setError(null);
    try {
      const { error: err } = await teacherClient.from('tasks').insert({
        course_id: courseId,
        week_id: form.week_id || null,
        title: form.title.trim(),
        instruction: form.instruction.trim() || null,
        mode: form.mode,
        max_points: form.max_points,
        due_at: form.due_at ? new Date(form.due_at).toISOString() : null,
      });
      if (err) throw err;
      setForm({ title: '', instruction: '', mode: 'individual', max_points: 100, due_at: '', week_id: '' });
      setShowNew(false);
      setNotice('과제를 만들었습니다. 준비중 상태라 아직 학생에게 보이지 않습니다.');
      await load();
    } catch (e) {
      setError(errText(e, '만들지 못했습니다.'));
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(t: Task, status: TaskStatus) {
    const { error: err } = await teacherClient.from('tasks').update({ status }).eq('id', t.id);
    if (err) setError(err.message);
    else await load();
  }

  async function removeTask(t: Task) {
    if (!confirm(`"${t.title}" 과제를 지우면 제출물과 점수도 함께 사라집니다. 계속할까요?`)) return;
    const { error: err } = await teacherClient.from('tasks').delete().eq('id', t.id);
    if (err) setError(err.message);
    else await load();
  }

  /** 점수·피드백 저장. graded_at 을 채워야 학생이 더는 못 고친다. */
  async function grade(task: Task, ownerId: string, score: string, feedback: string) {
    const numeric = score.trim() === '' ? null : Number(score);
    if (numeric !== null && (Number.isNaN(numeric) || numeric < 0 || numeric > task.max_points)) {
      return setError(`점수는 0 ~ ${task.max_points} 사이여야 합니다.`);
    }
    setError(null);

    const existing = subs.find((s) => (task.mode === 'team' ? s.team_id === ownerId : s.student_id === ownerId));

    // 두 칸을 모두 명시한다. DB 의 one_owner CHECK 가 "정확히 하나만 채워질 것"을 요구한다.
    const payload = {
      task_id: task.id,
      student_id: task.mode === 'team' ? null : ownerId,
      team_id: task.mode === 'team' ? ownerId : null,
      score: numeric,
      feedback: feedback.trim() || null,
      graded_at: numeric === null ? null : new Date().toISOString(),
    };

    const { error: err } = existing
      ? await teacherClient.from('task_submissions').update(payload).eq('id', existing.id)
      : await teacherClient.from('task_submissions').insert(payload);

    if (err) setError(err.message);
    else await loadSubs(task.id);
  }

  const weekLabel = (id: string | null) => {
    const w = weeks.find((x) => x.id === id);
    return w ? `${w.week_no}주` : '—';
  };

  const grading = tasks.find((t) => t.id === gradingId) ?? null;
  const owners: Array<{ id: string; label: string; sub: TaskSubmission | undefined }> = grading
    ? grading.mode === 'team'
      ? teams.map((t) => ({ id: t.id, label: t.name, sub: subs.find((s) => s.team_id === t.id) }))
      : students.map((s) => ({
          id: s.id,
          label: `${s.student_no} ${s.name}`,
          sub: subs.find((x) => x.student_id === s.id),
        }))
    : [];

  return (
    <>
      {error && <div className="alert alert-error">{error}</div>}
      {notice && <div className="alert alert-ok">{notice}</div>}

      <div className="card tight">
        <div className="row" style={{ alignItems: 'center' }}>
          <div style={{ flex: 1 }}>
            <b>과제 {tasks.length}개</b>{' '}
            <span className="muted small">· 진행중 {tasks.filter((t) => t.status === 'open').length}개</span>
          </div>
          <button className="btn-primary btn-sm" style={{ flex: '0 0 auto' }} onClick={() => setShowNew(!showNew)}>
            {showNew ? '닫기' : '과제 등록'}
          </button>
        </div>
      </div>

      {showNew && (
        <div className="card">
          <div className="row" style={{ gap: 8 }}>
            <input
              style={{ flex: 1, minWidth: 0 }}
              placeholder="과제 제목"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              aria-label="과제 제목"
            />
            <select
              style={{ flex: '0 0 auto' }}
              value={form.mode}
              onChange={(e) => setForm({ ...form, mode: e.target.value as TaskMode })}
              aria-label="과제 유형"
            >
              <option value="individual">개인</option>
              <option value="team">팀</option>
            </select>
          </div>

          <textarea
            rows={3}
            placeholder="과제 안내"
            value={form.instruction}
            onChange={(e) => setForm({ ...form, instruction: e.target.value })}
            aria-label="과제 안내"
            style={{ marginTop: 8 }}
          />

          <div className="row" style={{ gap: 8, marginTop: 8 }}>
            <label className="small muted" style={{ flex: 1 }}>
              배점
              <input
                type="number"
                min={1}
                value={form.max_points}
                onChange={(e) => setForm({ ...form, max_points: Number(e.target.value) })}
              />
            </label>
            <label className="small muted" style={{ flex: 1 }}>
              마감
              <input
                type="datetime-local"
                value={form.due_at}
                onChange={(e) => setForm({ ...form, due_at: e.target.value })}
              />
            </label>
            <label className="small muted" style={{ flex: 1 }}>
              주차
              <select value={form.week_id} onChange={(e) => setForm({ ...form, week_id: e.target.value })}>
                <option value="">지정 안 함</option>
                {weeks.map((w) => <option key={w.id} value={w.id}>{w.week_no}주차</option>)}
              </select>
            </label>
          </div>

          <button className="btn-primary btn-sm" style={{ marginTop: 12 }} disabled={busy} onClick={createTask}>
            만들기
          </button>
        </div>
      )}

      {tasks.length === 0 ? (
        <div className="empty">등록한 과제가 없습니다.</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>주차</th><th>제목</th><th>유형</th><th>배점</th><th>마감일</th><th>상태</th><th /></tr>
            </thead>
            <tbody>
              {tasks.map((t) => (
                <tr key={t.id}>
                  <td className="muted small">{weekLabel(t.week_id)}</td>
                  <td>{t.title}</td>
                  <td>{t.mode === 'team' ? '팀' : '개인'}</td>
                  <td>{t.max_points}</td>
                  <td className="muted small">
                    {t.due_at ? new Date(t.due_at).toLocaleString('ko-KR') : '—'}
                  </td>
                  <td>
                    <select
                      value={t.status}
                      onChange={(e) => setStatus(t, e.target.value as TaskStatus)}
                      aria-label={`${t.title} 상태`}
                    >
                      {(Object.keys(TASK_STATUS_LABEL) as TaskStatus[]).map((s) => (
                        <option key={s} value={s}>{TASK_STATUS_LABEL[s]}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <div className="btn-row">
                      <button
                        className="btn-sm btn-navy"
                        onClick={() => { setGradingId(t.id); loadSubs(t.id); }}
                      >
                        채점
                      </button>
                      <button className="btn-sm btn-danger" onClick={() => removeTask(t)}>삭제</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── 채점 ────────────────────────────────────────── */}
      {grading && (
        <>
          <div className="section-title" style={{ marginTop: 28 }}>
            채점 — {grading.title} <span className="muted small">({grading.mode === 'team' ? '팀' : '개인'} · 만점 {grading.max_points})</span>
          </div>

          <div className="card tight">
            <div className="row" style={{ alignItems: 'center' }}>
              <div style={{ flex: 1 }} className="muted small">
                제출 {owners.filter((o) => o.sub?.submitted_at).length} · 채점 {owners.filter((o) => o.sub?.graded_at).length} / 전체 {owners.length}
              </div>
              <button className="btn-sm btn-ghost" style={{ flex: '0 0 auto' }} onClick={() => setGradingId(null)}>닫기</button>
            </div>
          </div>

          {grading.mode === 'team' && teams.length === 0 && (
            <div className="alert alert-warn">팀이 아직 없습니다. 명단·팀 탭에서 팀을 먼저 만들어 주세요.</div>
          )}

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{grading.mode === 'team' ? '팀' : '학생'}</th>
                  <th>제출</th>
                  <th style={{ width: 110 }}>점수</th>
                  <th>피드백</th>
                </tr>
              </thead>
              <tbody>
                {owners.map((o) => (
                  <GradeRow
                    key={o.id}
                    label={o.label}
                    max={grading.max_points}
                    sub={o.sub}
                    onSave={(score, feedback) => grade(grading, o.id, score, feedback)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}

/** 한 줄만 자기 입력값을 들고 있게 해서 표 전체가 다시 그려지지 않게 한다. */
function GradeRow({
  label,
  max,
  sub,
  onSave,
}: {
  label: string;
  max: number;
  sub: TaskSubmission | undefined;
  onSave: (score: string, feedback: string) => void;
}) {
  const [score, setScore] = useState(sub?.score == null ? '' : String(sub.score));
  const [feedback, setFeedback] = useState(sub?.feedback ?? '');

  useEffect(() => {
    setScore(sub?.score == null ? '' : String(sub.score));
    setFeedback(sub?.feedback ?? '');
  }, [sub?.id, sub?.score, sub?.feedback]);

  return (
    <tr>
      <td>{label}</td>
      <td className="muted small">
        {sub?.submitted_at ? (
          <>
            {new Date(sub.submitted_at).toLocaleDateString('ko-KR')}
            {sub.url && <> · <a href={sub.url} target="_blank" rel="noreferrer">링크</a></>}
          </>
        ) : (
          <span className="badge badge-draft">미제출</span>
        )}
      </td>
      <td>
        <input
          type="number"
          min={0}
          max={max}
          value={score}
          onChange={(e) => setScore(e.target.value)}
          onBlur={() => onSave(score, feedback)}
          aria-label={`${label} 점수`}
        />
      </td>
      <td>
        <input
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          onBlur={() => onSave(score, feedback)}
          placeholder="학생 본인에게만 보입니다"
          aria-label={`${label} 피드백`}
        />
      </td>
    </tr>
  );
}
