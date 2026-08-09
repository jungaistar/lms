import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { loadStudentSession, studentDb } from '../lib/session';
import type { Student } from '../lib/types';
import PageHero from '../components/PageHero';

const TOTAL = 100;

/**
 * 팀 기여도 — 100점 배분.
 *
 * 본인을 뺀 팀원에게 총 100점을 나눠 준다.
 * 균등하게 나누면 한 사람당 100/(팀원수−1)점이고, 그게 "제 몫을 했다"의 기준이다.
 * 자기 자신은 배분 대상이 아니다 (자기 점수를 올릴 방법이 없어야 한다).
 */
export default function Contribution() {
  const { activityId } = useParams<{ activityId: string }>();
  const nav = useNavigate();
  const me = loadStudentSession()!.student;

  const [title, setTitle] = useState('');
  const [instruction, setInstruction] = useState<string | null>(null);
  const [mates, setMates] = useState<Student[]>([]);
  const [points, setPoints] = useState<Record<string, number>>({});
  const [comments, setComments] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noTeam, setNoTeam] = useState(false);

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

        const { data: meRow, error: mErr } = await db
          .from('students')
          .select('team_id')
          .eq('id', me.id)
          .single();
        if (mErr) throw mErr;

        if (!meRow.team_id) {
          setNoTeam(true);
          return;
        }

        const { data: team, error: tErr } = await db
          .from('students')
          .select('id, course_id, student_no, name, team_id, active')
          .eq('team_id', meRow.team_id)
          .eq('active', true)
          .neq('id', me.id)
          .order('name');
        if (tErr) throw tErr;
        const list = (team ?? []) as Student[];
        setMates(list);

        const { data: prev } = await db
          .from('contributions')
          .select('ratee_id, points, comment')
          .eq('activity_id', activityId!)
          .eq('evaluator_id', me.id);

        if (prev && prev.length > 0) {
          const p: Record<string, number> = {};
          const c: Record<string, string> = {};
          for (const r of prev as Array<{ ratee_id: string; points: number; comment: string | null }>) {
            p[r.ratee_id] = Number(r.points);
            if (r.comment) c[r.ratee_id] = r.comment;
          }
          setPoints(p);
          setComments(c);
        } else if (list.length > 0) {
          // 균등 배분을 기본값으로 깔아준다. 대부분은 여기서 조금만 조정한다.
          const even = Math.floor(TOTAL / list.length);
          const p: Record<string, number> = {};
          list.forEach((s, i) => {
            p[s.id] = even + (i < TOTAL - even * list.length ? 1 : 0);
          });
          setPoints(p);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : '불러오지 못했습니다.');
      } finally {
        setLoading(false);
      }
    })();
  }, [activityId, me.id]);

  const sum = useMemo(
    () => mates.reduce((s, m) => s + (Number(points[m.id]) || 0), 0),
    [mates, points],
  );
  const balanced = sum === TOTAL;

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const db = studentDb();
      const now = new Date().toISOString();
      const rows = mates.map((m) => ({
        activity_id: activityId!,
        evaluator_id: me.id,
        ratee_id: m.id,
        points: Number(points[m.id]) || 0,
        comment: comments[m.id]?.trim() || null,
        submitted_at: now,
      }));
      const { error: err } = await db
        .from('contributions')
        .upsert(rows, { onConflict: 'activity_id,evaluator_id,ratee_id' });
      if (err) throw err;
      nav('/me', { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="container"><div className="empty">불러오는 중…</div></div>;

  if (noTeam) {
    return (
      <div className="container">
        <div className="alert alert-warn">
          아직 팀이 배정되지 않았습니다. 교수님께 말씀해 주세요.
        </div>
        <button className="btn-ghost btn-block" onClick={() => nav('/me')}>돌아가기</button>
      </div>
    );
  }

  return (
    <>
    <PageHero
      crumbs={['학생', '팀 기여도']}
      title={title}
      en="TEAM CONTRIBUTION"
      desc={
        instruction ??
        `팀원 ${mates.length}명에게 총 ${TOTAL}점을 나눠 주세요. 똑같이 기여했다면 한 사람당 ${Math.round(TOTAL / Math.max(mates.length, 1))}점입니다.`
      }
    />
    <div className="container">
      <div className="alert alert-info small">
        본인은 배분 대상이 아닙니다. 배분 내역은 팀원에게 공개되지 않습니다.
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {mates.map((m) => (
        <div className="rubric-item" key={m.id}>
          <div className="head">
            <span className="label">{m.name}</span>
            <span className="max mono">{m.student_no}</span>
          </div>
          <div className="row" style={{ alignItems: 'center' }}>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={TOTAL}
              value={points[m.id] ?? ''}
              onChange={(e) =>
                setPoints((p) => ({ ...p, [m.id]: Math.max(0, Math.min(TOTAL, Number(e.target.value) || 0)) }))
              }
              style={{ flex: '0 0 110px' }}
            />
            <input
              type="text"
              placeholder="한 줄 코멘트 (선택)"
              value={comments[m.id] ?? ''}
              onChange={(e) => setComments((c) => ({ ...c, [m.id]: e.target.value }))}
              style={{ flex: '1 1 200px' }}
            />
          </div>
        </div>
      ))}

      <div className="sticky-actions">
        <div
          className={`small center ${balanced ? '' : 'muted'}`}
          style={{ marginBottom: 8, color: balanced ? 'var(--ok)' : 'var(--danger)', fontWeight: 700 }}
        >
          합계 {sum} / {TOTAL}점 {balanced ? '✓' : `— ${TOTAL - sum > 0 ? `${TOTAL - sum}점 남음` : `${sum - TOTAL}점 초과`}`}
        </div>
        <div className="btn-row">
          <button className="btn-ghost" style={{ flex: 1 }} onClick={() => nav('/me')} disabled={busy}>
            뒤로
          </button>
          <button className="btn-primary" style={{ flex: 2 }} onClick={submit} disabled={busy || !balanced}>
            {busy ? '저장 중…' : '제출'}
          </button>
        </div>
      </div>
    </div>
    </>
  );
}
