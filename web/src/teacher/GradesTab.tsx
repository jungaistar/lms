import { useCallback, useEffect, useState } from 'react';
import { teacherClient } from '../lib/supabase';
import { downloadCsv, downloadXlsx, printTable, type SheetTable } from '../lib/exporters';
import {
  EXAM_KIND_LABEL,
  type Course,
  type Exam,
  type ExamKind,
  type ExamScore,
  type FinalGrade,
  type GradePolicy,
  type Student,
} from '../lib/types';

const DEFAULT_POLICY: Omit<GradePolicy, 'course_id'> = {
  attendance_pct: 20,
  task_pct: 30,
  midterm_pct: 20,
  final_pct: 20,
  peer_pct: 10,
  late_credit: 0.5,
  excused_credit: 1,
  absence_limit: 0.25,
  etc_pct: 0,
  etc_base: 100,
};

/**
 * 성적 구성비 · 시험 점수 · 최종 성적 산출.
 *
 * 계산은 전부 DB 의 compute_final_grades() 가 한다. 화면은 자료를 넣고
 * 결과를 보여 줄 뿐이다 — 여기서 총점을 만들어 저장하는 코드를 넣지 말 것.
 *
 * 구성비 합이 100 이 아니면 DB CHECK 에 걸려 저장 자체가 안 된다.
 * 그래서 저장 전에 미리 합을 보여 준다.
 */
export default function GradesTab({ course }: { course: Course }) {
  const [policy, setPolicy] = useState<Omit<GradePolicy, 'course_id'>>(DEFAULT_POLICY);
  const [students, setStudents] = useState<Student[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [scores, setScores] = useState<ExamScore[]>([]);
  const [grades, setGrades] = useState<FinalGrade[]>([]);
  const [examId, setExamId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [p, s, e, g] = await Promise.all([
      teacherClient.from('grade_policies').select('*').eq('course_id', course.id).maybeSingle(),
      teacherClient.from('students').select('*').eq('course_id', course.id).eq('active', true).order('student_no'),
      teacherClient.from('exams').select('*').eq('course_id', course.id).order('ord'),
      teacherClient.from('final_grades').select('*').eq('course_id', course.id),
    ]);
    if (p.data) {
      const { course_id: _ignored, ...rest } = p.data as GradePolicy;
      setPolicy(rest);
    }
    setStudents((s.data ?? []) as Student[]);
    setExams((e.data ?? []) as Exam[]);
    setGrades((g.data ?? []) as FinalGrade[]);
  }, [course.id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!examId) return setScores([]);
    (async () => {
      const { data } = await teacherClient.from('exam_scores').select('*').eq('exam_id', examId);
      setScores((data ?? []) as ExamScore[]);
    })();
  }, [examId]);

  const pctSum =
    Number(policy.attendance_pct) + Number(policy.task_pct) + Number(policy.midterm_pct) +
    Number(policy.final_pct) + Number(policy.peer_pct) + Number(policy.etc_pct);

  async function savePolicy() {
    if (pctSum !== 100) return setError(`구성비 합이 ${pctSum} 입니다. 100 이어야 저장됩니다.`);
    if (!course.peer_assessment && Number(policy.peer_pct) !== 0) {
      return setError('이 과목은 상호평가를 쓰지 않습니다. 상호평가 비율을 0 으로 두고 그 몫을 다른 항목에 나눠 주세요.');
    }
    setBusy(true);
    setError(null);
    const { error: err } = await teacherClient
      .from('grade_policies')
      .upsert({ course_id: course.id, ...policy, updated_at: new Date().toISOString() }, { onConflict: 'course_id' });
    setBusy(false);
    if (err) setError(err.message);
    else setNotice('구성비를 저장했습니다.');
  }

  async function addExam(kind: ExamKind) {
    const { error: err } = await teacherClient.from('exams').insert({
      course_id: course.id,
      kind,
      title: EXAM_KIND_LABEL[kind],
      max_points: 100,
      ord: exams.length,
    });
    if (err) setError(err.message);
    else await load();
  }

  async function saveScore(studentId: string, raw: string) {
    if (!examId) return;
    const exam = exams.find((e) => e.id === examId);
    const value = raw.trim() === '' ? null : Number(raw);
    if (value !== null && (Number.isNaN(value) || value < 0 || (exam && value > exam.max_points))) {
      return setError(`점수는 0 ~ ${exam?.max_points ?? 100} 사이여야 합니다.`);
    }
    setError(null);
    const { error: err } = await teacherClient
      .from('exam_scores')
      .upsert({ exam_id: examId, student_id: studentId, score: value }, { onConflict: 'exam_id,student_id' });
    if (err) setError(err.message);
    else {
      const { data } = await teacherClient.from('exam_scores').select('*').eq('exam_id', examId);
      setScores((data ?? []) as ExamScore[]);
    }
  }

  async function compute() {
    setBusy(true);
    setError(null);
    const { data, error: err } = await teacherClient.rpc('compute_final_grades', { p_course: course.id });
    setBusy(false);
    if (err) setError(err.message);
    else {
      setNotice(`${data ?? 0}명 계산했습니다. 확정(approved)한 학생은 다시 계산하지 않습니다.`);
      await load();
    }
  }

  async function approveAll() {
    if (!confirm('현재 계산 결과를 확정합니다. 확정한 뒤에는 다시 계산해도 덮어쓰지 않습니다. 계속할까요?')) return;
    setBusy(true);
    const { error: err } = await teacherClient
      .from('final_grades')
      .update({ status: 'approved' })
      .eq('course_id', course.id)
      .eq('status', 'draft');
    setBusy(false);
    if (err) setError(err.message);
    else { setNotice('확정했습니다.'); await load(); }
  }

  const byStudent = new Map(grades.map((g) => [g.student_id, g]));
  const scoreOf = new Map(scores.map((s) => [s.student_id, s.score]));

  const num = (v: number | null | undefined) => (v == null ? '—' : v.toFixed(1));

  /** 화면과 같은 모양의 성적표를 만든다. 내보내기 세 가지가 이걸 함께 쓴다. */
  function buildSheet(): SheetTable {
    const head = ['학번', '이름', '출석', '과제', '중간', '기말', '상호평가', '기타', '감점합', '총점', '등급', '결석률', '상태'];
    const rows = students.map((s) => {
      const g = byStudent.get(s.id);
      return [
        s.student_no, s.name,
        g?.attendance_pts ?? null, g?.task_pts ?? null, g?.midterm_pts ?? null,
        g?.final_pts ?? null, g?.peer_pts ?? null, g?.etc_pts ?? null,
        g?.deduction_total ?? null, g?.total ?? null, g?.letter ?? '',
        g?.absence_rate == null ? '' : `${(g.absence_rate * 100).toFixed(0)}%`,
        g?.status === 'approved' ? '확정' : '초안',
      ];
    });
    return { name: '성적표', rows: [head, ...rows] };
  }

  const fileBase = `${course.title}${course.class_no ? `_${course.class_no}` : ''}_성적표`;

  return (
    <>
      {error && <div className="alert alert-error">{error}</div>}
      {notice && <div className="alert alert-ok">{notice}</div>}

      {/* ── 구성비 ──────────────────────────────────── */}
      <div className="section-title">성적 구성비</div>
      <div className="card">
        {!course.peer_assessment && (
          <div className="alert alert-info">
            이 과목은 <b>상호평가를 쓰지 않습니다.</b> 상호평가 비율을 0 으로 두고 그 몫을 다른 항목에 나눠 주세요.
          </div>
        )}
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          {([
            ['attendance_pct', '출석'],
            ['task_pct', '과제'],
            ['midterm_pct', '중간'],
            ['final_pct', '기말'],
            ['peer_pct', '상호평가'],
            ['etc_pct', '기타(감점)'],
          ] as const).map(([key, label]) => (
            <label key={key} className="small muted" style={{ flex: '1 1 90px' }}>
              {label} %
              <input
                type="number"
                min={0}
                max={100}
                value={policy[key]}
                onChange={(e) => setPolicy({ ...policy, [key]: Number(e.target.value) })}
              />
            </label>
          ))}
        </div>

        <p className={pctSum === 100 ? 'small muted' : 'small'} style={{ marginTop: 8, color: pctSum === 100 ? undefined : 'var(--danger, #c0392b)' }}>
          합계 <b>{pctSum}</b> {pctSum === 100 ? '— 저장할 수 있습니다.' : '— 100 이어야 저장됩니다.'}
        </p>

        <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
          <label className="small muted" style={{ flex: '1 1 120px' }}>
            지각 인정 비율
            <input type="number" step="0.1" min={0} max={1} value={policy.late_credit}
              onChange={(e) => setPolicy({ ...policy, late_credit: Number(e.target.value) })} />
          </label>
          <label className="small muted" style={{ flex: '1 1 120px' }}>
            인정결석 비율
            <input type="number" step="0.1" min={0} max={1} value={policy.excused_credit}
              onChange={(e) => setPolicy({ ...policy, excused_credit: Number(e.target.value) })} />
          </label>
          <label className="small muted" style={{ flex: '1 1 120px' }}>
            결석 한도 (넘으면 F)
            <input type="number" step="0.05" min={0} max={1} value={policy.absence_limit}
              onChange={(e) => setPolicy({ ...policy, absence_limit: Number(e.target.value) })} />
          </label>
        </div>

        <button className="btn-primary btn-sm" style={{ marginTop: 12 }} disabled={busy} onClick={savePolicy}>
          구성비 저장
        </button>
      </div>

      {/* ── 시험 ────────────────────────────────────── */}
      <div className="section-title" style={{ marginTop: 28 }}>중간 · 기말</div>
      <div className="card tight">
        <div className="row" style={{ gap: 8, alignItems: 'center' }}>
          <select style={{ flex: 1 }} value={examId} onChange={(e) => setExamId(e.target.value)} aria-label="시험 선택">
            <option value="">— 점수를 넣을 시험 —</option>
            {exams.map((e) => <option key={e.id} value={e.id}>{e.title} (만점 {e.max_points})</option>)}
          </select>
          {!exams.some((e) => e.kind === 'midterm') && (
            <button className="btn-sm btn-ghost" style={{ flex: '0 0 auto' }} onClick={() => addExam('midterm')}>+ 중간고사</button>
          )}
          {!exams.some((e) => e.kind === 'final') && (
            <button className="btn-sm btn-ghost" style={{ flex: '0 0 auto' }} onClick={() => addExam('final')}>+ 기말고사</button>
          )}
        </div>
      </div>

      {examId && (
        <div className="table-wrap">
          <table>
            <thead><tr><th>학번</th><th>이름</th><th style={{ width: 120 }}>점수</th></tr></thead>
            <tbody>
              {students.map((s) => (
                <tr key={s.id}>
                  <td className="mono">{s.student_no}</td>
                  <td>{s.name}</td>
                  <td>
                    <input
                      type="number"
                      min={0}
                      defaultValue={scoreOf.get(s.id) ?? ''}
                      onBlur={(e) => saveScore(s.id, e.target.value)}
                      aria-label={`${s.name} 점수`}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── 최종 성적 ───────────────────────────────── */}
      <div className="section-title" style={{ marginTop: 28 }}>최종 성적</div>
      <div className="card tight">
        <div className="row" style={{ alignItems: 'center', gap: 8 }}>
          <div style={{ flex: 1 }} className="small muted">
            계산됨 {grades.length}명 · 확정 {grades.filter((g) => g.status === 'approved').length}명
            {grades.some((g) => g.over_absence) && (
              <> · <b>결석 초과 {grades.filter((g) => g.over_absence).length}명</b></>
            )}
          </div>
          <button className="btn-primary btn-sm" style={{ flex: '0 0 auto' }} disabled={busy} onClick={compute}>
            성적 산출
          </button>
          {grades.some((g) => g.status === 'draft') && (
            <button className="btn-sm btn-navy" style={{ flex: '0 0 auto' }} disabled={busy} onClick={approveAll}>
              확정
            </button>
          )}
        </div>

        <div className="btn-row" style={{ marginTop: 10 }}>
          <button className="btn-sm btn-ghost" onClick={() => downloadCsv(buildSheet().rows, fileBase)}>CSV</button>
          <button className="btn-sm btn-ghost" onClick={() => downloadXlsx([buildSheet()], fileBase)}>XLSX</button>
          <button
            className="btn-sm btn-ghost"
            onClick={() => { if (!printTable(fileBase, [buildSheet()])) setError('팝업이 막혀 있습니다. 주소창 오른쪽에서 팝업을 허용해 주세요.'); }}
          >
            PDF(인쇄)
          </button>
        </div>
        <p className="muted small" style={{ marginTop: 8 }}>
          자료가 아직 없는 항목은 만점으로 칩니다 — 학기 중간에 눌러도 0점이 되지 않게 하려는 것입니다.
          학기 말에는 출결·과제·시험이 모두 들어온 뒤 다시 눌러 주세요.
        </p>
      </div>

      {grades.length === 0 ? (
        <div className="empty">아직 계산한 성적이 없습니다.</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>학번</th><th>이름</th>
                <th>출석</th><th>과제</th><th>중간</th><th>기말</th><th>상호</th><th>기타</th>
                <th>총점</th><th>등급</th><th>결석률</th><th>상태</th>
              </tr>
            </thead>
            <tbody>
              {students.map((s) => {
                const g = byStudent.get(s.id);
                return (
                  <tr key={s.id}>
                    <td className="mono">{s.student_no}</td>
                    <td>{s.name}</td>
                    <td>{num(g?.attendance_pts)}</td>
                    <td>{num(g?.task_pts)}</td>
                    <td>{num(g?.midterm_pts)}</td>
                    <td>{num(g?.final_pts)}</td>
                    <td>{num(g?.peer_pts)}</td>
                    <td>{num(g?.etc_pts)}</td>
                    <td><b>{num(g?.total)}</b></td>
                    <td>
                      <span className={g?.letter === 'F' ? 'badge badge-draft' : 'badge badge-approved'}>
                        {g?.letter ?? '—'}
                      </span>
                    </td>
                    <td className="muted small">
                      {g?.absence_rate == null ? '—' : `${(g.absence_rate * 100).toFixed(0)}%`}
                      {g?.over_absence && <b> 초과</b>}
                    </td>
                    <td className="muted small">{g?.status === 'approved' ? '확정' : '초안'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
