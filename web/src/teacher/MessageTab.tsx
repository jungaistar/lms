import { useCallback, useEffect, useMemo, useState } from 'react';
import { teacherClient } from '../lib/supabase';
import { downloadCsv, type SheetTable } from '../lib/exporters';
import { errText } from '../lib/errors';
import {
  applyFilter,
  buildGmailLink,
  buildMailtoLink,
  buildSmsLink,
  CHANNEL_LABEL,
  FILTER_LABEL,
  HEYYOUNG_SMS_URL,
  isAppleDevice,
  isPersonalized,
  PHONE_STYLE_LABEL,
  PLACEHOLDERS,
  phoneList,
  renderTemplate,
  smsBytes,
  smsKind,
  type MessagePerson,
  type PhoneListStyle,
  type SendChannel,
  type TargetFilter,
  type TargetRow,
} from '../lib/messaging';
import type { CourseSession, CourseWeek } from '../lib/types';

/**
 * 문자 · 알림 — 학생에게 무엇을 보낼지 만들고, 보낸 걸 기록한다.
 *
 * ─────────────────────────────────────────────────────────────
 * 이 화면이 문자를 직접 쏘지 않는 이유를 먼저 적어 둔다.
 *
 *   헤이영에는 공개 API 가 없다. 문자발송 화면이 어느 주소로 무엇을 보내는지는
 *   로그인 상태에서 화면을 뜯어야 알 수 있고, 그건 추측이다. 이 저장소의
 *   원칙은 **미확인 저장 엔드포인트를 추측해 호출하지 않는다** 이다.
 *   199명에게 잘못된 문자가 나가는 쪽이 손이 한 번 더 가는 쪽보다 훨씬 나쁘다.
 *
 * 그래서 두 길을 낸다.
 *   ① 헤이영으로 — 번호 목록을 헤이영이 받는 모양으로 만들어 복사해 준다.
 *      교수는 헤이영 문자발송 화면에 붙여 넣고 보내기만 누른다.
 *   ② 기기로 — 문자앱 · 메일앱 · 공유 시트를 연다.
 *      `sms:` `mailto:` 는 브라우저 표준이라 아이폰 · 안드로이드 · 아이패드 ·
 *      안드로이드 태블릿 · 맥북에서 각자의 기본 앱이 그대로 열린다.
 *      카카오톡은 **공유 시트**를 통해 붙는다 — 카톡 자동 발송은 사업자 채널과
 *      알림톡 템플릿 승인이 필요해서 이 저장소가 할 수 있는 일이 아니다.
 */
export default function MessageTab({ courseId, courseTitle }: { courseId: string; courseTitle: string }) {
  const [rows, setRows] = useState<TargetRow[]>([]);
  const [weeks, setWeeks] = useState<CourseWeek[]>([]);
  const [sessions, setSessions] = useState<CourseSession[]>([]);
  const [sessionId, setSessionId] = useState('');

  const [filter, setFilter] = useState<TargetFilter>('has_phone');
  const [absentMin, setAbsentMin] = useState(3);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [touchedPick, setTouchedPick] = useState(false);

  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [style, setStyle] = useState<PhoneListStyle>('lines');

  const [templates, setTemplates] = useState<Array<{ id: string; title: string; body: string }>>([]);
  const [log, setLog] = useState<Array<{ id: string; channel: SendChannel; body: string; recipient_count: number; sent_at: string }>>([]);

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // 기기 판단은 한 번만 한다. 문자 링크 문법이 여기서 갈린다.
  const apple = useMemo(
    () => typeof navigator !== 'undefined'
      && isAppleDevice(navigator.userAgent, navigator.platform, navigator.maxTouchPoints),
    [],
  );

  // ── 불러오기 ───────────────────────────────────────────────
  const loadTargets = useCallback(async (sid: string) => {
    const { data, error: err } = await teacherClient.rpc('message_targets', {
      p_course: courseId,
      p_session: sid || null,
    });
    if (err) setError(errText(err, '대상을 불러오지 못했습니다.'));
    else setRows((data ?? []) as TargetRow[]);
  }, [courseId]);

  const load = useCallback(async () => {
    const [w, t, l] = await Promise.all([
      teacherClient.from('course_weeks').select('*').eq('course_id', courseId).order('week_no'),
      teacherClient.from('message_templates').select('id,title,body').eq('course_id', courseId).order('ord'),
      teacherClient.from('message_log').select('id,channel,body,recipient_count,sent_at')
        .eq('course_id', courseId).order('sent_at', { ascending: false }).limit(20),
    ]);
    const wl = (w.data ?? []) as CourseWeek[];
    setWeeks(wl);
    setTemplates((t.data ?? []) as typeof templates);
    setLog((l.data ?? []) as typeof log);

    if (wl.length > 0) {
      const { data: cs } = await teacherClient
        .from('course_sessions').select('*')
        .in('week_id', wl.map((x) => x.id)).order('session_no');
      setSessions((cs ?? []) as CourseSession[]);
    }
  }, [courseId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadTargets(sessionId); }, [sessionId, loadTargets]);

  const sessionLabel = useCallback((s: CourseSession) => {
    const w = weeks.find((x) => x.id === s.week_id);
    return `${s.meets_on ?? '날짜 없음'} — ${w ? w.week_no : '?'}주차 ${s.session_no}회차`;
  }, [weeks]);

  const orderedSessions = useMemo(() => {
    const no = new Map(weeks.map((w) => [w.id, w.week_no]));
    return [...sessions].sort(
      (a, b) => (no.get(a.week_id) ?? 0) - (no.get(b.week_id) ?? 0) || a.session_no - b.session_no,
    );
  }, [sessions, weeks]);

  // ── 대상 ───────────────────────────────────────────────────
  const filtered = useMemo(() => applyFilter(rows, filter, absentMin), [rows, filter, absentMin]);

  // 거르기를 바꾸면 고른 사람을 그 결과로 다시 맞춘다.
  // 교수가 체크를 손댄 뒤에는 건드리지 않는다.
  useEffect(() => {
    if (!touchedPick) setPicked(new Set(filtered.map((r) => r.student_id)));
  }, [filtered, touchedPick]);

  const chosen = useMemo(() => rows.filter((r) => picked.has(r.student_id)), [rows, picked]);

  const people: MessagePerson[] = useMemo(
    () => chosen.map((r) => ({
      studentId: r.student_id, studentNo: r.student_no, name: r.name,
      phone: r.phone, email: r.email,
    })),
    [chosen],
  );

  const withPhone = people.filter((p) => p.phone);
  const withEmail = people.filter((p) => p.email);
  const dateStr = orderedSessions.find((s) => s.id === sessionId)?.meets_on
    ?? new Date().toLocaleDateString('sv-SE');

  const personalized = isPersonalized(body);

  /** 한 통으로 묶어 보낼 때의 본문. 사람마다 다른 자리표시자는 그대로 남는다. */
  const bulkBody = useMemo(
    () => renderTemplate(body, { name: '', studentNo: '', course: courseTitle, date: dateStr }),
    [body, courseTitle, dateStr],
  );

  const preview = useMemo(() => {
    const first = chosen[0];
    return renderTemplate(body, {
      name: first?.name ?? '홍길동',
      studentNo: first?.student_no ?? '202400000',
      course: courseTitle,
      date: dateStr,
    });
  }, [body, chosen, courseTitle, dateStr]);

  // ── 보조 동작 ──────────────────────────────────────────────
  async function copy(text: string, what: string) {
    setError(null);
    try {
      await navigator.clipboard.writeText(text);
      setNotice(`${what} 복사했습니다.`);
    } catch {
      setError('복사하지 못했습니다. 브라우저가 막고 있으면 아래 칸에서 직접 선택해 복사해 주세요.');
    }
  }

  /** 보낸 사실을 남긴다. 전송 결과가 아니라 "이걸 보냈다" 는 표시다. */
  async function record(channel: SendChannel) {
    if (people.length === 0) return;
    const { error: err } = await teacherClient.rpc('log_message', {
      p_course: courseId,
      p_channel: channel,
      p_subject: subject || null,
      p_body: personalized ? body : bulkBody,
      p_recipients: people.map((p) => ({ student_id: p.studentId, name: p.name, student_no: p.studentNo })),
    });
    if (err) setError(errText(err, '기록하지 못했습니다.'));
    else { setNotice(`${CHANNEL_LABEL[channel]} — ${people.length}명에게 보낸 것으로 기록했습니다.`); load(); }
  }

  async function share() {
    setError(null);
    if (typeof navigator === 'undefined' || !navigator.share) {
      return setError('이 브라우저는 공유 시트를 못 엽니다. 아래 "문안 복사" 를 눌러 카카오톡에 붙여 넣어 주세요.');
    }
    try {
      await navigator.share({ title: courseTitle, text: personalized ? preview : bulkBody });
      record('share');
    } catch {
      // 사용자가 공유를 취소한 경우다. 오류로 볼 일이 아니다.
    }
  }

  async function saveTemplate() {
    const title = window.prompt('이 문안을 무슨 이름으로 저장할까요?', subject || '새 문안');
    if (!title) return;
    setBusy(true);
    const { error: err } = await teacherClient.from('message_templates')
      .upsert({ course_id: courseId, title, body, ord: templates.length }, { onConflict: 'course_id,title' });
    setBusy(false);
    if (err) setError(errText(err, '저장하지 못했습니다.'));
    else { setNotice(`"${title}" 로 저장했습니다.`); load(); }
  }

  async function removeTemplate(id: string, title: string) {
    if (!window.confirm(`"${title}" 문안을 지웁니다. 계속할까요?`)) return;
    const { error: err } = await teacherClient.from('message_templates').delete().eq('id', id);
    if (err) setError(err.message);
    else load();
  }

  function targetSheet(): SheetTable {
    const head = ['학번', '이름', '전화번호', '가입 이메일', '고른 날짜 출결', '누적 결석'];
    return {
      name: `${courseTitle} 보낼 대상`,
      rows: [head, ...chosen.map((r) => [
        r.student_no, r.name, r.phone ?? '', r.email ?? '', r.att_status ?? '', r.absent_cnt,
      ])],
    };
  }

  const numbers = phoneList(withPhone, style);
  const bytes = smsBytes(personalized ? preview : bulkBody);

  return (
    <>
      {error && <div className="alert alert-error">{error}</div>}
      {notice && <div className="alert alert-ok">{notice}</div>}

      <div className="alert alert-info">
        <b>이 화면은 문자를 대신 쏘지 않습니다.</b>
        <p className="small" style={{ margin: '6px 0 0' }}>
          헤이영에는 공개 API 가 없어서, 문자발송 화면이 무엇을 주고받는지는 추측이 됩니다.
          잘못 쏘면 <b>{rows.length}명 전원에게 잘못된 문자</b>가 나갑니다. 그래서 여기까지만 합니다 —
          <b> 누구에게 보낼지 고르고, 문안을 만들고, 헤이영에 그대로 붙일 수 있는 번호 목록을 내줍니다.</b>
          보내기 단추는 헤이영에서 교수가 누릅니다.
          <br />
          휴대폰 · 태블릿에서는 <b>기기 문자앱 · 메일앱 · 공유 시트</b>를 바로 열 수 있습니다.
        </p>
      </div>

      {/* ── ① 대상 ──────────────────────────────────── */}
      <div className="section-title">① 누구에게</div>
      <div className="card tight">
        <div className="row" style={{ gap: 8, alignItems: 'flex-end' }}>
          <label className="small muted" style={{ flex: '1 1 200px' }}>
            거르기
            <select
              value={filter}
              onChange={(e) => { setFilter(e.target.value as TargetFilter); setTouchedPick(false); }}
            >
              {(Object.keys(FILTER_LABEL) as TargetFilter[]).map((k) => (
                <option key={k} value={k}>{FILTER_LABEL[k]}</option>
              ))}
            </select>
          </label>

          {(filter === 'absent_today' || filter === 'late_today' || filter === 'unmarked_today') && (
            <label className="small muted" style={{ flex: '2 1 260px' }}>
              날짜
              <select value={sessionId} onChange={(e) => { setSessionId(e.target.value); setTouchedPick(false); }}>
                <option value="">— 고르세요 —</option>
                {orderedSessions.map((s) => <option key={s.id} value={s.id}>{sessionLabel(s)}</option>)}
              </select>
            </label>
          )}

          {filter === 'absent_many' && (
            <label className="small muted" style={{ flex: '1 1 160px' }}>
              결석 몇 회 이상
              <input
                type="number" min={1} max={30} value={absentMin}
                onChange={(e) => { setAbsentMin(Number(e.target.value) || 1); setTouchedPick(false); }}
              />
            </label>
          )}
        </div>

        <div className="small" style={{ marginTop: 10 }}>
          거른 결과 <b>{filtered.length}</b>명 · 고른 사람 <b>{people.length}</b>명
          · 번호 있음 <b>{withPhone.length}</b> · 이메일 있음 <b>{withEmail.length}</b>
        </div>
        {people.length > withPhone.length && (
          <div className="alert alert-warn" style={{ marginTop: 10 }}>
            고른 사람 중 <b>{people.length - withPhone.length}명은 번호가 없습니다.</b> 문자에서는 빠집니다 —
            <b> 연락처 관리</b> 화면에서 번호를 먼저 채워 주세요.
          </div>
        )}

        <div className="btn-row" style={{ marginTop: 10 }}>
          <button className="btn-sm btn-ghost" onClick={() => { setTouchedPick(true); setPicked(new Set(filtered.map((r) => r.student_id))); }}>
            거른 결과 전원 고르기
          </button>
          <button className="btn-sm btn-ghost" onClick={() => { setTouchedPick(true); setPicked(new Set()); }}>
            모두 풀기
          </button>
          <button className="btn-sm btn-ghost" disabled={chosen.length === 0} onClick={() => downloadCsv(targetSheet().rows, targetSheet().name)}>
            대상 CSV
          </button>
        </div>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr><th style={{ width: 44 }}>고름</th><th>이름</th><th>학번</th><th>번호</th><th>이메일</th><th>날짜 출결</th><th>누적 결석</th></tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.student_id}>
                <td>
                  <input
                    type="checkbox"
                    checked={picked.has(r.student_id)}
                    aria-label={`${r.name} 고르기`}
                    onChange={(e) => {
                      setTouchedPick(true);
                      setPicked((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(r.student_id); else next.delete(r.student_id);
                        return next;
                      });
                    }}
                  />
                </td>
                <td>{r.name}</td>
                <td className="mono small">{r.student_no}</td>
                <td className="small">{r.phone ?? <span className="muted">없음</span>}</td>
                <td className="small">{r.email ?? <span className="muted">—</span>}</td>
                <td className="small">{r.att_status ?? '—'}</td>
                <td className="small">{r.absent_cnt}</td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={7} className="muted center">해당하는 학생이 없습니다.</td></tr>}
          </tbody>
        </table>
      </div>

      {/* ── ② 문안 ──────────────────────────────────── */}
      <div className="section-title" style={{ marginTop: 28 }}>② 무슨 내용을</div>
      <div className="card tight">
        <label className="small muted" htmlFor="msg-subject">제목 (메일에만 쓰입니다)</label>
        <input
          id="msg-subject" value={subject} onChange={(e) => setSubject(e.target.value)}
          placeholder={`[${courseTitle}] 안내`}
        />

        <label className="small muted" htmlFor="msg-body" style={{ display: 'block', marginTop: 12 }}>본문</label>
        <textarea
          id="msg-body" rows={5} value={body} onChange={(e) => setBody(e.target.value)}
          placeholder={'{이름} 학생, 오늘 수업에 결석했습니다. 사유가 있으면 알려 주세요.'}
        />

        <div className="btn-row" style={{ marginTop: 8 }}>
          {PLACEHOLDERS.map((p) => (
            <button key={p} className="btn-sm btn-ghost" onClick={() => setBody((b) => b + p)}>{p}</button>
          ))}
        </div>
        <p className="small muted" style={{ margin: '8px 0 0' }}>
          <b>{'{이름}'}</b> · <b>{'{학번}'}</b> 을 쓰면 사람마다 문장이 달라집니다.
          그러면 <b>한 통으로 못 묶습니다</b> — 아래 ③ 에 한 명씩 보내는 목록이 나옵니다.
        </p>

        {body && (
          <div className="alert alert-info" style={{ marginTop: 12 }}>
            <div className="small muted">미리보기 {chosen[0] ? `(${chosen[0].name} 기준)` : ''}</div>
            <div style={{ whiteSpace: 'pre-wrap', marginTop: 6 }}>{preview}</div>
            <div className="small muted" style={{ marginTop: 8 }}>
              {bytes}바이트 · <b>{smsKind(preview)}</b>
              {smsKind(preview) === 'LMS' && ' (90바이트를 넘어 장문입니다 — 요금이 다를 수 있습니다)'}
            </div>
          </div>
        )}

        <div className="btn-row" style={{ marginTop: 10 }}>
          <button className="btn-sm btn-ghost" disabled={busy || !body.trim()} onClick={saveTemplate}>이 문안 저장</button>
          {templates.map((t) => (
            <span key={t.id} className="btn-row" style={{ gap: 4 }}>
              <button className="btn-sm btn-ghost" onClick={() => setBody(t.body)}>{t.title}</button>
              <button className="btn-sm btn-danger" onClick={() => removeTemplate(t.id, t.title)} aria-label={`${t.title} 지우기`}>×</button>
            </span>
          ))}
        </div>
      </div>

      {/* ── ③ 보내기 ────────────────────────────────── */}
      <div className="section-title" style={{ marginTop: 28 }}>③ 어떻게 보낼까</div>

      {/* 헤이영 */}
      <div className="card tight">
        <h3 style={{ marginTop: 0 }}>헤이영 문자발송에 붙여 넣기</h3>
        <p className="small muted">
          아래 번호 목록을 복사해 헤이영 <b>문자발송</b> 화면의 받는사람 칸에 붙여 넣으세요.
          화면이 받는 모양이 저마다 달라서 세 가지를 다 내줍니다.
        </p>
        <div className="row" style={{ gap: 8, alignItems: 'flex-end' }}>
          <label className="small muted" style={{ flex: '1 1 220px' }}>
            모양
            <select value={style} onChange={(e) => setStyle(e.target.value as PhoneListStyle)}>
              {(Object.keys(PHONE_STYLE_LABEL) as PhoneListStyle[]).map((k) => (
                <option key={k} value={k}>{PHONE_STYLE_LABEL[k]}</option>
              ))}
            </select>
          </label>
        </div>
        <textarea
          rows={4} readOnly value={numbers}
          aria-label="번호 목록"
          style={{ marginTop: 10, fontFamily: 'var(--mono)' }}
        />
        <div className="btn-row" style={{ marginTop: 8 }}>
          <button className="btn-sm btn-primary" disabled={withPhone.length === 0}
            onClick={() => copy(numbers, `번호 ${withPhone.length}개를`)}>
            번호 {withPhone.length}개 복사
          </button>
          <button className="btn-sm btn-ghost" disabled={!body.trim()}
            onClick={() => copy(personalized ? preview : bulkBody, '문안을')}>
            문안 복사
          </button>
          <a className="btn btn-sm btn-ghost" href={HEYYOUNG_SMS_URL} target="_blank" rel="noreferrer">
            헤이영 열기 ↗
          </a>
          <button className="btn-sm btn-navy" disabled={people.length === 0} onClick={() => record('heyyoung')}>
            보냈다고 기록
          </button>
        </div>
      </div>

      {/* 기기 */}
      <div className="card tight">
        <h3 style={{ marginTop: 0 }}>내 기기에서 바로</h3>
        <p className="small muted">
          아이폰 · 안드로이드 폰 · 아이패드 · 안드로이드 태블릿 · 맥북에서 각자의 기본 앱이 열립니다.
          지금 이 기기는 <b>{apple ? '애플' : '안드로이드 · 그 밖'}</b> 문법으로 문자 링크를 만듭니다.
        </p>

        {personalized ? (
          <div className="alert alert-warn">
            문안에 <b>{'{이름}'}</b> 이나 <b>{'{학번}'}</b> 이 있어서 사람마다 문장이 다릅니다.
            한 통으로 묶어 보낼 수 없습니다 — 아래 목록에서 <b>한 명씩</b> 열어 주세요.
          </div>
        ) : (
          <div className="btn-row">
            {/*
              받는 사람이 없으면 링크를 아예 그리지 않는다.
              `aria-disabled` 를 붙인 <a> 는 **여전히 눌린다** — 눌러서 열리는
              문자앱에 받는 사람이 비어 있으면 교수는 보낸 줄로 착각한다.
            */}
            {withPhone.length > 0 ? (
              <a
                className="btn btn-sm btn-primary"
                href={buildSmsLink(withPhone, bulkBody, apple)}
                onClick={() => record('sms')}
              >
                문자앱 열기 ({withPhone.length}명)
              </a>
            ) : (
              <button className="btn-sm btn-ghost" disabled>문자앱 열기 (번호 있는 사람 없음)</button>
            )}

            {withEmail.length > 0 ? (
              <>
                <a
                  className="btn btn-sm btn-ghost"
                  href={buildMailtoLink(withEmail, subject, bulkBody)}
                  onClick={() => record('email')}
                >
                  메일앱 열기 ({withEmail.length}명)
                </a>
                <a
                  className="btn btn-sm btn-ghost"
                  href={buildGmailLink(withEmail, subject, bulkBody)}
                  target="_blank" rel="noreferrer"
                  onClick={() => record('email')}
                >
                  구글 메일로 쓰기 ↗
                </a>
              </>
            ) : (
              <button className="btn-sm btn-ghost" disabled>메일 (가입 이메일 없음)</button>
            )}

            <button className="btn-sm btn-ghost" disabled={!body.trim()} onClick={share}>
              공유하기 (카카오톡 등)
            </button>
          </div>
        )}

        <p className="small muted" style={{ marginTop: 10 }}>
          메일은 받는 사람을 전부 <b>숨은참조(BCC)</b> 로 넣습니다 — 학생끼리 서로의 주소를 보면 안 됩니다.
          <br />
          문자앱에 사람이 많이 들어가면 기기가 잘라 버리는 경우가 있습니다. 스무 명이 넘으면
          <b> 헤이영 쪽</b>을 쓰시는 편이 확실합니다.
          <br />
          카카오톡 <b>자동 발송</b>은 사업자 채널과 알림톡 서식 승인이 있어야 해서 이 시스템이 대신할 수 없습니다.
          공유 시트에 뜨는 카카오톡을 골라 보내는 방식만 됩니다.
        </p>
      </div>

      {/* 한 명씩 */}
      {personalized && chosen.length > 0 && (
        <>
          <div className="section-title">한 명씩 보내기</div>
          <div className="card tight">
            <p className="small muted" style={{ marginTop: 0 }}>
              사람마다 문장이 달라서 한 줄에 하나씩 냅니다. 누르면 그 학생 한 명에게 갈 문자앱이 열립니다.
            </p>
          </div>
          {chosen.map((r) => {
            const one = renderTemplate(body, {
              name: r.name, studentNo: r.student_no, course: courseTitle, date: dateStr,
            });
            const person: MessagePerson = {
              studentId: r.student_id, studentNo: r.student_no, name: r.name, phone: r.phone, email: r.email,
            };
            return (
              <div className="mark-row" key={r.student_id}>
                <div className="who">
                  <b>{r.name}</b>
                  <span>{r.phone ?? '번호 없음'}</span>
                </div>
                <div className="mark-group mark-group-wide">
                  <span className="k">보낼 내용</span>
                  <div className="small" style={{ whiteSpace: 'pre-wrap' }}>{one}</div>
                </div>
                <div className="mark-group">
                  <span className="k">보내기</span>
                  <div className="btn-row">
                    {r.phone
                      ? <a className="btn btn-sm btn-primary" href={buildSmsLink([person], one, apple)}>문자</a>
                      : <span className="badge badge-pending">번호 없음</span>}
                    {r.email && (
                      <a className="btn btn-sm btn-ghost" href={buildMailtoLink([person], subject, one)}>메일</a>
                    )}
                    <button className="btn-sm btn-ghost" onClick={() => copy(one, '문안을')}>복사</button>
                  </div>
                </div>
              </div>
            );
          })}
          <div className="btn-row">
            <button className="btn-sm btn-navy" onClick={() => record('sms')}>{chosen.length}명에게 보냈다고 기록</button>
          </div>
        </>
      )}

      {/* ── 보낸 기록 ───────────────────────────────── */}
      <div className="section-title" style={{ marginTop: 28 }}>보낸 기록</div>
      <div className="card tight">
        <p className="small muted" style={{ marginTop: 0 }}>
          이쪽이 대신 쏜 게 아니라 <b>교수가 눌러 남긴 표시</b>입니다 — 통신사 전송 결과가 아닙니다.
          "그 학생한테 연락했던가?" 를 나중에 확인하려고 둡니다.
        </p>
      </div>
      <ul className="list">
        {log.map((l) => (
          <li key={l.id}>
            <div className="grow">
              <div className="name">{CHANNEL_LABEL[l.channel] ?? l.channel} · {l.recipient_count}명</div>
              <div className="sub">
                {new Date(l.sent_at).toLocaleString('ko-KR')}
                <span>·</span>
                <span className="muted">{l.body.slice(0, 60)}{l.body.length > 60 ? '…' : ''}</span>
              </div>
            </div>
          </li>
        ))}
        {log.length === 0 && <li><span className="muted">아직 기록이 없습니다.</span></li>}
      </ul>
    </>
  );
}
