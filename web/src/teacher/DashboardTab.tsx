import { useEffect, useState } from 'react';
import { teacherClient } from '../lib/supabase';
import type { Course, CourseOverview } from '../lib/types';
import type { MenuKey } from './adminMenu';

/**
 * 과목 대시보드.
 *
 * 숫자는 전부 `course_overview()` 한 번으로 받는다. 표를 열 개 따로 세면
 * 요청이 열 번 나가고, 그중 하나만 실패해도 화면이 반쪽이 된다.
 *
 * 아래 "지금 할 일" 은 규칙이 단순하다 — 비어 있으면 채우라고 말한다.
 * 학기 중에 자주 잊는 순서대로 놓았다.
 */
export default function DashboardTab({
  course,
  onGo,
}: {
  course: Course;
  onGo: (key: MenuKey) => void;
}) {
  const [ov, setOv] = useState<CourseOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data, error: err } = await teacherClient.rpc('course_overview', { p_course: course.id });
      // 함수가 없으면 0009 가 아직 안 올라간 것이다. 원인을 바로 알려 준다 —
      // "function does not exist" 만 보여 주면 무엇을 해야 할지 알 수 없다.
      if (err) {
        setError(
          /course_overview/.test(err.message)
            ? '대시보드 함수가 아직 없습니다. Supabase SQL Editor 에서 0009_admin_console.sql 을 실행해 주세요 (docs/11-migrate.md 3-1 절).'
            : err.message,
        );
      } else setOv(data as CourseOverview);
    })();
  }, [course.id]);

  if (error) return <div className="alert alert-error">{error}</div>;
  if (!ov) return <div className="empty">불러오는 중…</div>;

  const todo: Array<{ text: string; key: MenuKey }> = [];
  if (ov.students === 0) todo.push({ text: '수강생 명단이 비어 있습니다.', key: 'roster' });
  if (ov.weeks === 0) todo.push({ text: '주차가 없습니다. 출석은 회차에 붙습니다.', key: 'weeks' });
  if (ov.sessions === 0 && ov.weeks > 0) todo.push({ text: '회차가 없어 출석을 찍을 수 없습니다.', key: 'weeks' });
  if (ov.sessions_blank > 0)
    todo.push({ text: `출결이 비어 있는 회차 ${ov.sessions_blank}개`, key: 'attendance' });
  if (ov.tasks === 0) todo.push({ text: '등록한 과제가 없습니다.', key: 'tasks' });
  if (course.project_mode === 'team' && ov.teams === 0)
    todo.push({ text: '팀 프로젝트 과목인데 팀이 없습니다.', key: 'teams' });
  if (ov.grades_computed === 0) todo.push({ text: '아직 성적을 한 번도 산출하지 않았습니다.', key: 'grades' });

  const syncedAt = ov.last_task_sync ? new Date(ov.last_task_sync).toLocaleString('ko-KR') : null;

  return (
    <>
      <div className="stat-grid">
        <Stat k="수강생" v={ov.students} unit="명" />
        <Stat k="팀" v={ov.teams} unit="개" />
        <Stat k="주차" v={ov.weeks} unit="주" sub={`공개 ${ov.weeks_open}`} />
        <Stat k="회차" v={ov.sessions} unit="회" />
        <Stat k="과제" v={ov.tasks} unit="개" sub={`진행중 ${ov.tasks_open}`} />
        <Stat k="설문" v={ov.surveys} unit="개" sub={`진행중 ${ov.surveys_open}`} />
        {course.peer_assessment && (
          <Stat k="평가 활동" v={ov.activities} unit="개" sub={`진행중 ${ov.activities_open}`} />
        )}
        <Stat k="공지 · 자료" v={ov.notices + ov.materials} unit="건" />
      </div>

      <div className="section-title">출결 · 기타</div>
      <div className="stat-grid">
        <Stat k="출결 표시" v={ov.attendance_marked} unit="칸" />
        <Stat k="지각" v={ov.late} unit="회" />
        <Stat k="결석" v={ov.absent} unit="회" />
        <Stat
          k="출결 안 찍은 회차"
          v={ov.sessions_blank}
          unit="회"
          warn={ov.sessions_blank > 0}
        />
        <Stat k="감점 합계" v={Number(ov.deduction_total).toFixed(1)} unit="점" />
        <Stat k="성적 산출" v={ov.grades_computed} unit="명" sub={`확정 ${ov.grades_approved}`} />
      </div>

      <div className="section-title">지금 할 일</div>
      {todo.length === 0 ? (
        <div className="card tight">
          <p className="small" style={{ margin: 0 }}>
            비어 있는 곳이 없습니다. 기말에는 <b>과제 제출현황</b>을 한 번 더 가져온 뒤
            <b> 학습평가 성적</b>에서 산출하세요.
          </p>
        </div>
      ) : (
        <ul className="list">
          {todo.map((t) => (
            <li key={t.text}>
              <div className="grow">
                <div className="name">{t.text}</div>
              </div>
              <button className="btn-sm btn-ghost" onClick={() => onGo(t.key)}>바로가기</button>
            </li>
          ))}
        </ul>
      )}

      <div className="section-title">학교 LMS 연동</div>
      <div className="card tight">
        <p className="small" style={{ marginTop: 0 }}>
          과제 제출현황 마지막 반영:{' '}
          {syncedAt ? <b>{syncedAt}</b> : <span className="muted">아직 없음</span>}
        </p>
        {course.ext_lms_url && (
          <p className="small muted" style={{ margin: '0 0 10px' }}>
            연결된 강의실: <a href={course.ext_lms_url} target="_blank" rel="noreferrer">{course.ext_lms_url}</a>
          </p>
        )}
        <button className="btn-sm btn-ghost" onClick={() => onGo('tasksync')}>과제 제출현황 가져오기</button>
      </div>
    </>
  );
}

function Stat({
  k,
  v,
  unit,
  sub,
  warn,
}: {
  k: string;
  v: number | string;
  unit?: string;
  sub?: string;
  warn?: boolean;
}) {
  return (
    <div className={warn ? 'stat warn' : 'stat'}>
      <div className="k">{k}</div>
      <div className="v">
        {v}
        {unit && <small>{unit}</small>}
      </div>
      {sub && <div className="k" style={{ marginTop: 2, fontWeight: 500 }}>{sub}</div>}
    </div>
  );
}
