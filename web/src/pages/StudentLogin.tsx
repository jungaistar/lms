import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { studentEnter, studentLogin, type CourseChoice } from '../lib/supabase';
import { saveStudentProfile } from '../lib/session';
import PageHero from '../components/PageHero';
import { COURSES, NOTICE } from '../brand';
import { errText } from '../lib/errors';

/**
 * 수업 들어가기.
 *
 * 기본은 **이메일 + 학번 + 이름** 이다. 수업코드는 한 번 새어 나가면 막을
 * 방법이 없다 — 단톡방에 올라가면 수강생이 아닌 사람도 학번만 알면 들어온다.
 * 새 방식은 명단에 있는 사람만, 교수가 승인한 뒤에만 들어온다.
 *
 * 처음 넣으면 **바로 못 들어가는 것이 정상**이다. 승인을 기다린다.
 * 그래서 "승인 대기" 는 오류 화면이 아니라 그 자체로 하나의 결과 화면이다.
 *
 * 옛 수업코드 방식은 접어서 남겨 뒀다. 과목의 `entry_mode` 가 `code` 인
 * 동안만 통하고, 아니면 서버가 "이메일로 들어오세요" 라고 돌려보낸다.
 */
type Phase =
  | { at: 'form' }
  | { at: 'choose'; courses: CourseChoice[] }
  | { at: 'pending'; courseLabel: string }
  | { at: 'rejected'; courseLabel: string };

export default function StudentLogin() {
  const nav = useNavigate();
  const [params] = useSearchParams();

  // 홈의 과목 카드에서 넘어온 힌트. 과목 id 도 수업코드도 아니라서
  // 아무 수업이나 열리지 않는다 — 명단에 여러 수업이 걸렸을 때
  // 어느 쪽을 먼저 볼지 정해 줄 뿐이다.
  const hinted = COURSES.find((c) => c.key === params.get('c')) ?? null;

  const [email, setEmail] = useState('');
  const [studentNo, setStudentNo] = useState('');
  const [name, setName] = useState('');
  const [phase, setPhase] = useState<Phase>({ at: 'form' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 옛 방식
  const [showCode, setShowCode] = useState(false);
  const [joinCode, setJoinCode] = useState('');

  async function enter(courseId?: string) {
    setBusy(true);
    setError(null);
    try {
      const r = await studentEnter(email, studentNo, name, courseId);
      if (r.kind === 'session') {
        saveStudentProfile({ student: r.session.student, course: r.session.course });
        // 들어가면 강의홈으로 — 과제·설문·출결이 한 화면에 보이는 자리다.
        return nav('/home', { replace: true });
      }
      if (r.kind === 'choose') {
        // 홈에서 과목을 눌러 왔다면 그걸로 바로 이어 간다. 학생에게 같은 걸
        // 두 번 묻지 않는다. 힌트와 맞는 게 없으면 그냥 고르게 둔다.
        const auto = hinted
          ? r.courses.find((c) => c.title === hinted.title && c.class_no === hinted.classNo)
          : undefined;
        if (auto && !courseId) return enter(auto.id);
        return setPhase({ at: 'choose', courses: r.courses });
      }
      if (r.kind === 'pending') return setPhase({ at: 'pending', courseLabel: r.courseLabel });
      return setPhase({ at: 'rejected', courseLabel: r.courseLabel });
    } catch (e) {
      const msg = errText(e, '들어가지 못했습니다.');

      // 서버(Edge Function)가 아직 옛 코드면 이메일 방식 요청에 대고
      // "수업코드와 학번을 모두 입력하세요" 를 돌려준다. 학생 입장에서는
      // 시키는 대로 넣었는데 엉뚱한 소리를 듣는 셈이라 그대로 보여 주면 안 된다.
      // 무엇이 문제인지 말해 주고 쓸 수 있는 길(수업코드)을 열어 준다.
      if (msg.includes('수업코드와 학번')) {
        setShowCode(true);
        setError(
          '아직 이메일로 들어올 수 없습니다. 서버 준비가 끝나지 않았습니다. ' +
            '아래 "수업코드를 받았어요" 로 들어오거나 교수님께 말씀해 주세요.',
        );
        return;
      }
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  async function enterWithCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await studentLogin(joinCode, studentNo);
      saveStudentProfile({ student: r.student, course: r.course });
      nav('/home', { replace: true });
    } catch (e) {
      setError(errText(e, '들어가지 못했습니다.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHero
        crumbs={['학생']}
        title="수업 들어가기"
        en="STUDENT ACCESS"
        desc={NOTICE.student}
        gradient
      />
      <div className="container narrow">
        {/* ── 승인 대기 ─────────────────────────────────── */}
        {phase.at === 'pending' && (
          <div className="card">
            <div className="empty" style={{ border: 0, background: 'none', padding: '20px 0' }}>
              <div className="big">⏳</div>
              <b style={{ color: 'var(--fg-strong)' }}>승인을 기다리는 중입니다.</b>
            </div>
            <p className="small">
              {phase.courseLabel && <b>{phase.courseLabel}</b>} 명단에서 <b>{name}</b>({studentNo}) 님을 찾았습니다.
              교수님이 승인하면 들어올 수 있습니다.
            </p>
            <p className="small muted">
              승인 뒤에는 <b>{email}</b> 로만 들어올 수 있습니다 — 지금 넣은 주소가 맞는지 확인해 주세요.
              다른 주소로 바꾸려면 아래에서 다시 넣으면 됩니다.
            </p>
            <button className="btn-primary btn-block" disabled={busy} onClick={() => enter()}>
              {busy ? '확인 중…' : '승인됐는지 다시 확인'}
            </button>
            <div className="spacer" />
            <button className="btn-ghost btn-block" onClick={() => setPhase({ at: 'form' })}>
              다시 입력하기
            </button>
          </div>
        )}

        {/* ── 거절됨 ────────────────────────────────────── */}
        {phase.at === 'rejected' && (
          <div className="card">
            <div className="alert alert-error">
              <b>입장이 거절되었습니다.</b>
              <p className="small" style={{ margin: '6px 0 0' }}>
                {phase.courseLabel && <>{phase.courseLabel} — </>}
                교수님께 문의해 주세요.
              </p>
            </div>
            <button className="btn-ghost btn-block" onClick={() => setPhase({ at: 'form' })}>
              다시 입력하기
            </button>
          </div>
        )}

        {/* ── 과목 고르기 ───────────────────────────────── */}
        {phase.at === 'choose' && (
          <div className="card">
            <h2>어느 수업인가요?</h2>
            <p className="muted small">
              같은 학번·이름이 여러 수업 명단에 있습니다. 들어갈 수업을 고르세요.
            </p>
            <ul className="list">
              {phase.courses.map((c) => (
                <li key={c.id}>
                  <div className="grow">
                    <div className="name">{c.title}</div>
                    <div className="sub">{c.term}{c.class_no ? ` · ${c.class_no}반` : ''}</div>
                  </div>
                  <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => enter(c.id)}>
                    이 수업
                  </button>
                </li>
              ))}
            </ul>
            <button className="btn-ghost btn-block" onClick={() => setPhase({ at: 'form' })}>
              다시 입력하기
            </button>
          </div>
        )}

        {/* ── 입력 ──────────────────────────────────────── */}
        {phase.at === 'form' && (
          <div className="card">
            <h2>이메일 · 학번 · 이름으로 입장</h2>
            <p className="muted small">
              교수님이 올린 명단과 맞춰 봅니다. 처음 넣으면 교수님 승인을 기다린 뒤 들어옵니다.
            </p>

            {hinted && (
              <div className="alert alert-info">
                <b>{hinted.title}</b> ({hinted.classNo}반) 수업으로 들어갑니다.
                <p className="small" style={{ margin: '6px 0 0' }}>
                  이 수업 명단에 없으면 들어올 수 없습니다. 다른 수업이면 홈에서 다시 고르세요.
                </p>
              </div>
            )}

            {error && <div className="alert alert-error">{error}</div>}

            <form onSubmit={(e) => { e.preventDefault(); enter(); }}>
              <label className="field">
                <span>이메일</span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="예: hong@dima.ac.kr"
                  autoComplete="email"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  required
                />
                <small>승인 뒤에는 이 주소로만 들어올 수 있습니다.</small>
              </label>

              <label className="field">
                <span>학번</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={studentNo}
                  onChange={(e) => setStudentNo(e.target.value.replace(/\s/g, ''))}
                  placeholder="예: 202458004"
                  autoComplete="off"
                  required
                />
              </label>

              <label className="field">
                <span>이름</span>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="예: 홍길동"
                  autoComplete="name"
                  required
                />
                <small>명단에 적힌 이름과 같아야 합니다. 띄어쓰기는 달라도 됩니다.</small>
              </label>

              <button className="btn-primary btn-block" disabled={busy}>
                {busy ? '확인 중…' : '들어가기'}
              </button>
            </form>

            <p className="small muted" style={{ marginTop: 14 }}>
              명단에 없으면 들어올 수 없습니다. 학번과 이름이 맞는데 안 되면 교수님께 말씀하세요.
            </p>

            {/* 옛 방식 — 아직 수업코드로 운영하는 과목만 */}
            <details style={{ marginTop: 10 }} open={showCode}>
              <summary className="small" onClick={() => setShowCode(true)}>
                수업코드를 받았어요
              </summary>
              {showCode && (
                <form onSubmit={enterWithCode} style={{ marginTop: 10 }}>
                  <label className="field">
                    <span>수업코드</span>
                    <input
                      type="text"
                      value={joinCode}
                      onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                      placeholder="예: HRD2601"
                      autoCapitalize="characters"
                      autoCorrect="off"
                      spellCheck={false}
                    />
                  </label>
                  <label className="field">
                    <span>학번</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={studentNo}
                      onChange={(e) => setStudentNo(e.target.value.replace(/\s/g, ''))}
                      placeholder="예: 202458004"
                    />
                  </label>
                  <button className="btn-ghost btn-block" disabled={busy}>
                    {busy ? '확인 중…' : '수업코드로 들어가기'}
                  </button>
                </form>
              )}
            </details>
          </div>
        )}
      </div>
    </>
  );
}
