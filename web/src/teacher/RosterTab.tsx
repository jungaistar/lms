import { useCallback, useEffect, useState } from 'react';
import { teacherClient } from '../lib/supabase';
import type { Student, Team } from '../lib/types';
import { errText } from '../lib/errors';
import { parseRoster, rosterLeftovers } from '../lib/roster';

export default function RosterTab({ courseId }: { courseId: string }) {
  const [students, setStudents] = useState<Student[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [paste, setPaste] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [replace, setReplace] = useState(false);

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

  // 학년·학과 칸은 값이 하나라도 있을 때만 보여 준다. 엑셀로 학번·이름만
  // 넣은 과목에 빈 칸 두 개가 늘 붙어 있으면 표만 넓어진다.
  const anyGrade = students.some((s) => s.grade != null);
  const anyDept = students.some((s) => s.dept != null);

  async function importRoster() {
    const rows = parseRoster(paste);
    if (rows.length === 0) return setError('읽어들일 수 있는 줄이 없습니다. "학번 이름 팀" 형식인지 확인하세요.');

    // 교체는 지우는 일이다. 무엇이 지워지는지 세어서 **넣기 전에** 묻는다.
    const doomed = replace ? rosterLeftovers(students, rows) : [];
    if (doomed.length > 0) {
      const head = doomed.slice(0, 5).map((s) => `${s.student_no} ${s.name}`).join(', ');
      const more = doomed.length > 5 ? ` 외 ${doomed.length - 5}명` : '';
      const ok = confirm(
        `붙여넣은 명단에 없는 ${doomed.length}명을 지웁니다.\n${head}${more}\n\n` +
          '그 학생이 남긴 평가 · 출결 · 과제 · 성적도 함께 사라집니다. 되돌릴 수 없습니다.\n' +
          '지우지 않고 집계에서만 빼려면 취소하고 각 줄의 "제외" 를 쓰세요.',
      );
      if (!ok) return;
    }

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
      const base = rows.map((r) => ({
        course_id: courseId,
        student_no: r.student_no,
        name: r.name,
        team_id: r.team ? teamId.get(r.team) ?? null : null,
      }));

      // 학년·학과는 0011 마이그레이션이 올라가야 있는 열이다.
      // 아직이면 PGRST204 가 오는데, 그때는 학번·이름만으로 한 번 더 넣는다 —
      // 마이그레이션 때문에 명단 넣기가 막히면 안 된다.
      const withExtra = base.map((b, i) => ({ ...b, grade: rows[i]!.grade, dept: rows[i]!.dept }));
      const hasExtra = rows.some((r) => r.grade !== null || r.dept !== null);

      let degraded = false;
      let { error: sErr } = await teacherClient
        .from('students')
        .upsert(hasExtra ? withExtra : base, { onConflict: 'course_id,student_no' });

      if (sErr && /grade|dept|PGRST204/i.test(`${sErr.code ?? ''} ${sErr.message ?? ''}`)) {
        degraded = true;
        ({ error: sErr } = await teacherClient
          .from('students')
          .upsert(base, { onConflict: 'course_id,student_no' }));
      }
      if (sErr) throw sErr;

      // 3) 교체면 명단에 없던 학생을 지운다. **새 명단을 넣은 뒤**에 지우는 이유는
      //    넣기가 실패했을 때 아무도 지우지 않기 위해서다.
      //    한 번에 다 보내면 주소가 너무 길어져서 끊어 보낸다.
      for (let i = 0; i < doomed.length; i += 50) {
        const { error: dErr } = await teacherClient
          .from('students')
          .delete()
          .in('id', doomed.slice(i, i + 50).map((s) => s.id));
        if (dErr) throw dErr;
      }

      setNotice(
        `${rows.length}명 반영했습니다.` +
          (doomed.length ? ` 명단에 없던 ${doomed.length}명은 지웠습니다.` : '') +
          (degraded ? ' (학년·학과는 0011 마이그레이션을 올린 뒤 다시 붙여넣으면 저장됩니다.)' : ''),
      );
      setPaste('');
      setReplace(false);
      setShowImport(false);
      await load();
    } catch (e) {
      setError(errText(e, '불러오지 못했습니다.'));
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
            학교 LMS <b>성적산출/결과</b> 표를 <b>그대로 긁어 붙여도</b> 됩니다 —
            NO · 학과 · 학년 · 학번 · 이름 순서를 알아서 읽고, 뒤에 붙는
            "점 · 추가점수 저장 · 출석미달" 은 버립니다.
            엑셀에서 <b>학번 · 이름 · 팀</b> 순서로 붙여넣던 방식도 그대로 됩니다.
            학번이 같으면 덮어쓰고, 없던 학생은 추가됩니다.
          </p>
          <textarea
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            rows={8}
            className="mono"
            style={{ fontSize: 14 }}
            placeholder={'1\t성악(보컬)과\t3\t201936083\t전예찬\n2\t방송극작과\t3\t202126002\t고재욱\n\n또는  202458001\t김민준\t1조'}
          />
          <label
            className="row"
            style={{ alignItems: 'flex-start', gap: 10, marginTop: 12, cursor: 'pointer' }}
          >
            <input
              type="checkbox"
              checked={replace}
              onChange={(e) => setReplace(e.target.checked)}
              style={{ width: 18, height: 18, flex: '0 0 auto', marginTop: 2 }}
            />
            <span className="small">
              <b>명단 교체</b> — 붙여넣은 명단에 <b>없는</b> 학생을 지웁니다.
              학기가 바뀌어 지난 학기 명단이 그대로 남아 있을 때 씁니다.
              지우기 전에 몇 명인지 묻습니다.
            </span>
          </label>
          <div className="spacer" />
          <button className="btn-primary btn-block" onClick={importRoster} disabled={busy || !paste.trim()}>
            {busy
              ? '반영 중…'
              : replace
                ? `${parseRoster(paste).length}명으로 교체`
                : `${parseRoster(paste).length}명 반영`}
          </button>
        </div>
      )}

      {students.length === 0 ? (
        <div className="empty">명단이 비어 있습니다.</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>학번</th>
                <th>이름</th>
                {anyGrade && <th style={{ width: 56 }}>학년</th>}
                {anyDept && <th>학과</th>}
                <th>팀</th>
                <th style={{ width: 90 }}>상태</th>
              </tr>
            </thead>
            <tbody>
              {students.map((s) => (
                <tr key={s.id} style={{ opacity: s.active ? 1 : 0.45 }}>
                  <td className="mono">{s.student_no}</td>
                  <td>{s.name}</td>
                  {anyGrade && <td className="small muted">{s.grade ?? '—'}</td>}
                  {anyDept && <td className="small muted">{s.dept ?? '—'}</td>}
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
