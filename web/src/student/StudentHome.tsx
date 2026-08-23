import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { loadStudentSession, studentDb } from '../lib/session';
import { KIND_LABEL, type ActivityKind, type MyTask } from '../lib/types';
import PageHero from '../components/PageHero';
import StudentNav from './StudentNav';
import { errText } from '../lib/errors';

interface OpenActivity {
  id: string;
  kind: ActivityKind;
  title: string;
  closes_at: string | null;
}

export default function StudentHome() {
  const nav = useNavigate();
  const session = loadStudentSession()!;
  const [tasks, setTasks] = useState<MyTask[]>([]);
  const [special, setSpecial] = useState<OpenActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const db = studentDb();
        const [t, a] = await Promise.all([
          db.rpc('my_tasks'),
          // 팀 기여도와 토론은 배정(assignment)이 아니라 활동 단위로 들어간다.
          db
            .from('activities')
            .select('id, kind, title, closes_at')
            .in('kind', ['team_contribution', 'discussion'])
            .eq('status', 'open'),
        ]);
        if (t.error) throw t.error;
        if (a.error) throw a.error;
        setTasks((t.data ?? []) as MyTask[]);
        setSpecial((a.data ?? []) as OpenActivity[]);
      } catch (e) {
        setError(errText(e, '불러오지 못했습니다.'));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const pending = tasks.filter((t) => !t.submitted);
  const done = tasks.filter((t) => t.submitted);

  if (loading) return <div className="container"><div className="empty">불러오는 중…</div></div>;

  return (
    <>
    <PageHero
      crumbs={['학생', '내 평가']}
      title={session.course.title}
      en={`${session.course.term}${session.course.class_no ? ` · ${session.course.class_no}분반` : ''}`}
      desc={`${session.student.name} (${session.student.student_no}) 님, 아래 목록에서 해야 할 평가를 확인하세요.`}
      actions={
        <>
          <button className="btn btn-on-hero btn-sm" onClick={() => nav('/lessons')}>수업</button>
          <button className="btn btn-on-hero btn-sm" onClick={() => nav('/record')}>내 기록</button>
          <button className="btn btn-on-hero btn-sm" onClick={() => nav('/feedback')}>받은 피드백</button>
        </>
      }
      gradient
    />
    <div className="container">
      <StudentNav />
      {error && <div className="alert alert-error">{error}</div>}

      {tasks.length > 0 && (
        <div className="card tight">
          <div className="row" style={{ alignItems: 'baseline', gap: 8 }}>
            <b style={{ flex: 1 }}>평가 진행률</b>
            <span className="small muted" style={{ flex: '0 0 auto' }}>
              {done.length} / {tasks.length} 완료
              {pending.length > 0 && ` · ${pending.length}건 남음`}
            </span>
          </div>
          <div className="spacer" />
          <div className="progress">
            <i style={{ width: `${Math.round((done.length / tasks.length) * 100)}%` }} />
          </div>
        </div>
      )}

      {special.length > 0 && (
        <>
          <h2 className="section-title">참여</h2>
          <ul className="list">
            {special.map((a) => (
              <li key={a.id}>
                <div className="grow">
                  <div className="name">{a.title}</div>
                  <div className="sub">
                    <span className="badge badge-kind">{KIND_LABEL[a.kind]}</span>
                    {a.closes_at && <> · 마감 {new Date(a.closes_at).toLocaleString('ko-KR')}</>}
                  </div>
                </div>
                <Link
                  className="btn btn-primary btn-sm"
                  to={a.kind === 'team_contribution' ? `/contribution/${a.id}` : `/discussion/${a.id}`}
                >
                  {a.kind === 'team_contribution' ? '배분하기' : '토론방'}
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}

      <h2 className="section-title">
        해야 할 평가{pending.length > 0 && <span className="count">({pending.length})</span>}
      </h2>
      {pending.length === 0 ? (
        <div className="empty">
          지금 해야 할 평가가 없습니다.
        </div>
      ) : (
        <ul className="list">
          {pending.map((t) => (
            <li key={t.assignment_id}>
              <div className="grow">
                <div className="name">{t.target_title}</div>
                <div className="sub">
                  <span className="badge badge-kind">{KIND_LABEL[t.activity_kind]}</span> {t.activity_title}
                  {t.closes_at && <> · 마감 {new Date(t.closes_at).toLocaleString('ko-KR')}</>}
                </div>
              </div>
              <Link className="btn btn-primary btn-sm" to={`/evaluate/${t.assignment_id}`}>
                평가하기
              </Link>
            </li>
          ))}
        </ul>
      )}

      {done.length > 0 && (
        <>
          <h2 className="section-title">
            완료<span className="count">({done.length})</span>
          </h2>
          <ul className="list">
            {done.map((t) => (
              <li key={t.assignment_id}>
                <div className="grow">
                  <div className="name">{t.target_title}</div>
                  <div className="sub">{t.activity_title}</div>
                </div>
                <Link className="btn btn-ghost btn-sm" to={`/evaluate/${t.assignment_id}`}>
                  수정
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
    </>
  );
}
