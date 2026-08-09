import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { studentDb } from '../lib/session';
import { KIND_LABEL, type ActivityKind, type RubricItem } from '../lib/types';
import PageHero from '../components/PageHero';

interface Loaded {
  activityTitle: string;
  activityKind: ActivityKind;
  instruction: string | null;
  targetTitle: string;
  targetContent: string | null;
  commentsShared: boolean;
  items: RubricItem[];
  evaluationId: string | null;
  scores: Record<string, number>;
  comment: string;
  submittedAt: string | null;
}

export default function Evaluate() {
  const { assignmentId } = useParams<{ assignmentId: string }>();
  const nav = useNavigate();

  const [data, setData] = useState<Loaded | null>(null);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const db = studentDb();

        const { data: a, error: aErr } = await db
          .from('assignments')
          .select(
            `id,
             targets ( title, content ),
             activities ( title, kind, instruction, rubric_id, show_comments_to_students )`,
          )
          .eq('id', assignmentId!)
          .single();
        if (aErr) throw aErr;

        const activity = (a as any).activities;
        const target = (a as any).targets;

        const { data: items, error: iErr } = await db
          .from('rubric_items')
          .select('*')
          .eq('rubric_id', activity.rubric_id)
          .order('ord');
        if (iErr) throw iErr;

        const { data: ev } = await db
          .from('evaluations')
          .select('id, comment, submitted_at, evaluation_scores ( rubric_item_id, score )')
          .eq('assignment_id', assignmentId!)
          .maybeSingle();

        const existing: Record<string, number> = {};
        for (const s of ((ev as any)?.evaluation_scores ?? []) as Array<{ rubric_item_id: string; score: number }>) {
          existing[s.rubric_item_id] = Number(s.score);
        }

        setData({
          activityTitle: activity.title,
          activityKind: activity.kind,
          instruction: activity.instruction,
          targetTitle: target.title,
          targetContent: target.content,
          commentsShared: activity.show_comments_to_students,
          items: (items ?? []) as RubricItem[],
          evaluationId: (ev as any)?.id ?? null,
          scores: existing,
          comment: (ev as any)?.comment ?? '',
          submittedAt: (ev as any)?.submitted_at ?? null,
        });
        setScores(existing);
        setComment((ev as any)?.comment ?? '');
      } catch (e) {
        setError(e instanceof Error ? e.message : '불러오지 못했습니다.');
      } finally {
        setLoading(false);
      }
    })();
  }, [assignmentId]);

  const allScored = useMemo(
    () => Boolean(data) && data!.items.every((i) => scores[i.id] !== undefined),
    [data, scores],
  );

  /** 현재 입력 기준 환산 점수(100점 만점). 학생에게 "내가 몇 점 줬는지" 감을 준다. */
  const preview = useMemo(() => {
    if (!data || !allScored) return null;
    const wsum = data.items.reduce((s, i) => s + Number(i.weight), 0);
    if (wsum === 0) return null;
    const v = data.items.reduce(
      (s, i) => s + (Number(scores[i.id] ?? 0) / Number(i.max_score)) * Number(i.weight),
      0,
    );
    return Math.round((100 * v) / wsum);
  }, [data, scores, allScored]);

  async function save(submit: boolean) {
    if (!data) return;
    setBusy(true);
    setError(null);
    try {
      const db = studentDb();

      const { data: ev, error: eErr } = await db
        .from('evaluations')
        .upsert(
          {
            assignment_id: assignmentId!,
            comment: comment.trim() || null,
            submitted_at: submit ? new Date().toISOString() : data.submittedAt,
          },
          { onConflict: 'assignment_id' },
        )
        .select('id')
        .single();
      if (eErr) throw eErr;

      const rows = Object.entries(scores).map(([rubric_item_id, score]) => ({
        evaluation_id: ev.id,
        rubric_item_id,
        score,
      }));
      if (rows.length > 0) {
        const { error: sErr } = await db
          .from('evaluation_scores')
          .upsert(rows, { onConflict: 'evaluation_id,rubric_item_id' });
        if (sErr) throw sErr;
      }

      nav('/me', { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="container"><div className="empty">불러오는 중…</div></div>;
  if (!data) return <div className="container"><div className="alert alert-error">{error}</div></div>;

  return (
    <>
    <PageHero
      crumbs={['학생', '평가']}
      title={data.targetTitle}
      en={`${KIND_LABEL[data.activityKind]} · ${data.activityTitle}`}
      desc={data.instruction ?? undefined}
    />
    <div className="container">
      {data.targetContent && (
        <div className="card soft">
          <div className="eyebrow">평가 대상</div>
          <div style={{ whiteSpace: 'pre-wrap', marginTop: 8, fontSize: 14.5, lineHeight: 1.75 }}>
            {data.targetContent}
          </div>
        </div>
      )}

      {error && <div className="alert alert-error">{error}</div>}

      {data.items.map((item) => (
        <div className="rubric-item" key={item.id}>
          <div className="head">
            <span className="label">{item.label}</span>
            <span className="max">{Number(item.max_score)}점 만점</span>
          </div>
          {item.description && <div className="desc">{item.description}</div>}
          <ScorePicker
            max={Number(item.max_score)}
            value={scores[item.id]}
            onChange={(v) => setScores((s) => ({ ...s, [item.id]: v }))}
          />
        </div>
      ))}

      <div className="card">
        <label className="field" style={{ marginBottom: 0 }}>
          <span>코멘트</span>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="좋았던 점과 아쉬운 점을 구체적으로 적어주세요."
          />
          <small>
            {data.commentsShared
              ? '코멘트는 이름 없이 상대에게 전달됩니다. 점수는 전달되지 않습니다.'
              : '코멘트는 교수님만 봅니다.'}
          </small>
        </label>
      </div>

      <div className="sticky-actions">
        {preview !== null && (
          <div className="small muted center" style={{ marginBottom: 8 }}>
            환산 {preview}점 / 100점
          </div>
        )}
        <div className="btn-row">
          <button className="btn-ghost" style={{ flex: 1 }} onClick={() => nav('/me')} disabled={busy}>
            뒤로
          </button>
          <button
            className="btn-primary"
            style={{ flex: 2 }}
            onClick={() => save(true)}
            disabled={busy || !allScored}
          >
            {busy ? '저장 중…' : allScored ? (data.submittedAt ? '수정 저장' : '제출') : '모든 항목을 채워주세요'}
          </button>
        </div>
      </div>
    </div>
    </>
  );
}

/**
 * 점수 입력.
 * 만점이 10 이하면 버튼으로 고른다 — 수업 중 휴대폰에서 키패드를 여는 것보다 훨씬 빠르다.
 * 그보다 크면 숫자 입력으로 떨어뜨린다.
 */
function ScorePicker({
  max,
  value,
  onChange,
}: {
  max: number;
  value: number | undefined;
  onChange: (v: number) => void;
}) {
  if (max <= 10) {
    const options = Array.from({ length: max + 1 }, (_, i) => i);
    return (
      <div className="score-picker">
        {options.map((n) => (
          <button key={n} type="button" aria-pressed={value === n} onClick={() => onChange(n)}>
            {n}
          </button>
        ))}
      </div>
    );
  }
  return (
    <input
      type="number"
      inputMode="numeric"
      min={0}
      max={max}
      value={value ?? ''}
      onChange={(e) => {
        const v = e.target.value === '' ? NaN : Number(e.target.value);
        if (!Number.isNaN(v)) onChange(Math.min(Math.max(v, 0), max));
      }}
      placeholder={`0 ~ ${max}`}
    />
  );
}
