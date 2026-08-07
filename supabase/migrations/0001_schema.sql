-- ════════════════════════════════════════════════════════════════
--  동료평가 학습보조 시스템 — 스키마
--
--  역할 두 종류
--   · 교수: Supabase Auth 사용자 (auth.uid())
--   · 학생: Edge Function이 발급한 커스텀 JWT (student_id / course_id 클레임)
--
--  확정된 정책
--   · 학생 로그인 = 학번 + 수업코드
--   · 코멘트만 익명 공개, 점수는 학생에게 비공개
-- ════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;

-- ── 과목 ─────────────────────────────────────────────────────
create table courses (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references auth.users(id) on delete cascade,
  term         text not null,                    -- 202610
  title        text not null,
  class_no     text,                             -- 분반 Y2
  join_code    text not null unique,             -- 학생이 입력할 수업코드
  -- 학교 LMS(*.dunet) 연동 식별자. 성적 내보내기 때만 쓴다.
  ext_course_id text,
  ext_class_no  text,
  created_at   timestamptz not null default now()
);

create table teams (
  id        uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses(id) on delete cascade,
  name      text not null,
  unique (course_id, name)
);

create table students (
  id         uuid primary key default gen_random_uuid(),
  course_id  uuid not null references courses(id) on delete cascade,
  student_no text not null,                      -- 학번
  name       text not null,
  team_id    uuid references teams(id) on delete set null,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  unique (course_id, student_no)
);

-- ── 루브릭 ───────────────────────────────────────────────────
create table rubrics (
  id        uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses(id) on delete cascade,
  title     text not null,
  created_at timestamptz not null default now()
);

create table rubric_items (
  id          uuid primary key default gen_random_uuid(),
  rubric_id   uuid not null references rubrics(id) on delete cascade,
  ord         int  not null default 0,
  label       text not null,
  description text,
  max_score   numeric not null check (max_score > 0),
  weight      numeric not null default 1 check (weight > 0)
);

-- ── 활동 ─────────────────────────────────────────────────────
create table activities (
  id          uuid primary key default gen_random_uuid(),
  course_id   uuid not null references courses(id) on delete cascade,
  kind        text not null check (kind in (
                'presentation',        -- 발표 상호평가
                'discussion',          -- 토론 참여 평가
                'team_contribution',   -- 팀 기여도 (100점 배분)
                'peer_review')),       -- 과제 동료 첨삭
  title       text not null,
  instruction text,
  rubric_id   uuid references rubrics(id) on delete restrict,  -- team_contribution 은 null
  target_kind text not null default 'student' check (target_kind in ('student','team')),

  opens_at    timestamptz,
  closes_at   timestamptz,

  -- 대상 하나당 배정할 평가자 수. 많을수록 안정적이지만 학생 부담이 커진다.
  evaluators_per_target int not null default 5 check (evaluators_per_target between 1 and 30),

  -- 공개 정책 (기본값 = 확정된 정책: 코멘트만 익명 공개, 점수 비공개)
  show_scores_to_students   boolean not null default false,
  show_comments_to_students boolean not null default true,

  -- 성적 반영
  max_points  numeric not null default 100 check (max_points > 0),
  -- none: 원점수 그대로 / trim: 최고·최저 1개씩 제외 / zscore: 평가자 관대함 보정
  normalize   text not null default 'trim' check (normalize in ('none','trim','zscore')),
  -- 평가를 안 한 학생에게 적용할 감점 비율(0~1). 0.3이면 미제출률만큼 최대 30% 감점.
  participation_penalty numeric not null default 0.3
                        check (participation_penalty between 0 and 1),

  status      text not null default 'draft'
              check (status in ('draft','open','closed','finalized')),
  created_at  timestamptz not null default now(),

  -- 루브릭 기반 활동은 루브릭이 반드시 있어야 한다.
  constraint rubric_required check (kind = 'team_contribution' or rubric_id is not null)
);

-- ── 평가 대상 ────────────────────────────────────────────────
-- 발표 조, 토론 글, 첨삭할 과제 등 "평가받는 것"
create table targets (
  id          uuid primary key default gen_random_uuid(),
  activity_id uuid not null references activities(id) on delete cascade,
  student_id  uuid references students(id) on delete cascade,
  team_id     uuid references teams(id) on delete cascade,
  title       text not null,
  content     text,                              -- 과제 본문·발표 요약·링크
  ord         int not null default 0,
  -- 학생 대상이거나 팀 대상이거나, 정확히 하나여야 한다.
  constraint one_owner check ((student_id is null) <> (team_id is null))
);

-- ── 배정: 누가 누구를 평가하는가 ─────────────────────────────
create table assignments (
  id           uuid primary key default gen_random_uuid(),
  activity_id  uuid not null references activities(id) on delete cascade,
  evaluator_id uuid not null references students(id) on delete cascade,
  target_id    uuid not null references targets(id) on delete cascade,
  created_at   timestamptz not null default now(),
  unique (evaluator_id, target_id)
);

-- ── 제출된 평가 ──────────────────────────────────────────────
create table evaluations (
  id            uuid primary key default gen_random_uuid(),
  assignment_id uuid not null unique references assignments(id) on delete cascade,
  comment       text,
  -- 가중 합산 원점수 (0~100 정규화). 저장 트리거가 계산한다.
  raw_total     numeric,
  submitted_at  timestamptz,
  updated_at    timestamptz not null default now()
);

create table evaluation_scores (
  evaluation_id  uuid not null references evaluations(id) on delete cascade,
  rubric_item_id uuid not null references rubric_items(id) on delete cascade,
  score          numeric not null check (score >= 0),
  primary key (evaluation_id, rubric_item_id)
);

-- ── 팀 기여도: 100점 배분 ────────────────────────────────────
create table contributions (
  id           uuid primary key default gen_random_uuid(),
  activity_id  uuid not null references activities(id) on delete cascade,
  evaluator_id uuid not null references students(id) on delete cascade,
  ratee_id     uuid not null references students(id) on delete cascade,
  points       numeric not null check (points >= 0),
  comment      text,
  submitted_at timestamptz,
  unique (activity_id, evaluator_id, ratee_id)
);

-- ── 토론 게시 ────────────────────────────────────────────────
create table discussion_posts (
  id          uuid primary key default gen_random_uuid(),
  activity_id uuid not null references activities(id) on delete cascade,
  author_id   uuid not null references students(id) on delete cascade,
  parent_id   uuid references discussion_posts(id) on delete cascade,
  body        text not null,
  created_at  timestamptz not null default now()
);

-- ── 집계 결과 (교수가 검토·확정) ─────────────────────────────
create table results (
  id                 uuid primary key default gen_random_uuid(),
  activity_id        uuid not null references activities(id) on delete cascade,
  student_id         uuid not null references students(id) on delete cascade,
  raw_score          numeric,      -- 받은 평가 평균 (0~100)
  adjusted_score     numeric,      -- 정규화 적용 후
  participation_rate numeric,      -- 본인이 해야 할 평가 중 제출 비율
  final_score        numeric,      -- 감점까지 반영, max_points 스케일
  evaluator_count    int,
  override_score     numeric,      -- 교수가 손으로 덮어쓴 값
  note               text,
  status             text not null default 'draft'
                     check (status in ('draft','approved')),
  computed_at        timestamptz not null default now(),
  unique (activity_id, student_id)
);

-- ── 감사 로그 ────────────────────────────────────────────────
create table audit_log (
  id         bigserial primary key,
  at         timestamptz not null default now(),
  actor      text not null,        -- 'teacher:<uuid>' | 'student:<uuid>'
  action     text not null,
  course_id  uuid,
  detail     jsonb
);

-- ── 인덱스 ───────────────────────────────────────────────────
create index on students(course_id);
create index on targets(activity_id);
create index on assignments(activity_id);
create index on assignments(evaluator_id);
create index on evaluations(assignment_id);
create index on contributions(activity_id, evaluator_id);
create index on discussion_posts(activity_id, created_at);
create index on results(activity_id);
create index on audit_log(course_id, at desc);

-- ════════════════════════════════════════════════════════════
--  원점수 자동 계산
--  루브릭 항목별 (score / max_score) 을 weight 로 가중평균해 0~100 으로 만든다.
--  항목 배점이 서로 달라도 공정하게 합산된다.
-- ════════════════════════════════════════════════════════════
create or replace function recalc_evaluation_total() returns trigger
language plpgsql as $$
declare
  eid uuid := coalesce(new.evaluation_id, old.evaluation_id);
  total numeric;
begin
  select case when sum(ri.weight) = 0 then null
              else round(100 * sum((es.score / ri.max_score) * ri.weight) / sum(ri.weight), 2)
         end
    into total
    from evaluation_scores es
    join rubric_items ri on ri.id = es.rubric_item_id
   where es.evaluation_id = eid;

  update evaluations set raw_total = total, updated_at = now() where id = eid;
  return null;
end $$;

create trigger trg_recalc_total
after insert or update or delete on evaluation_scores
for each row execute function recalc_evaluation_total();

-- 루브릭 항목 만점을 넘는 점수를 막는다. CHECK 로는 다른 테이블을 볼 수 없어 트리거로 처리.
create or replace function check_score_range() returns trigger
language plpgsql as $$
declare mx numeric;
begin
  select max_score into mx from rubric_items where id = new.rubric_item_id;
  if new.score > mx then
    raise exception '점수 %는 이 항목의 만점 %를 넘습니다.', new.score, mx;
  end if;
  return new;
end $$;

create trigger trg_check_score_range
before insert or update on evaluation_scores
for each row execute function check_score_range();
