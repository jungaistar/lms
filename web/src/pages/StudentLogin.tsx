import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { studentLogin } from '../lib/supabase';
import { saveStudentProfile } from '../lib/session';
import PageHero from '../components/PageHero';
import { NOTICE } from '../brand';

export default function StudentLogin() {
  const nav = useNavigate();
  const [joinCode, setJoinCode] = useState('');
  const [studentNo, setStudentNo] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await studentLogin(joinCode, studentNo);
      saveStudentProfile({ student: r.student, course: r.course });
      nav('/me', { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : '로그인에 실패했습니다.');
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
        <div className="card">
          <h2>수업코드로 입장</h2>
          <p className="muted small">교수님이 알려준 수업코드와 본인 학번을 입력하세요.</p>

          {error && <div className="alert alert-error">{error}</div>}

          <form onSubmit={submit}>
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
                required
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
                autoComplete="off"
                required
              />
            </label>

            <button className="btn-primary btn-block" disabled={busy}>
              {busy ? '확인 중…' : '들어가기'}
            </button>
          </form>

          <p className="small muted" style={{ marginTop: 14, marginBottom: 0 }}>
            명단에 없으면 들어올 수 없습니다. 학번이 맞는데 안 되면 교수님께 말씀하세요.
          </p>
        </div>
      </div>
    </>
  );
}
