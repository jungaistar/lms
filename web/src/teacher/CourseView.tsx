import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { teacherClient } from '../lib/supabase';
import { PROJECT_MODE_LABEL, type Course } from '../lib/types';
import AdminShell from './AdminShell';
import { buildMenu, isMenuKey, type MenuKey } from './adminMenu';

import DashboardTab from './DashboardTab';
import RosterTab from './RosterTab';
import RosterMatchTab from './RosterMatchTab';
import AccessTab from './AccessTab';
import TeamsTab from './TeamsTab';
import WeeksTab from './WeeksTab';
import BoardTab from './BoardTab';
import TasksTab from './TasksTab';
import TaskSyncTab from './TaskSyncTab';
import SurveyTab from './SurveyTab';
import AttendanceTab from './AttendanceTab';
import LiveCheckTab from './LiveCheckTab';
import DeductionTab from './DeductionTab';
import RubricTab from './RubricTab';
import ActivityTab from './ActivityTab';
import ProjectEvalTab from './ProjectEvalTab';
import GradesTab from './GradesTab';
import PageHero from '../components/PageHero';

/**
 * 과목 관리 콘솔.
 *
 * 예전에는 가로 탭이었다. 화면이 열여덟 개로 늘면서 탭이 화면 밖으로 밀려
 * 지금 어디에 있는지 알 수 없게 됐다. 그래서 왼쪽 세로 메뉴로 바꿨다 —
 * 참고한 관리자 화면(rest.dreamitbiz.com)의 짜임새다.
 *
 * 지금 메뉴는 주소(`?m=...`)에 남긴다. 새로고침해도 보던 화면이 그대로 열리고,
 * 특정 화면 링크를 그대로 붙여 쓸 수 있다. HashRouter 라 주소는 `#/...?m=...` 이 된다.
 */
export default function CourseView() {
  const { courseId } = useParams<{ courseId: string }>();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const [course, setCourse] = useState<Course | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** 0006 이 아직 안 올라간 프로젝트인지. 화면마다 다른 오류가 나기 전에 한 번 알려 준다. */
  const [opsReady, setOpsReady] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: s } = await teacherClient.auth.getSession();
      if (!s.session) return nav('/teacher/login', { replace: true });
      const { data, error: err } = await teacherClient
        .from('courses')
        .select('*')
        .eq('id', courseId!)
        .single();
      if (err) return setError(err.message);

      // 0006 이 안 올라간 프로젝트에서는 이 칸들이 아예 오지 않는다.
      // 그대로 쓰면 화면에 "undefined" 가 찍히고 메뉴가 엉뚱하게 갈린다.
      // DB 기본값과 같은 값으로 메워 두고, 안 올라갔다는 사실은 따로 알린다.
      const row = data as Partial<Course> & Course;
      setOpsReady(row.project_mode !== undefined);
      setCourse({
        ...row,
        peer_assessment: row.peer_assessment ?? true,
        project_mode: row.project_mode ?? 'individual',
        ext_lms_url: row.ext_lms_url ?? null,
        // 0010 이 안 올라갔으면 아직 옛 방식이다.
        entry_mode: row.entry_mode ?? 'code',
      });
    })();
  }, [courseId, nav]);

  const groups = useMemo(() => (course ? buildMenu(course) : []), [course]);

  // 주소에 이상한 값이 와도 튕기지 않게 대시보드로 떨어뜨린다.
  const raw = params.get('m') ?? 'dashboard';
  const current: MenuKey = course && isMenuKey(groups, raw) ? raw : 'dashboard';

  const go = (key: MenuKey) => {
    setParams({ m: key }, { replace: false });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (error) return <div className="container"><div className="alert alert-error">{error}</div></div>;
  if (!course) return <div className="container"><div className="empty">불러오는 중…</div></div>;

  const item = groups.flatMap((g) => g.items).find((i) => i.key === current);

  return (
    <>
      <PageHero
        crumbs={['교수', '과목', item?.label ?? '대시보드']}
        title={course.title}
        en={`${course.term}${course.class_no ? ` · ${course.class_no}반` : ''}`}
        desc={
          `수업코드 ${course.join_code} — 학생이 학번과 함께 입력합니다. · ` +
          `${PROJECT_MODE_LABEL[course.project_mode] ?? '프로젝트 설정 없음'}` +
          `${course.peer_assessment ? ' · 상호평가 사용' : ' · 상호평가 없음'}`
        }
        actions={<Link className="btn btn-on-hero btn-sm" to="/teacher">← 내 과목</Link>}
        gradient
      />
      <div className="container wide">
        {!opsReady && (
          <div className="alert alert-warn">
            <b>수업 운영 표가 아직 없습니다.</b>
            <p className="small" style={{ margin: '6px 0 0' }}>
              이 Supabase 프로젝트에는 <code>0001</code>~<code>0005</code> 만 올라가 있습니다.
              주차 · 공지 · 자료 · 과제 · 출석 · 성적 · 설문 화면은 표가 없어서 동작하지 않습니다.
              Supabase SQL Editor 에서 <b>0006 → 0007 → 0008 → 0009</b> 를 순서대로 실행해 주세요
              (<code>docs/11-migrate.md</code>).
              지금 쓸 수 있는 것은 <b>수강생 관리 · 명단 대조 · 팀 편성 · 루브릭 · 평가 활동</b> 입니다.
            </p>
          </div>
        )}

        <AdminShell groups={groups} current={current} onSelect={go}>
          <div className="admin-head">
            <h2>{item?.label ?? '대시보드'}</h2>
            {item?.hint && <p>{item.hint}</p>}
          </div>

          {current === 'dashboard' && <DashboardTab course={course} onGo={go} />}
          {current === 'roster' && <RosterTab courseId={course.id} />}
          {current === 'match' && <RosterMatchTab courseId={course.id} courseTitle={course.title} />}
          {current === 'access' && <AccessTab course={course} />}
          {current === 'teams' && <TeamsTab courseId={course.id} courseTitle={course.title} />}
          {current === 'weeks' && <WeeksTab courseId={course.id} />}
          {current === 'notices' && <BoardTab courseId={course.id} only="notices" />}
          {current === 'materials' && <BoardTab courseId={course.id} only="materials" />}
          {current === 'tasks' && <TasksTab courseId={course.id} />}
          {current === 'tasksync' && <TaskSyncTab courseId={course.id} courseTitle={course.title} onGo={go} />}
          {current === 'surveys' && <SurveyTab courseId={course.id} courseTitle={course.title} />}
          {current === 'attendance' && <AttendanceTab courseId={course.id} />}
          {current === 'live' && <LiveCheckTab courseId={course.id} />}
          {current === 'deduction' && <DeductionTab courseId={course.id} courseTitle={course.title} />}
          {current === 'rubric' && <RubricTab courseId={course.id} />}
          {current === 'activity' && <ActivityTab courseId={course.id} />}
          {current === 'pre' && (
            <ProjectEvalTab courseId={course.id} courseTitle={course.title} phase="pre" onGo={go} />
          )}
          {current === 'result' && (
            <ProjectEvalTab courseId={course.id} courseTitle={course.title} phase="result" onGo={go} />
          )}
          {current === 'grades' && <GradesTab course={course} />}
        </AdminShell>
      </div>
    </>
  );
}
