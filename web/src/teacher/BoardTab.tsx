import { useCallback, useEffect, useState } from 'react';
import { teacherClient } from '../lib/supabase';
import {
  MATERIAL_KIND_LABEL,
  type CourseWeek,
  type Material,
  type MaterialKind,
  type Notice,
} from '../lib/types';

/**
 * 과목공지 · 학습자료실 · 강의계획서.
 *
 * 왼쪽 메뉴에서는 '과목 공지'와 '자료 관리'를 따로 부른다 —
 * 참고한 관리자 화면이 그렇게 나눠 뒀고, 학교 LMS 도 과목공지와 학습자료실이
 * 다른 메뉴다. `only` 로 한쪽만 그린다. 데이터를 읽는 길은 하나로 둔다 —
 * 두 벌로 나누면 한쪽이 반드시 뒤처진다.
 *
 * 공지는 published_at 이 null 이면 초안이고, 자료는 published 로 켜고 끈다.
 * 학교 LMS 에서 가져온 줄(locked)은 여기서 고치면 다음 가져오기가 덮어쓰지 않는다.
 */
export default function BoardTab({
  courseId,
  only,
}: {
  courseId: string;
  /** 없으면 둘 다 그린다. */
  only?: 'notices' | 'materials';
}) {
  const [weeks, setWeeks] = useState<CourseWeek[]>([]);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [nTitle, setNTitle] = useState('');
  const [nBody, setNBody] = useState('');
  const [nWeek, setNWeek] = useState('');

  const [mTitle, setMTitle] = useState('');
  const [mUrl, setMUrl] = useState('');
  const [mKind, setMKind] = useState<MaterialKind>('link');
  const [mWeek, setMWeek] = useState('');

  const load = useCallback(async () => {
    const [w, n, m] = await Promise.all([
      teacherClient.from('course_weeks').select('*').eq('course_id', courseId).order('week_no'),
      teacherClient.from('notices').select('*').eq('course_id', courseId).order('created_at', { ascending: false }),
      teacherClient.from('materials').select('*').eq('course_id', courseId).order('ord'),
    ]);
    if (w.error) setError(w.error.message);
    setWeeks((w.data ?? []) as CourseWeek[]);
    setNotices((n.data ?? []) as Notice[]);
    setMaterials((m.data ?? []) as Material[]);
  }, [courseId]);

  useEffect(() => { load(); }, [load]);

  const weekLabel = (id: string | null) => {
    if (!id) return '전체';
    const w = weeks.find((x) => x.id === id);
    return w ? `${w.week_no}주차` : '전체';
  };

  async function addNotice() {
    if (!nTitle.trim()) return setError('공지 제목을 적어 주세요.');
    setBusy(true);
    setError(null);
    try {
      const { error: err } = await teacherClient.from('notices').insert({
        course_id: courseId,
        week_id: nWeek || null,
        title: nTitle.trim(),
        body: nBody.trim() || null,
      });
      if (err) throw err;
      setNTitle('');
      setNBody('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : '올리지 못했습니다.');
    } finally {
      setBusy(false);
    }
  }

  async function addMaterial() {
    if (!mTitle.trim()) return setError('자료 제목을 적어 주세요.');
    setBusy(true);
    setError(null);
    try {
      const { error: err } = await teacherClient.from('materials').insert({
        course_id: courseId,
        week_id: mWeek || null,
        title: mTitle.trim(),
        kind: mKind,
        url: mUrl.trim() || null,
        ord: materials.length,
      });
      if (err) throw err;
      setMTitle('');
      setMUrl('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : '올리지 못했습니다.');
    } finally {
      setBusy(false);
    }
  }

  async function patchNotice(id: string, patch: Partial<Notice>) {
    const { error: err } = await teacherClient.from('notices').update(patch).eq('id', id);
    if (err) setError(err.message);
    else await load();
  }

  async function patchMaterial(id: string, patch: Partial<Material>) {
    const { error: err } = await teacherClient.from('materials').update(patch).eq('id', id);
    if (err) setError(err.message);
    else await load();
  }

  async function removeRow(table: 'notices' | 'materials', id: string) {
    if (!confirm('지울까요?')) return;
    const { error: err } = await teacherClient.from(table).delete().eq('id', id);
    if (err) setError(err.message);
    else await load();
  }

  const showNotices = only !== 'materials';
  const showMaterials = only !== 'notices';

  return (
    <>
      {error && <div className="alert alert-error">{error}</div>}

      {/* ── 공지 ────────────────────────────────────────── */}
      {showNotices && (
      <>
      <div className="section-title">과목공지</div>

      <div className="card tight">
        <div className="row" style={{ gap: 8 }}>
          <input
            style={{ flex: 1, minWidth: 0 }}
            placeholder="공지 제목"
            value={nTitle}
            onChange={(e) => setNTitle(e.target.value)}
            aria-label="공지 제목"
          />
          <select style={{ flex: '0 0 auto' }} value={nWeek} onChange={(e) => setNWeek(e.target.value)} aria-label="공지 주차">
            <option value="">전체</option>
            {weeks.map((w) => <option key={w.id} value={w.id}>{w.week_no}주차</option>)}
          </select>
        </div>
        <textarea
          rows={3}
          placeholder="내용"
          value={nBody}
          onChange={(e) => setNBody(e.target.value)}
          aria-label="공지 내용"
          style={{ marginTop: 8 }}
        />
        <button className="btn-primary btn-sm" style={{ marginTop: 8 }} disabled={busy} onClick={addNotice}>
          공지 등록 (초안)
        </button>
      </div>

      {notices.length === 0 ? (
        <div className="empty">등록한 공지가 없습니다.</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>주차</th><th>제목</th><th>상태</th><th>고정</th><th /></tr>
            </thead>
            <tbody>
              {notices.map((n) => (
                <tr key={n.id}>
                  <td className="muted small">{weekLabel(n.week_id)}</td>
                  <td>
                    {n.title}
                    {n.locked && <span className="badge" style={{ marginLeft: 6 }}>수정됨</span>}
                  </td>
                  <td>
                    <button
                      className={n.published_at ? 'btn-sm btn-navy' : 'btn-sm btn-ghost'}
                      onClick={() => patchNotice(n.id, { published_at: n.published_at ? null : new Date().toISOString() })}
                    >
                      {n.published_at ? '공개중' : '초안'}
                    </button>
                  </td>
                  <td>
                    <button className="btn-sm btn-ghost" onClick={() => patchNotice(n.id, { pinned: !n.pinned })}>
                      {n.pinned ? '고정됨' : '—'}
                    </button>
                  </td>
                  <td><button className="btn-sm btn-danger" onClick={() => removeRow('notices', n.id)}>삭제</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      </>
      )}

      {/* ── 자료 ────────────────────────────────────────── */}
      {showMaterials && (
      <>
      <div className="section-title" style={{ marginTop: showNotices ? 28 : 0 }}>학습자료실 · 강의계획서</div>

      <div className="card tight">
        <div className="row" style={{ gap: 8 }}>
          <input
            style={{ flex: 1, minWidth: 0 }}
            placeholder="자료 제목"
            value={mTitle}
            onChange={(e) => setMTitle(e.target.value)}
            aria-label="자료 제목"
          />
          <select
            style={{ flex: '0 0 auto' }}
            value={mKind}
            onChange={(e) => setMKind(e.target.value as MaterialKind)}
            aria-label="자료 종류"
          >
            {(Object.keys(MATERIAL_KIND_LABEL) as MaterialKind[]).map((k) => (
              <option key={k} value={k}>{MATERIAL_KIND_LABEL[k]}</option>
            ))}
          </select>
          <select style={{ flex: '0 0 auto' }} value={mWeek} onChange={(e) => setMWeek(e.target.value)} aria-label="자료 주차">
            <option value="">전체</option>
            {weeks.map((w) => <option key={w.id} value={w.id}>{w.week_no}주차</option>)}
          </select>
        </div>
        <input
          placeholder="주소 (구글 드라이브·유튜브·학교 LMS 링크 등)"
          value={mUrl}
          onChange={(e) => setMUrl(e.target.value)}
          aria-label="자료 주소"
          style={{ marginTop: 8 }}
        />
        <p className="muted small" style={{ marginTop: 6 }}>
          파일 자체를 여기 올리지는 않습니다. 드라이브에 올리고 <b>링크</b>를 걸어 주세요.
        </p>
        <button className="btn-primary btn-sm" style={{ marginTop: 8 }} disabled={busy} onClick={addMaterial}>
          자료 등록
        </button>
      </div>

      {materials.length === 0 ? (
        <div className="empty">등록한 자료가 없습니다.</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>주차</th><th>종류</th><th>제목</th><th>공개</th><th /></tr>
            </thead>
            <tbody>
              {materials.map((m) => (
                <tr key={m.id}>
                  <td className="muted small">{weekLabel(m.week_id)}</td>
                  <td><span className="badge badge-kind">{MATERIAL_KIND_LABEL[m.kind]}</span></td>
                  <td>
                    {m.url ? <a href={m.url} target="_blank" rel="noreferrer">{m.title}</a> : m.title}
                  </td>
                  <td>
                    <button
                      className={m.published ? 'btn-sm btn-navy' : 'btn-sm btn-ghost'}
                      onClick={() => patchMaterial(m.id, { published: !m.published })}
                    >
                      {m.published ? '공개중' : '숨김'}
                    </button>
                  </td>
                  <td><button className="btn-sm btn-danger" onClick={() => removeRow('materials', m.id)}>삭제</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      </>
      )}
    </>
  );
}
