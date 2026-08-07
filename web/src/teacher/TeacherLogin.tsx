import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { teacherClient } from '../lib/supabase';

export default function TeacherLogin() {
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: err } = await teacherClient.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (err) return setError('이메일 또는 비밀번호가 맞지 않습니다.');
    nav('/teacher', { replace: true });
  }

  return (
    <div className="container" style={{ maxWidth: 420 }}>
      <div className="card">
        <h2>교수 로그인</h2>
        <p className="small muted">
          Supabase 대시보드에서 만든 계정으로 로그인합니다. 학생 계정과는 별개입니다.
        </p>
        {error && <div className="alert alert-error">{error}</div>}
        <form onSubmit={submit}>
          <label className="field">
            <span>이메일</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" />
          </label>
          <label className="field">
            <span>비밀번호</span>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
          </label>
          <button className="btn-navy btn-block" disabled={busy}>
            {busy ? '확인 중…' : '로그인'}
          </button>
        </form>
      </div>
    </div>
  );
}
