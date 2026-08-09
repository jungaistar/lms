import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { teacherClient } from '../lib/supabase';
import { MEMBER_STATUS_LABEL, type Member, type MemberStatus } from '../lib/types';
import PageHero from '../components/PageHero';

const FILTERS: Array<{ key: MemberStatus | 'all'; label: string }> = [
  { key: 'pending', label: '승인 대기' },
  { key: 'approved', label: '승인됨' },
  { key: 'suspended', label: '정지' },
  { key: 'all', label: '전체' },
];

/**
 * 회원관리 — 관리자 전용.
 *
 * 화면을 감추는 게 아니라 서버가 막는다. admin_member_list() 는 `where is_admin()`
 * 이라 관리자가 아니면 빈 목록이 오고, admin_set_member_status() 는 예외를 던진다.
 * 그래서 이 컴포넌트를 억지로 열어도 아무것도 얻을 수 없다.
 *
 * 관리자가 보는 것은 회원과 그 규모(과목·학생 수)까지다.
 * 남의 수업 안의 평가 내용이나 점수는 관리자도 볼 수 없다 — 관리 권한이
 * 수업 내부를 들여다볼 이유가 없기 때문이다.
 */
export default function AdminMembers() {
  const nav = useNavigate();
  const [members, setMembers] = useState<Member[]>([]);
  const [filter, setFilter] = useState<MemberStatus | 'all'>('pending');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error: err } = await teacherClient.rpc('admin_member_list');
    if (err) setError(err.message);
    else setMembers((data ?? []) as Member[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await teacherClient.auth.getSession();
      if (!data.session) return nav('/teacher/login', { replace: true });
      await load();
    })();
  }, [load, nav]);

  async function setStatus(m: Member, status: MemberStatus) {
    setBusyId(m.id);
    setError(null);
    setNotice(null);
    const { error: err } = await teacherClient.rpc('admin_set_member_status', {
      p_user: m.id,
      p_status: status,
    });
    setBusyId(null);
    if (err) return setError(err.message);
    setNotice(`${m.name ?? m.email} → ${MEMBER_STATUS_LABEL[status]}`);
    await load();
  }

  const shown = filter === 'all' ? members : members.filter((m) => m.status === filter);
  const pendingCount = members.filter((m) => m.status === 'pending').length;

  if (loading) return <div className="container"><div className="empty">불러오는 중…</div></div>;

  return (
    <>
    <PageHero
      crumbs={['교수', '회원관리']}
      title="회원관리"
      en="MEMBERS"
      desc={`전체 ${members.length}명${pendingCount > 0 ? ` · 승인 대기 ${pendingCount}명` : ''}`}
      actions={<Link className="btn btn-on-hero btn-sm" to="/teacher">← 내 과목</Link>}
    />
    <div className="container wide">
      {error && <div className="alert alert-error">{error}</div>}
      {notice && <div className="alert alert-ok">{notice}</div>}

      {members.length === 0 && (
        <div className="alert alert-warn">
          목록이 비어 있습니다. 관리자 계정으로 로그인했는지 확인하세요.
          (관리자가 아니면 서버가 빈 목록을 돌려줍니다.)
        </div>
      )}

      <div className="tabs">
        {FILTERS.map((f) => (
          <button key={f.key} aria-selected={filter === f.key} onClick={() => setFilter(f.key)}>
            {f.label}
            {f.key === 'pending' && pendingCount > 0 && ` (${pendingCount})`}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <div className="empty small">해당하는 회원이 없습니다.</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>이름</th>
                <th>이메일</th>
                <th>소속</th>
                <th>상태</th>
                <th className="num">과목</th>
                <th className="num">학생</th>
                <th>가입</th>
                <th style={{ width: 170 }}>처리</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((m) => (
                <tr key={m.id} style={{ opacity: m.status === 'suspended' ? 0.5 : 1 }}>
                  <td>
                    <b>{m.name ?? '—'}</b>
                    {m.role === 'admin' && <span className="badge badge-finalized" style={{ marginLeft: 6 }}>관리자</span>}
                  </td>
                  <td className="small">{m.email}</td>
                  <td className="small">{m.affiliation ?? '—'}</td>
                  <td>
                    <span className={`badge badge-${m.status === 'approved' ? 'open' : m.status === 'pending' ? 'closed' : 'draft'}`}>
                      {MEMBER_STATUS_LABEL[m.status]}
                    </span>
                  </td>
                  <td className="num">{m.course_count}</td>
                  <td className="num">{m.student_count}</td>
                  <td className="small">{new Date(m.created_at).toLocaleDateString('ko-KR')}</td>
                  <td>
                    {m.role === 'admin' ? (
                      <span className="small muted">—</span>
                    ) : (
                      <div className="btn-row">
                        {m.status !== 'approved' && (
                          <button className="btn-primary btn-sm" disabled={busyId === m.id}
                                  onClick={() => setStatus(m, 'approved')}>
                            승인
                          </button>
                        )}
                        {m.status === 'approved' && (
                          <button className="btn-danger btn-sm" disabled={busyId === m.id}
                                  onClick={() => setStatus(m, 'suspended')}>
                            정지
                          </button>
                        )}
                        {m.status === 'suspended' && (
                          <button className="btn-ghost btn-sm" disabled={busyId === m.id}
                                  onClick={() => setStatus(m, 'pending')}>
                            대기로
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="alert alert-info small" style={{ marginTop: 16 }}>
        <b>정지</b>하면 새 과목을 만들거나 기존 과목을 수정할 수 없습니다.
        이미 만든 과목과 학생 데이터는 지워지지 않습니다.
        회원과 데이터를 완전히 지우려면 Supabase 대시보드에서 해당 계정을 삭제하세요.
      </div>
    </div>
    </>
  );
}
