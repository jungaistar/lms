import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { isConfigured } from './lib/supabase';
import { loadStudentSession } from './lib/session';

import SiteHeader from './components/SiteHeader';
import SiteFooter from './components/SiteFooter';

/* 학생 화면은 수업 중 휴대폰 데이터로 들어온다 — 곧바로 필요하니 같이 묶는다. */
import Landing from './pages/Landing';
import StudentLogin from './pages/StudentLogin';
import StudentHome from './student/StudentHome';
import Evaluate from './student/Evaluate';
import Contribution from './student/Contribution';
import Discussion from './student/Discussion';
import Feedback from './student/Feedback';
import Lessons from './student/Lessons';
import TaskSubmit from './student/TaskSubmit';
import MyRecord from './student/MyRecord';

/**
 * 교수 화면은 따로 떼어 낸다.
 * 학생은 이 화면들을 절대 열지 않는데, 한 덩어리로 묶으면 명단·루브릭·집계 화면까지
 * 전부 받고 시작하게 된다. 교수는 데스크톱에서 몇 명이 쓰므로 지연 로딩이 낫다.
 */
const AuthOtp = lazy(() => import('./pages/AuthOtp'));
const SetPassword = lazy(() => import('./teacher/SetPassword'));
const TeacherLogin = lazy(() => import('./teacher/TeacherLogin'));
const TeacherSignup = lazy(() => import('./teacher/TeacherSignup'));
const TeacherHome = lazy(() => import('./teacher/TeacherHome'));
const AdminMembers = lazy(() => import('./teacher/AdminMembers'));
const CourseView = lazy(() => import('./teacher/CourseView'));
const ActivityView = lazy(() => import('./teacher/ActivityView'));

function NotConfigured() {
  return (
    <div className="app">
      <div className="container narrow" style={{ paddingTop: 56 }}>
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
    </div>
  );
}

/** 학생 로그인이 없으면 로그인 화면으로 돌려보낸다. */
function RequireStudent({ children }: { children: React.ReactNode }) {
  return loadStudentSession() ? <>{children}</> : <Navigate to="/login" replace />;
}

export default function App() {
  if (!isConfigured) return <NotConfigured />;

  return (
    <div className="app">
      {/* 링크가 아니라 버튼이다. HashRouter 라 href="#main" 을 쓰면 해시가 라우트로
          해석돼 보고 있던 화면에서 홈으로 튕긴다. 버튼은 기본 이동이 없어 그럴 일이 없다. */}
      <button
        type="button"
        className="skip-link"
        onClick={() => {
          const m = document.getElementById('main');
          if (!m) return;
          m.setAttribute('tabindex', '-1');
          m.focus();
          m.scrollIntoView();
        }}
      >
        본문 바로가기
      </button>
      <SiteHeader />
      <main id="main">
        <Suspense fallback={<div className="container"><div className="empty">불러오는 중…</div></div>}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<StudentLogin />} />

          <Route path="/me" element={<RequireStudent><StudentHome /></RequireStudent>} />
          <Route path="/evaluate/:assignmentId" element={<RequireStudent><Evaluate /></RequireStudent>} />
          <Route path="/contribution/:activityId" element={<RequireStudent><Contribution /></RequireStudent>} />
          <Route path="/discussion/:activityId" element={<RequireStudent><Discussion /></RequireStudent>} />
          <Route path="/feedback" element={<RequireStudent><Feedback /></RequireStudent>} />
          <Route path="/lessons" element={<RequireStudent><Lessons /></RequireStudent>} />
          <Route path="/task/:taskId" element={<RequireStudent><TaskSubmit /></RequireStudent>} />
          <Route path="/record" element={<RequireStudent><MyRecord /></RequireStudent>} />

          <Route path="/teacher/login" element={<TeacherLogin />} />
          <Route path="/teacher/signup" element={<TeacherSignup />} />
          <Route path="/teacher" element={<TeacherHome />} />
          <Route path="/teacher/members" element={<AdminMembers />} />
          <Route path="/teacher/password" element={<SetPassword />} />
          <Route path="/auth/otp" element={<AuthOtp />} />
          <Route path="/teacher/course/:courseId" element={<CourseView />} />
          <Route path="/teacher/activity/:activityId" element={<ActivityView />} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </Suspense>
      </main>
      <SiteFooter />
    </div>
  );
}
