-- ════════════════════════════════════════════════════════════════
--  회원가입 · 회원관리
--
--  교수는 스스로 회원가입한다. 다만 가입 즉시 쓸 수 있는 게 아니라
--  **승인 대기(pending)** 상태로 들어오고, 관리자가 승인해야 과목을 만들 수 있다.
--  승인 절차가 없으면 아무나 가입해 학생 명단을 올릴 수 있게 된다.
--
--  관리자는 이메일로 하드코딩한다. DB 안에 박아두는 이유:
--  프론트에서 판단하면 클라이언트를 고쳐서 관리자 행세를 할 수 있지만,
--  여기에 두면 RLS 가 JWT 의 email 클레임을 직접 보고 판단한다.
-- ════════════════════════════════════════════════════════════════

create or replace function admin_email() returns text
language sql immutable as $$ select 'radical8566@gmail.com' $$;

create table if not exists profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  name        text,
  role        text not null default 'teacher' check (role in ('admin','teacher')),
  status      text not null default 'pending' check (status in ('pending','approved','suspended')),
  affiliation text,                        -- 소속 (가입 시 입력)
  note        text,                        -- 관리자 메모
  created_at  timestamptz not null default now(),
  approved_at timestamptz,
  approved_by uuid references auth.users(id) on delete set null
);

create index if not exists idx_profiles_status on profiles(status);

-- ── 가입하면 프로필이 자동으로 생긴다 ────────────────────────
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  is_admin_user boolean;
begin
  -- 학생 계정은 회원이 아니다. student-login 이 만든 내부 계정이므로 건너뛴다.
  if coalesce(new.raw_app_meta_data ->> 'user_kind', '') = 'student'
     or new.email like '%@students.invalid' then
    return new;
  end if;

  is_admin_user := lower(coalesce(new.email, '')) = admin_email();

  insert into profiles (id, email, name, affiliation, role, status, approved_at)
  values (
    new.id,
    lower(new.email),
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'name'), ''), split_part(new.email, '@', 1)),
    nullif(btrim(new.raw_user_meta_data ->> 'affiliation'), ''),
    case when is_admin_user then 'admin'    else 'teacher' end,
    -- 관리자는 자기 자신을 승인할 사람이 없으므로 바로 승인 상태로 들어온다.
    case when is_admin_user then 'approved' else 'pending' end,
    case when is_admin_user then now()      else null      end
  )
  on conflict (id) do nothing;

  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function handle_new_user();

-- 트리거가 생기기 전에 만들어진 계정 보정
insert into profiles (id, email, name, role, status, approved_at)
select u.id, lower(u.email), split_part(u.email, '@', 1),
       case when lower(u.email) = admin_email() then 'admin' else 'teacher' end,
       case when lower(u.email) = admin_email() then 'approved' else 'pending' end,
       case when lower(u.email) = admin_email() then now() else null end
  from auth.users u
 where u.email is not null
   and u.email not like '%@students.invalid'
   and coalesce(u.raw_app_meta_data ->> 'user_kind', '') <> 'student'
on conflict (id) do nothing;

-- ── 판정 함수 ────────────────────────────────────────────────
-- 관리자 여부는 JWT 의 email 클레임으로 직접 판단한다.
-- profiles.role 을 보지 않는 이유: role 컬럼이 잘못 바뀌어도 관리자 권한이
-- 넘어가지 않게, 진실의 출처를 하나(하드코딩된 이메일)로 묶어두기 위해서다.
create or replace function is_admin() returns boolean
language sql stable as $$
  select lower(coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'email', '')) = admin_email()
$$;

create or replace function is_approved() returns boolean
language sql stable security definer set search_path = public as $$
  select is_admin() or exists (
    select 1 from profiles p where p.id = auth.uid() and p.status = 'approved'
  )
$$;

alter table profiles enable row level security;

-- 본인 프로필은 본인이 본다 (승인 상태를 화면에 보여줘야 하므로).
create policy profile_self_read on profiles
  for select using (id = auth.uid() or is_admin());

-- 상태·역할 변경은 관리자만. 본인이 자기 status 를 approved 로 바꿀 수 없다.
create policy profile_admin_update on profiles
  for update using (is_admin()) with check (is_admin());

create policy profile_admin_delete on profiles
  for delete using (is_admin());

-- INSERT 정책이 없다 = 클라이언트에서 프로필을 만들 수 없다.
-- 생성 경로는 위 트리거(security definer)뿐이다.

-- ── 승인된 사람만 과목을 만들 수 있다 ────────────────────────
drop policy if exists course_owner_all on courses;

create policy course_owner_select on courses
  for select using (owner_id = auth.uid() or is_admin());

-- 여기가 승인 절차의 이빨이다. 승인 전에는 과목 생성이 막힌다.
create policy course_owner_insert on courses
  for insert with check (owner_id = auth.uid() and is_approved());

create policy course_owner_update on courses
  for update using (owner_id = auth.uid() and is_approved())
  with check (owner_id = auth.uid());

create policy course_owner_delete on courses
  for delete using (owner_id = auth.uid() or is_admin());

-- ── 관리자용 회원 목록 ───────────────────────────────────────
-- 관리자는 회원과 그 규모(과목·학생 수)만 본다.
-- 평가 내용이나 점수는 보지 않는다 — 관리 권한이 남의 수업 내부를 들여다볼
-- 이유가 없고, owns_course() 를 건드리지 않았으므로 실제로 접근도 안 된다.
create or replace function admin_member_list()
returns table (
  id           uuid,
  email        text,
  name         text,
  affiliation  text,
  role         text,
  status       text,
  note         text,
  created_at   timestamptz,
  approved_at  timestamptz,
  course_count int,
  student_count int,
  last_sign_in timestamptz
)
language sql stable security definer set search_path = public as $$
  select p.id, p.email, p.name, p.affiliation, p.role, p.status, p.note,
         p.created_at, p.approved_at,
         (select count(*) from courses c where c.owner_id = p.id)::int,
         (select count(*) from students s
            join courses c on c.id = s.course_id
           where c.owner_id = p.id and s.active)::int,
         u.last_sign_in_at
    from profiles p
    left join auth.users u on u.id = p.id
   where is_admin()
   order by
     case p.status when 'pending' then 0 when 'approved' then 1 else 2 end,
     p.created_at desc
$$;

-- 승인 / 보류 / 정지
create or replace function admin_set_member_status(p_user uuid, p_status text, p_note text default null)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then
    raise exception '관리자만 회원 상태를 바꿀 수 있습니다.';
  end if;
  if p_status not in ('pending', 'approved', 'suspended') then
    raise exception '알 수 없는 상태입니다: %', p_status;
  end if;
  if p_user = auth.uid() then
    raise exception '자기 자신의 상태는 바꿀 수 없습니다.';
  end if;

  update profiles
     set status      = p_status,
         note        = coalesce(p_note, note),
         approved_at = case when p_status = 'approved' then now() else approved_at end,
         approved_by = case when p_status = 'approved' then auth.uid() else approved_by end
   where id = p_user;

  insert into audit_log (actor, action, detail)
  values ('admin:' || auth.uid(), 'set_member_status',
          jsonb_build_object('user_id', p_user, 'status', p_status));
end $$;

grant execute on function admin_member_list() to authenticated;
grant execute on function admin_set_member_status(uuid, text, text) to authenticated;
grant execute on function is_admin(), is_approved() to authenticated;
