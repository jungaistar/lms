import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { teacherClient } from '../lib/supabase';
import PageHero from '../components/PageHero';

/**
 * 비밀번호 설정 · 변경.
 *
 * 일회용 링크로 처음 들어온 계정은 비밀번호가 없다. 여기서 정하고 나면
 * 다음부터는 링크 없이 이메일+비밀번호로 로그인할 수 있다.
 */
export default function SetPassword() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const isFirstTime = params.get('first') === '1';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await teacherClient.auth.getSession();
      if (!data.session) return nav('/teacher/login', { replace: true });
      setEmail(data.session.user.email ?? '');
    })();
  }, [nav]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) return setError('비밀번호가 서로 다릅니다.');
    if (password.length < 8) return setError('비밀번호는 8자 이상이어야 합니다.');

    setBusy(true);
    setError(null);
    const { error: err } = await teacherClient.auth.updateUser({ password });
    setBusy(false);
    if (err) return setError(`설정하지 못했습니다: ${err.message}`);
    setDone(true);
  }

  if (done) {
    return (
      <div className="container narrow">
        <div className="card">
          <h2>비밀번호 설정 완료</h2>
          <div className="alert alert-ok">
            이제 <b>{email}</b> 과 방금 정한 비밀번호로 로그인할 수 있습니다.
          </div>
          <button className="btn-primary btn-block" onClick={() => nav('/teacher', { replace: true })}>
            내 과목으로
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
    <PageHero
      crumbs={['교수', '비밀번호']}
      title={isFirstTime ? '비밀번호 정하기' : '비밀번호 변경'}
      en="PASSWORD"
    />
    <div className="container narrow">
      <div className="card">
        {isFirstTime && (
          <div className="alert alert-ok">
            로그인되었습니다. 다음부터 링크 없이 들어오시려면 비밀번호를 정해두세요.
          </div>
        )}
        <p className="small muted">계정: <b>{email || '…'}</b></p>

        {error && <div className="alert alert-error">{error}</div>}

        <form onSubmit={submit}>
          <label className="field">
            <span>새 비밀번호</span>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                   required minLength={8} autoComplete="new-password" />
            <small>8자 이상</small>
          </label>
          <label className="field">
            <span>새 비밀번호 확인</span>
            <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
                   required autoComplete="new-password" />
          </label>
          <button className="btn-primary btn-block" disabled={busy}>
            {busy ? '설정 중…' : '비밀번호 저장'}
          </button>
        </form>

        {isFirstTime && (
          <button className="btn-ghost btn-block" style={{ marginTop: 8 }}
                  onClick={() => nav('/teacher', { replace: true })}>
            나중에 하기
          </button>
        )}
      </div>
    </div>
    </>
  );
}
