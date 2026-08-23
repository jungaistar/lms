import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { loadStudentSession, studentDb } from '../lib/session';
import {
  SURVEY_STATUS_LABEL,
  type AttendanceRow,
  type CourseWeek,
  type Material,
  type MyTask,
  type Notice,
  type Survey,
  type Task,
  type TaskSubmission,
} from '../lib/types';
import PageHero from '../components/PageHero';
import StudentNav from './StudentNav';
import { errText } from '../lib/errors';

/**
 * 강의홈 — 학생이 처음 보는 화면.
 *
 * 학교 LMS 강의실의 같은 이름 자리를 옮긴 것이다. 여기서는 **지금 해야 할 것**만
 * 보여 준다. 주차별 자료를 훑는 건 '주차 학습' 이 할 일이다.
 *
 * 점수는 여기에 없다. 과제 점수와 출결만 본인 것이 보이고, 상호평가 원점수와
 * 최종 성적은 애초에 내려오지 않는다 — RLS 에 학생용 정책이 없기 때문이다.
 */
export default function CourseHome() {
  const nav = useNavigate();
  const session = loadStudentSession()!;
  const [weeks, setWeeks] = useState<CourseWeek[]>([]);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [subs, setSubs] = useState<TaskSubmission[]>([]);
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [answered, setAnswered] = useState<Set<string>>(new Set());
  const [peer, setPeer] = useState<MyTask[]>([]);
  const [att, setAtt] = useState<AttendanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const db = studentDb();
        const [w, n, m, t, s, p, a] = await Promise.all([
          db.from('course_weeks').select('*').order('week_no'),
          db.from('notices').select('*').order('published_at', { ascending: false }),
          db.from('materials').select('*').order('ord'),
          db.from('tasks').select('*').order('due_at', { nullsFirst: false }),
          db.from('task_submissions').select('*'),
          db.rpc('my_tasks'),
          db.from('attendance').select('*'),
        ]);
        if (w.error) throw w.error;
        setWeeks((w.data ?? []) as CourseWeek[]);
        setNotices((n.data ?? []) as Notice[]);
        setMaterials((m.data ?? []) as Material[]);
        setTasks((t.data ?? []) as Task[]);
        setSubs((s.data ?? []) as TaskSubmission[]);
        setPeer((p.data ?? []) as MyTask[]);
        setAtt((a.data ?? []) as AttendanceRow[]);

        // 설문은 0009 마이그레이션이 올라가야 생기는 표다. 아직이면 조용히 건너뛴다 —
        // 아직 없는 기능 하나 때문에 강의홈 전체가 오류 화면이 되면 안 된다.
        const [sv, sr] = await Promise.all([
          db.from('surveys').select('*').order('created_at', { ascending: false }),
          db.from('survey_responses').select('survey_id'),
        ]);
        if (!sv.error) setSurveys((sv.data ?? []) as Survey[]);
        if (!sr.error) {
          setAnswered(new Set(((sr.data ?? []) as Array<{ survey_id: string }>).map((x) => x.survey_id)));
        }
      } catch (e) {
        setError(errText(e, '불러오지 못했습니다.'));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <div className="container"><div className="empty">불러오는 중…</div></div>;

  const today = new Date().toLocaleDateString('sv-SE');
  // 오늘이 낀 주차가 있으면 그것, 없으면 이미 시작한 주차 중 가장 늦은 것.
  const thisWeek =
    weeks.find((w) => w.starts_on && w.ends_on && w.starts_on <= today && today <= w.ends_on) ??
    [...weeks].reverse().find((w) => w.starts_on && w.starts_on <= today) ??
    weeks[0] ?? null;

  const subOf = (taskId: string) => subs.find((s) => s.task_id === taskId);
  const pendingTasks = tasks.filter((t) => t.status === 'open' && !subOf(t.id)?.submitted_at);
  const openSurveys = surveys.filter((s) => s.status === 'open' && !answered.has(s.id));
  const pendingPeer = peer.filter((p) => !p.submitted);
  const pinned = notices.filter((n) => n.pinned);

  const late = att.filter((r) => r.status === 'late').length;
  const absent = att.filter((r) => r.status === 'absent').length;
  const present = att.filter((r) => r.status === 'present').length;

  const todoCount = pendingTasks.length + openSurveys.length + pendingPeer.length;

  return (
    <>
      <PageHero
        crumbs={['학생', '강의홈']}
        title={session.course.title}
        en={`${session.course.term}${session.course.class_no ? ` · ${session.course.class_no}반` : ''}`}
        desc={`${session.student.name} (${session.student.student_no}) 님, 오늘 해야 할 것은 ${todoCount}건입니다.`}
        gradient
      />
      <div className="container">
        <StudentNav />

        {error && <div className="alert alert-error">{error}</div>}

        {/* ── 고정 공지 ─────────────────────────────────── */}
        {pinned.length > 0 && (
          <div className="card accent">
            <div className="section-title" style={{ marginTop: 0 }}>고정 공지</div>
            {pinned.map((n) => (
              <div key={n.id} style={{ marginBottom: 8 }}>
                <b>{n.title}</b>
                {n.body && <p className="small muted" style={{ margin: '4px 0 0', whiteSpace: 'pre-wrap' }}>{n.body}</p>}
              </div>
            ))}
          </div>
        )}

        {/* ── 이번 주 ───────────────────────────────────── */}
        <div className="section-title">이번 주 수업</div>
        {!thisWeek ? (
          <div className="empty">아직 공개된 주차가 없습니다.</div>
        ) : (
          <div className="card">
            <h3 style={{ marginTop: 0 }}>
              <span className="badge">{thisWeek.week_no}주</span> {thisWeek.title}
            </h3>
            {thisWeek.summary && <p className="small">{thisWeek.summary}</p>}
            <p className="small muted" style={{ marginBottom: 10 }}>
              자료 {materials.filter((m) => m.week_id === thisWeek.id).length}건 ·
              과제 {tasks.filter((t) => t.week_id === thisWeek.id).length}건 ·
              공지 {notices.filter((n) => n.week_id === thisWeek.id).length}건
            </p>
            <Link className="btn-primary btn-sm" to="/lessons">주차 학습으로</Link>
          </div>
        )}

        {/* ── 해야 할 것 ────────────────────────────────── */}
        <div className="section-title">
          해야 할 것{todoCount > 0 && <span className="count">({todoCount})</span>}
        </div>
        {todoCount === 0 ? (
          <div className="empty">지금 해야 할 것이 없습니다.</div>
        ) : (
          <ul className="list">
            {pendingTasks.map((t) => (
              <li key={t.id}>
                <div className="grow">
                  <div className="name">{t.title}</div>
                  <div className="sub">
                    <span className="badge badge-kind">과제</span>
                    {t.mode === 'team' ? ' 팀' : ' 개인'} · {t.max_points}점
                    {t.due_at && <> · 마감 {new Date(t.due_at).toLocaleString('ko-KR')}</>}
                  </div>
                </div>
                <Link className="btn btn-primary btn-sm" to={`/task/${t.id}`}>제출하기</Link>
              </li>
            ))}
            {openSurveys.map((s) => (
              <li key={s.id}>
                <div className="grow">
                  <div className="name">{s.title}</div>
                  <div className="sub">
                    <span className="badge badge-kind">설문</span>
                    {s.anonymous ? ' 익명' : ' 기명'}
                    {s.closes_at && <> · 마감 {new Date(s.closes_at).toLocaleString('ko-KR')}</>}
                  </div>
                </div>
                <Link className="btn btn-primary btn-sm" to={`/survey/${s.id}`}>참여하기</Link>
              </li>
            ))}
            {pendingPeer.length > 0 && (
              <li>
                <div className="grow">
                  <div className="name">상호평가 {pendingPeer.length}건</div>
                  <div className="sub"><span className="badge badge-kind">평가</span> 아직 제출하지 않았습니다.</div>
                </div>
                <button className="btn btn-primary btn-sm" onClick={() => nav('/me')}>평가하러</button>
              </li>
            )}
          </ul>
        )}

        {/* ── 설문 지난 것 ──────────────────────────────── */}
        {surveys.length > openSurveys.length && (
          <>
            <div className="section-title">설문</div>
            <ul className="list">
              {surveys.map((s) => (
                <li key={s.id}>
                  <div className="grow">
                    <div className="name">{s.title}</div>
                    <div className="sub">
                      {SURVEY_STATUS_LABEL[s.status]}
                      {answered.has(s.id) && <> · <b>참여함</b></>}
                    </div>
                  </div>
                  {s.status === 'open' && !answered.has(s.id) ? (
                    <Link className="btn btn-primary btn-sm" to={`/survey/${s.id}`}>참여하기</Link>
                  ) : (
                    <Link className="btn btn-ghost btn-sm" to={`/survey/${s.id}`}>보기</Link>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}

        {/* ── 내 출결 ───────────────────────────────────── */}
        <div className="section-title">내 출결</div>
        <div className="stat-grid">
          <div className="stat"><div className="k">출석</div><div className="v">{present}</div></div>
          <div className={late ? 'stat warn' : 'stat'}><div className="k">지각</div><div className="v">{late}</div></div>
          <div className={absent ? 'stat warn' : 'stat'}><div className="k">결석</div><div className="v">{absent}</div></div>
        </div>
        <p className="small muted">
          지각·결석은 기타 점수에 반영됩니다. 잘못된 것이 있으면 교수에게 말해 주세요.
          <Link to="/record" style={{ marginLeft: 6 }}>내 기록 자세히 보기</Link>
        </p>
      </div>
    </>
  );
}
