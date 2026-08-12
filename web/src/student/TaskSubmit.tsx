import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { loadStudentSession, studentDb } from '../lib/session';
import type { Task, TaskSubmission } from '../lib/types';
import PageHero from '../components/PageHero';
import { errText } from '../lib/errors';

/**
 * 과제 제출.
 *
 * 채점이 끝난 뒤에는 고칠 수 없다 — 화면에서 막는 게 아니라 RLS 정책이
 * `graded_at is null` 을 요구한다. 여기서 점수·피드백 칸을 보내면 정책에
 * 걸려 저장 자체가 안 된다.
 *
 * 팀 과제는 팀 하나가 한 번 낸다. 팀원 중 누가 내도 같은 제출물이 갱신된다.
 */
export default function TaskSubmit() {
  const { taskId } = useParams<{ taskId: string }>();
  const nav = useNavigate();
  const session = loadStudentSession()!;

  const [task, setTask] = useState<Task | null>(null);
  const [sub, setSub] = useState<TaskSubmission | null>(null);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [body, setBody] = useState('');
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const db = studentDb();
        const [t, s, me] = await Promise.all([
          db.from('tasks').select('*').eq('id', taskId!).maybeSingle(),
          db.from('task_submissions').select('*').eq('task_id', taskId!).maybeSingle(),
          db.from('students').select('team_id').eq('id', session.student.id).maybeSingle(),
        ]);
        if (t.error) throw t.error;
        if (!t.data) throw new Error('과제를 찾을 수 없습니다. 아직 공개되지 않았을 수 있습니다.');

        setTask(t.data as Task);
        setTeamId((me.data as { team_id: string | null } | null)?.team_id ?? null);
        if (s.data) {
          const row = s.data as TaskSubmission;
          setSub(row);
          setBody(row.body ?? '');
          setUrl(row.url ?? '');
        }
      } catch (e) {
        setError(errText(e, '불러오지 못했습니다.'));
      } finally {
        setLoading(false);
      }
    })();
  }, [taskId, session.student.id]);

  const graded = Boolean(sub?.graded_at);
  const overdue = Boolean(task?.due_at && new Date(task.due_at).getTime() < Date.now());
  const locked = graded || task?.status !== 'open' || (overdue && !task?.allow_late);

  async function submit() {
    if (!task) return;
    if (!body.trim() && !url.trim()) {
      return setError('내용이나 링크 중 하나는 채워 주세요.');
    }
    if (task.mode === 'team' && !teamId) {
      return setError('팀이 정해지지 않아 팀 과제를 낼 수 없습니다. 교수님께 알려 주세요.');
    }

    setBusy(true);
    setError(null);
    try {
      const db = studentDb();
      // 점수·피드백 칸은 보내지 않는다. 보내면 RLS with check 에 걸린다.
      const payload = {
        task_id: task.id,
        student_id: task.mode === 'team' ? null : session.student.id,
        team_id: task.mode === 'team' ? teamId : null,
        body: body.trim() || null,
        url: url.trim() || null,
        submitted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const { error: err } = sub
        ? await db.from('task_submissions').update(payload).eq('id', sub.id)
        : await db.from('task_submissions').insert(payload);
      if (err) throw err;

      const { data } = await db.from('task_submissions').select('*').eq('task_id', task.id).maybeSingle();
      setSub((data ?? null) as TaskSubmission | null);
      setNotice(overdue ? '지각 제출로 처리되었습니다.' : '제출했습니다.');
    } catch (e) {
      setError(errText(e, '제출하지 못했습니다.'));
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="container"><div className="empty">불러오는 중…</div></div>;
  if (!task) return <div className="container"><div className="alert alert-error">{error ?? '과제를 찾을 수 없습니다.'}</div></div>;

  return (
    <>
      <PageHero
        crumbs={['학생', '과제']}
        title={task.title}
        en={`${task.mode === 'team' ? 'TEAM' : 'INDIVIDUAL'} · ${task.max_points}점`}
        desc={
          task.due_at
            ? `마감 ${new Date(task.due_at).toLocaleString('ko-KR')}${task.allow_late ? ' (지각 제출 가능)' : ''}`
            : '마감 없음'
        }
        actions={<button className="btn btn-on-hero btn-sm" onClick={() => nav('/lessons')}>← 수업</button>}
      />
      <div className="container">
        {error && <div className="alert alert-error">{error}</div>}
        {notice && <div className="alert alert-ok">{notice}</div>}

        {task.instruction && (
          <div className="card tight">
            <p className="small" style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{task.instruction}</p>
          </div>
        )}

        {graded && (
          <div className="alert alert-info">
            채점이 끝났습니다 — <b>{sub?.score ?? '—'}</b> / {task.max_points}점.
            {sub?.feedback && <div style={{ marginTop: 6 }}>{sub.feedback}</div>}
            <div className="small muted" style={{ marginTop: 6 }}>채점 뒤에는 고칠 수 없습니다.</div>
          </div>
        )}

        {!graded && overdue && task.allow_late && (
          <div className="alert alert-warn">마감이 지났습니다. 지금 내면 <b>지각 제출</b>로 기록됩니다.</div>
        )}
        {!graded && overdue && !task.allow_late && (
          <div className="alert alert-error">마감이 지나 더는 제출할 수 없습니다.</div>
        )}
        {!graded && task.status !== 'open' && (
          <div className="alert alert-warn">지금은 제출 기간이 아닙니다.</div>
        )}

        {task.mode === 'team' && (
          <div className="alert alert-info">
            팀 과제입니다. 팀에서 한 번만 내면 되고, 팀원이 낸 내용이 여기 함께 보입니다.
          </div>
        )}

        <div className="card">
          <label className="small muted" htmlFor="task-body">내용</label>
          <textarea
            id="task-body"
            rows={8}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            disabled={locked}
            placeholder="과제 내용을 적어 주세요."
          />

          <label className="small muted" htmlFor="task-url" style={{ marginTop: 10, display: 'block' }}>
            링크 (구글 드라이브 · 유튜브 등)
          </label>
          <input
            id="task-url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={locked}
            placeholder="https://"
          />
          <p className="muted small" style={{ marginTop: 6 }}>
            파일은 여기 올리지 않습니다. 드라이브에 올리고 <b>공유 링크</b>를 붙여 주세요.
          </p>

          {sub?.submitted_at && (
            <p className="small muted" style={{ marginTop: 10 }}>
              마지막 제출 {new Date(sub.submitted_at).toLocaleString('ko-KR')}
            </p>
          )}
        </div>

        {!locked && (
          <div className="sticky-actions">
            <button className="btn-primary btn-block" disabled={busy} onClick={submit}>
              {sub?.submitted_at ? '다시 제출' : '제출하기'}
            </button>
          </div>
        )}
      </div>
    </>
  );
}
