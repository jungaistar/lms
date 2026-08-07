import { useCallback, useEffect, useState } from 'react';
import { teacherClient } from '../lib/supabase';
import type { Student, Team } from '../lib/types';

/**
 * 명단은 학교 LMS에서 받아온 목록을 붙여넣어 만든다.
 * 한 줄에 "학번  이름  팀" — 탭/쉼표/여러 칸 어느 걸로 나눠도 받는다.
 * 엑셀에서 그대로 긁어 붙이는 게 제일 흔한 경로라서.
 */
function parseRoster(text: string): Array<{ student_no: string; name: string; team: string | null }> {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const cols = line.split(/\t|,|\s{2,}|\s+/).filter(Boolean);
      return {
        student_no: cols[0] ?? '',
        name: cols[1] ?? '',
        team: cols[2] ?? null,
      };
    })
    .filter((r) => r.student_no && r.name)
    // 헤더 줄("학번 이름")이 섞여 들어오는 경우가 잦아서 걸러낸다.
    .filter((r) => /\d/.test(r.student_no));
}

export default function RosterTab({ courseId }: { courseId: string }) {
  const [students, setStudents] = useState<Student[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [paste, setPaste] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);

  const load = useCallback(async () => {
    const [s, t] = await Promise.all([
      teacherClient.from('students').select('*').eq('course_id', courseId).order('student_no'),
      teacherClient.from('teams').select('*').eq('course_id', courseId).order('name'),
    ]);
    if (s.error) setError(s.error.message);
    else setStudents((s.data ?? []) as Student[]);
    if (!t.error) setTeams((t.data ?? []) as Team[]);
  }, [courseId]);

  useEffect(() => { load(); }, [load]);

  async function importRoster() {
    const rows = parseRoster(paste);
    if (rows.length === 0) return setError('읽어들일 수 있는 줄이 없습니다. "학번 이름 팀" 형식인지 확인하세요.');

    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      // 1) 붙여넣기에 등장한 팀을 먼저 만든다 (이미 있으면 그대로 둔다)
      const teamNames = [...new Set(rows.map((r) => r.team).filter(Boolean) as string[])];
      if (teamNames.length > 0) {
        const { error: tErr } = await teacherClient
          .from('teams')
          .upsert(teamNames.map((name) => ({ course_id: courseId, name })), { onConflict: 'course_id,name' });
        if (tErr) throw tErr;
      }

      const { data: allTeams } = await teacherClient.from('teams').select('*').eq('course_id', courseId);
      const teamId = new Map((allTeams ?? []).map((t: any) => [t.name, t.id]));

      // 2) 학생 upsert — 학번이 같으면 이름·팀만 갱신한다.
      //    기존 학생을 지우지 않는 이유: 이미 남긴 평가가 딸려 삭제되기 때문.
      const { error: sErr } = await teacherClient.from('students').upsert(
        rows.map((r) => ({
          course_id: courseId,
          student_no: r.student_no,
          name: r.name,
          team_id: r.team ? teamId.get(r.team) ?? null : null,
        })),
        { onConflict: 'course_id,student_no' },
      );
      if (sErr) throw sErr;

      setNotice(`${rows.length}명 반영했습니다.`);
      setPaste('');
      setShowImport(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : '불러오지 못했습니다.');
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(s: Student) {
    await teacherClient.from('students').update({ active: !s.active }).eq('id', s.id);
    await load();
  }

  async function changeTeam(s: Student, teamId: string) {
    await teacherClient.from('students').update({ team_id: teamId || null }).eq('id', s.id);
    await load();
  }

  return (
    <>
      {error && <div className="alert alert-error">{error}</div>}
      {notice && <div className="alert alert-ok">{notice}</div>}

      <div className="card tight">
        <div className="row" style={{ alignItems: 'center' }}>
          <div style={{ flex: 1 }}>
            <b>{students.filter((s) => s.active).length}명</b>{' '}
            <span className="muted small">
              활동중 · 팀 {teams.length}개
              {students.some((s) => !s.active) && ` · 제외 ${students.filter((s) => !s.active).length}명`}
            </span>
          </div>
          <button className="btn-primary btn-sm" style={{ flex: '0 0 auto' }} onClick={() => setShowImport(!showImport)}>
            {showImport ? '닫기' : '명단 붙여넣기'}
          </button>
        </div>
      </div>

      {showImport && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>명단 붙여넣기</h3>
          <p className="small muted">
            엑셀이나 학교 LMS 명단에서 <b>학번 · 이름 · 팀</b> 순서로 긁어 붙이세요.
            팀 칸은 비워도 됩니다. 학번이 같으면 덮어쓰고, 없던 학생은 추가됩니다.
          </p>
          <textarea
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            rows={8}
            className="mono"
            style={{ fontSize: 14 }}
            placeholder={'202458001\t김민준\t1조\n202458002\t이서연\t1조\n202458003\t박도윤\t2조'}
          />
          <div className="spacer" />
          <button className="btn-primary btn-block" onClick={importRoster} disabled={busy || !paste.trim()}>
            {busy ? '반영 중…' : `${parseRoster(paste).length}명 반영`}
          </button>
        </div>
      )}

      {students.length === 0 ? (
        <div className="empty"><div className="big">👥</div>명단이 비어 있습니다.</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>학번</th>
                <th>이름</th>
                <th>팀</th>
                <th style={{ width: 90 }}>상태</th>
              </tr>
            </thead>
            <tbody>
              {students.map((s) => (
                <tr key={s.id} style={{ opacity: s.active ? 1 : 0.45 }}>
                  <td className="mono">{s.student_no}</td>
                  <td>{s.name}</td>
                  <td>
                    <select
                      value={s.team_id ?? ''}
                      onChange={(e) => changeTeam(s, e.target.value)}
                      style={{ padding: '5px 8px', fontSize: 14 }}
                    >
                      <option value="">—</option>
                      {teams.map((t) => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <button className="btn-ghost btn-sm" onClick={() => toggleActive(s)}>
                      {s.active ? '제외' : '복귀'}
                    </button>
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
