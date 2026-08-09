import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { teacherClient } from '../lib/supabase';
import { ADMIN_EMAIL } from '../lib/types';
import PageHero from '../components/PageHero';

export default function TeacherSignup() {
  const nav = useNavigate();
  const [form, setForm] = useState({ name: '', affiliation: '', email: '', password: '', confirm: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (form.password !== form.confirm) return setError('비밀번호가 서로 다릅니다.');
    if (form.password.length < 8) return setError('비밀번호는 8자 이상이어야 합니다.');

    setBusy(true);
    setError(null);

    const { error: err } = await teacherClient.auth.signUp({
      email: form.email.trim().toLowerCase(),
      password: form.password,
      // 트리거가 프로필을 만들 때 읽는다.
      options: { data: { name: form.name.trim(), affiliation: form.affiliation.trim() } },
    });

    setBusy(false);
    if (err) {
      return setError(
        err.message.includes('already registered')
          ? '이미 가입된 이메일입니다. 로그인해 주세요.'
          : `가입하지 못했습니다: ${err.message}`,
      );
    }
    setDone(true);
  }

  if (done) {
    const isAdmin = form.email.trim().toLowerCase() === ADMIN_EMAIL;
    return (
      <>
      <PageHero crumbs={['교수', '회원가입']} title="가입 완료" en="SIGN UP COMPLETE" />
      <div className="container narrow">
        <div className="card">
          <h2>가입이 접수되었습니다</h2>
          {isAdmin ? (
            <div className="alert alert-ok">
              관리자 계정입니다. 바로 사용할 수 있습니다.
            </div>
          ) : (
            <div className="alert alert-warn">
              <b>승인 대기 중입니다.</b>
              <p className="small" style={{ margin: '6px 0 0' }}>
                관리자가 승인해야 과목을 만들 수 있습니다. 승인 전에도 로그인은 됩니다.
              </p>
            </div>
          )}
          <Link className="btn btn-navy btn-block" to="/teacher/login">로그인하러 가기</Link>
        </div>
      </div>
      </>
    );
  }

  return (
    <>
    <PageHero
      crumbs={['교수', '회원가입']}
      title="교수 회원가입"
      en="INSTRUCTOR SIGN UP"
      desc="가입 후 관리자 승인을 받으면 과목을 만들 수 있습니다. 학생은 가입하지 않습니다 — 수업코드와 학번으로 바로 들어옵니다."
    />
    <div className="container narrow">
      <div className="card">
        {error && <div className="alert alert-error">{error}</div>}

        <form onSubmit={submit}>
          <label className="field">
            <span>이름</span>
            <input type="text" value={form.name} onChange={set('name')} required autoComplete="name" />
          </label>
          <label className="field">
            <span>소속</span>
            <input type="text" value={form.affiliation} onChange={set('affiliation')}
                   placeholder="예: ○○대학교 사회복지학과" autoComplete="organization" />
            <small>관리자가 누구를 승인하는지 판단할 때 봅니다.</small>
          </label>
          <label className="field">
            <span>이메일</span>
            <input type="email" value={form.email} onChange={set('email')} required autoComplete="username" />
          </label>
          <label className="field">
            <span>비밀번호</span>
            <input type="password" value={form.password} onChange={set('password')} required
                   minLength={8} autoComplete="new-password" />
            <small>8자 이상</small>
          </label>
          <label className="field">
            <span>비밀번호 확인</span>
            <input type="password" value={form.confirm} onChange={set('confirm')} required
                   autoComplete="new-password" />
          </label>

          <button className="btn-primary btn-block" disabled={busy}>
            {busy ? '가입 중…' : '가입하기'}
          </button>
        </form>

        <p className="small center muted" style={{ marginTop: 14, marginBottom: 0 }}>
          이미 계정이 있으신가요? <Link to="/teacher/login">로그인</Link>
        </p>
      </div>
    </div>
    </>
  );
}
