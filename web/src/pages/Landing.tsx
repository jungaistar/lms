import { Link } from 'react-router-dom';
import { CONTACT, NOTICE, OWNER, SERVICE } from '../brand';
import { loadStudentSession } from '../lib/session';
import { KIND_LABEL, type ActivityKind } from '../lib/types';

/** 홈에서 소개하는 평가 활동 4종. KIND_LABEL 과 짝을 맞춰 둔다. */
const ACTIVITIES: Array<{ kind: ActivityKind; en: string; desc: string }> = [
  {
    kind: 'presentation',
    en: 'PRESENTATION',
    desc: '발표를 들은 동료들이 루브릭 항목별로 점수를 매기고 짧은 코멘트를 남깁니다.',
  },
  {
    kind: 'discussion',
    en: 'DISCUSSION',
    desc: '토론방에 글과 답글을 남기고, 참여도를 기준으로 평가가 이루어집니다.',
  },
  {
    kind: 'team_contribution',
    en: 'TEAM CONTRIBUTION',
    desc: '같은 팀원끼리 100점을 나눠 배분해 실제 기여도를 드러냅니다.',
  },
  {
    kind: 'peer_review',
    en: 'PEER REVIEW',
    desc: '동료의 과제를 읽고 고칠 점을 짚어 주는 첨삭 활동입니다.',
  },
];

export default function Landing() {
  const s = loadStudentSession();

  return (
    <>
      <section className="home-hero">
        <span className="ring a" />
        <span className="ring b" />
        <div className="inner">
          <div className="kicker">
            <i />
            {SERVICE.nameEn}
          </div>
          <h1>
            서로의 배움을 평가하고,
            <br />
            스스로 성장합니다.
          </h1>
          <p className="sub">{SERVICE.summary}</p>
          <div className="tags">
            {ACTIVITIES.map((a) => (
              <span key={a.kind}>{KIND_LABEL[a.kind]}</span>
            ))}
          </div>
        </div>
      </section>

      <nav className="quick-links">
        <div className="inner">
          <Link to={s ? '/me' : '/login'}>
            <span>
              <span className="ko">{s ? `${s.student.name} 님으로 계속하기` : '학생 들어가기'}</span>
              <span className="en">STUDENT</span>
            </span>
            <span className="arrow" aria-hidden="true">
              →
            </span>
          </Link>
          <Link to="/teacher">
            <span>
              <span className="ko">교수 로그인</span>
              <span className="en">INSTRUCTOR</span>
            </span>
            <span className="arrow" aria-hidden="true">
              →
            </span>
          </Link>
          <a href={CONTACT.site} target="_blank" rel="noreferrer">
            <span>
              <span className="ko">직업미래연구소</span>
              <span className="en">INSTITUTE</span>
            </span>
            <span className="arrow" aria-hidden="true">
              ↗
            </span>
          </a>
        </div>
      </nav>

      <div className="container wide">
        <div className="section-title">평가 활동</div>
        <div className="feature-grid">
          {ACTIVITIES.map((a) => (
            <div className="feature" key={a.kind}>
              <div className="k">{a.en}</div>
              <h3>{KIND_LABEL[a.kind]}</h3>
              <p>{a.desc}</p>
            </div>
          ))}
        </div>

        <div className="section-title">이용 안내</div>
        <div className="feature-grid">
          <div className="card">
            <h2>학생</h2>
            <p className="small">{NOTICE.student}</p>
            <Link className="btn btn-primary btn-block" to={s ? '/me' : '/login'}>
              {s ? `${s.student.name} 님으로 계속하기` : '수업 들어가기'}
            </Link>
          </div>

          <div className="card">
            <h2>교수</h2>
            <p className="small">
              과목·명단·루브릭을 만들고, 평가를 배정하고, 결과를 확정합니다. 가입 후 관리자
              승인을 받으면 과목을 만들 수 있습니다.
            </p>
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

        <div className="alert alert-info" style={{ marginTop: 24 }}>
          <b>익명성과 점수 공개 정책</b>
          <p className="small" style={{ margin: '6px 0 0' }}>
            {NOTICE.privacy} 받은 코멘트는 누가 썼는지 표시되지 않으며, 평가한 사람과 평가받은
            사람 모두 서로의 점수를 볼 수 없습니다.
          </p>
        </div>

        <div className="card soft" style={{ marginTop: 24 }}>
          <div className="eyebrow">OPERATED BY</div>
          <h2 style={{ marginTop: 8 }}>
            {OWNER.name} {OWNER.degree}
          </h2>
          <p className="small" style={{ margin: 0 }}>
            {OWNER.role} · {OWNER.affiliation}
          </p>
        </div>
      </div>
    </>
  );
}
