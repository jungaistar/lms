import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { loadStudentSession, studentDb } from '../lib/session';
import type {
  AttendanceRow,
  CourseSession,
  CourseWeek,
  DeductionKind,
  DeductionRow,
  Task,
  TaskSubmission,
} from '../lib/types';
import PageHero from '../components/PageHero';
import StudentNav from './StudentNav';
import { errText } from '../lib/errors';

const STATUS_LABEL: Record<string, string> = {
  present: '출석',
  late: '지각',
  absent: '결석',
  excused: '유고결석',
  early_leave: '조퇴',
};

/**
 * 학생 본인 기록 — 출결 · 과제 점수 · 감점.
 *
 * 확정된 공개 정책 그대로다. 여기 보이는 건 전부 **본인 것**이고,
 * 최종 성적과 상호평가 원점수는 여기 없다 — RLS 에 학생 정책이 없어서
 * 애초에 내려오지 않는다. 화면에서 감추는 게 아니다.
 */
export default function MyRecord() {
  const nav = useNavigate();
  const session = loadStudentSession()!;

  const [weeks, setWeeks] = useState<CourseWeek[]>([]);
  const [sessions, setSessions] = useState<CourseSession[]>([]);
  const [att, setAtt] = useState<AttendanceRow[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [subs, setSubs] = useState<TaskSubmission[]>([]);
  const [kinds, setKinds] = useState<DeductionKind[]>([]);
  const [deds, setDeds] = useState<DeductionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const db = studentDb();
        const [w, a, t, s, k, d] = await Promise.all([
          db.from('course_weeks').select('*').order('week_no'),
          db.from('attendance').select('*'),
          db.from('tasks').select('*').order('due_at', { nullsFirst: false }),
          db.from('task_submissions').select('*'),
          db.from('deduction_kinds').select('*').order('ord'),
          db.from('deductions').select('*'),
        ]);
        if (a.error) throw a.error;

        const wl = (w.data ?? []) as CourseWeek[];
        setWeeks(wl);
        setAtt((a.data ?? []) as AttendanceRow[]);
        setTasks((t.data ?? []) as Task[]);
        setSubs((s.data ?? []) as TaskSubmission[]);
        setKinds((k.data ?? []) as DeductionKind[]);
        setDeds((d.data ?? []) as DeductionRow[]);

        if (wl.length > 0) {
          const { data: cs } = await db
            .from('course_sessions')
            .select('*')
            .in('week_id', wl.map((x) => x.id))
            .order('session_no');
          setSessions((cs ?? []) as CourseSession[]);
        }
      } catch (e) {
        setError(errText(e, '불러오지 못했습니다.'));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <div className="container"><div className="empty">불러오는 중…</div></div>;

  const weekOf = new Map(weeks.map((w) => [w.id, w.week_no]));
  const sessionInfo = new Map(sessions.map((s) => [s.id, s]));

  const rows = att
    .map((r) => {
      const cs = sessionInfo.get(r.session_id);
      const week = cs ? weekOf.get(cs.week_id) ?? 0 : 0;
      return { ...r, week, session: cs?.session_no ?? 0, meetsOn: cs?.meets_on ?? null };
    })
    .sort((x, y) => x.week - y.week || x.session - y.session);

  const count = (st: string) => rows.filter((r) => r.status === st).length;

  // 감점은 본인 것만 내려온다. 자동 항목(지각·과제)은 아래에서 직접 센다.
  const dedCount = (k: DeductionKind): number => {
    switch (k.source) {
      case 'attendance_late': return count('late');
      case 'attendance_early_leave': return count('early_leave');
      case 'task_missing':
        return tasks.filter((t) => t.status !== 'draft' && !subs.find((s) => s.task_id === t.id)?.submitted_at).length;
      case 'task_late':
        return tasks.filter((t) => {
          const sub = subs.find((s) => s.task_id === t.id);
          return Boolean(sub?.submitted_at && t.due_at && new Date(sub.submitted_at) > new Date(t.due_at));
        }).length;
      default:
        return deds.filter((d) => d.kind_id === k.id).reduce((a, d) => a + Number(d.count), 0);
    }
  };

  const activeKinds = kinds.filter((k) => k.active);
  const dedTotal = activeKinds.reduce((a, k) => a + dedCount(k) * Number(k.points), 0);

  return (
    <>
      <PageHero
        crumbs={['학생', '내 기록']}
        title="내 출결 · 과제"
        en="MY RECORD"
        desc={`${session.student.name} (${session.student.student_no}) 님의 기록입니다. 본인 것만 보입니다.`}
        actions={
          <>
            <button className="btn btn-on-hero btn-sm" onClick={() => nav('/lessons')}>수업</button>
            <button className="btn btn-on-hero btn-sm" onClick={() => nav('/me')}>내 평가</button>
          </>
        }
        gradient
      />
      <div className="container">
        <StudentNav />
        {error && <div className="alert alert-error">{error}</div>}

        {/* ── 출결 ─────────────────────────────────── */}
        <div className="section-title">출결</div>
        <div className="card tight">
          <div className="small">
            {(['present', 'late', 'absent', 'excused', 'early_leave'] as const).map((st) => (
              <span key={st} style={{ marginRight: 14 }}>
                {STATUS_LABEL[st]} <b>{count(st)}</b>
              </span>
            ))}
          </div>
          <p className="muted small" style={{ marginTop: 8 }}>
            헤이영 기록을 옮겨 온 것입니다. 다른 부분이 있으면 <b>헤이영에서 출결이의신청</b>을 해 주세요.
          </p>
        </div>

        {rows.length === 0 ? (
          <div className="empty">아직 기록된 출결이 없습니다.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>주차</th><th>회차</th><th>수업일</th><th>출결</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>{r.week || '—'}주</td>
                    <td>{r.session || '—'}</td>
                    <td className="muted small">{r.meetsOn ?? '—'}</td>
                    <td>
                      <span className={r.status === 'present' ? 'badge badge-approved' : 'badge badge-draft'}>
                        {STATUS_LABEL[r.status] ?? r.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── 과제 ─────────────────────────────────── */}
        <div className="section-title" style={{ marginTop: 28 }}>과제</div>
        {tasks.length === 0 ? (
          <div className="empty">공개된 과제가 없습니다.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>과제</th><th>마감</th><th>제출</th><th>점수</th></tr></thead>
              <tbody>
                {tasks.map((t) => {
                  const sub = subs.find((s) => s.task_id === t.id);
                  const late = Boolean(sub?.submitted_at && t.due_at && new Date(sub.submitted_at) > new Date(t.due_at));
                  return (
                    <tr key={t.id}>
                      <td>{t.title} <span className="muted small">({t.mode === 'team' ? '팀' : '개인'})</span></td>
                      <td className="muted small">
                        {t.due_at ? new Date(t.due_at).toLocaleDateString('ko-KR') : '—'}
                      </td>
                      <td>
                        {sub?.submitted_at ? (
                          <span className={late ? 'badge badge-closed' : 'badge badge-approved'}>
                            {late ? '지각 제출' : '제출'}
                          </span>
                        ) : (
                          <span className="badge badge-draft">미제출</span>
                        )}
                      </td>
                      <td>
                        {sub?.graded_at ? <b>{sub.score ?? '—'} / {t.max_points}</b> : <span className="muted">채점 전</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* ── 감점 ─────────────────────────────────── */}
        {activeKinds.length > 0 && (
          <>
            <div className="section-title" style={{ marginTop: 28 }}>감점</div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>항목</th><th>건수</th><th>1건당</th><th>합계</th></tr></thead>
                <tbody>
                  {activeKinds.map((k) => {
                    const c = dedCount(k);
                    return (
                      <tr key={k.id}>
                        <td>{k.label}</td>
                        <td>{c || '—'}</td>
                        <td className="muted small">{k.points}점</td>
                        <td>{c ? (c * Number(k.points)).toFixed(1) : '—'}</td>
                      </tr>
                    );
                  })}
                  <tr>
                    <td colSpan={3}><b>감점 합계</b></td>
                    <td><b>{dedTotal.toFixed(1)}</b></td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="muted small" style={{ marginTop: 8 }}>
              감점은 성적의 <b>기타</b> 항목에 반영됩니다. 최종 성적은 학교 성적 공시로 확인해 주세요.
            </p>
          </>
        )}
      </div>
    </>
  );
}
