import { useCallback, useEffect, useMemo, useState } from 'react';
import { teacherClient } from '../lib/supabase';
import { matchContacts, normalizePhone, parseContacts, type ContactParseResult } from '../lib/contacts';
import { downloadCsv, downloadXlsx, type SheetTable } from '../lib/exporters';
import { errText } from '../lib/errors';
import type { AccessRow, Student, StudentContact } from '../lib/types';

/**
 * 연락처 관리 — 학생 전화번호와 이메일.
 *
 * 왜 이 화면이 필요한가
 *   헤이영에서 학생에게 문자를 보내려면 **번호를 들고 있어야** 한다.
 *   헤이영 화면은 번호를 마스킹해서 보여 주고, 이름을 눌러야 한 명씩 풀린다.
 *   199명을 한 명씩 눌러 옮겨 적는 일을 여기서 줄인다.
 *
 * 받는 길 두 가지
 *   ① 엑셀다운 파일 올리기 — 학번·이름은 다 들어오지만 번호는 대개 마스킹된다.
 *      그래도 먼저 올려 두면 "누구 번호가 비었는지" 가 표로 보인다.
 *   ② 마스킹을 푼 줄만 붙여넣기 — 푼 것부터 채워 나간다.
 *
 * 마스킹된 값이 이미 풀어 둔 번호를 **덮지 않는다**. DB 함수에서 막는다 —
 * 엑셀다운을 다시 올렸다고 애써 풀어 둔 번호가 ****로 돌아가면 안 된다.
 *
 * 이 표에는 학생용 권한 정책이 없다. 학생 계정으로는 한 줄도 못 읽는다.
 */
export default function ContactsTab({ courseId, courseTitle }: { courseId: string; courseTitle: string }) {
  const [students, setStudents] = useState<Student[]>([]);
  const [contacts, setContacts] = useState<StudentContact[]>([]);
  const [access, setAccess] = useState<AccessRow[]>([]);

  const [parsed, setParsed] = useState<ContactParseResult | null>(null);
  const [fileName, setFileName] = useState('');
  const [paste, setPaste] = useState('');

  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reveal, setReveal] = useState(false);

  const load = useCallback(async () => {
    const [s, c] = await Promise.all([
      teacherClient.from('students').select('*').eq('course_id', courseId).eq('active', true).order('student_no'),
      teacherClient.from('student_contacts').select('*').eq('course_id', courseId),
    ]);
    setStudents((s.data ?? []) as Student[]);
    if (c.error) setError(errText(c.error, '연락처를 불러오지 못했습니다.'));
    else setContacts((c.data ?? []) as StudentContact[]);

    // 가입 이메일은 입장 승인 표에 있다. 메일을 보낼 때 쓴다.
    const { data: a } = await teacherClient.from('student_access').select('*').eq('course_id', courseId);
    setAccess((a ?? []) as AccessRow[]);
  }, [courseId]);

  useEffect(() => { load(); }, [load]);

  const byStudent = useMemo(() => new Map(contacts.map((c) => [c.student_id, c])), [contacts]);
  const emailOf = useMemo(
    () => new Map(access.filter((a) => a.email).map((a) => [a.student_id, a.email as string])),
    [access],
  );

  const shown = useMemo(() => {
    const key = q.trim().toLowerCase();
    if (!key) return students;
    return students.filter((s) => s.name.toLowerCase().includes(key) || s.student_no.includes(key));
  }, [students, q]);

  const withPhone = contacts.filter((c) => c.phone).length;
  const maskedLeft = contacts.filter((c) => c.masked && !c.phone).length;
  const noRow = students.length - contacts.length;

  const preview = useMemo(() => {
    if (!parsed) return null;
    return matchContacts(
      parsed.rows,
      students.map((s) => ({ id: s.id, student_no: s.student_no, name: s.name })),
    );
  }, [parsed, students]);

  // ── 읽기 ───────────────────────────────────────────────────
  async function onFile(file: File) {
    setError(null); setNotice(null); setFileName(file.name); setPaste('');
    try {
      const text = await file.text();
      const r = parseContacts(text);
      if (r.rows.length === 0) {
        setError('읽을 수 있는 줄이 없습니다. 헤이영에서 받은 파일을 엑셀에서 "CSV UTF-8" 로 저장했는지 확인해 주세요.');
      }
      setParsed(r);
    } catch {
      setError('파일을 읽지 못했습니다.');
    }
  }

  function onPaste() {
    setError(null); setNotice(null); setFileName('');
    const r = parseContacts(paste);
    if (r.rows.length === 0) {
      setError('읽을 수 있는 줄이 없습니다. 한 줄에 "학번 이름 전화번호" 가 들어가야 합니다.');
    }
    setParsed(r);
  }

  // ── 적재 ───────────────────────────────────────────────────
  /** 미리보기에서 확인한 뒤에만 넣는다. */
  async function apply() {
    if (!parsed || !preview) return;
    setBusy(true); setError(null);
    try {
      const rows = preview.matched.map(({ row, studentId }) => ({
        student_id: studentId,
        phone: row.phone,
        phone_raw: row.phoneRaw,
        masked: row.masked,
        guardian_phone: row.guardianPhone,
        source: 'heyyoung',
      }));

      if (rows.length === 0) throw new Error('명단과 맞는 줄이 없습니다.');

      // 한 번에 다 보내면 요청이 너무 커진다. 200 개씩 끊는다.
      for (let i = 0; i < rows.length; i += 200) {
        const { error: err } = await teacherClient.rpc('save_student_contacts', {
          p_course: courseId,
          p_rows: rows.slice(i, i + 200),
        });
        if (err) throw err;
      }

      const gotPhone = preview.matched.filter((m) => m.row.phone).length;
      const stillMasked = preview.matched.filter((m) => m.row.masked).length;
      setNotice(
        `${rows.length}명 반영했습니다. 번호를 받은 사람 ${gotPhone}명` +
          (stillMasked ? ` · 아직 마스킹된 줄 ${stillMasked}명` : '') +
          (preview.unmatched.length ? ` · 명단에 없는 학번 ${preview.unmatched.length}건은 넣지 않았습니다.` : ''),
      );
      setParsed(null); setFileName(''); setPaste('');
      await load();
    } catch (e) {
      setError(errText(e, '반영하지 못했습니다.'));
    } finally {
      setBusy(false);
    }
  }

  /** 표에서 번호 한 칸을 직접 고친다. 사람이 손으로 넣은 값은 source=manual. */
  async function saveOne(studentId: string, raw: string, field: 'phone' | 'guardian_phone') {
    const cur = byStudent.get(studentId);
    const v = raw.trim();
    const normalized = v ? normalizePhone(v) : null;
    if (v && !normalized) return setError(`전화번호를 못 알아봤습니다 — "${v}"`);
    setError(null);

    const { error: err } = await teacherClient.rpc('save_student_contacts', {
      p_course: courseId,
      p_rows: [{
        student_id: studentId,
        phone: field === 'phone' ? normalized : cur?.phone ?? null,
        phone_raw: field === 'phone' ? normalized : cur?.phone_raw ?? null,
        masked: false,
        guardian_phone: field === 'guardian_phone' ? normalized : cur?.guardian_phone ?? null,
        source: 'manual',
      }],
    });
    if (err) setError(errText(err, '저장하지 못했습니다.'));
    else await load();
  }

  // ── 내보내기 ───────────────────────────────────────────────
  /** 번호가 있는 학생만. 헤이영 문자발송 화면에 붙여 넣는 표다. */
  function sheet(onlyWithPhone: boolean): SheetTable {
    const head = ['학번', '이름', '학년', '학과', '전화번호', '보호자', '가입 이메일'];
    const rows = students
      .filter((s) => !onlyWithPhone || byStudent.get(s.id)?.phone)
      .map((s) => {
        const c = byStudent.get(s.id);
        return [
          s.student_no, s.name, s.grade ?? '', s.dept ?? '',
          c?.phone ?? '', c?.guardian_phone ?? '', emailOf.get(s.id) ?? '',
        ];
      });
    return { name: `${courseTitle} 연락처`, rows: [head, ...rows] };
  }

  return (
    <>
      {error && <div className="alert alert-error">{error}</div>}
      {notice && <div className="alert alert-ok">{notice}</div>}

      <div className="alert alert-warn">
        <b>개인정보입니다. 교수만 봅니다.</b>
        <p className="small" style={{ margin: '6px 0 0' }}>
          전화번호는 <code>student_contacts</code> 에 따로 담습니다. 명단(<code>students</code>)에 붙이지 않은 이유가 있습니다 —
          명단은 <b>같은 수업 학생도 읽을 수 있게</b> 되어 있어서(팀 배분·발표 대상에 필요), 거기에 번호를 넣으면
          학생 한 명이 로그인하는 것만으로 <b>반 전체 번호를 가져갑니다.</b>
          연락처 표에는 학생용 권한 정책을 아예 만들지 않았습니다.
          <br />
          수업이 끝나면 <b>내보낸 파일은 지워 주세요.</b> 파일에는 이 보호가 따라가지 않습니다.
        </p>
      </div>

      {/* ── 현황 ────────────────────────────────────── */}
      <div className="card tight">
        <div className="small">
          명단 <b>{students.length}</b>명
          · 번호 있음 <b>{withPhone}</b>
          · 마스킹된 채 <b>{maskedLeft}</b>
          · 아직 아무것도 없음 <b>{noRow}</b>
          · 가입 이메일 <b>{emailOf.size}</b>
        </div>
        {withPhone < students.length && (
          <p className="small muted" style={{ margin: '8px 0 0' }}>
            번호가 없는 학생에게는 문자를 못 보냅니다. 헤이영에서 이름을 눌러 마스킹을 푼 뒤
            아래 <b>붙여넣기</b> 칸에 넣거나, 표에서 바로 고쳐 주세요.
          </p>
        )}
        <div className="btn-row" style={{ marginTop: 10 }}>
          <button className="btn-sm btn-ghost" onClick={() => downloadCsv(sheet(true).rows, sheet(true).name)}>
            번호 있는 사람만 CSV
          </button>
          <button className="btn-sm btn-ghost" onClick={() => downloadXlsx([sheet(false)], sheet(false).name)}>
            전체 XLSX
          </button>
          <button className="btn-sm btn-ghost" onClick={() => setReveal((v) => !v)} aria-pressed={reveal}>
            {reveal ? '번호 가리기' : '번호 보기'}
          </button>
        </div>
      </div>

      {/* ── ① 파일 ──────────────────────────────────── */}
      <div className="section-title" style={{ marginTop: 28 }}>① 헤이영 명단 파일 올리기</div>
      <div className="card tight">
        <p className="small muted" style={{ marginTop: 0 }}>
          헤이영 <b>강좌별 출석관리 → 교과목명 → 엑셀다운</b> 으로 받은 파일입니다.
          엑셀에서 <b>다른 이름으로 저장 → CSV UTF-8</b> 로 바꿔 올려 주세요.
          이 파일의 번호는 대개 <b>마스킹된 채</b>로 나옵니다 — 그래도 올려 두면 누가 비었는지 표로 보입니다.
        </p>
        <input
          type="file"
          accept=".csv,.tsv,.txt,text/csv"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }}
          aria-label="헤이영 명단 파일"
        />
      </div>

      {/* ── ② 붙여넣기 ──────────────────────────────── */}
      <div className="section-title">② 마스킹 푼 번호 붙여넣기</div>
      <div className="card tight">
        <p className="small muted" style={{ marginTop: 0 }}>
          헤이영에서 <b>학생 이름을 눌러 마스킹을 해제</b>한 뒤 그 줄을 긁어 붙여넣으세요.
          한 줄에 <b>학번 · 이름 · 전화번호</b>가 있으면 됩니다. 여러 줄을 한 번에 넣어도 됩니다.
          머리글이 있어도 되고 없어도 됩니다.
        </p>
        <textarea
          rows={5}
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
          placeholder={'202458001\t김민준\t010-1234-5678\n202458002\t이서연\t010-9999-8888'}
          aria-label="번호 붙여넣기"
        />
        <div className="btn-row" style={{ marginTop: 8 }}>
          <button className="btn-sm btn-primary" disabled={!paste.trim()} onClick={onPaste}>읽어 보기</button>
          <button className="btn-sm btn-ghost" disabled={!paste} onClick={() => setPaste('')}>지우기</button>
        </div>
      </div>

      {/* ── 미리보기 ────────────────────────────────── */}
      {parsed && preview && (
        <div className="card tight">
          <div className="alert alert-info">
            {fileName ? <b>{fileName}</b> : <b>붙여넣은 내용</b>} — 읽은 줄 {parsed.rows.length}
            · 명단과 맞음 <b>{preview.matched.length}</b>
            {preview.unmatched.length > 0 && <> · 명단에 없음 {preview.unmatched.length}</>}
            {preview.missing.length > 0 && <> · 이 파일에 안 나온 학생 {preview.missing.length}</>}
            {parsed.maskedCount > 0 && <> · <b>마스킹된 줄 {parsed.maskedCount}</b></>}
            {parsed.mapping.phone && (
              <div className="small muted" style={{ marginTop: 6 }}>
                인식한 열 — 학번: {parsed.mapping.studentNo ?? '생김새로 찾음'}
                · 전화번호: {parsed.mapping.phone}
                {parsed.mapping.guardianPhone && <> · 보호자: {parsed.mapping.guardianPhone}</>}
              </div>
            )}
          </div>

          {parsed.maskedCount > 0 && (
            <div className="alert alert-warn">
              마스킹된 줄 {parsed.maskedCount}개는 <b>번호로 받지 않습니다.</b> 걸 수 없는 번호이기 때문입니다.
              "마스킹된 채" 로만 표시해 두니, 헤이영에서 이름을 눌러 푼 뒤 ② 로 다시 넣어 주세요.
              <b> 이미 풀어 둔 번호는 이 파일이 덮어쓰지 않습니다.</b>
            </div>
          )}

          {preview.nameMismatch.length > 0 && (
            <details>
              <summary className="small">학번은 맞는데 이름이 다른 줄 {preview.nameMismatch.length}개 — 다른 분반 파일인지 확인해 주세요</summary>
              <ul className="small muted">
                {preview.nameMismatch.slice(0, 20).map((r, i) => (
                  <li key={`${r.row.studentNo}-${i}`}>
                    {r.row.studentNo} — 파일 "{r.row.name}" · 명단 "{r.rosterName}"
                  </li>
                ))}
              </ul>
            </details>
          )}

          {preview.unmatched.length > 0 && (
            <details>
              <summary className="small">명단에 없는 학번 {preview.unmatched.length}개 보기</summary>
              <ul className="small muted">
                {preview.unmatched.slice(0, 20).map((r, i) => (
                  <li key={`${r.studentNo}-${i}`}>{r.studentNo} {r.name ?? ''}</li>
                ))}
              </ul>
            </details>
          )}

          {parsed.skipped.length > 0 && (
            <details>
              <summary className="small">못 읽은 줄 {parsed.skipped.length}개 보기</summary>
              <ul className="small muted">
                {parsed.skipped.slice(0, 20).map((s) => <li key={s.line}>{s.line}번째 줄 — {s.reason}</li>)}
              </ul>
            </details>
          )}

          <div className="btn-row" style={{ marginTop: 10 }}>
            <button className="btn-primary btn-sm" disabled={busy || preview.matched.length === 0} onClick={apply}>
              {preview.matched.length}명 반영하기
            </button>
            <button className="btn-sm btn-ghost" onClick={() => { setParsed(null); setFileName(''); }}>취소</button>
          </div>
        </div>
      )}

      {/* ── 표 ──────────────────────────────────────── */}
      <div className="section-title" style={{ marginTop: 28 }}>연락처</div>
      <div className="card tight">
        <label className="small muted" htmlFor="contact-q">이름 · 학번으로 찾기</label>
        <input id="contact-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="김…" />
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>학번</th><th>이름</th><th>전화번호</th><th>보호자</th><th>가입 이메일</th><th>출처</th></tr>
          </thead>
          <tbody>
            {shown.map((s) => {
              const c = byStudent.get(s.id);
              const email = emailOf.get(s.id);
              return (
                <tr key={s.id}>
                  <td className="mono small">{s.student_no}</td>
                  <td>
                    {s.name}
                    {s.grade && <span className="muted small"> · {s.grade}학년</span>}
                  </td>
                  <td>
                    <input
                      key={`${s.id}-${c?.phone ?? ''}`}
                      type="tel"
                      inputMode="tel"
                      defaultValue={c?.phone ?? ''}
                      placeholder={c?.masked ? (c.phone_raw ?? '마스킹됨') : '010-0000-0000'}
                      aria-label={`${s.name} 전화번호`}
                      style={{
                        minWidth: 150,
                        // 번호를 가려 둘 때만 글자를 흐리게 한다. 옆에서 화면을
                        // 들여다보는 상황이 실제로 있다 (강의실 · 교무실).
                        WebkitTextSecurity: reveal || !c?.phone ? 'none' : 'disc',
                      } as React.CSSProperties}
                      onBlur={(e) => {
                        if (e.target.value.trim() !== (c?.phone ?? '')) saveOne(s.id, e.target.value, 'phone');
                      }}
                    />
                  </td>
                  <td>
                    <input
                      key={`${s.id}-g-${c?.guardian_phone ?? ''}`}
                      type="tel"
                      inputMode="tel"
                      defaultValue={c?.guardian_phone ?? ''}
                      placeholder="—"
                      aria-label={`${s.name} 보호자 전화번호`}
                      style={{ minWidth: 140 }}
                      onBlur={(e) => {
                        if (e.target.value.trim() !== (c?.guardian_phone ?? '')) saveOne(s.id, e.target.value, 'guardian_phone');
                      }}
                    />
                  </td>
                  <td className="small">
                    {email ?? <span className="muted">아직 안 들어옴</span>}
                  </td>
                  <td className="small">
                    {c?.masked && !c.phone
                      ? <span className="badge badge-pending">마스킹</span>
                      : c?.source === 'manual'
                        ? <span className="badge badge-kind">직접</span>
                        : c?.phone ? <span className="badge">헤이영</span> : <span className="muted">—</span>}
                  </td>
                </tr>
              );
            })}
            {shown.length === 0 && <tr><td colSpan={6} className="muted center">찾는 학생이 없습니다.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
