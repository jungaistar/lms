import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { isConfigured } from './lib/supabase';
import { clearStudentSession, loadStudentSession } from './lib/session';

import Landing from './pages/Landing';
import StudentLogin from './pages/StudentLogin';
import StudentHome from './student/StudentHome';
import Evaluate from './student/Evaluate';
import Contribution from './student/Contribution';
import Discussion from './student/Discussion';
import Feedback from './student/Feedback';

import TeacherLogin from './teacher/TeacherLogin';
import TeacherSignup from './teacher/TeacherSignup';
import TeacherHome from './teacher/TeacherHome';
import AdminMembers from './teacher/AdminMembers';
import CourseView from './teacher/CourseView';
import ActivityView from './teacher/ActivityView';

function NotConfigured() {
  return (
    <div className="container">
      <div className="alert alert-error">
        <b>Supabase 설정이 없습니다.</b>
        <p className="small" style={{ margin: '6px 0 0' }}>
          <code>web/.env</code> 에 <code>VITE_SUPABASE_URL</code> 과{' '}
          <code>VITE_SUPABASE_ANON_KEY</code> 를 넣고 다시 빌드하세요.
          GitHub Pages 로 배포한 경우에는 저장소 Secrets 에 같은 두 값을 등록해야 합니다.
          자세한 절차는 <code>docs/10-setup.md</code> 에 있습니다.
        </p>
      </div>
    </div>
  );
}

/** 학생 로그인이 없으면 로그인 화면으로 돌려보낸다. */
function RequireStudent({ children }: { children: React.ReactNode }) {
  return loadStudentSession() ? <>{children}</> : <Navigate to="/login" replace />;
}

function TopBar() {
  const nav = useNavigate();
  const s = loadStudentSession();
  return (
    <header className="topbar">
      <div className="title" onClick={() => nav('/')} style={{ cursor: 'pointer' }}>
        동료<span>평가</span>
      </div>
      {s && (
        <div className="who">
          <b>{s.student.name}</b>
          {s.course.title}
          <button
            className="btn-ghost btn-sm"
            style={{ marginLeft: 8 }}
            onClick={async () => {
              await clearStudentSession();
              nav('/login', { replace: true });
            }}
          >
            나가기
          </button>
        </div>
      )}
    </header>
  );
}

export default function App() {
  if (!isConfigured) return <NotConfigured />;

  return (
    <div className="app">
      <TopBar />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<StudentLogin />} />

        <Route path="/me" element={<RequireStudent><StudentHome /></RequireStudent>} />
        <Route path="/evaluate/:assignmentId" element={<RequireStudent><Evaluate /></RequireStudent>} />
        <Route path="/contribution/:activityId" element={<RequireStudent><Contribution /></RequireStudent>} />
        <Route path="/discussion/:activityId" element={<RequireStudent><Discussion /></RequireStudent>} />
        <Route path="/feedback" element={<RequireStudent><Feedback /></RequireStudent>} />

        <Route path="/teacher/login" element={<TeacherLogin />} />
        <Route path="/teacher/signup" element={<TeacherSignup />} />
        <Route path="/teacher" element={<TeacherHome />} />
        <Route path="/teacher/members" element={<AdminMembers />} />
        <Route path="/teacher/course/:courseId" element={<CourseView />} />
        <Route path="/teacher/activity/:activityId" element={<ActivityView />} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}
