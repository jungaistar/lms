import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { studentDb } from '../lib/session';
import PageHero from '../components/PageHero';

interface Item {
  activity_id: string;
  activity_title: string;
  target_title?: string;
  comment: string;
}

/**
 * 내가 받은 피드백.
 *
 * 여기에는 **점수가 없다.** my_feedback() RPC 가 아예 점수 컬럼을 반환하지 않으므로
 * 클라이언트를 조작해도 점수를 볼 수 없다. 확정된 공개 정책(코멘트만 익명 공개)을
 * 화면이 아니라 데이터 계층에서 지킨다.
 */
export default function Feedback() {
  const nav = useNavigate();
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const db = studentDb();
        const [a, b] = await Promise.all([
          db.rpc('my_feedback'),
          db.rpc('my_contribution_feedback'),
        ]);
        if (a.error) throw a.error;
        if (b.error) throw b.error;
        setItems([...((a.data ?? []) as Item[]), ...((b.data ?? []) as Item[])]);
      } catch (e) {
        setError(e instanceof Error ? e.message : '불러오지 못했습니다.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const byActivity = items.reduce<Record<string, Item[]>>((acc, it) => {
    (acc[it.activity_title] ??= []).push(it);
    return acc;
  }, {});

  if (loading) return <div className="container"><div className="empty">불러오는 중…</div></div>;

  return (
    <>
    <PageHero
      crumbs={['학생', '받은 피드백']}
      title="내가 받은 피드백"
      en="MY FEEDBACK"
      desc="누가 썼는지는 표시되지 않습니다. 점수는 공개되지 않습니다."
    />
    <div className="container">
      {error && <div className="alert alert-error">{error}</div>}

      {items.length === 0 ? (
        <div className="empty">
          <div className="big">🗒️</div>
          아직 받은 피드백이 없습니다.
          <div className="small" style={{ marginTop: 6 }}>평가가 마감되면 여기에 표시됩니다.</div>
        </div>
      ) : (
        Object.entries(byActivity).map(([activity, list]) => (
          <div key={activity}>
            <div className="section-title">{activity}</div>
            {list.map((it, i) => (
              <div className="card tight" key={i}>
                {it.target_title && <div className="small muted">{it.target_title}</div>}
                <div style={{ whiteSpace: 'pre-wrap' }}>{it.comment}</div>
              </div>
            ))}
          </div>
        ))
      )}

      <div style={{ marginTop: 20 }}>
        <button className="btn-ghost btn-block" onClick={() => nav('/me')}>돌아가기</button>
      </div>
    </div>
    </>
  );
}
