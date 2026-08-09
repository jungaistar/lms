import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { teacherClient } from '../lib/supabase';
import { PROJECT_MODE_LABEL, type Course } from '../lib/types';
import RosterTab from './RosterTab';
import RubricTab from './RubricTab';
import ActivityTab from './ActivityTab';
import WeeksTab from './WeeksTab';
import BoardTab from './BoardTab';
import TasksTab from './TasksTab';
import AttendanceTab from './AttendanceTab';
import GradesTab from './GradesTab';
import PageHero from '../components/PageHero';

type Tab = 'roster' | 'weeks' | 'board' | 'tasks' | 'attendance' | 'rubric' | 'activity' | 'grades';

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

  // 상호평가를 안 쓰는 과목은 루브릭·평가 활동 탭을 아예 감춘다.
  // 감춰도 권한은 RLS 가 판단한다 — 이건 화면 정리일 뿐이다.
  const tabs: Array<[Tab, string]> = [
    ['roster', '명단 · 팀'],
    ['weeks', '주차'],
    ['board', '공지 · 자료'],
    ['tasks', '과제'],
    ['attendance', '출석'],
    ...(course.peer_assessment ? ([['rubric', '루브릭'], ['activity', '평가 활동']] as Array<[Tab, string]>) : []),
    ['grades', '성적'],
  ];

  return (
    <>
      <PageHero
        crumbs={['교수', '과목']}
        title={course.title}
        en={`${course.term}${course.class_no ? ` · ${course.class_no}반` : ''}`}
        desc={
          `수업코드 ${course.join_code} — 학생이 학번과 함께 입력합니다. · ` +
          `${PROJECT_MODE_LABEL[course.project_mode]}` +
          `${course.peer_assessment ? ' · 상호평가 사용' : ' · 상호평가 없음'}`
        }
        actions={<Link className="btn btn-on-hero btn-sm" to="/teacher">← 내 과목</Link>}
        gradient
      />
      <div className="container wide">
        <div className="tabs">
          {tabs.map(([key, label]) => (
            <button key={key} aria-selected={tab === key} onClick={() => setTab(key)}>{label}</button>
          ))}
        </div>

        {tab === 'roster' && <RosterTab courseId={course.id} />}
        {tab === 'weeks' && <WeeksTab courseId={course.id} />}
        {tab === 'board' && <BoardTab courseId={course.id} />}
        {tab === 'tasks' && <TasksTab courseId={course.id} />}
        {tab === 'attendance' && <AttendanceTab courseId={course.id} />}
        {tab === 'rubric' && <RubricTab courseId={course.id} />}
        {tab === 'activity' && <ActivityTab courseId={course.id} />}
        {tab === 'grades' && <GradesTab course={course} />}
      </div>
    </>
  );
}
