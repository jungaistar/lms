import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { teacherClient } from '../lib/supabase';
import type { Course } from '../lib/types';
import RosterTab from './RosterTab';
import RubricTab from './RubricTab';
import ActivityTab from './ActivityTab';

type Tab = 'roster' | 'rubric' | 'activity';

export default function CourseView() {
  const { courseId } = useParams<{ courseId: string }>();
  const nav = useNavigate();
  const [course, setCourse] = useState<Course | null>(null);
  const [tab, setTab] = useState<Tab>('roster');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: s } = await teacherClient.auth.getSession();
      if (!s.session) return nav('/teacher/login', { replace: true });
      const { data, error: err } = await teacherClient
        .from('courses')
        .select('*')
        .eq('id', courseId!)
        .single();
      if (err) setError(err.message);
      else setCourse(data as Course);
    })();
  }, [courseId, nav]);

  if (error) return <div className="container"><div className="alert alert-error">{error}</div></div>;
  if (!course) return <div className="container"><div className="empty">불러오는 중…</div></div>;

  return (
    <div className="container wide">
      <div className="card tight">
        <div className="row" style={{ alignItems: 'center' }}>
          <div className="grow" style={{ flex: 1 }}>
            <Link to="/teacher" className="small muted" style={{ textDecoration: 'none' }}>← 내 과목</Link>
            <h2 style={{ margin: '4px 0 2px' }}>{course.title}</h2>
            <div className="small muted">
              {course.term}
              {course.class_no && ` · ${course.class_no}분반`} · 수업코드{' '}
              <b className="mono" style={{ color: 'var(--orange)' }}>{course.join_code}</b>
            </div>
          </div>
        </div>
      </div>

      <div className="tabs">
        <button aria-selected={tab === 'roster'} onClick={() => setTab('roster')}>명단 · 팀</button>
        <button aria-selected={tab === 'rubric'} onClick={() => setTab('rubric')}>루브릭</button>
        <button aria-selected={tab === 'activity'} onClick={() => setTab('activity')}>평가 활동</button>
      </div>

      {tab === 'roster' && <RosterTab courseId={course.id} />}
      {tab === 'rubric' && <RubricTab courseId={course.id} />}
      {tab === 'activity' && <ActivityTab courseId={course.id} />}
    </div>
  );
}
