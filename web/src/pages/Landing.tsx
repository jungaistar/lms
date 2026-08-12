import { Link } from 'react-router-dom';
import { COURSES, NOTICE, OWNER, SERVICE } from '../brand';
import { loadStudentSession } from '../lib/session';
import { KIND_LABEL, type ActivityKind } from '../lib/types';
import RoleArt from '../components/RoleArt';

/**
 * 홈에서 소개하는 평가 활동.
 *
 * 시스템은 네 가지를 모두 지원하지만(토론 참여 · 과제 동료 첨삭 포함),
 * 홈에서는 실제로 운영하는 두 가지만 내건다. 쓰지 않는 것을 앞세우면
 * 학생이 없는 화면을 찾아다니게 된다. 다시 내걸려면 여기에 줄을 되살리면 된다.
 */
const ACTIVITIES: Array<{ kind: ActivityKind; en: string; desc: string }> = [
  {
    kind: 'presentation',
    en: 'PRESENTATION',
    desc: '발표를 들은 동료들이 루브릭 항목별로 점수를 매기고 짧은 코멘트를 남깁니다.',
  },
  {
    kind: 'team_contribution',
    en: 'TEAM CONTRIBUTION',
    desc: '같은 팀원끼리 100점을 나눠 배분해 실제 기여도를 드러냅니다.',
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

      {/* ── 누구로 들어올지 고르기 ─────────────────────────
          그림 전체가 링크다. 손가락으로 누르는 대상이 크면 클수록 좋다. */}
      <div className="container wide">
        <div className="role-picker">
          <Link className="role-card" to={s ? '/home' : '/login'}>
            <RoleArt role="student" />
            <b>학생</b>
            <span className="en">STUDENT</span>
            <span className="small muted">
              {s ? `${s.student.name} 님으로 계속하기` : '눌러서 들어가기'}
            </span>
          </Link>

          <Link className="role-card" to="/teacher">
            <RoleArt role="teacher" />
            <b>교수</b>
            <span className="en">INSTRUCTOR</span>
            <span className="small muted">눌러서 들어가기</span>
          </Link>
        </div>
      </div>

      <div className="container wide">
        {/* ── 평가 활동 ─────────────────────────────────
            개설 과목 6개와 평가 2가지를 **한 화면**에 둔다.

            과목 카드는 누르면 로그인으로 가고, 로그인하면 그 수업으로 이어진다.
            여기서 고른다고 아무 수업이나 열리는 게 아니다 — 명단에 있고
            교수가 승인한 수업만 열린다.

            평가 카드는 링크가 아니다. 무엇을 하는 수업인지 알려 주는 설명이라
            누를 것이 없다. 그래서 왼쪽 강조 줄도 '들어가기'도 없다. */}
        <h2 className="section-title">평가 활동</h2>
        <p className="small muted" style={{ margin: '-6px 0 14px' }}>
          자기가 듣는 수업을 누르세요. 로그인하면 그 수업으로 이어집니다.
          <b> 명단에 있는 수업만</b> 열립니다.
        </p>

        <div className="course-grid">
          {COURSES.map((c) => (
            <Link className="course-card" key={c.key} to={s ? '/home' : `/login?c=${c.key}`}>
              <span className="k">{c.en}</span>
              <b>{c.title}</b>
              <span className="cls">{c.classNo}반</span>
              <p>{c.desc}</p>
              <span className="go" aria-hidden="true">들어가기 →</span>
            </Link>
          ))}

          {ACTIVITIES.map((a) => (
            <div className="course-card info" key={a.kind}>
              <span className="k">{a.en}</span>
              <b>{KIND_LABEL[a.kind]}</b>
              <span className="cls">평가 방식</span>
              <p>{a.desc}</p>
            </div>
          ))}
        </div>

        <h2 className="section-title">이용 안내</h2>
        <div className="feature-grid">
          <div className="card">
            <h3>학생</h3>
            <p className="small">{NOTICE.student}</p>
            <p className="small muted">
              처음이라면 <b>등록 신청</b>을 먼저 하세요. 교수님이 명단과 맞춰 승인하면
              그 다음부터는 바로 들어옵니다. 비밀번호는 없습니다.
            </p>
            <div className="btn-row">
              <Link className="btn btn-primary" style={{ flex: 2 }} to={s ? '/home' : '/login'}>
                {s ? `${s.student.name} 님으로 계속하기` : '들어가기'}
              </Link>
              <Link className="btn btn-ghost" style={{ flex: 1 }} to="/login">
                등록 신청
              </Link>
            </div>
          </div>

          <div className="card">
            <h3>교수</h3>
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
          <h3 style={{ marginTop: 8 }}>
            {OWNER.name} {OWNER.degree}
          </h3>
          <p className="small" style={{ margin: 0 }}>
            {OWNER.role} · {OWNER.affiliation}
          </p>
        </div>
      </div>
    </>
  );
}
