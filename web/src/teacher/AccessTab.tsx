import { useCallback, useEffect, useMemo, useState } from 'react';
import { teacherClient } from '../lib/supabase';
import { downloadCsv, downloadXlsx, type SheetTable } from '../lib/exporters';
import { ACCESS_STATUS_LABEL, type AccessRow, type AccessStatus, type Course } from '../lib/types';

/**
 * 입장 승인.
 *
 * 학생이 이메일 · 학번 · 이름을 넣으면 명단과 대조된 뒤 여기 대기 줄로 온다.
 * 승인해야 들어온다. 판정은 Edge Function 이 하고, 이 화면은 그 상태를 바꾼다 —
 * `student_access` 에는 학생용 RLS 정책이 아예 없어서 학생 토큰으로는
 * 남이 승인됐는지도 읽을 수 없다.
 *
 * 명단 전원이 보인다. 아직 신청하지 않은 학생도 '미신청' 으로 나와야
 * "누가 아직 안 들어왔는지" 를 알 수 있다.
 *
 * 이메일은 승인 뒤 **두 번째 열쇠**가 된다. 학생이 주소를 잘못 넣었거나
 * 바꿔야 하면 '이메일 풀기' 로 비운다 — 다음 로그인 때 새 주소가 묶인다.
 */
export default function AccessTab({ course }: { course: Course }) {
  const [rows, setRows] = useState<AccessRow[]>([]);
  const [entryMode, setEntryMode] = useState(course.entry_mode ?? 'approval');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error: err } = await teacherClient.rpc('access_list', { p_course: course.id });
    if (err) {
      setError(
        /access_list/.test(err.message)
          ? '입장 승인 함수가 아직 없습니다. Supabase SQL Editor 에서 0010_student_access.sql 을 실행해 주세요 (docs/11-migrate.md).'
          : err.message,
      );
    } else {
      setError(null);
      setRows((data ?? []) as AccessRow[]);
    }
  }, [course.id]);

  useEffect(() => { load(); }, [load]);

  async function setStatus(studentId: string, status: AccessStatus) {
    setBusy(true);
    const { error: err } = await teacherClient.rpc('set_access_status', {
      p_course: course.id,
      p_student: studentId,
      p_status: status,
    });
    setBusy(false);
    if (err) setError(err.message);
    else await load();
  }

  async function approveAll() {
    const waiting = rows.filter((r) => r.status !== 'approved').length;
    if (waiting === 0) return setNotice('이미 전원 승인되어 있습니다.');
    if (!confirm(`명단 ${waiting}명을 한 번에 승인할까요? 학생은 첫 로그인 때 이메일이 묶입니다.`)) return;

    setBusy(true);
    const { error: err } = await teacherClient.rpc('approve_all_access', { p_course: course.id });
    setBusy(false);
    if (err) setError(err.message);
    else { setNotice(`${waiting}명을 승인했습니다.`); await load(); }
  }

  async function clearEmail(studentId: string, name: string) {
    if (!confirm(`${name} 님의 승인된 이메일을 풀까요? 다음 로그인 때 넣는 주소가 새로 묶입니다.`)) return;
    setBusy(true);
    const { error: err } = await teacherClient.rpc('clear_access_email', {
      p_course: course.id,
      p_student: studentId,
    });
    setBusy(false);
    if (err) setError(err.message);
    else await load();
  }

  async function switchMode(mode: 'code' | 'approval') {
    if (mode === 'approval' && rows.every((r) => r.status !== 'approved')) {
      if (!confirm(
        '승인 방식으로 바꾸면 승인받지 않은 학생은 못 들어옵니다.\n' +
        '지금 승인된 학생이 없습니다. 바꾼 뒤 "명단 전원 승인" 을 눌러 주세요.\n\n계속할까요?',
      )) return;
    }
    setBusy(true);
    const { error: err } = await teacherClient.from('courses').update({ entry_mode: mode }).eq('id', course.id);
    setBusy(false);
    if (err) setError(err.message);
    else { setEntryMode(mode); setNotice(mode === 'approval' ? '승인 방식으로 바꿨습니다.' : '수업코드 방식으로 바꿨습니다.'); }
  }

  const shown = useMemo(() => {
    const key = q.trim().toLowerCase();
    if (!key) return rows;
    return rows.filter(
      (r) => r.name.toLowerCase().includes(key)
        || r.student_no.includes(key)
        || (r.email ?? '').toLowerCase().includes(key),
    );
  }, [rows, q]);

  const count = (s: AccessStatus | 'none') => rows.filter((r) => r.status === s).length;

  function buildSheet(): SheetTable {
    const head = ['학번', '이름', '팀', '이메일', '상태', '신청', '처리', '마지막 입장'];
    const body = shown.map((r) => [
      r.student_no, r.name, r.team_name ?? '', r.email ?? '',
      ACCESS_STATUS_LABEL[r.status],
      r.requested_at ? new Date(r.requested_at).toLocaleString('ko-KR') : '',
      r.decided_at ? new Date(r.decided_at).toLocaleString('ko-KR') : '',
      r.last_login_at ? new Date(r.last_login_at).toLocaleString('ko-KR') : '',
    ]);
    return { name: '입장 승인', rows: [head, ...body] };
  }

  const fileBase = `${course.title}_입장승인`;

  return (
    <>
      {error && <div className="alert alert-error">{error}</div>}
      {notice && <div className="alert alert-ok">{notice}</div>}

      {/* ── 입장 방식 ─────────────────────────────────── */}
      <div className="section-title">입장 방식</div>
      <div className="card tight">
        <div className="btn-row">
          <button
            className={entryMode === 'approval' ? 'btn-sm btn-navy' : 'btn-sm btn-ghost'}
            disabled={busy}
            onClick={() => switchMode('approval')}
          >
            이메일 · 학번 · 이름 + 승인
          </button>
          <button
            className={entryMode === 'code' ? 'btn-sm btn-navy' : 'btn-sm btn-ghost'}
            disabled={busy}
            onClick={() => switchMode('code')}
          >
            수업코드 + 학번 (옛 방식)
          </button>
        </div>
        <p className="small muted" style={{ margin: '10px 0 0' }}>
          {entryMode === 'approval' ? (
            <>
              학생이 <b>이메일 · 학번 · 이름</b>을 넣으면 명단과 대조한 뒤 아래 대기 줄로 옵니다.
              승인해야 들어옵니다. 승인 뒤에는 <b>그 이메일로만</b> 들어올 수 있습니다.
            </>
          ) : (
            <>
              수업코드 <b>{course.join_code}</b> 와 학번만 맞으면 누구든 들어옵니다.
              코드가 새어 나가면 막을 방법이 없습니다 — 승인 방식을 권합니다.
            </>
          )}
        </p>
      </div>

      {/* ── 현황 ─────────────────────────────────────── */}
      <div className="stat-grid" style={{ marginTop: 20 }}>
        <div className={count('pending') ? 'stat warn' : 'stat'}>
          <div className="k">승인 대기</div><div className="v">{count('pending')}</div>
        </div>
        <div className="stat"><div className="k">승인됨</div><div className="v">{count('approved')}</div></div>
        <div className="stat"><div className="k">미신청</div><div className="v">{count('none')}</div></div>
        <div className={count('rejected') ? 'stat warn' : 'stat'}>
          <div className="k">거절</div><div className="v">{count('rejected')}</div>
        </div>
      </div>

      <div className="card tight">
        <div className="row" style={{ alignItems: 'flex-end', gap: 8 }}>
          <label className="small muted" style={{ flex: '1 1 220px' }}>
            이름 · 학번 · 이메일로 찾기
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="김…" aria-label="학생 찾기" />
          </label>
          <button className="btn-primary btn-sm" style={{ flex: '0 0 auto' }} disabled={busy} onClick={approveAll}>
            명단 전원 승인
          </button>
          <button className="btn-sm btn-ghost" style={{ flex: '0 0 auto' }} onClick={() => downloadCsv(buildSheet().rows, fileBase)}>CSV</button>
          <button className="btn-sm btn-ghost" style={{ flex: '0 0 auto' }} onClick={() => downloadXlsx([buildSheet()], fileBase)}>XLSX</button>
        </div>
        <p className="small muted" style={{ margin: '10px 0 0' }}>
          학기 초에는 <b>명단 전원 승인</b>을 한 번 눌러 두면 학생이 기다리지 않습니다.
          그래도 <b>명단에 없는 사람은 못 들어옵니다</b> — 승인은 명단 위에서만 됩니다.
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="empty">명단이 없습니다. <b>수강생 관리</b>에서 먼저 명단을 넣어 주세요.</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>학생</th><th>이메일</th><th>상태</th><th>마지막 입장</th><th />
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.student_id}>
                  <td>
                    {r.name}
                    <div className="small muted mono">
                      {r.student_no}{r.team_name && ` · ${r.team_name}`}
                    </div>
                  </td>
                  <td className="small">
                    {r.email ?? <span className="muted">—</span>}
                    {r.status === 'approved' && r.email && (
                      <button
                        className="btn-sm btn-ghost"
                        style={{ marginLeft: 6 }}
                        onClick={() => clearEmail(r.student_id, r.name)}
                      >
                        풀기
                      </button>
                    )}
                  </td>
                  <td>
                    <span className={
                      r.status === 'approved' ? 'badge badge-approved'
                        : r.status === 'pending' ? 'badge badge-pending'
                        : r.status === 'rejected' ? 'badge badge-suspended'
                        : 'badge badge-draft'
                    }>
                      {ACCESS_STATUS_LABEL[r.status]}
                    </span>
                    {r.requested_at && r.status === 'pending' && (
                      <div className="small muted">{new Date(r.requested_at).toLocaleString('ko-KR')}</div>
                    )}
                  </td>
                  <td className="small muted">
                    {r.last_login_at ? new Date(r.last_login_at).toLocaleString('ko-KR') : '—'}
                  </td>
                  <td>
                    <div className="btn-row">
                      {r.status !== 'approved' && (
                        <button className="btn-sm btn-navy" disabled={busy} onClick={() => setStatus(r.student_id, 'approved')}>
                          승인
                        </button>
                      )}
                      {r.status !== 'rejected' && (
                        <button className="btn-sm btn-danger" disabled={busy} onClick={() => setStatus(r.student_id, 'rejected')}>
                          거절
                        </button>
                      )}
                      {r.status === 'rejected' && (
                        <button className="btn-sm btn-ghost" disabled={busy} onClick={() => setStatus(r.student_id, 'pending')}>
                          되돌리기
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
