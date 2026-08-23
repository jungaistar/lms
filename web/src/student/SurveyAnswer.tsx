import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { studentDb } from '../lib/session';
import { type Survey, type SurveyQuestion } from '../lib/types';
import PageHero from '../components/PageHero';
import { errText } from '../lib/errors';

/**
 * 설문 참여.
 *
 * 휴대폰으로 수업 중에 넣는다는 전제다 —
 * 척도 문항은 숫자 입력이 아니라 버튼으로 고르고, 제출은 화면 아래 고정한다.
 *
 * 한 번 내면 고칠 수 없다. 익명 설문에서 수정을 열어 두면 "누가 뭘 고쳤나" 를
 * 되짚을 수 있어야 하고, 그 순간 익명이 아니게 된다.
 */
export default function SurveyAnswer() {
  const { surveyId } = useParams<{ surveyId: string }>();
  const nav = useNavigate();
  const [survey, setSurvey] = useState<Survey | null>(null);
  const [questions, setQuestions] = useState<SurveyQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const db = studentDb();
        const [s, q, r] = await Promise.all([
          db.from('surveys').select('*').eq('id', surveyId!).single(),
          db.from('survey_questions').select('*').eq('survey_id', surveyId!).order('ord'),
          db.from('survey_responses').select('id').eq('survey_id', surveyId!).maybeSingle(),
        ]);
        if (s.error) throw s.error;
        setSurvey(s.data as Survey);
        setQuestions((q.data ?? []) as SurveyQuestion[]);
        setDone(!!r.data);
      } catch (e) {
        setError(errText(e, '불러오지 못했습니다.'));
      } finally {
        setLoading(false);
      }
    })();
  }, [surveyId]);

  async function submit() {
    if (!survey) return;
    const missing = questions.filter((q) => q.required && !answers[q.id]?.trim());
    if (missing.length > 0) return setError(`아직 답하지 않은 문항이 ${missing.length}개 있습니다.`);

    setBusy(true);
    setError(null);
    try {
      const db = studentDb();
      const { data: resp, error: rErr } = await db
        .from('survey_responses')
        .insert({ survey_id: survey.id })
        .select()
        .single();
      if (rErr) throw rErr;

      const rows = questions
        .filter((q) => answers[q.id]?.trim())
        .map((q) => ({
          response_id: (resp as { id: string }).id,
          question_id: q.id,
          value_num: q.kind === 'scale' ? Number(answers[q.id]) : null,
          value_text: q.kind === 'scale' ? null : answers[q.id]!.trim(),
        }));

      if (rows.length > 0) {
        const { error: aErr } = await db.from('survey_answers').insert(rows);
        if (aErr) throw aErr;
      }
      setDone(true);
    } catch (e) {
      setError(errText(e, '제출하지 못했습니다.'));
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="container"><div className="empty">불러오는 중…</div></div>;
  if (!survey) return <div className="container"><div className="alert alert-error">{error ?? '설문을 찾을 수 없습니다.'}</div></div>;

  return (
    <>
      <PageHero
        crumbs={['학생', '설문']}
        title={survey.title}
        en={survey.anonymous ? 'ANONYMOUS' : 'NAMED'}
        desc={survey.intro ?? undefined}
        gradient
      />
      <div className="container narrow">
        {error && <div className="alert alert-error">{error}</div>}

        <div className={survey.anonymous ? 'alert alert-info' : 'alert alert-warn'}>
          {survey.anonymous
            ? '익명 설문입니다. 교수는 누가 참여했는지는 알지만 무엇을 썼는지는 합계로만 봅니다.'
            : '기명 설문입니다. 답한 내용이 이름과 함께 교수에게 보입니다.'}
        </div>

        {done ? (
          <>
            <div className="empty">참여를 마쳤습니다. 고맙습니다.</div>
            <button className="btn-primary btn-block" onClick={() => nav('/home')}>강의홈으로</button>
          </>
        ) : survey.status !== 'open' ? (
          <div className="empty">지금은 참여할 수 없는 설문입니다.</div>
        ) : questions.length === 0 ? (
          <div className="empty">아직 문항이 없습니다.</div>
        ) : (
          <>
            {questions.map((q) => (
              <div className="rubric-item" key={q.id}>
                <div className="head">
                  <span className="label">{q.ord + 1}. {q.label}</span>
                  {!q.required && <span className="max">선택</span>}
                </div>

                {q.kind === 'scale' && (
                  <div className="score-picker">
                    {Array.from({ length: q.scale_max }, (_, i) => i + 1).map((n) => (
                      <button
                        key={n}
                        type="button"
                        aria-pressed={answers[q.id] === String(n)}
                        onClick={() => setAnswers({ ...answers, [q.id]: String(n) })}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                )}

                {q.kind === 'choice' && (
                  <div className="score-picker">
                    {(q.choices ?? []).map((c) => (
                      <button
                        key={c}
                        type="button"
                        aria-pressed={answers[q.id] === c}
                        onClick={() => setAnswers({ ...answers, [q.id]: c })}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                )}

                {q.kind === 'text' && (
                  <textarea
                    rows={3}
                    value={answers[q.id] ?? ''}
                    onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                    placeholder="자유롭게 적어 주세요"
                    aria-label={q.label}
                  />
                )}
              </div>
            ))}

            <div className="sticky-actions">
              <button className="btn-primary btn-block" disabled={busy} onClick={submit}>
                {busy ? '내는 중…' : '제출하기 (한 번만 됩니다)'}
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
