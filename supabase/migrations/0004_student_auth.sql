-- ════════════════════════════════════════════════════════════════
--  학생 인증을 "직접 서명한 JWT" → "진짜 Supabase Auth 세션" 으로 변경
--
--  왜 바꾸는가
--  ─────────────────────────────────────────────────────────────
--  처음에는 Edge Function 이 프로젝트 JWT 시크릿으로 HS256 토큰을 직접
--  서명했다. 그런데 요즘 만들어지는 Supabase 프로젝트는 서명 키가
--  **ES256(비대칭)** 이 기본이고, HS256 공유 시크릿은 legacy 로만 남는다.
--  legacy 키가 살아 있는 동안은 동작하지만, 그 키를 폐기하는 순간
--  학생 로그인이 전부 죽는다. 언젠가 반드시 터질 지뢰라 지금 제거한다.
--
--  바뀐 방식
--  ─────────────────────────────────────────────────────────────
--  Edge Function 이 명단을 대조한 뒤, 그 학생에 대응하는 auth 사용자로
--  **정상 로그인 세션**을 만들어 준다. 토큰은 Supabase 가 자기 키로 서명하므로
--  키 종류가 뭐든, 나중에 회전하든 상관없이 동작한다.
--
--  학생 식별자는 JWT 의 app_metadata 에 실린다.
--  app_metadata 는 **서버만 쓸 수 있고 사용자가 고칠 수 없다** —
--  학생이 자기 토큰을 손봐서 남의 student_id 를 주장할 수 없다는 뜻이다.
-- ════════════════════════════════════════════════════════════════

-- 명단 한 줄 ↔ auth 사용자 하나를 잇는다.
alter table students
  add column if not exists auth_user_id uuid unique references auth.users(id) on delete set null;

-- ── 클레임 헬퍼 재정의 ───────────────────────────────────────
-- 이전: 최상위 커스텀 클레임(student_id) 을 읽었다.
-- 이후: app_metadata 안을 읽는다. 최상위도 계속 지원해 기존 토큰이 만료될
--       때까지 로그인이 끊기지 않게 한다.
create or replace function jwt_student_id() returns uuid
language sql stable as $$
  select nullif(coalesce(
    current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'student_id',
    current_setting('request.jwt.claims', true)::jsonb ->> 'student_id',
    ''), '')::uuid
$$;

create or replace function jwt_course_id() returns uuid
language sql stable as $$
  select nullif(coalesce(
    current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'course_id',
    current_setting('request.jwt.claims', true)::jsonb ->> 'course_id',
    ''), '')::uuid
$$;

-- ── 교수 계정이 학생 정책에 걸려들지 않게 ────────────────────
-- 교수도 이제 학생과 같은 auth.users 안에 있다. 교수 토큰에는
-- app_metadata.student_id 가 없으므로 jwt_student_id() 가 null 이 되고,
-- 학생용 정책은 자연히 아무것도 매칭하지 않는다. 별도 조치가 필요 없다.

-- ── 명단에서 학생을 지우면 auth 사용자도 남지 않도록 ─────────
create or replace function drop_student_auth_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.auth_user_id is not null then
    delete from auth.users where id = old.auth_user_id;
  end if;
  return old;
end $$;

drop trigger if exists trg_drop_student_auth_user on students;
create trigger trg_drop_student_auth_user
after delete on students
for each row execute function drop_student_auth_user();
