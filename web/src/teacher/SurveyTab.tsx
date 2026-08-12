import { useCallback, useEffect, useState } from 'react';
import { teacherClient } from '../lib/supabase';
import { downloadCsv, downloadXlsx, type SheetTable } from '../lib/exporters';
import {
  QUESTION_KIND_LABEL,
  SURVEY_STATUS_LABEL,
  type CourseWeek,
  type QuestionKind,
  type Student,
  type Survey,
  type SurveyQuestion,
  type SurveyStatus,
  type SurveySummaryRow,
} from '../lib/types';

/**
 * 설문 등록 · 결과조회. 학교 LMS 강의실 메뉴의 같은 이름 자리다.
 *
 * 기본은 익명이다. 익명일 때 교수는 **누가 냈는지**만 보고 **무엇을 썼는지**는
 * 합계로만 본다. 화면에서 가리는 게 아니라 `survey_answers` 에 교수용 RLS 정책이
 * 아예 없어서 못 읽는다. 집계 함수(security definer)만 통과한다.
 *
 * 서술형 원문은 집계 함수가 순서를 섞어서 돌려준다 — 제출 순서로 사람을 짚지
 * 못하게 하려는 것이다.
 */
export default function SurveyTab({ courseId, courseTitle }: { courseId: string; courseTitle: string }) {
  const [weeks, setWeeks] = useState<CourseWeek[]>([]);
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<SurveyQuestion[]>([]);
  const [summary, setSummary] = useState<SurveySummaryRow[]>([]);
  const [respondents, setRespondents] = useState<Set<string>>(new Set());
  const [showNew, setShowNew] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [form, setForm] = useState({ title: '', intro: '', week_id: '', anonymous: true, closes_at: '' });

  const load = useCallback(async () => {
    const [w, s, st] = await Promise.all([
      teacherClient.from('course_weeks').select('*').eq('course_id', courseId).order('week_no'),
      teacherClient.from('surveys').select('*').eq('course_id', courseId).order('created_at', { ascending: false }),
      teacherClient.from('students').select('*').eq('course_id', courseId).eq('active', true).order('student_no'),
    ]);
    if (s.error) setError(s.error.message);
    setWeeks((w.data ?? []) as CourseWeek[]);
    setSurveys((s.data ?? []) as Survey[]);
    setStudents((st.data ?? []) as Student[]);
  }, [courseId]);

  useEffect(() => { load(); }, [load]);

  const openSurvey = useCallback(async (id: string) => {
    setOpenId(id);
    const [q, sum, r] = await Promise.all([
      teacherClient.from('survey_questions').select('*').eq('survey_id', id).order('ord'),
      teacherClient.rpc('survey_summary', { p_survey: id }),
      teacherClient.from('survey_responses').select('student_id').eq('survey_id', id),
    ]);
    setQuestions((q.data ?? []) as SurveyQuestion[]);
    setSummary((sum.data ?? []) as SurveySummaryRow[]);
    setRespondents(new Set(((r.data ?? []) as Array<{ student_id: string }>).map((x) => x.student_id)));
  }, []);

  async function createSurvey() {
    if (!form.title.trim()) return setError('설문 제목을 적어 주세요.');
    setBusy(true);
    setError(null);
    try {
      const { data, error: err } = await teacherClient
        .from('surveys')
        .insert({
          course_id: courseId,
          week_id: form.week_id || null,
          title: form.title.trim(),
          intro: form.intro.trim() || null,
          anonymous: form.anonymous,
          closes_at: form.closes_at ? new Date(form.closes_at).toISOString() : null,
        })
        .select()
        .single();
      if (err) throw err;
      setForm({ title: '', intro: '', week_id: '', anonymous: true, closes_at: '' });
      setShowNew(false);
      setNotice('설문을 만들었습니다. 준비중이라 아직 학생에게 보이지 않습니다.');
      await load();
      await openSurvey((data as Survey).id);
    } catch (e) {
      setError(e instanceof Error ? e.message : '만들지 못했습니다.');
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(s: Survey, status: SurveyStatus) {
    if (status !== 'draft' && questions.length === 0 && openId === s.id) {
      return setError('문항이 하나도 없습니다. 먼저 문항을 넣어 주세요.');
    }
    const { error: err } = await teacherClient.from('surveys').update({ status }).eq('id', s.id);
    if (err) setError(err.message);
    else await load();
  }

  async function removeSurvey(s: Survey) {
    if (!confirm(`"${s.title}" 설문을 지우면 응답도 함께 사라집니다. 계속할까요?`)) return;
    const { error: err } = await teacherClient.from('surveys').delete().eq('id', s.id);
    if (err) setError(err.message);
    else { if (openId === s.id) setOpenId(null); await load(); }
  }

  async function addQuestion(kind: QuestionKind) {
    if (!openId) return;
    const label = prompt(kind === 'text' ? '서술형 문항' : '문항 내용');
    if (!label?.trim()) return;

    let choices: string[] | null = null;
    if (kind === 'choice') {
      const raw = prompt('보기를 쉼표로 나눠 적으세요 (예: 매우 그렇다, 그렇다, 보통, 아니다)');
      if (!raw?.trim()) return;
      choices = raw.split(',').map((c) => c.trim()).filter(Boolean);
      if (choices.length < 2) return setError('보기는 두 개 이상이어야 합니다.');
    }

    const { error: err } = await teacherClient.from('survey_questions').insert({
      survey_id: openId,
      ord: questions.length,
      label: label.trim(),
      kind,
      choices,
    });
    if (err) setError(err.message);
    else await openSurvey(openId);
  }

  async function removeQuestion(id: string) {
    if (!openId) return;
    if (!confirm('이 문항을 지울까요? 이미 들어온 답도 함께 사라집니다.')) return;
    const { error: err } = await teacherClient.from('survey_questions').delete().eq('id', id);
    if (err) setError(err.message);
    else await openSurvey(openId);
  }

  const open = surveys.find((s) => s.id === openId) ?? null;
  const notYet = students.filter((s) => !respondents.has(s.id));

  function buildSheet(): SheetTable {
    const rows: Array<Array<string | number | null>> = [['문항', '종류', '응답 수', '평균', '분포']];
    summary.forEach((r) =>
      rows.push([
        r.label,
        QUESTION_KIND_LABEL[r.kind],
        r.answers,
        r.avg_num ?? '',
        Object.entries(r.breakdown ?? {}).map(([k, v]) => `${k}:${v}`).join(' / '),
      ]),
    );
    summary
      .filter((r) => r.kind === 'text')
      .forEach((r) => (r.texts ?? []).forEach((t) => rows.push([r.label, '서술', '', '', t])));
    return { name: '설문 결과', rows };
  }

  return (
    <>
      {error && <div className="alert alert-error">{error}</div>}
      {notice && <div className="alert alert-ok">{notice}</div>}

      <div className="card tight">
        <div className="row" style={{ alignItems: 'center' }}>
          <div style={{ flex: 1 }}>
            <b>설문 {surveys.length}개</b>{' '}
            <span className="muted small">· 진행중 {surveys.filter((s) => s.status === 'open').length}개</span>
          </div>
          <button className="btn-primary btn-sm" style={{ flex: '0 0 auto' }} onClick={() => setShowNew(!showNew)}>
            {showNew ? '닫기' : '설문 등록'}
          </button>
        </div>
      </div>

      {showNew && (
        <div className="card">
          <div className="row" style={{ gap: 8 }}>
            <input
              style={{ flex: 1, minWidth: 0 }}
              placeholder="설문 제목 (예: 중간 강의 만족도)"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              aria-label="설문 제목"
            />
            <select
              style={{ flex: '0 0 auto' }}
              value={form.week_id}
              onChange={(e) => setForm({ ...form, week_id: e.target.value })}
              aria-label="설문 주차"
            >
              <option value="">주차 지정 안 함</option>
              {weeks.map((w) => <option key={w.id} value={w.id}>{w.week_no}주차</option>)}
            </select>
          </div>

          <textarea
            rows={2}
            placeholder="안내문 (선택)"
            value={form.intro}
            onChange={(e) => setForm({ ...form, intro: e.target.value })}
            aria-label="설문 안내"
            style={{ marginTop: 8 }}
          />

          <div className="row" style={{ gap: 8, marginTop: 8, alignItems: 'center' }}>
            <label className="small muted" style={{ flex: 1 }}>
              마감
              <input
                type="datetime-local"
                value={form.closes_at}
                onChange={(e) => setForm({ ...form, closes_at: e.target.value })}
              />
            </label>
            <label className="small" style={{ flex: 1, display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={form.anonymous}
                onChange={(e) => setForm({ ...form, anonymous: e.target.checked })}
                style={{ width: 'auto' }}
              />
              익명 (권장) — 답 내용은 합계로만 봅니다
            </label>
          </div>

          <button className="btn-primary btn-sm" style={{ marginTop: 12 }} disabled={busy} onClick={createSurvey}>
            만들기
          </button>
        </div>
      )}

      {surveys.length === 0 ? (
        <div className="empty">등록한 설문이 없습니다.</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>주차</th><th>제목</th><th>익명</th><th>마감</th><th>상태</th><th /></tr>
            </thead>
            <tbody>
              {surveys.map((s) => (
                <tr key={s.id}>
                  <td className="muted small">{weeks.find((w) => w.id === s.week_id)?.week_no ? `${weeks.find((w) => w.id === s.week_id)!.week_no}주` : '—'}</td>
                  <td>{s.title}</td>
                  <td className="small">{s.anonymous ? '익명' : '기명'}</td>
                  <td className="muted small">{s.closes_at ? new Date(s.closes_at).toLocaleString('ko-KR') : '—'}</td>
                  <td>
                    <select value={s.status} onChange={(e) => setStatus(s, e.target.value as SurveyStatus)} aria-label={`${s.title} 상태`}>
                      {(Object.keys(SURVEY_STATUS_LABEL) as SurveyStatus[]).map((k) => (
                        <option key={k} value={k}>{SURVEY_STATUS_LABEL[k]}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <div className="btn-row">
                      <button className="btn-sm btn-navy" onClick={() => openSurvey(s.id)}>문항 · 결과</button>
                      <button className="btn-sm btn-danger" onClick={() => removeSurvey(s)}>삭제</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {open && (
        <>
          <div className="section-title" style={{ marginTop: 28 }}>
            {open.title} <span className="muted small">· {SURVEY_STATUS_LABEL[open.status]} · {open.anonymous ? '익명' : '기명'}</span>
          </div>

          <div className="card tight">
            <div className="row" style={{ alignItems: 'center' }}>
              <div style={{ flex: 1 }} className="small">
                응답 <b>{respondents.size}</b> / {students.length}명
                {notYet.length > 0 && <span className="muted"> · 미응답 {notYet.length}명</span>}
              </div>
              <button className="btn-sm btn-ghost" style={{ flex: '0 0 auto' }} onClick={() => addQuestion('scale')}>+ 점수 문항</button>
              <button className="btn-sm btn-ghost" style={{ flex: '0 0 auto' }} onClick={() => addQuestion('choice')}>+ 보기 문항</button>
              <button className="btn-sm btn-ghost" style={{ flex: '0 0 auto' }} onClick={() => addQuestion('text')}>+ 서술 문항</button>
              <button className="btn-sm btn-ghost" style={{ flex: '0 0 auto' }} onClick={() => downloadCsv(buildSheet().rows, `${courseTitle}_${open.title}`)}>CSV</button>
              <button className="btn-sm btn-ghost" style={{ flex: '0 0 auto' }} onClick={() => downloadXlsx([buildSheet()], `${courseTitle}_${open.title}`)}>XLSX</button>
              <button className="btn-sm btn-ghost" style={{ flex: '0 0 auto' }} onClick={() => setOpenId(null)}>닫기</button>
            </div>
          </div>

          {questions.length === 0 ? (
            <div className="empty">문항이 없습니다. 위에서 문항을 넣어 주세요.</div>
          ) : (
            questions.map((q) => {
              const r = summary.find((x) => x.question_id === q.id);
              return (
                <div className="card" key={q.id}>
                  <div className="row" style={{ alignItems: 'baseline', gap: 8 }}>
                    <h3 style={{ margin: 0, flex: 1 }}>
                      {q.ord + 1}. {q.label}
                    </h3>
                    <span className="badge badge-kind" style={{ flex: '0 0 auto' }}>{QUESTION_KIND_LABEL[q.kind]}</span>
                    <button className="btn-sm btn-danger" style={{ flex: '0 0 auto' }} onClick={() => removeQuestion(q.id)}>삭제</button>
                  </div>

                  {q.kind === 'choice' && q.choices && (
                    <p className="small muted" style={{ marginTop: 6 }}>보기 — {q.choices.join(' · ')}</p>
                  )}

                  {!r || r.answers === 0 ? (
                    <p className="small muted" style={{ margin: '10px 0 0' }}>아직 답이 없습니다.</p>
                  ) : q.kind === 'text' ? (
                    <ul className="list" style={{ marginTop: 10 }}>
                      {(r.texts ?? []).map((t, i) => (
                        <li key={i}><div className="grow"><div className="small">{t}</div></div></li>
                      ))}
                    </ul>
                  ) : (
                    <>
                      <p className="small" style={{ margin: '10px 0 6px' }}>
                        응답 <b>{r.answers}</b>건
                        {q.kind === 'scale' && r.avg_num !== null && <> · 평균 <b>{r.avg_num}</b> / {q.scale_max}</>}
                      </p>
                      {Object.entries(r.breakdown ?? {})
                        .sort((a, b) => a[0].localeCompare(b[0], 'ko', { numeric: true }))
                        .map(([k, n]) => (
                          <div key={k} style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 6 }}>
                            <span className="small" style={{ width: 110, flex: '0 0 auto' }}>{k}</span>
                            <span className="progress" style={{ flex: 1 }}>
                              <i style={{ width: `${Math.round((n / r.answers) * 100)}%` }} />
                            </span>
                            <span className="small mono" style={{ flex: '0 0 auto' }}>{n}</span>
                          </div>
                        ))}
                    </>
                  )}
                </div>
              );
            })
          )}

          {notYet.length > 0 && (
            <details>
              <summary className="small">미응답 {notYet.length}명 보기</summary>
              <p className="small muted" style={{ marginTop: 6 }}>
                {notYet.map((s) => `${s.name}(${s.student_no})`).join(', ')}
              </p>
            </details>
          )}
        </>
      )}
    </>
  );
}
