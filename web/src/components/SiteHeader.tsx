import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { CONTACT, ORG, OWNER, SERVICE } from '../brand';
import { clearStudentSession, loadStudentSession } from '../lib/session';
import { teacherClient } from '../lib/supabase';

/**
 * 사이트 공통 헤더.
 *
 * 표시만 한다 — 여기서 권한을 판단하지 않는다. "교수 메뉴가 보인다"는 것과
 * "교수 권한이 있다"는 건 별개이고, 실제 접근 통제는 DB의 RLS 가 한다.
 * 로그인 상태는 메뉴를 고르기 위한 힌트일 뿐이다.
 */
export default function SiteHeader() {
  const nav = useNavigate();
  const loc = useLocation();

  // 화면 이동마다 다시 읽는다(로그인 직후 헤더가 바로 바뀌게).
  const student = loadStudentSession();
  const [teacherEmail, setTeacherEmail] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    teacherClient.auth.getSession().then(({ data }) => {
      if (alive) setTeacherEmail(data.session?.user.email ?? null);
    });
    const { data: sub } = teacherClient.auth.onAuthStateChange((_e, s) => {
      setTeacherEmail(s?.user.email ?? null);
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, [loc.pathname]);

  const isTeacherArea = loc.pathname.startsWith('/teacher');
  const here = (p: string) => (loc.pathname === p ? 'page' : undefined);

  return (
    <header className="site-header">
      <div className="utility">
        <div className="inner">
          <div className="org">
            <b>{ORG.name}</b>
            <span className="dot">·</span>
            <span className="en">{ORG.nameEn}</span>
          </div>
          <div className="util-links" style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <span style={{ opacity: 0.75 }}>
              {OWNER.name} {OWNER.degree}
            </span>
            <span className="dot">|</span>
            <a href={CONTACT.site} target="_blank" rel="noreferrer">
              연구소 홈
            </a>
          </div>
        </div>
      </div>

      <div className="masthead">
        <div className="inner">
          <Link className="brand" to="/">
            <span className="brand-mark" aria-hidden="true">
              {ORG.mark}
            </span>
            <span className="brand-text">
              <span className="ko">{SERVICE.name}</span>
              <span className="en">{SERVICE.nameEn}</span>
            </span>
          </Link>

          {(student || teacherEmail) && (
            <div className="session">
              <div className="who">
                <b>{student ? student.student.name : (teacherEmail ?? '')}</b>
                <span>{student ? student.course.title : '교수'}</span>
              </div>
            </div>
          )}

          <nav className="gnb">
            <Link to="/" aria-current={here('/')}>
              홈
            </Link>

            {student ? (
              <>
                <Link to="/me" aria-current={here('/me')}>
                  내 평가
                </Link>
                <Link to="/feedback" aria-current={here('/feedback')}>
                  받은 피드백
                </Link>
                <button
                  onClick={async () => {
                    await clearStudentSession();
                    nav('/login', { replace: true });
                  }}
                >
                  나가기
                </button>
              </>
            ) : teacherEmail ? (
              <>
                <Link to="/teacher" aria-current={here('/teacher')}>
                  내 과목
                </Link>
                <Link to="/teacher/password" aria-current={here('/teacher/password')}>
                  비밀번호
                </Link>
                <button
                  onClick={async () => {
                    await teacherClient.auth.signOut();
                    nav('/teacher/login', { replace: true });
                  }}
                >
                  로그아웃
                </button>
              </>
            ) : isTeacherArea ? (
              <>
                <Link to="/teacher/login" aria-current={here('/teacher/login')}>
                  교수 로그인
                </Link>
                <Link className="cta" to="/login">
                  학생 들어가기
                </Link>
              </>
            ) : (
              <>
                <Link to="/teacher/login" aria-current={here('/teacher/login')}>
                  교수
                </Link>
                <Link className="cta" to="/login">
                  학생 들어가기
                </Link>
              </>
            )}
          </nav>
        </div>
      </div>
    </header>
  );
}
