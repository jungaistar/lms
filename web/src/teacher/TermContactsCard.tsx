import { useCallback, useMemo, useState } from 'react';
import { teacherClient } from '../lib/supabase';
import { downloadCsv, downloadXlsx, safeSheetName, type SheetTable } from '../lib/exporters';
import { errText } from '../lib/errors';
import type { AccessRow, Course, Student, StudentContact } from '../lib/types';

/**
 * 학기 연락처 — 한 학기 과목을 통째로 모아 본다.
 *
 * 왜 대시보드에 있나
 *   연락처 관리(ContactsTab)는 **과목 하나**를 다룬다. 학기말에 "이번 학기
 *   전체 수강생에게 문자를 돌리자" 가 되면 과목마다 들어가 내려받고 손으로
 *   합쳐야 했다. 과목이 여섯이면 여섯 번이다. 여기서 한 번에 끝낸다.
 *
 * 파일 모양
 *   XLSX 는 **과목마다 시트 하나** + 맨 앞에 요약 시트를 둔다. 헤이영 문자발송
 *   화면은 과목 단위로 붙여 넣게 되어 있어서, 한 장에 다 밀어넣는 것보다
 *   시트가 갈라져 있는 편이 그대로 쓰인다.
 *   CSV 는 반대로 **한 장에 전부** 담고 과목 열을 붙인다 — 주소록에 넣거나
 *   피벗으로 셀 때 쓴다.
 *
 * 화면에는 번호를 바로 펼치지 않는다. 대시보드는 강의실 화면에 띄워 둔 채
 * 자리를 뜨는 일이 잦아서, 기본은 가린 상태고 눌러야 보인다.
 */

/** 202620 → "2026학년도 2학기". 모르는 형식이면 그대로 돌려준다. */
export function termLabel(term: string): string {
  const m = /^(\d{4})(\d{2})$/.exec(term.trim());
  if (!m) return term;
  const year = m[1];
  const code = m[2];
  const semester = code === '10' ? '1학기' : code === '20' ? '2학기' : code;
  return `${year}학년도 ${semester}`;
}

/** 010-1234-5678 → 010-****-5678. 모양이 다르면 뒤 4자리만 남긴다. */
function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return '****';
  const parts = phone.split('-');
  if (parts.length === 3) return `${parts[0]}-****-${parts[2]}`;
  return `****${digits.slice(-4)}`;
}

interface CourseBlock {
  course: Course;
  students: Student[];
  /** student_id → 연락처 */
  contacts: Map<string, StudentContact>;
  /** student_id → 가입 이메일 */
  emails: Map<string, string>;
}

const HEAD = ['학번', '이름', '학년', '학과', '전화번호', '보호자', '가입 이메일'];

/**
 * student_access 표에는 course_id 가 있는데 AccessRow 타입에는 없다.
 * 그 타입은 과목 하나를 이미 고른 화면(AccessTab)에 맞춰 만든 것이라
 * 과목 열이 필요 없었다. 여기서는 여러 과목을 한 번에 긁어 놓고
 * 과목별로 갈라야 해서 열이 필요하다.
 */
type AccessRowWithCourse = AccessRow & { course_id: string };

export default function TermContactsCard({ courses }: { courses: Course[] }) {
  // 학기 목록은 최신부터. courses 는 term 내림차순으로 들어온다.
  const terms = useMemo(() => [...new Set(courses.map((c) => c.term))], [courses]);
  const [term, setTerm] = useState(terms[0] ?? '');
  const [blocks, setBlocks] = useState<CourseBlock[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reveal, setReveal] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  const termCourses = useMemo(() => courses.filter((c) => c.term === term), [courses, term]);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    setBlocks(null);
    setOpen(null);
    setReveal(false);

    const ids = termCourses.map((c) => c.id);
    if (ids.length === 0) { setBusy(false); return; }

    // 과목마다 부르지 않고 한 번에 긁는다 — 과목이 여섯이면 요청도 여섯 배가 된다.
    const [s, c, a] = await Promise.all([
      teacherClient.from('students').select('*').in('course_id', ids).eq('active', true).order('student_no'),
      teacherClient.from('student_contacts').select('*').in('course_id', ids),
      teacherClient.from('student_access').select('*').in('course_id', ids),
    ]);

    const firstError = s.error ?? c.error ?? a.error;
    if (firstError) {
      setError(errText(firstError, '연락처를 불러오지 못했습니다.'));
      setBusy(false);
      return;
    }

    const allStudents = (s.data ?? []) as Student[];
    const allContacts = (c.data ?? []) as StudentContact[];
    const allAccess = (a.data ?? []) as AccessRowWithCourse[];

    setBlocks(
      termCourses.map((course) => ({
        course,
        students: allStudents.filter((x) => x.course_id === course.id),
        contacts: new Map(
          allContacts.filter((x) => x.course_id === course.id).map((x) => [x.student_id, x]),
        ),
        emails: new Map(
          allAccess
            .filter((x) => x.course_id === course.id && x.email)
            .map((x) => [x.student_id, x.email as string]),
        ),
      })),
    );
    setBusy(false);
  }, [termCourses]);

  // ── 세기 ───────────────────────────────────────────────────
  const stat = (b: CourseBlock) => {
    const withPhone = b.students.filter((s) => b.contacts.get(s.id)?.phone).length;
    const masked = b.students.filter((s) => {
      const c = b.contacts.get(s.id);
      return Boolean(c?.masked) && !c?.phone;
    }).length;
    return {
      total: b.students.length,
      withPhone,
      masked,
      none: b.students.length - withPhone - masked,
      emails: b.students.filter((s) => b.emails.get(s.id)).length,
    };
  };

  const totals = useMemo(() => {
    if (!blocks) return null;
    return blocks.reduce(
      (acc, b) => {
        const t = stat(b);
        return {
          total: acc.total + t.total,
          withPhone: acc.withPhone + t.withPhone,
          masked: acc.masked + t.masked,
          none: acc.none + t.none,
          emails: acc.emails + t.emails,
        };
      },
      { total: 0, withPhone: 0, masked: 0, none: 0, emails: 0 },
    );
  }, [blocks]);

  // ── 내보내기 ───────────────────────────────────────────────
  const rowsOf = (b: CourseBlock, onlyWithPhone: boolean) =>
    b.students
      .filter((s) => !onlyWithPhone || b.contacts.get(s.id)?.phone)
      .map((s) => {
        const c = b.contacts.get(s.id);
        return [
          s.student_no, s.name, s.grade ?? '', s.dept ?? '',
          c?.phone ?? '', c?.guardian_phone ?? '', b.emails.get(s.id) ?? '',
        ];
      });

  const courseLabel = (c: Course) => `${c.title}${c.class_no ? ` ${c.class_no}분반` : ''}`;

  function sheets(): SheetTable[] {
    if (!blocks) return [];

    const summary: SheetTable = {
      name: '요약',
      rows: [
        ['과목', '분반', '명단', '번호 있음', '마스킹된 채', '번호 없음', '가입 이메일'],
        ...blocks.map((b) => {
          const t = stat(b);
          return [b.course.title, b.course.class_no ?? '', t.total, t.withPhone, t.masked, t.none, t.emails];
        }),
        ...(totals
          ? [['합계', '', totals.total, totals.withPhone, totals.masked, totals.none, totals.emails]]
          : []),
      ],
    };

    // 시트 이름은 31자에서 잘린다. 잘린 뒤 겹치면 엑셀이 파일을 못 연다.
    const used = new Set<string>([summary.name]);
    const unique = (name: string) => {
      let out = safeSheetName(name);
      let n = 2;
      while (used.has(out)) {
        const tail = ` (${n})`;
        out = safeSheetName(name).slice(0, 31 - tail.length) + tail;
        n += 1;
      }
      used.add(out);
      return out;
    };

    return [
      summary,
      ...blocks.map((b) => ({
        name: unique(courseLabel(b.course)),
        rows: [HEAD, ...rowsOf(b, false)],
      })),
    ];
  }

  /** CSV 는 한 장에 전부. 어느 과목 줄인지 알아야 하니 과목 열을 앞에 붙인다. */
  function flatRows(onlyWithPhone: boolean) {
    if (!blocks) return [];
    return [
      ['과목', '분반', ...HEAD],
      ...blocks.flatMap((b) =>
        rowsOf(b, onlyWithPhone).map((r) => [b.course.title, b.course.class_no ?? '', ...r]),
      ),
    ];
  }

  const fileBase = `${termLabel(term)} 수강생 연락처`;

  if (terms.length === 0) return null;

  return (
    <>
      <div className="section-title" style={{ marginTop: 28 }}>학기 연락처</div>

      <div className="card tight">
        <p className="small muted" style={{ marginTop: 0 }}>
          한 학기 과목을 <b>한 번에</b> 모아 내려받습니다. XLSX 는 과목마다 시트가 갈라지고,
          CSV 는 한 장에 전부 담고 과목 열이 붙습니다.
          과목 하나만 손보려면 과목을 열어 <b>연락처 관리</b> 로 가세요.
        </p>

        <div className="row">
          <label className="field">
            <span>학기</span>
            <select value={term} onChange={(e) => { setTerm(e.target.value); setBlocks(null); }}>
              {terms.map((t) => (
                <option key={t} value={t}>{termLabel(t)} ({t})</option>
              ))}
            </select>
            <small>과목 {termCourses.length}개</small>
          </label>
        </div>

        <div className="btn-row" style={{ marginTop: 10 }}>
          <button className="btn-sm btn-navy" onClick={load} disabled={busy || termCourses.length === 0}>
            {busy ? '불러오는 중…' : blocks ? '다시 불러오기' : '연락처 불러오기'}
          </button>
          {blocks && (
            <>
              <button className="btn-sm btn-ghost" onClick={() => downloadXlsx(sheets(), fileBase)}>
                과목별 XLSX
              </button>
              <button className="btn-sm btn-ghost" onClick={() => downloadCsv(flatRows(true), `${fileBase} (번호 있는 사람만)`)}>
                번호 있는 사람만 CSV
              </button>
              <button className="btn-sm btn-ghost" onClick={() => setReveal((v) => !v)} aria-pressed={reveal}>
                {reveal ? '번호 가리기' : '번호 보기'}
              </button>
            </>
          )}
        </div>

        {error && <div className="alert alert-error" style={{ marginTop: 10 }}>{error}</div>}

        {blocks && totals && (
          <div className="alert alert-warn" style={{ marginTop: 12 }}>
            <b>개인정보입니다. 교수만 봅니다.</b>
            <p className="small" style={{ margin: '6px 0 0' }}>
              내려받은 파일에는 이 화면의 보호가 따라가지 않습니다. 쓰고 나면 <b>지워 주세요.</b>
            </p>
          </div>
        )}
      </div>

      {blocks && totals && (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>과목</th><th>분반</th><th>명단</th><th>번호 있음</th>
                  <th>마스킹된 채</th><th>번호 없음</th><th>가입 이메일</th><th></th>
                </tr>
              </thead>
              <tbody>
                {blocks.map((b) => {
                  const t = stat(b);
                  return (
                    <tr key={b.course.id}>
                      <td>{b.course.title}</td>
                      <td className="small">{b.course.class_no ?? ''}</td>
                      <td>{t.total}</td>
                      <td><b>{t.withPhone}</b></td>
                      <td>{t.masked > 0 ? <b>{t.masked}</b> : 0}</td>
                      <td>{t.none}</td>
                      <td>{t.emails}</td>
                      <td>
                        <button
                          className="btn-sm btn-ghost"
                          onClick={() => setOpen((v) => (v === b.course.id ? null : b.course.id))}
                          aria-expanded={open === b.course.id}
                        >
                          {open === b.course.id ? '접기' : '명단'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
                <tr>
                  <td><b>합계</b></td>
                  <td></td>
                  <td><b>{totals.total}</b></td>
                  <td><b>{totals.withPhone}</b></td>
                  <td><b>{totals.masked}</b></td>
                  <td><b>{totals.none}</b></td>
                  <td><b>{totals.emails}</b></td>
                  <td></td>
                </tr>
              </tbody>
            </table>
          </div>

          {totals.masked > 0 && (
            <p className="small muted">
              마스킹된 채 <b>{totals.masked}</b>명은 헤이영에서 이름을 눌러 푼 뒤
              과목 → <b>연락처 관리</b> 에 넣어야 번호가 채워집니다.
            </p>
          )}

          {blocks
            .filter((b) => open === b.course.id)
            .map((b) => (
              <div key={b.course.id}>
                <div className="section-title" style={{ marginTop: 20 }}>{courseLabel(b.course)}</div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr><th>학번</th><th>이름</th><th>학과</th><th>전화번호</th><th>보호자</th><th>가입 이메일</th></tr>
                    </thead>
                    <tbody>
                      {b.students.map((s) => {
                        const c = b.contacts.get(s.id);
                        return (
                          <tr key={s.id}>
                            <td className="mono small">{s.student_no}</td>
                            <td>{s.name}</td>
                            <td className="small">{s.dept ?? ''}</td>
                            <td className="mono small">
                              {c?.phone
                                ? (reveal ? c.phone : maskPhone(c.phone))
                                : c?.masked
                                  ? <span className="muted">마스킹된 채</span>
                                  : <span className="muted">—</span>}
                            </td>
                            <td className="mono small">
                              {c?.guardian_phone ? (reveal ? c.guardian_phone : maskPhone(c.guardian_phone)) : ''}
                            </td>
                            <td className="small">{b.emails.get(s.id) ?? ''}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
        </>
      )}
    </>
  );
}
