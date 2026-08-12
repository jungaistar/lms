import { useCallback, useEffect, useState } from 'react';
import { teacherClient } from '../lib/supabase';
import type { CourseWeek, CourseSession } from '../lib/types';
import { errText } from '../lib/errors';

/**
 * 주차 · 회차 관리.
 *
 * 출석이 회차에 붙기 때문에 여기서 회차를 제대로 만들어 두지 않으면
 * 헤이영 파일을 올려도 붙일 자리가 없다. 주 2회 수업이면 회차를 2개로 늘린다.
 *
 * published 가 꺼진 주차는 학생에게 아예 안 보인다 (RLS 로 막혀 있다).
 */
export default function WeeksTab({ courseId }: { courseId: string }) {
  const [weeks, setWeeks] = useState<CourseWeek[]>([]);
  const [sessions, setSessions] = useState<CourseSession[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data: w, error: wErr } = await teacherClient
      .from('course_weeks')
      .select('*')
      .eq('course_id', courseId)
      .order('week_no');
    if (wErr) return setError(wErr.message);

    const list = (w ?? []) as CourseWeek[];
    setWeeks(list);

    if (list.length === 0) return setSessions([]);
    const { data: s } = await teacherClient
      .from('course_sessions')
      .select('*')
      .in('week_id', list.map((x) => x.id))
      .order('session_no');
    setSessions((s ?? []) as CourseSession[]);
  }, [courseId]);

  useEffect(() => { load(); }, [load]);

  /** 15주 뼈대를 한 번에 깐다. 이미 있는 주차는 건드리지 않는다. */
  async function createSkeleton(count: number) {
    setBusy(true);
    setError(null);
    try {
      const have = new Set(weeks.map((w) => w.week_no));
      const rows = Array.from({ length: count }, (_, i) => i + 1)
        .filter((n) => !have.has(n))
        .map((n) => ({ course_id: courseId, week_no: n, title: `${n}주차` }));
      if (rows.length === 0) {
        setNotice('이미 다 만들어져 있습니다.');
        return;
      }
      const { data, error: err } = await teacherClient
        .from('course_weeks')
        .insert(rows)
        .select('id');
      if (err) throw err;

      // 회차는 주차마다 1개로 시작한다. 주 2회면 아래에서 추가한다.
      const made = (data ?? []) as Array<{ id: string }>;
      if (made.length > 0) {
        const { error: sErr } = await teacherClient
          .from('course_sessions')
          .insert(made.map((m) => ({ week_id: m.id, session_no: 1 })));
        if (sErr) throw sErr;
      }
      setNotice(`${rows.length}개 주차를 만들었습니다.`);
      await load();
    } catch (e) {
      setError(errText(e, '만들지 못했습니다.'));
    } finally {
      setBusy(false);
    }
  }

  async function patchWeek(id: string, patch: Partial<CourseWeek>) {
    const { error: err } = await teacherClient.from('course_weeks').update(patch).eq('id', id);
    if (err) setError(err.message);
    else await load();
  }

  async function addSession(week: CourseWeek) {
    const used = sessions.filter((s) => s.week_id === week.id).map((s) => s.session_no);
    const next = (used.length === 0 ? 0 : Math.max(...used)) + 1;
    const { error: err } = await teacherClient
      .from('course_sessions')
      .insert({ week_id: week.id, session_no: next });
    if (err) setError(err.message);
    else await load();
  }

  async function patchSession(id: string, patch: Partial<CourseSession>) {
    const { error: err } = await teacherClient.from('course_sessions').update(patch).eq('id', id);
    if (err) setError(err.message);
    else await load();
  }

  async function removeSession(id: string) {
    // 출석이 딸려 지워지므로 되묻는다.
    if (!confirm('이 회차를 지우면 붙어 있는 출결 기록도 함께 사라집니다. 계속할까요?')) return;
    const { error: err } = await teacherClient.from('course_sessions').delete().eq('id', id);
    if (err) setError(err.message);
    else await load();
  }

  const totalSessions = sessions.length;

  return (
    <>
      {error && <div className="alert alert-error">{error}</div>}
      {notice && <div className="alert alert-ok">{notice}</div>}

      <div className="card tight">
        <div className="row" style={{ alignItems: 'center' }}>
          <div style={{ flex: 1 }}>
            <b>{weeks.length}주차</b>{' '}
            <span className="muted small">
              · 전체 {totalSessions}회차 · 공개 {weeks.filter((w) => w.published).length}주차
            </span>
          </div>
          {weeks.length < 15 && (
            <button className="btn-primary btn-sm" style={{ flex: '0 0 auto' }} disabled={busy} onClick={() => createSkeleton(15)}>
              15주차 만들기
            </button>
          )}
        </div>
        <p className="muted small" style={{ marginTop: 8 }}>
          출석은 주차가 아니라 <b>회차</b>에 붙습니다. 주 2회 수업이면 회차를 2개로 늘려 주세요.
          공개를 끈 주차는 학생 화면에 나타나지 않습니다.
        </p>
      </div>

      {weeks.length === 0 && <div className="empty">아직 주차가 없습니다. 위에서 만들어 주세요.</div>}

      <div className="list">
        {weeks.map((w) => {
          const mine = sessions.filter((s) => s.week_id === w.id);
          const open = openId === w.id;
          return (
            <div className="card" key={w.id}>
              <div className="row" style={{ alignItems: 'center', gap: 8 }}>
                <span className="badge">{w.week_no}주</span>
                <input
                  style={{ flex: 1, minWidth: 0 }}
                  value={w.title}
                  onChange={(e) => setWeeks((prev) => prev.map((x) => (x.id === w.id ? { ...x, title: e.target.value } : x)))}
                  onBlur={(e) => patchWeek(w.id, { title: e.target.value })}
                  aria-label={`${w.week_no}주차 제목`}
                />
                <span className="muted small" style={{ flex: '0 0 auto' }}>{mine.length}회차</span>
                <button
                  className={w.published ? 'btn-sm btn-navy' : 'btn-sm btn-ghost'}
                  style={{ flex: '0 0 auto' }}
                  onClick={() => patchWeek(w.id, { published: !w.published })}
                >
                  {w.published ? '공개중' : '비공개'}
                </button>
                <button className="btn-sm btn-ghost" style={{ flex: '0 0 auto' }} onClick={() => setOpenId(open ? null : w.id)}>
                  {open ? '접기' : '펼치기'}
                </button>
              </div>

              {open && (
                <div style={{ marginTop: 12 }}>
                  <label className="small muted" htmlFor={`sum-${w.id}`}>주차 요약</label>
                  <input
                    id={`sum-${w.id}`}
                    defaultValue={w.summary ?? ''}
                    placeholder="이번 주차에 무엇을 하는지 한 줄로"
                    onBlur={(e) => patchWeek(w.id, { summary: e.target.value || null })}
                  />

                  <label className="small muted" htmlFor={`syl-${w.id}`} style={{ marginTop: 10, display: 'block' }}>
                    강의계획
                  </label>
                  <textarea
                    id={`syl-${w.id}`}
                    rows={4}
                    defaultValue={w.syllabus ?? ''}
                    placeholder="학습 목표 · 진행 방식 · 준비물"
                    onBlur={(e) => patchWeek(w.id, { syllabus: e.target.value || null })}
                  />

                  <div className="section-title" style={{ marginTop: 16 }}>회차</div>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr><th>회차</th><th>수업일</th><th>주제</th><th>분</th><th /></tr>
                      </thead>
                      <tbody>
                        {mine.map((s) => (
                          <tr key={s.id}>
                            <td>{s.session_no}</td>
                            <td>
                              <input
                                type="date"
                                defaultValue={s.meets_on ?? ''}
                                onBlur={(e) => patchSession(s.id, { meets_on: e.target.value || null })}
                                aria-label="수업일"
                              />
                            </td>
                            <td>
                              <input
                                defaultValue={s.topic ?? ''}
                                onBlur={(e) => patchSession(s.id, { topic: e.target.value || null })}
                                aria-label="주제"
                              />
                            </td>
                            <td style={{ width: 90 }}>
                              <input
                                type="number"
                                min={0}
                                defaultValue={s.minutes ?? ''}
                                onBlur={(e) => patchSession(s.id, { minutes: e.target.value ? Number(e.target.value) : null })}
                                aria-label="수업 시간(분)"
                              />
                            </td>
                            <td>
                              <button className="btn-sm btn-danger" onClick={() => removeSession(s.id)}>삭제</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <button className="btn-sm btn-ghost" style={{ marginTop: 8 }} onClick={() => addSession(w)}>
                    + 회차 추가
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
