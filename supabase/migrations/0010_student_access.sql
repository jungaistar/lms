-- ════════════════════════════════════════════════════════════════
--  학생 입장 방식 바꾸기 — 수업코드 → 이메일 + 학번 + 이름 + 교수 승인
--
--  왜 바꾸나
--    수업코드는 한 번 새어 나가면 막을 방법이 없다. 단톡방에 올라가면
--    수강생이 아닌 사람도 학번만 알면 들어온다.
--    새 방식은 **명단에 있는 사람**만, 그리고 **교수가 승인한 뒤에만** 들어온다.
--
--  어떻게 도나
--    ① 학생이 이메일 · 학번 · 이름을 넣는다 (수업코드 없음)
--    ② 학번 + 이름으로 명단을 대조한다. 못 맞추면 거기서 끝이다
--    ③ 맞으면 승인 대기 줄이 생긴다
--    ④ 교수가 '입장 승인' 화면에서 승인한다
--    ⑤ 그 뒤부터 같은 이메일 · 학번 · 이름으로 들어온다
--
--  이메일은 승인 뒤 **두 번째 열쇠**가 된다. 승인된 줄의 이메일과 다르면
--  들여보내지 않는다. 미리 승인해 둔 줄(이메일 없음)은 첫 로그인 때 묶인다.
--
--  판정은 전부 Edge Function(service_role) 이 한다. 학생 토큰으로는
--  이 표를 읽을 수 없다 — 남이 승인됐는지도 알 수 없어야 한다.
-- ════════════════════════════════════════════════════════════════

-- ── 과목마다 입장 방식을 고른다 ──────────────────────────────
-- 기본은 새 방식이다. 옛 방식으로 돌리고 싶은 과목만 'code' 로 바꾼다.
alter table courses
  add column if not exists entry_mode text not null default 'approval'
      check (entry_mode in ('code', 'approval'));

comment on column courses.entry_mode is
  'code = 수업코드 + 학번 (옛 방식) / approval = 이메일 + 학번 + 이름 + 교수 승인';

-- ── 입장 신청과 승인 ─────────────────────────────────────────
create table if not exists student_access (
  id           uuid primary key default gen_random_uuid(),
  course_id    uuid not null references courses(id) on delete cascade,
  student_id   uuid not null references students(id) on delete cascade,
  -- 학생이 낸 이메일. 미리 승인해 둔 줄은 비어 있고 첫 로그인 때 채워진다.
  email        text,
  status       text not null default 'pending'
               check (status in ('pending', 'approved', 'rejected')),
  requested_at timestamptz,
  decided_at   timestamptz,
  note         text,
  -- 마지막으로 들어온 시각. 교수가 "아직 한 번도 안 들어온 학생" 을 볼 수 있게.
  last_login_at timestamptz,
  unique (course_id, student_id)
);

create index if not exists student_access_course_idx on student_access(course_id, status);

comment on table student_access is
  '학생 입장 신청과 승인. 판정은 Edge Function 이 service_role 로 한다.';

alter table student_access enable row level security;

drop policy if exists sa_owner_all on student_access;
create policy sa_owner_all on student_access
  for all using (owns_course(course_id)) with check (owns_course(course_id));

-- 학생 정책은 만들지 않는다. 남이 승인됐는지 알 필요가 없고,
-- 자기 상태는 로그인 응답으로 받는다. 화면에서 가리는 방식이 아니다.

-- ── 명단에 없는 사람이 시도한 기록 ───────────────────────────
-- 표를 따로 만들지 않고 audit_log 에 남긴다. 교수가 "누가 못 들어왔나" 를
-- 확인할 수 있어야 하지만, 아무나 줄을 만들 수 있게 하면 스팸이 된다.
-- (Edge Function 이 넣는다. 이 마이그레이션은 자리만 확인한다.)

-- ════════════════════════════════════════════════════════════
--  교수용 — 일괄 승인
--
--  방식을 바꾸는 순간 전원이 대기 상태가 되면 수업이 멈춘다.
--  명단을 미리 통째로 승인해 두면 학생은 첫 로그인에 바로 들어온다.
--  그때 이메일이 묶인다.
-- ════════════════════════════════════════════════════════════
create or replace function approve_all_access(p_course uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare n int;
begin
  if not owns_course(p_course) then
    raise exception '이 과목을 수정할 권한이 없습니다.';
  end if;

  insert into student_access (course_id, student_id, status, decided_at)
  select p_course, s.id, 'approved', now()
    from students s
   where s.course_id = p_course and s.active
  on conflict (course_id, student_id) do update
    set status = 'approved',
        decided_at = now()
    where student_access.status <> 'approved';

  get diagnostics n = row_count;

  insert into audit_log(actor, action, course_id, detail)
  values ('teacher:' || coalesce(auth.uid()::text, '?'), 'approve_all_access', p_course,
          jsonb_build_object('rows', n));

  return n;
end $$;

revoke all on function approve_all_access(uuid) from public, anon;
grant execute on function approve_all_access(uuid) to authenticated;

-- ════════════════════════════════════════════════════════════
--  교수용 — 입장 현황 한 줄로 읽기
--
--  명단 전원이 나온다. 아직 신청하지 않은 학생도 'none' 으로 보여야
--  "누가 아직 안 들어왔는지" 를 알 수 있다.
-- ════════════════════════════════════════════════════════════
create or replace function access_list(p_course uuid)
returns table (
  student_id    uuid,
  student_no    text,
  name          text,
  team_name     text,
  email         text,
  status        text,
  requested_at  timestamptz,
  decided_at    timestamptz,
  last_login_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select s.id, s.student_no, s.name, t.name,
         a.email,
         coalesce(a.status, 'none'),
         a.requested_at, a.decided_at, a.last_login_at
    from students s
    left join teams t on t.id = s.team_id
    left join student_access a on a.student_id = s.id and a.course_id = p_course
   where s.course_id = p_course
     and s.active
     and owns_course(p_course)
   order by
     -- 처리할 것이 위로 온다
     case coalesce(a.status, 'none')
       when 'pending' then 0 when 'none' then 1
       when 'rejected' then 2 else 3 end,
     s.student_no
$$;

revoke all on function access_list(uuid) from public, anon;
grant execute on function access_list(uuid) to authenticated;

-- ════════════════════════════════════════════════════════════
--  교수용 — 한 명 승인 / 거절 / 되돌리기
--
--  화면에서 student_access 를 직접 고칠 수도 있지만, 아직 줄이 없는
--  학생(미리 승인)까지 한 길로 처리하려고 함수로 둔다.
-- ════════════════════════════════════════════════════════════
create or replace function set_access_status(
  p_course uuid, p_student uuid, p_status text, p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not owns_course(p_course) then
    raise exception '이 과목을 수정할 권한이 없습니다.';
  end if;
  if p_status not in ('pending', 'approved', 'rejected') then
    raise exception '알 수 없는 상태입니다: %', p_status;
  end if;
  if not exists (select 1 from students where id = p_student and course_id = p_course) then
    raise exception '이 과목의 학생이 아닙니다.';
  end if;

  insert into student_access (course_id, student_id, status, decided_at, note)
  values (p_course, p_student, p_status, now(), p_note)
  on conflict (course_id, student_id) do update
    set status = excluded.status,
        decided_at = now(),
        note = coalesce(excluded.note, student_access.note);

  insert into audit_log(actor, action, course_id, detail)
  values ('teacher:' || coalesce(auth.uid()::text, '?'), 'set_access_status', p_course,
          jsonb_build_object('student_id', p_student, 'status', p_status));
end $$;

revoke all on function set_access_status(uuid, uuid, text, text) from public, anon;
grant execute on function set_access_status(uuid, uuid, text, text) to authenticated;

-- ════════════════════════════════════════════════════════════
--  교수용 — 승인된 이메일 풀기
--
--  학생이 이메일을 잘못 넣고 승인받았거나 메일 주소가 바뀐 경우.
--  이메일만 비우면 다음 로그인 때 새 주소가 다시 묶인다.
-- ════════════════════════════════════════════════════════════
create or replace function clear_access_email(p_course uuid, p_student uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not owns_course(p_course) then
    raise exception '이 과목을 수정할 권한이 없습니다.';
  end if;

  update student_access set email = null
   where course_id = p_course and student_id = p_student;

  insert into audit_log(actor, action, course_id, detail)
  values ('teacher:' || coalesce(auth.uid()::text, '?'), 'clear_access_email', p_course,
          jsonb_build_object('student_id', p_student));
end $$;

revoke all on function clear_access_email(uuid, uuid) from public, anon;
grant execute on function clear_access_email(uuid, uuid) to authenticated;
