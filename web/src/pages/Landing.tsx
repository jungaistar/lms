import { Link } from 'react-router-dom';
import { loadStudentSession } from '../lib/session';

export default function Landing() {
  const s = loadStudentSession();

  return (
    <div className="container">
      <div className="card">
        <h2>동료평가 학습보조 시스템</h2>
        <p className="muted small">
          발표 상호평가 · 토론 참여 평가 · 팀 기여도 평가 · 과제 동료 첨삭을
          한 곳에서 하고, 결과를 학교 LMS 성적으로 넘깁니다.
        </p>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>학생</h3>
        <p className="small muted">교수님이 알려준 수업코드와 본인 학번으로 들어옵니다. 가입 절차는 없습니다.</p>
        <Link className="btn btn-primary btn-block" to={s ? '/me' : '/login'}>
          {s ? `${s.student.name} 님으로 계속하기` : '학생으로 시작'}
        </Link>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>교수</h3>
        <p className="small muted">과목·명단·루브릭을 만들고, 평가를 배정하고, 결과를 확정합니다.</p>
        <div className="btn-row">
          <Link className="btn btn-navy" style={{ flex: 2 }} to="/teacher">
            로그인
          </Link>
          <Link className="btn btn-ghost" style={{ flex: 1 }} to="/teacher/signup">
            회원가입
          </Link>
        </div>
      </div>
    </div>
  );
}
