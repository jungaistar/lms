import { useCallback, useEffect, useMemo, useState } from 'react';
import { teacherClient } from '../lib/supabase';
import { downloadCsv, downloadXlsx, printTable, type SheetTable } from '../lib/exporters';
import type { Student, Team } from '../lib/types';
import { errText } from '../lib/errors';

/**
 * 팀 편성.
 *
 * 명단 화면에도 팀 칸이 있지만 그건 "한 명씩 고치는" 자리다.
 * 여기는 **팀 단위로 보는** 자리다 — 인원이 몰린 팀, 팀 없는 학생,
 * 팀 이름 바꾸기처럼 한 명씩 보면 안 보이는 것들을 다룬다.
 *
 * 자동 배정은 이름·학번 순서를 섞어서 나눈다. 학번 순으로 자르면
 * 같은 과·같은 학년이 한 팀에 몰린다.
 */
export default function TeamsTab({ courseId, courseTitle }: { courseId: string; courseTitle: string }) {
  const [students, setStudents] = useState<Student[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [size, setSize] = useState(4);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [s, t] = await Promise.all([
      teacherClient.from('students').select('*').eq('course_id', courseId).eq('active', true).order('student_no'),
      teacherClient.from('teams').select('*').eq('course_id', courseId).order('name'),
    ]);
    if (s.error) setError(s.error.message);
    setStudents((s.data ?? []) as Student[]);
    setTeams((t.data ?? []) as Team[]);
  }, [courseId]);

  useEffect(() => { load(); }, [load]);

  const byTeam = useMemo(() => {
    const m = new Map<string, Student[]>();
    teams.forEach((t) => m.set(t.id, []));
    students.forEach((s) => {
      if (!s.team_id) return;
      const list = m.get(s.team_id);
      if (list) list.push(s);
    });
    return m;
  }, [students, teams]);

  const unassigned = students.filter((s) => !s.team_id);

  async function addTeam() {
    const name = prompt('팀 이름 (예: 1조)');
    if (!name?.trim()) return;
    const { error: err } = await teacherClient.from('teams').insert({ course_id: courseId, name: name.trim() });
    if (err) setError(err.message);
    else await load();
  }

  async function renameTeam(t: Team) {
    const name = prompt('팀 이름', t.name);
    if (!name?.trim() || name.trim() === t.name) return;
    const { error: err } = await teacherClient.from('teams').update({ name: name.trim() }).eq('id', t.id);
    if (err) setError(err.message);
    else await load();
  }

  async function removeTeam(t: Team) {
    const n = byTeam.get(t.id)?.length ?? 0;
    if (!confirm(`"${t.name}" 팀을 지울까요?${n ? ` 팀원 ${n}명은 팀 없음으로 돌아갑니다.` : ''}`)) return;
    const { error: err } = await teacherClient.from('teams').delete().eq('id', t.id);
    if (err) setError(err.message);
    else await load();
  }

  async function move(s: Student, teamId: string) {
    const { error: err } = await teacherClient.from('students').update({ team_id: teamId || null }).eq('id', s.id);
    if (err) setError(err.message);
    else await load();
  }

  /** 팀을 새로 만들어 전원을 섞어 넣는다. 이미 짜 둔 팀이 있으면 먼저 묻는다. */
  async function autoAssign() {
    if (students.length === 0) return setError('명단이 비어 있습니다.');
    if (size < 2) return setError('팀 인원은 2명 이상이어야 합니다.');

    const count = Math.ceil(students.length / size);
    if (!confirm(`${students.length}명을 ${count}개 팀으로 섞어 나눕니다. 지금 배정은 모두 덮어씁니다. 계속할까요?`)) return;

    setBusy(true);
    setError(null);
    try {
      const names = Array.from({ length: count }, (_, i) => `${i + 1}조`);
      const { error: tErr } = await teacherClient
        .from('teams')
        .upsert(names.map((name) => ({ course_id: courseId, name })), { onConflict: 'course_id,name' });
      if (tErr) throw tErr;

      const { data: all } = await teacherClient.from('teams').select('*').eq('course_id', courseId);
      const idOf = new Map(((all ?? []) as Team[]).map((t) => [t.name, t.id]));

      // 섞은 뒤 순서대로 돌려 담는다(라운드로빈). 뒤 팀만 인원이 적어지는 걸 막는다.
      const shuffled = [...students];
      for (let i = shuffled.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
      }

      for (let i = 0; i < shuffled.length; i += 1) {
        const teamName = names[i % count]!;
        await teacherClient
          .from('students')
          .update({ team_id: idOf.get(teamName) ?? null })
          .eq('id', shuffled[i]!.id);
      }

      setNotice(`${count}개 팀으로 나눴습니다.`);
      await load();
    } catch (e) {
      setError(errText(e, '배정하지 못했습니다.'));
    } finally {
      setBusy(false);
    }
  }

  function buildSheet(): SheetTable {
    const head = ['팀', '학번', '이름'];
    const rows: Array<Array<string | number | null>> = [];
    teams.forEach((t) => (byTeam.get(t.id) ?? []).forEach((s) => rows.push([t.name, s.student_no, s.name])));
    unassigned.forEach((s) => rows.push(['(팀 없음)', s.student_no, s.name]));
    return { name: '팀 편성', rows: [head, ...rows] };
  }

  const fileBase = `${courseTitle}_팀편성`;

  return (
    <>
      {error && <div className="alert alert-error">{error}</div>}
      {notice && <div className="alert alert-ok">{notice}</div>}

      <div className="card tight">
        <div className="row" style={{ alignItems: 'center', gap: 8 }}>
          <div style={{ flex: 1 }} className="small">
            <b>팀 {teams.length}개</b>{' '}
            <span className="muted">· 배정 {students.length - unassigned.length}명 · 팀 없음 {unassigned.length}명</span>
          </div>
          <label className="small muted" style={{ flex: '0 0 auto' }}>
            팀당{' '}
            <input
              type="number"
              min={2}
              max={12}
              value={size}
              onChange={(e) => setSize(Number(e.target.value))}
              style={{ width: 64 }}
              aria-label="팀당 인원"
            />
            명
          </label>
          <button className="btn-sm btn-navy" style={{ flex: '0 0 auto' }} disabled={busy} onClick={autoAssign}>
            섞어서 자동 배정
          </button>
          <button className="btn-sm btn-ghost" style={{ flex: '0 0 auto' }} onClick={addTeam}>+ 팀 추가</button>
          <button className="btn-sm btn-ghost" style={{ flex: '0 0 auto' }} onClick={() => downloadCsv(buildSheet().rows, fileBase)}>CSV</button>
          <button className="btn-sm btn-ghost" style={{ flex: '0 0 auto' }} onClick={() => downloadXlsx([buildSheet()], fileBase)}>XLSX</button>
          <button
            className="btn-sm btn-ghost"
            style={{ flex: '0 0 auto' }}
            onClick={() => { if (!printTable(fileBase, [buildSheet()])) setError('팝업이 막혀 있습니다.'); }}
          >
            PDF(인쇄)
          </button>
        </div>
      </div>

      {teams.length === 0 && <div className="empty">팀이 없습니다.</div>}

      <div className="feature-grid">
        {teams.map((t) => {
          const members = byTeam.get(t.id) ?? [];
          return (
            <div className="card" key={t.id}>
              <div className="row" style={{ alignItems: 'center', gap: 6 }}>
                <h3 style={{ margin: 0, flex: 1 }}>
                  {t.name} <span className="muted small">{members.length}명</span>
                </h3>
                <button className="btn-sm btn-ghost" style={{ flex: '0 0 auto' }} onClick={() => renameTeam(t)}>이름</button>
                <button className="btn-sm btn-danger" style={{ flex: '0 0 auto' }} onClick={() => removeTeam(t)}>삭제</button>
              </div>

              {members.length === 0 ? (
                <p className="muted small" style={{ marginBottom: 0 }}>팀원이 없습니다.</p>
              ) : (
                <ul className="list" style={{ marginTop: 10 }}>
                  {members.map((s) => (
                    <li key={s.id}>
                      <div className="grow">
                        <div className="name">{s.name}</div>
                        <div className="sub mono">{s.student_no}</div>
                      </div>
                      <select
                        value={s.team_id ?? ''}
                        onChange={(e) => move(s, e.target.value)}
                        aria-label={`${s.name} 팀 옮기기`}
                        style={{ padding: '5px 8px', fontSize: 14, flex: '0 0 auto' }}
                      >
                        <option value="">팀 없음</option>
                        {teams.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                      </select>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      {unassigned.length > 0 && (
        <>
          <div className="section-title" style={{ marginTop: 24 }}>팀 없음 <span className="count">{unassigned.length}</span></div>
          <ul className="list">
            {unassigned.map((s) => (
              <li key={s.id}>
                <div className="grow">
                  <div className="name">{s.name}</div>
                  <div className="sub mono">{s.student_no}</div>
                </div>
                <select
                  value=""
                  onChange={(e) => move(s, e.target.value)}
                  aria-label={`${s.name} 팀 배정`}
                  style={{ padding: '5px 8px', fontSize: 14, flex: '0 0 auto' }}
                >
                  <option value="">— 팀 고르기 —</option>
                  {teams.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                </select>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
