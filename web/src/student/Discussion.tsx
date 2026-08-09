import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { loadStudentSession, studentDb } from '../lib/session';
import PageHero from '../components/PageHero';

interface Post {
  id: string;
  parent_id: string | null;
  body: string;
  created_at: string;
  author_id: string;
  students: { name: string } | null;
}

/**
 * 토론방.
 *
 * 토론은 익명이 아니다 — 누가 무슨 말을 했는지 보여야 대화가 된다.
 * 익명 처리되는 건 나중에 이 글들을 대상으로 하는 **상호평가 코멘트** 쪽이다.
 */
export default function Discussion() {
  const { activityId } = useParams<{ activityId: string }>();
  const nav = useNavigate();
  const me = loadStudentSession()!.student;

  const [title, setTitle] = useState('');
  const [instruction, setInstruction] = useState<string | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [body, setBody] = useState('');
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const db = studentDb();
    const { data, error: err } = await db
      .from('discussion_posts')
      .select('id, parent_id, body, created_at, author_id, students!discussion_posts_author_id_fkey ( name )')
      .eq('activity_id', activityId!)
      .order('created_at');
    if (err) throw err;
    setPosts((data ?? []) as unknown as Post[]);
  }, [activityId]);

  useEffect(() => {
    (async () => {
      try {
        const db = studentDb();
        const { data: act, error: aErr } = await db
          .from('activities')
          .select('title, instruction')
          .eq('id', activityId!)
          .single();
        if (aErr) throw aErr;
        setTitle(act.title);
        setInstruction(act.instruction);
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : '불러오지 못했습니다.');
      } finally {
        setLoading(false);
      }
    })();
  }, [activityId, load]);

  async function post() {
    if (!body.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const db = studentDb();
      const { error: err } = await db.from('discussion_posts').insert({
        activity_id: activityId!,
        author_id: me.id,
        parent_id: replyTo,
        body: body.trim(),
      });
      if (err) throw err;
      setBody('');
      setReplyTo(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : '등록하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  }

  const roots = posts.filter((p) => !p.parent_id);
  const repliesOf = (id: string) => posts.filter((p) => p.parent_id === id);

  if (loading) return <div className="container"><div className="empty">불러오는 중…</div></div>;

  return (
    <>
    <PageHero
      crumbs={['학생', '토론방']}
      title={title}
      en="DISCUSSION"
      desc={instruction ?? undefined}
    />
    <div className="container">
      {error && <div className="alert alert-error">{error}</div>}

      {roots.length === 0 && (
        <div className="empty">
          <div className="big">💬</div>
          아직 글이 없습니다. 첫 글을 남겨보세요.
        </div>
      )}

      {roots.map((p) => (
        <div className="card tight" key={p.id}>
          <div className="small muted">
            <b style={{ color: 'var(--navy)' }}>{p.students?.name ?? '이름 없음'}</b>
            {p.author_id === me.id && <span className="badge badge-kind" style={{ marginLeft: 6 }}>나</span>}
            {' · '}
            {new Date(p.created_at).toLocaleString('ko-KR')}
          </div>
          <div style={{ whiteSpace: 'pre-wrap', marginTop: 6 }}>{p.body}</div>

          {repliesOf(p.id).map((r) => (
            <div
              key={r.id}
              style={{ borderLeft: '3px solid var(--line)', paddingLeft: 12, marginTop: 12 }}
            >
              <div className="small muted">
                <b style={{ color: 'var(--navy)' }}>{r.students?.name ?? '이름 없음'}</b>
                {' · '}
                {new Date(r.created_at).toLocaleString('ko-KR')}
              </div>
              <div style={{ whiteSpace: 'pre-wrap', marginTop: 4, fontSize: 15 }}>{r.body}</div>
            </div>
          ))}

          <button
            className="btn-ghost btn-sm"
            style={{ marginTop: 10 }}
            onClick={() => setReplyTo(replyTo === p.id ? null : p.id)}
          >
            {replyTo === p.id ? '답글 취소' : '답글'}
          </button>
        </div>
      ))}

      <div className="card">
        <label className="field" style={{ marginBottom: 10 }}>
          <span>{replyTo ? '답글 쓰기' : '새 글 쓰기'}</span>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="생각을 적어주세요." />
        </label>
        <div className="btn-row">
          <button className="btn-ghost" style={{ flex: 1 }} onClick={() => nav('/me')} disabled={busy}>
            뒤로
          </button>
          <button className="btn-primary" style={{ flex: 2 }} onClick={post} disabled={busy || !body.trim()}>
            {busy ? '등록 중…' : '등록'}
          </button>
        </div>
      </div>
    </div>
    </>
  );
}
