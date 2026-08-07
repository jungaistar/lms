import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { teacherClient } from '../lib/supabase';
import { MEMBER_STATUS_LABEL, type Course, type Profile } from '../lib/types';

/** 학생이 손으로 입력할 코드라 헷갈리는 글자(O/0, I/1)를 뺀다. */
function randomJoinCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
}

export default function TeacherHome() {
  const nav = useNavigate();
  const [ready, setReady] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [courses, setCourses] = useState<Course[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    term: String(new Date().getFullYear()) + '10',
    title: '',
    class_no: '',
    join_code: randomJoinCode(),
    ext_course_id: '',
    ext_class_no: '',
  });

  async function load() {
    const { data, error: err } = await teacherClient
      .from('courses')
      .select('*')
      .order('term', { ascending: false });
    if (err) setError(err.message);
    else setCourses((data ?? []) as Course[]);
  }

  useEffect(() => {
    (async () => {
      const { data } = await teacherClient.auth.getSession();
      if (!data.session) return nav('/teacher/login', { replace: true });

      const { data: p } = await teacherClient
        .from('profiles')
        .select('*')
        .eq('id', data.session.user.id)
        .maybeSingle();
      setProfile((p ?? null) as Profile | null);

      // 관리자면 승인 대기 인원을 배지로 띄운다. 관리자가 아니면 빈 목록이 온다.
      if ((p as Profile | null)?.role === 'admin') {
        const { data: members } = await teacherClient.rpc('admin_member_list');
        setPendingCount(((members ?? []) as Array<{ status: string }>).filter((m) => m.status === 'pending').length);
      }

      await load();
      setReady(true);
    })();
  }, [nav]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const { data: session } = await teacherClient.auth.getUser();
    const { error: err } = await teacherClient.from('courses').insert({
      owner_id: session.user!.id,
      term: form.term.trim(),
      title: form.title.trim(),
      class_no: form.class_no.trim() || null,
      join_code: form.join_code.trim().toUpperCase(),
      ext_course_id: form.ext_course_id.trim() || null,
      ext_class_no: form.ext_class_no.trim() || null,
    });
    if (err) return setError(err.message);
    setCreating(false);
    setForm({ ...form, title: '', class_no: '', join_code: randomJoinCode() });
    await load();
  }

  if (!ready) return <div className="container"><div className="empty">불러오는 중…</div></div>;

  return (
    <div className="container">
      <div className="card tight">
        <div className="row" style={{ alignItems: 'center' }}>
          <div style={{ flex: 1 }}>
            <h2 style={{ margin: 0 }}>내 과목</h2>
            {profile && (
              <div className="small muted">
                {profile.name ?? profile.email}
                {profile.role === 'admin' && <span className="badge badge-finalized" style={{ marginLeft: 6 }}>관리자</span>}
              </div>
            )}
          </div>
          {profile?.role === 'admin' && (
            <Link className="btn btn-navy btn-sm" to="/teacher/members" style={{ flex: '0 0 auto' }}>
              회원관리{pendingCount > 0 && ` (${pendingCount})`}
            </Link>
          )}
          <button
            className="btn-ghost btn-sm"
            style={{ flex: '0 0 auto' }}
            onClick={async () => {
              await teacherClient.auth.signOut();
              nav('/teacher/login', { replace: true });
            }}
          >
            로그아웃
          </button>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {profile && profile.status !== 'approved' && (
        <div className={`alert ${profile.status === 'suspended' ? 'alert-error' : 'alert-warn'}`}>
          <b>{MEMBER_STATUS_LABEL[profile.status]} 상태입니다.</b>
          <p className="small" style={{ margin: '6px 0 0' }}>
            {profile.status === 'pending'
              ? '관리자가 승인해야 과목을 만들 수 있습니다. 승인되면 이 안내가 사라집니다.'
              : '계정이 정지되어 과목을 만들거나 수정할 수 없습니다. 관리자에게 문의하세요.'}
          </p>
        </div>
      )}

      {courses.length === 0 && !creating && (
        <div className="empty">
          <div className="big">📚</div>
          아직 과목이 없습니다.
        </div>
      )}

      <ul className="list">
        {courses.map((c) => (
          <li key={c.id}>
            <div className="grow">
              <div className="name">{c.title}</div>
              <div className="sub">
                {c.term}
                {c.class_no && ` · ${c.class_no}분반`} · 수업코드{' '}
                <b className="mono" style={{ color: 'var(--orange)' }}>{c.join_code}</b>
              </div>
            </div>
            <Link className="btn btn-navy btn-sm" to={`/teacher/course/${c.id}`}>
              열기
            </Link>
          </li>
        ))}
      </ul>

      {creating ? (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>새 과목</h3>
          <form onSubmit={create}>
            <div className="row">
              <label className="field">
                <span>학기</span>
                <input value={form.term} onChange={(e) => setForm({ ...form, term: e.target.value })} required />
                <small>학교 LMS와 같은 형식 (예: 202610)</small>
              </label>
              <label className="field">
                <span>분반</span>
                <input value={form.class_no} onChange={(e) => setForm({ ...form, class_no: e.target.value })} placeholder="Y2" />
              </label>
            </div>
            <label className="field">
              <span>과목명</span>
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
            </label>
            <label className="field">
              <span>수업코드</span>
              <div className="row">
                <input
                  className="mono"
                  value={form.join_code}
                  onChange={(e) => setForm({ ...form, join_code: e.target.value.toUpperCase() })}
                  required
                />
                <button type="button" className="btn-ghost" style={{ flex: '0 0 auto' }} onClick={() => setForm({ ...form, join_code: randomJoinCode() })}>
                  새로 만들기
                </button>
              </div>
              <small>학생이 학번과 함께 입력할 코드입니다. 수업 중에만 알려주세요.</small>
            </label>

            <h3>학교 LMS 연동 (선택)</h3>
            <p className="small muted">성적을 학교 LMS로 넘길 때만 필요합니다. 나중에 채워도 됩니다.</p>
            <div className="row">
              <label className="field">
                <span>course_id</span>
                <input className="mono" value={form.ext_course_id} onChange={(e) => setForm({ ...form, ext_course_id: e.target.value })} placeholder="202610UN0060****Y2" />
              </label>
              <label className="field">
                <span>class_no</span>
                <input className="mono" value={form.ext_class_no} onChange={(e) => setForm({ ...form, ext_class_no: e.target.value })} placeholder="Y2" />
              </label>
            </div>

            <div className="btn-row">
              <button type="button" className="btn-ghost" style={{ flex: 1 }} onClick={() => setCreating(false)}>
                취소
              </button>
              <button className="btn-primary" style={{ flex: 2 }}>만들기</button>
            </div>
          </form>
        </div>
      ) : (
        <button
          className="btn-primary btn-block"
          onClick={() => setCreating(true)}
          disabled={profile !== null && profile.status !== 'approved'}
        >
          {profile && profile.status !== 'approved' ? '승인 후 과목을 만들 수 있습니다' : '+ 새 과목'}
        </button>
      )}
    </div>
  );
}
