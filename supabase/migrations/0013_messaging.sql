-- ════════════════════════════════════════════════════════════════
--  학생에게 알리기 — 문안 서식과 보낸 기록
--
--  ─────────────────────────────────────────────────────────────
--  이 저장소가 문자를 직접 쏘지 않는 이유
--
--    헤이영에는 공개 API 가 없다. 문자발송 화면이 어느 주소로 무엇을 POST
--    하는지는 로그인 상태에서 화면을 뜯어야 알 수 있고, 그건 추측이다.
--    이 저장소의 원칙은 그대로다 — **미확인 저장 엔드포인트를 추측해
--    호출하지 않는다.** 잘못 쏘면 199명에게 잘못된 문자가 나간다.
--
--    그래서 이쪽이 하는 일은 여기까지다.
--      · 누구에게 보낼지 고른다 (오늘 결석한 사람 · 번호 있는 사람 …)
--      · 문안을 만든다 (이름 · 학번을 끼워 넣는다)
--      · **헤이영 문자발송 화면에 그대로 붙일 수 있는 모양**으로 내준다
--      · 보낸 사실을 기록해 둔다
--
--    실제 발송은 두 길이다.
--      ① 헤이영 문자발송 화면에 번호 목록을 붙여 넣고 사람이 보낸다
--      ② 교수 기기의 문자앱 · 메일앱 · 공유 시트를 연다 (sms: · mailto: · 공유)
--         — 이건 브라우저 표준이라 아이폰 · 안드로이드 · 맥에서 그대로 돈다
--
--  ─────────────────────────────────────────────────────────────
--  기록을 남기는 이유
--
--    "그 학생한테 연락했던가?" 를 나중에 확인할 수 있어야 한다.
--    출결 경고 · 과제 독촉은 성적 이의가 붙는 자리라 근거가 필요하다.
--    다만 **보냈다는 사실**만 남긴다. 이쪽이 발송을 대행하지 않으므로
--    '보냄' 은 교수가 눌러서 남긴 표시다 — 통신사 전송 결과가 아니다.
--
--  두 표 모두 학생용 RLS 정책이 없다. 교수만 읽고 쓴다.
-- ════════════════════════════════════════════════════════════════

-- ── 문안 서식 ────────────────────────────────────────────────
create table if not exists message_templates (
  id         uuid primary key default gen_random_uuid(),
  course_id  uuid not null references courses(id) on delete cascade,
  title      text not null,
  -- {이름} {학번} {과목} {날짜} 를 끼워 넣을 수 있다. 치환은 화면이 한다 —
  -- 점수가 아니라 보여 줄 글자라 DB 로 올릴 이유가 없다.
  body       text not null,
  ord        int  not null default 0,
  created_at timestamptz not null default now(),
  unique (course_id, title)
);

comment on column message_templates.body is
  '{이름} {학번} {과목} {날짜} 자리표시자를 쓸 수 있다.';

-- ── 보낸 기록 ────────────────────────────────────────────────
create table if not exists message_log (
  id         uuid primary key default gen_random_uuid(),
  course_id  uuid not null references courses(id) on delete cascade,
  -- 어느 길로 보냈나. 이쪽이 대행한 게 아니라 교수가 어느 버튼을 눌렀는지다.
  channel    text not null check (channel in ('heyyoung', 'sms', 'email', 'share', 'copy')),
  subject    text,
  body       text not null,
  -- 받는 사람 [{student_id, name, student_no}]. 번호는 남기지 않는다 —
  -- 기록에 번호를 복제해 두면 지울 자리가 하나 더 늘어난다.
  recipients jsonb not null default '[]'::jsonb,
  recipient_count int not null default 0,
  note       text,
  sent_at    timestamptz not null default now(),
  sent_by    uuid references auth.users(id) on delete set null
);

create index if not exists message_log_course_idx on message_log(course_id, sent_at desc);

comment on table message_log is
  '학생에게 무엇을 보냈는지 남긴다. 발송 대행이 아니라 교수가 남긴 표시다 — '
  '통신사 전송 결과가 아니다. 받는 사람 목록에 전화번호는 담지 않는다.';

-- ════════════════════════════════════════════════════════════
--  RLS — 교수만
-- ════════════════════════════════════════════════════════════
alter table message_templates enable row level security;
alter table message_log       enable row level security;

drop policy if exists msgtpl_owner_all on message_templates;
create policy msgtpl_owner_all on message_templates
  for all using (owns_course(course_id)) with check (owns_course(course_id));

drop policy if exists msglog_owner_all on message_log;
create policy msglog_owner_all on message_log
  for all using (owns_course(course_id)) with check (owns_course(course_id));

-- ════════════════════════════════════════════════════════════
--  보낼 대상 뽑기
--
--  전화번호와 이메일이 서로 다른 표에 있고, 출결로 거르는 일이 잦다.
--  화면에서 세 번 조회해 맞추는 대신 한 번에 내준다.
--
--  p_session 을 주면 그 날짜의 출결이 함께 온다. null 이면 출결 칸은 빈다.
-- ════════════════════════════════════════════════════════════
create or replace function message_targets(p_course uuid, p_session uuid default null)
returns table (
  student_id  uuid,
  student_no  text,
  name        text,
  grade       smallint,
  dept        text,
  team_name   text,
  phone       text,
  guardian_phone text,
  email       text,
  /** 그 날짜의 출결. 회차를 안 주면 null. */
  att_status  text,
  /** 학기 누계 결석 수. '결석이 잦은 학생' 을 고를 때 쓴다. */
  absent_cnt  int
)
language sql
stable
security definer
set search_path = public
as $$
  with sess as (
    select cs.id
      from course_sessions cs join course_weeks w on w.id = cs.week_id
     where w.course_id = p_course
  )
  select
    s.id, s.student_no, s.name, s.grade, s.dept,
    t.name,
    c.phone, c.guardian_phone,
    sa.email,
    (select a.status from attendance a
      where a.session_id = p_session and a.student_id = s.id),
    (select count(*)::int from attendance a
      where a.student_id = s.id and a.status = 'absent'
        and a.session_id in (select id from sess))
  from students s
  left join teams t            on t.id = s.team_id
  left join student_contacts c on c.student_id = s.id
  left join student_access sa  on sa.student_id = s.id
  -- security definer 라 RLS 를 건너뛴다. 여기서 직접 막지 않으면
  -- 남의 과목 id 를 넣어 부르는 것으로 번호가 통째로 새어 나간다.
  where s.course_id = p_course and s.active and owns_course(p_course)
  order by s.student_no
$$;

comment on function message_targets(uuid, uuid) is
  '문자 · 메일 보낼 대상 한 줄. 번호를 내주므로 owns_course 검사가 반드시 있어야 한다.';

revoke all on function message_targets(uuid, uuid) from public, anon;
grant execute on function message_targets(uuid, uuid) to authenticated;

-- ════════════════════════════════════════════════════════════
--  보낸 기록 남기기
-- ════════════════════════════════════════════════════════════
create or replace function log_message(
  p_course     uuid,
  p_channel    text,
  p_subject    text,
  p_body       text,
  p_recipients jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
begin
  if not owns_course(p_course) then
    raise exception '이 과목에 기록할 권한이 없습니다.';
  end if;

  insert into message_log (course_id, channel, subject, body, recipients, recipient_count, sent_by)
  values (
    p_course, p_channel, nullif(p_subject, ''), p_body,
    coalesce(p_recipients, '[]'::jsonb),
    coalesce(jsonb_array_length(p_recipients), 0),
    auth.uid()
  )
  returning id into new_id;

  return new_id;
end $$;

revoke all on function log_message(uuid, text, text, text, jsonb) from public, anon;
grant execute on function log_message(uuid, text, text, text, jsonb) to authenticated;

-- ════════════════════════════════════════════════════════════
--  PostgREST 스키마 캐시 새로 읽기
-- ════════════════════════════════════════════════════════════
notify pgrst, 'reload schema';

select
  to_regclass('public.message_templates') as "0013_문안",
  to_regclass('public.message_log')       as "0013_보낸기록";
