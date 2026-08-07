import { useCallback, useEffect, useState } from 'react';
import { teacherClient } from '../lib/supabase';
import type { Rubric, RubricItem } from '../lib/types';

interface Draft { label: string; description: string; max_score: number; weight: number }

/**
 * 기본 루브릭 견본.
 *
 * 학생이 매기는 척도는 5점을 넘기지 않는다. 전문대 수업에서 10점·100점 척도를 주면
 * 대부분 "잘했으면 90, 못했으면 70"처럼 뭉개져서 변별이 안 된다.
 * 0~5로 좁히고 항목 수를 늘리는 쪽이 훨씬 잘 갈린다.
 */
const PRESETS: Record<string, { title: string; items: Draft[] }> = {
  presentation: {
    title: '발표 평가',
    items: [
      { label: '내용의 충실성', description: '주제를 정확히 다뤘고 근거가 구체적인가', max_score: 5, weight: 2 },
      { label: '구성과 흐름', description: '순서가 이해하기 쉽게 짜였는가', max_score: 5, weight: 1 },
      { label: '전달력', description: '목소리·시선·속도가 알아듣기 좋았는가', max_score: 5, weight: 1 },
      { label: '자료 활용', description: '슬라이드·시각자료가 이해를 도왔는가', max_score: 5, weight: 1 },
      { label: '질의응답', description: '질문에 성실하고 정확하게 답했는가', max_score: 5, weight: 1 },
    ],
  },
  discussion: {
    title: '토론 참여 평가',
    items: [
      { label: '논거의 質', description: '주장에 근거를 붙였는가', max_score: 5, weight: 2 },
      { label: '경청과 반응', description: '남의 의견을 읽고 이어서 말했는가', max_score: 5, weight: 2 },
      { label: '참여 빈도', description: '꾸준히 참여했는가', max_score: 5, weight: 1 },
      { label: '태도', description: '반대 의견을 존중하며 말했는가', max_score: 5, weight: 1 },
    ],
  },
  peer_review: {
    title: '과제 동료 첨삭',
    items: [
      { label: '과제 요구 충족', description: '요구한 항목을 빠짐없이 다뤘는가', max_score: 5, weight: 2 },
      { label: '내용의 정확성', description: '사실·개념에 오류가 없는가', max_score: 5, weight: 2 },
      { label: '표현과 형식', description: '읽기 쉽고 형식을 지켰는가', max_score: 5, weight: 1 },
    ],
  },
};

export default function RubricTab({ courseId }: { courseId: string }) {
  const [rubrics, setRubrics] = useState<Array<Rubric & { rubric_items: RubricItem[] }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState('');
  const [items, setItems] = useState<Draft[]>([]);
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    const { data, error: err } = await teacherClient
      .from('rubrics')
      .select('*, rubric_items ( * )')
      .eq('course_id', courseId)
      .order('created_at');
    if (err) setError(err.message);
    else {
      const list = (data ?? []) as Array<Rubric & { rubric_items: RubricItem[] }>;
      list.forEach((r) => r.rubric_items.sort((a, b) => a.ord - b.ord));
      setRubrics(list);
    }
  }, [courseId]);

  useEffect(() => { load(); }, [load]);

  function usePreset(key: string) {
    const p = PRESETS[key]!;
    setTitle(p.title);
    setItems(p.items.map((i) => ({ ...i })));
    setEditing(true);
  }

  async function save() {
    if (!title.trim() || items.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const { data: r, error: rErr } = await teacherClient
        .from('rubrics')
        .insert({ course_id: courseId, title: title.trim() })
        .select('id')
        .single();
      if (rErr) throw rErr;

      const { error: iErr } = await teacherClient.from('rubric_items').insert(
        items.map((it, idx) => ({
          rubric_id: r.id,
          ord: idx,
          label: it.label.trim(),
          description: it.description.trim() || null,
          max_score: it.max_score,
          weight: it.weight,
        })),
      );
      if (iErr) throw iErr;

      setEditing(false);
      setTitle('');
      setItems([]);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {error && <div className="alert alert-error">{error}</div>}

      {rubrics.map((r) => (
        <div className="card" key={r.id}>
          <h3 style={{ marginTop: 0 }}>{r.title}</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>항목</th><th className="num" style={{ width: 80 }}>만점</th><th className="num" style={{ width: 80 }}>가중치</th></tr>
              </thead>
              <tbody>
                {r.rubric_items.map((i) => (
                  <tr key={i.id}>
                    <td>
                      <b>{i.label}</b>
                      {i.description && <div className="small muted">{i.description}</div>}
                    </td>
                    <td className="num">{Number(i.max_score)}</td>
                    <td className="num">{Number(i.weight)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {editing ? (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>새 루브릭</h3>
          <label className="field">
            <span>이름</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>

          {items.map((it, idx) => (
            <div className="rubric-item" key={idx}>
              <label className="field" style={{ marginBottom: 8 }}>
                <span>항목 {idx + 1}</span>
                <input
                  value={it.label}
                  onChange={(e) => setItems(items.map((x, i) => (i === idx ? { ...x, label: e.target.value } : x)))}
                  placeholder="평가 항목"
                />
              </label>
              <input
                value={it.description}
                onChange={(e) => setItems(items.map((x, i) => (i === idx ? { ...x, description: e.target.value } : x)))}
                placeholder="학생에게 보여줄 설명 (선택)"
                style={{ marginBottom: 8 }}
              />
              <div className="row">
                <label className="field" style={{ marginBottom: 0 }}>
                  <span>만점</span>
                  <input
                    type="number" min={1} max={100} value={it.max_score}
                    onChange={(e) => setItems(items.map((x, i) => (i === idx ? { ...x, max_score: Number(e.target.value) } : x)))}
                  />
                </label>
                <label className="field" style={{ marginBottom: 0 }}>
                  <span>가중치</span>
                  <input
                    type="number" min={1} max={10} value={it.weight}
                    onChange={(e) => setItems(items.map((x, i) => (i === idx ? { ...x, weight: Number(e.target.value) } : x)))}
                  />
                </label>
                <button
                  type="button" className="btn-danger" style={{ flex: '0 0 auto', alignSelf: 'end' }}
                  onClick={() => setItems(items.filter((_, i) => i !== idx))}
                >
                  삭제
                </button>
              </div>
            </div>
          ))}

          <button
            className="btn-ghost btn-block"
            onClick={() => setItems([...items, { label: '', description: '', max_score: 5, weight: 1 }])}
          >
            + 항목 추가
          </button>
          <div className="spacer" />
          <div className="btn-row">
            <button className="btn-ghost" style={{ flex: 1 }} onClick={() => setEditing(false)}>취소</button>
            <button className="btn-primary" style={{ flex: 2 }} onClick={save} disabled={busy || !title.trim() || items.length === 0}>
              {busy ? '저장 중…' : '저장'}
            </button>
          </div>
        </div>
      ) : (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>루브릭 만들기</h3>
          <p className="small muted">견본으로 시작해서 고치는 쪽이 빠릅니다.</p>
          <div className="btn-row">
            <button className="btn-ghost btn-sm" onClick={() => usePreset('presentation')}>발표 견본</button>
            <button className="btn-ghost btn-sm" onClick={() => usePreset('discussion')}>토론 견본</button>
            <button className="btn-ghost btn-sm" onClick={() => usePreset('peer_review')}>첨삭 견본</button>
            <button className="btn-primary btn-sm" onClick={() => { setTitle(''); setItems([{ label: '', description: '', max_score: 5, weight: 1 }]); setEditing(true); }}>
              빈 루브릭
            </button>
          </div>
          <p className="small muted" style={{ marginTop: 12, marginBottom: 0 }}>
            팀 기여도 평가는 루브릭이 필요 없습니다 (100점 배분 방식).
          </p>
        </div>
      )}
    </>
  );
}
