import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { loadStudentSession, studentDb } from '../lib/session';
import {
  MATERIAL_KIND_LABEL,
  type CourseWeek,
  type Material,
  type Notice,
  type Task,
  type TaskSubmission,
} from '../lib/types';
import PageHero from '../components/PageHero';
import StudentNav from './StudentNav';
import { errText } from '../lib/errors';

/**
 * 학생이 보는 수업 화면 — 주차별 공지 · 자료 · 과제.
 *
 * 공개되지 않은 주차·자료·과제는 RLS 가 아예 내려주지 않는다.
 * 화면에서 거르는 게 아니라 데이터가 오지 않는 것이다.
 */
export default function Lessons() {
  const nav = useNavigate();
  const session = loadStudentSession()!;
  const [weeks, setWeeks] = useState<CourseWeek[]>([]);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [subs, setSubs] = useState<TaskSubmission[]>([]);
  const [openWeek, setOpenWeek] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const db = studentDb();
        const [w, n, m, t, s] = await Promise.all([
          db.from('course_weeks').select('*').order('week_no'),
          db.from('notices').select('*').order('published_at', { ascending: false }),
          db.from('materials').select('*').order('ord'),
          db.from('tasks').select('*').order('due_at', { nullsFirst: false }),
          db.from('task_submissions').select('*'),
        ]);
        if (w.error) throw w.error;
        setWeeks((w.data ?? []) as CourseWeek[]);
        setNotices((n.data ?? []) as Notice[]);
        setMaterials((m.data ?? []) as Material[]);
        setTasks((t.data ?? []) as Task[]);
        setSubs((s.data ?? []) as TaskSubmission[]);
      } catch (e) {
        setError(errText(e, '불러오지 못했습니다.'));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <div className="container"><div className="empty">불러오는 중…</div></div>;

  const pinned = notices.filter((n) => n.pinned);
  const subOf = (taskId: string) => subs.find((s) => s.task_id === taskId);

  const dueLabel = (t: Task) => {
    if (!t.due_at) return null;
    const due = new Date(t.due_at);
    const over = due.getTime() < Date.now();
    return (
      <span className={over ? 'badge badge-closed' : 'badge badge-open'}>
        {due.toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
        {over ? ' 마감' : ' 까지'}
      </span>
    );
  };

  return (
    <>
      <PageHero
        crumbs={['학생', '수업']}
        title={session.course.title}
        en={`${session.course.term}${session.course.class_no ? ` · ${session.course.class_no}반` : ''}`}
        desc="주차별 공지 · 자료 · 과제입니다."
        actions={
          <>
            <button className="btn btn-on-hero btn-sm" onClick={() => nav('/me')}>내 평가</button>
            <button className="btn btn-on-hero btn-sm" onClick={() => nav('/record')}>내 기록</button>
          </>
        }
        gradient
      />
      <div className="container">
        <StudentNav />
        {error && <div className="alert alert-error">{error}</div>}

        {pinned.length > 0 && (
          <div className="card tight">
            <div className="section-title" style={{ marginTop: 0 }}>고정 공지</div>
            {pinned.map((n) => (
              <div key={n.id} style={{ marginBottom: 8 }}>
                <b>{n.title}</b>
                {n.body && <p className="small muted" style={{ margin: '4px 0 0' }}>{n.body}</p>}
              </div>
            ))}
          </div>
        )}

        {weeks.length === 0 && <div className="empty">아직 공개된 주차가 없습니다.</div>}

        <div className="list">
          {weeks.map((w) => {
            const wNotices = notices.filter((n) => n.week_id === w.id && !n.pinned);
            const wMaterials = materials.filter((m) => m.week_id === w.id);
            const wTasks = tasks.filter((t) => t.week_id === w.id);
            const count = wNotices.length + wMaterials.length + wTasks.length;
            const open = openWeek === w.id;

            return (
              <div className="card" key={w.id}>
                <button
                  className="btn-ghost"
                  style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10 }}
                  onClick={() => setOpenWeek(open ? null : w.id)}
                  aria-expanded={open}
                >
                  <span className="badge">{w.week_no}주</span>
                  <span style={{ flex: 1 }}>{w.title}</span>
                  <span className="muted small">
                    {count === 0 ? '자료 없음' : `${count}건`}
                    {wTasks.some((t) => !subOf(t.id)?.submitted_at) && ' · 미제출 과제 있음'}
                  </span>
                </button>

                {open && (
                  <div style={{ marginTop: 12 }}>
                    {w.summary && <p className="small">{w.summary}</p>}
                    {w.syllabus && (
                      <details>
                        <summary className="small">강의계획 보기</summary>
                        <p className="small muted" style={{ whiteSpace: 'pre-wrap' }}>{w.syllabus}</p>
                      </details>
                    )}

                    {wNotices.length > 0 && (
                      <>
                        <div className="section-title">공지</div>
                        {wNotices.map((n) => (
                          <div key={n.id} style={{ marginBottom: 8 }}>
                            <b className="small">{n.title}</b>
                            {n.body && <p className="small muted" style={{ margin: '2px 0 0' }}>{n.body}</p>}
                          </div>
                        ))}
                      </>
                    )}

                    {wMaterials.length > 0 && (
                      <>
                        <div className="section-title">자료</div>
                        <ul className="list">
                          {wMaterials.map((m) => (
                            <li key={m.id} className="small">
                              <span className="badge badge-kind">{MATERIAL_KIND_LABEL[m.kind]}</span>{' '}
                              {m.url ? <a href={m.url} target="_blank" rel="noreferrer">{m.title}</a> : m.title}
                            </li>
                          ))}
                        </ul>
                      </>
                    )}

                    {wTasks.length > 0 && (
                      <>
                        <div className="section-title">과제</div>
                        {wTasks.map((t) => {
                          const sub = subOf(t.id);
                          return (
                            <div className="card tight" key={t.id}>
                              <div className="row" style={{ alignItems: 'center', gap: 8 }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <b className="small">{t.title}</b>{' '}
                                  <span className="muted small">
                                    {t.mode === 'team' ? '팀' : '개인'} · {t.max_points}점
                                  </span>
                                  <div style={{ marginTop: 4 }}>{dueLabel(t)}</div>
                                </div>
                                <Link className="btn-primary btn-sm" style={{ flex: '0 0 auto' }} to={`/task/${t.id}`}>
                                  {sub?.submitted_at ? '제출함 · 보기' : '제출하기'}
                                </Link>
                              </div>
                              {sub?.graded_at && (
                                <p className="small" style={{ margin: '8px 0 0' }}>
                                  점수 <b>{sub.score ?? '—'}</b> / {t.max_points}
                                  {sub.feedback && <> · {sub.feedback}</>}
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </>
                    )}

                    {count === 0 && <p className="muted small">이 주차에 올라온 자료가 없습니다.</p>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
