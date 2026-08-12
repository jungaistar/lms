import { useCallback, useEffect, useMemo, useState } from 'react';
import { teacherClient } from '../lib/supabase';
import { downloadCsv, downloadXlsx, type SheetTable } from '../lib/exporters';
import type { Student } from '../lib/types';

/**
 * 명단 대조.
 *
 * 학기 초 수강정정이 끝나기 전까지 이쪽 명단과 학교 LMS 명단이 계속 어긋난다.
 * 어긋난 채로 출석을 올리면 없는 학생 줄이 조용히 사라지고, 성적을 낼 때가 되어야
 * 알아챈다. 그래서 **붙여넣고 → 차이를 보고 → 눌러서 맞추는** 화면을 따로 둔다.
 *
 * 학번만 열쇠로 쓴다. 이름은 동명이인·개명 때문에 못 믿는다 —
 * 대신 학번이 같은데 이름이 다르면 따로 보여 준다.
 */
interface Parsed {
  studentNo: string;
  name: string | null;
  line: number;
}

function parsePaste(text: string): Parsed[] {
  return text
    .split('\n')
    .map((raw, i) => ({ raw: raw.trim(), i }))
    .filter((x) => x.raw)
    .map(({ raw, i }) => {
      const cells = raw.includes('\t')
        ? raw.split('\t').map((c) => c.trim())
        : raw.split(/\s{2,}|,|\s+/).map((c) => c.trim());
      const studentNo = cells.find((c) => /^\d{6,12}$/.test(c));
      const name = cells.find((c) => c !== studentNo && /^[가-힣]{2,6}$/.test(c)) ?? null;
      return studentNo ? { studentNo, name, line: i + 1 } : null;
    })
    .filter((x): x is Parsed => x !== null);
}

export default function RosterMatchTab({ courseId, courseTitle }: { courseId: string; courseTitle: string }) {
  const [students, setStudents] = useState<Student[]>([]);
  const [paste, setPaste] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error: err } = await teacherClient
      .from('students')
      .select('*')
      .eq('course_id', courseId)
      .order('student_no');
    if (err) setError(err.message);
    else setStudents((data ?? []) as Student[]);
  }, [courseId]);

  useEffect(() => { load(); }, [load]);

  const rows = useMemo(() => parsePaste(paste), [paste]);

  const diff = useMemo(() => {
    const ours = new Map(students.map((s) => [s.student_no.replace(/\s/g, ''), s]));
    const theirs = new Map(rows.map((r) => [r.studentNo, r]));

    const both: Array<{ mine: Student; theirs: Parsed }> = [];
    const onlyTheirs: Parsed[] = [];
    const onlyMine: Student[] = [];
    const nameGap: Array<{ mine: Student; theirs: Parsed }> = [];

    for (const r of rows) {
      const mine = ours.get(r.studentNo);
      if (!mine) { onlyTheirs.push(r); continue; }
      both.push({ mine, theirs: r });
      if (r.name && r.name !== mine.name) nameGap.push({ mine, theirs: r });
    }
    for (const s of students) {
      if (!theirs.has(s.student_no.replace(/\s/g, ''))) onlyMine.push(s);
    }
    return { both, onlyTheirs, onlyMine, nameGap };
  }, [rows, students]);

  /** 학교 LMS 에만 있는 학생을 명단에 넣는다. 팀은 비워 둔다. */
  async function addMissing() {
    if (diff.onlyTheirs.length === 0) return;
    setBusy(true);
    setError(null);
    const { error: err } = await teacherClient.from('students').upsert(
      diff.onlyTheirs.map((r) => ({
        course_id: courseId,
        student_no: r.studentNo,
        name: r.name ?? r.studentNo,
        active: true,
      })),
      { onConflict: 'course_id,student_no' },
    );
    setBusy(false);
    if (err) setError(err.message);
    else { setNotice(`${diff.onlyTheirs.length}명을 명단에 넣었습니다.`); await load(); }
  }

  /**
   * 이쪽에만 있는 학생을 제외 처리한다. 지우지 않는 이유 —
   * 이미 남긴 평가·출결이 딸려 사라지고, 수강정정 중 되돌아오는 일이 잦다.
   */
  async function suspendExtra() {
    const targets = diff.onlyMine.filter((s) => s.active);
    if (targets.length === 0) return;
    if (!confirm(`${targets.length}명을 명단에서 제외할까요? 기록은 남고 집계에서만 빠집니다.`)) return;
    setBusy(true);
    const { error: err } = await teacherClient
      .from('students')
      .update({ active: false })
      .in('id', targets.map((s) => s.id));
    setBusy(false);
    if (err) setError(err.message);
    else { setNotice(`${targets.length}명을 제외했습니다.`); await load(); }
  }

  /** 학번이 같은데 이름이 다른 줄을 학교 LMS 쪽으로 맞춘다. */
  async function fixNames() {
    if (diff.nameGap.length === 0) return;
    setBusy(true);
    for (const g of diff.nameGap) {
      await teacherClient.from('students').update({ name: g.theirs.name }).eq('id', g.mine.id);
    }
    setBusy(false);
    setNotice(`이름 ${diff.nameGap.length}건을 맞췄습니다.`);
    await load();
  }

  function buildSheet(): SheetTable {
    const head = ['구분', '학번', '이 사이트 이름', '학교 LMS 이름'];
    const body = [
      ...diff.onlyTheirs.map((r) => ['학교 LMS 에만', r.studentNo, '', r.name ?? '']),
      ...diff.onlyMine.map((s) => ['이 사이트에만', s.student_no, s.name, '']),
      ...diff.nameGap.map((g) => ['이름 다름', g.mine.student_no, g.mine.name, g.theirs.name ?? '']),
    ];
    return { name: '명단 대조', rows: [head, ...body] };
  }

  const clean = rows.length > 0 && diff.onlyTheirs.length === 0 && diff.onlyMine.length === 0 && diff.nameGap.length === 0;

  return (
    <>
      {error && <div className="alert alert-error">{error}</div>}
      {notice && <div className="alert alert-ok">{notice}</div>}

      <div className="card">
        <h3 style={{ marginTop: 0 }}>학교 LMS 명단 붙여넣기</h3>
        <p className="small muted">
          학교 LMS <b>강의실 → 수강생 목록</b>(또는 과제관리 → 학생별 과제) 표를 통째로 긁어 붙이세요.
          줄마다 <b>학번</b>만 찾으면 되므로 열 순서는 상관없습니다.
        </p>
        <textarea
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
          rows={7}
          className="mono"
          style={{ fontSize: 14 }}
          placeholder={'1\t학부\t3\t202126002\t고재욱\n2\t학부\t3\t202415002\t고채연'}
        />
        <p className="small muted" style={{ marginBottom: 0 }}>
          읽은 줄 <b>{rows.length}</b> · 이 사이트 명단 <b>{students.filter((s) => s.active).length}</b>명
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="empty">붙여넣으면 차이를 여기에 보여 줍니다.</div>
      ) : clean ? (
        <div className="alert alert-ok">두 명단이 완전히 같습니다. 맞출 것이 없습니다.</div>
      ) : (
        <>
          <div className="stat-grid">
            <div className="stat"><div className="k">양쪽에 있음</div><div className="v">{diff.both.length}</div></div>
            <div className={diff.onlyTheirs.length ? 'stat warn' : 'stat'}>
              <div className="k">학교 LMS 에만</div><div className="v">{diff.onlyTheirs.length}</div>
            </div>
            <div className={diff.onlyMine.length ? 'stat warn' : 'stat'}>
              <div className="k">이 사이트에만</div><div className="v">{diff.onlyMine.length}</div>
            </div>
            <div className={diff.nameGap.length ? 'stat warn' : 'stat'}>
              <div className="k">이름 다름</div><div className="v">{diff.nameGap.length}</div>
            </div>
          </div>

          <div className="card tight">
            <div className="btn-row">
              <button className="btn-primary btn-sm" disabled={busy || !diff.onlyTheirs.length} onClick={addMissing}>
                학교 LMS 에만 있는 {diff.onlyTheirs.length}명 넣기
              </button>
              <button className="btn-sm btn-ghost" disabled={busy || !diff.onlyMine.some((s) => s.active)} onClick={suspendExtra}>
                이 사이트에만 있는 {diff.onlyMine.filter((s) => s.active).length}명 제외
              </button>
              <button className="btn-sm btn-ghost" disabled={busy || !diff.nameGap.length} onClick={fixNames}>
                이름 {diff.nameGap.length}건 맞추기
              </button>
              <button className="btn-sm btn-ghost" onClick={() => downloadCsv(buildSheet().rows, `${courseTitle}_명단대조`)}>CSV</button>
              <button className="btn-sm btn-ghost" onClick={() => downloadXlsx([buildSheet()], `${courseTitle}_명단대조`)}>XLSX</button>
            </div>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>구분</th><th>학번</th><th>이 사이트</th><th>학교 LMS</th></tr>
              </thead>
              <tbody>
                {diff.onlyTheirs.map((r) => (
                  <tr key={`t-${r.studentNo}`}>
                    <td><span className="badge badge-pending">학교 LMS 에만</span></td>
                    <td className="mono">{r.studentNo}</td>
                    <td className="muted">—</td>
                    <td>{r.name ?? '—'}</td>
                  </tr>
                ))}
                {diff.onlyMine.map((s) => (
                  <tr key={`m-${s.id}`} style={{ opacity: s.active ? 1 : 0.45 }}>
                    <td><span className="badge badge-closed">이 사이트에만</span></td>
                    <td className="mono">{s.student_no}</td>
                    <td>{s.name}{!s.active && ' (제외됨)'}</td>
                    <td className="muted">—</td>
                  </tr>
                ))}
                {diff.nameGap.map((g) => (
                  <tr key={`n-${g.mine.id}`}>
                    <td><span className="badge badge-kind">이름 다름</span></td>
                    <td className="mono">{g.mine.student_no}</td>
                    <td>{g.mine.name}</td>
                    <td><b>{g.theirs.name}</b></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
