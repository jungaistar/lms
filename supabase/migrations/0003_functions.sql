-- ════════════════════════════════════════════════════════════════
--  RPC — 배정 생성, 결과 집계, 학생용 조회
--  계산 로직을 DB에 두는 이유: 클라이언트가 보낸 점수를 신뢰하지 않기 위해서.
-- ════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────
--  배정 생성
--  대상 하나당 evaluators_per_target 명을 배정한다.
--  · 자기 자신 / 자기 팀은 평가하지 않는다 (자기평가 방지)
--  · 이미 배정이 적은 학생부터 뽑아 부담을 고르게 나눈다
--  · 이미 만들어진 배정은 유지하고 모자란 만큼만 채운다 (재실행 안전)
-- ────────────────────────────────────────────────────────────
create or replace function generate_assignments(p_activity uuid)
returns table (target_id uuid, added int)
language plpgsql security definer set search_path = public as $$
declare
  v_course uuid;
  v_n      int;
  t        record;
  need     int;
begin
  select course_id, evaluators_per_target into v_course, v_n
    from activities where id = p_activity;
  if v_course is null then raise exception '활동을 찾을 수 없습니다.'; end if;
  if not owns_course(v_course) then raise exception '이 과목의 담당자가 아닙니다.'; end if;

  for t in select * from targets where activity_id = p_activity order by ord, title loop
    select v_n - count(*) into need from assignments
      where activity_id = p_activity and assignments.target_id = t.id;
    if need <= 0 then
      target_id := t.id; added := 0; return next; continue;
    end if;

    insert into assignments (activity_id, evaluator_id, target_id)
    select p_activity, s.id, t.id
      from students s
      left join lateral (
        select count(*) c from assignments a where a.evaluator_id = s.id and a.activity_id = p_activity
      ) ld on true
     where s.course_id = v_course
       and s.active
       -- 자기 자신은 평가 대상에서 제외
       and (t.student_id is null or s.id <> t.student_id)
       -- 팀 대상이면 그 팀 소속은 제외
       and (t.team_id is null or s.team_id is distinct from t.team_id)
       -- 이미 이 대상에 배정된 사람 제외
       and not exists (select 1 from assignments a
                        where a.target_id = t.id and a.evaluator_id = s.id)
     order by ld.c asc, random()
     limit need;

    target_id := t.id;
    added := need;
    return next;
  end loop;

  insert into audit_log(actor, action, course_id, detail)
  values ('teacher:' || auth.uid(), 'generate_assignments', v_course,
          jsonb_build_object('activity_id', p_activity));
end $$;

-- ────────────────────────────────────────────────────────────
--  결과 집계
--
--  normalize
--   · none   : 받은 점수 단순 평균
--   · trim   : 평가자 4명 이상이면 최고·최저 1개씩 버리고 평균 (극단값 방어)
--   · zscore : 평가자별 관대함을 보정. 짜게 주는 평가자와 후하게 주는
--              평가자가 섞여 있을 때 대상 간 비교를 공정하게 만든다.
--
--  최종 점수 = 정규화 점수 × (만점/100) × (1 − 감점비율 × 미제출률)
--  → 남을 평가하지 않은 학생은 자기 점수도 깎인다.
-- ────────────────────────────────────────────────────────────
create or replace function compute_results(p_activity uuid)
returns int
language plpgsql security definer set search_path = public as $$
declare
  a        activities%rowtype;
  n_rows   int;
begin
  select * into a from activities where id = p_activity;
  if a.id is null then raise exception '활동을 찾을 수 없습니다.'; end if;
  if not owns_course(a.course_id) then raise exception '이 과목의 담당자가 아닙니다.'; end if;

  if a.kind = 'team_contribution' then
    return compute_contribution_results(p_activity);
  end if;

  with submitted as (
    select s.target_id, s.evaluator_id, e.raw_total
      from assignments s
      join evaluations e on e.assignment_id = s.id
     where s.activity_id = p_activity
       and e.submitted_at is not null
       and e.raw_total is not null
  ),
  -- 평가자별 평균·표준편차 (관대함 보정용)
  by_evaluator as (
    select evaluator_id, avg(raw_total) m, coalesce(stddev_samp(raw_total), 0) sd, count(*) c
      from submitted group by evaluator_id
  ),
  overall as (
    select avg(raw_total) m, coalesce(stddev_samp(raw_total), 0) sd from submitted
  ),
  normalized as (
    select sb.target_id,
           sb.evaluator_id,
           case
             when a.normalize = 'zscore'
                  and be.c >= 3 and be.sd > 0 and ov.sd > 0
               then ov.m + (sb.raw_total - be.m) * (ov.sd / be.sd)
             else sb.raw_total
           end as v
      from submitted sb
      join by_evaluator be on be.evaluator_id = sb.evaluator_id
      cross join overall ov
  ),
  ranked as (
    select target_id, v,
           row_number() over (partition by target_id order by v)      lo,
           row_number() over (partition by target_id order by v desc) hi,
           count(*)     over (partition by target_id)                 c
      from normalized
  ),
  per_target as (
    select target_id,
           round(avg(v) filter (
             where a.normalize <> 'trim' or c < 4 or (lo > 1 and hi > 1)
           )::numeric, 2) as score,
           max(c) as evaluator_count
      from ranked group by target_id
  ),
  -- 대상 → 학생 펼치기 (팀 대상이면 팀원 전원에게 같은 점수)
  per_student as (
    select coalesce(t.student_id, st.id) as student_id,
           pt.score, pt.evaluator_count
      from per_target pt
      join targets t on t.id = pt.target_id
      left join students st on t.team_id is not null
                           and st.team_id = t.team_id
                           and st.active
  ),
  -- 각 학생의 평가 참여율
  participation as (
    select s.evaluator_id as student_id,
           count(*) filter (where e.submitted_at is not null)::numeric / nullif(count(*), 0) as rate
      from assignments s
      left join evaluations e on e.assignment_id = s.id
     where s.activity_id = p_activity
     group by s.evaluator_id
  )
  insert into results (activity_id, student_id, raw_score, adjusted_score,
                       participation_rate, evaluator_count, final_score, computed_at)
  select p_activity,
         ps.student_id,
         ps.score,
         ps.score,
         coalesce(pa.rate, 0),
         ps.evaluator_count,
         round(ps.score * (a.max_points / 100.0)
               * (1 - a.participation_penalty * (1 - coalesce(pa.rate, 0))), 2),
         now()
    from per_student ps
    left join participation pa on pa.student_id = ps.student_id
   where ps.student_id is not null
  on conflict (activity_id, student_id) do update set
      raw_score          = excluded.raw_score,
      adjusted_score     = excluded.adjusted_score,
      participation_rate = excluded.participation_rate,
      evaluator_count    = excluded.evaluator_count,
      final_score        = excluded.final_score,
      computed_at        = now()
   -- 교수가 이미 확정한 결과는 재계산으로 덮지 않는다.
   where results.status <> 'approved';

  get diagnostics n_rows = row_count;

  insert into audit_log(actor, action, course_id, detail)
  values ('teacher:' || auth.uid(), 'compute_results', a.course_id,
          jsonb_build_object('activity_id', p_activity, 'rows', n_rows));

  return n_rows;
end $$;

-- ────────────────────────────────────────────────────────────
--  팀 기여도 집계
--
--  각 팀원이 나머지 팀원에게 100점을 나눠 준다.
--  균등 기여라면 한 사람당 100/(팀원수−1)점을 받는다. 이걸 기준(expected)으로
--  실제로 받은 평균이 기준의 몇 배인지(factor)를 계산한다.
--
--  factor 1.0 = 제 몫을 했다.  0.6 = 기대의 60%만 기여했다고 팀원들이 봤다.
--  최종 점수 = 만점 × min(factor, 1.0)
--    → 상한은 팀 만점. 무임승차는 깎이고, 더 한 사람이 남의 점수를 뺏지는 않는다.
--    → 더 보상하고 싶으면 교수가 override_score 로 조정한다.
-- ────────────────────────────────────────────────────────────
create or replace function compute_contribution_results(p_activity uuid)
returns int
language plpgsql security definer set search_path = public as $$
declare
  a      activities%rowtype;
  n_rows int;
begin
  select * into a from activities where id = p_activity;
  if not owns_course(a.course_id) then raise exception '이 과목의 담당자가 아닙니다.'; end if;

  with team_size as (
    select team_id, count(*) n from students
     where course_id = a.course_id and active and team_id is not null
     group by team_id
  ),
  received as (
    select c.ratee_id, avg(c.points) avg_pts, count(*) raters
      from contributions c
     where c.activity_id = p_activity and c.submitted_at is not null
     group by c.ratee_id
  ),
  participation as (
    -- 자기 팀원 전원에게 배분했는가
    select s.id as student_id,
           case when ts.n <= 1 then 1
                else least(1.0, (select count(*) from contributions c
                                  where c.activity_id = p_activity
                                    and c.evaluator_id = s.id
                                    and c.submitted_at is not null)::numeric / (ts.n - 1))
           end as rate
      from students s
      join team_size ts on ts.team_id = s.team_id
     where s.course_id = a.course_id and s.active
  ),
  factored as (
    select s.id as student_id,
           ts.n,
           r.raters,
           case when ts.n <= 1 then 1.0
                else coalesce(r.avg_pts, 0) / (100.0 / (ts.n - 1))
           end as factor
      from students s
      join team_size ts on ts.team_id = s.team_id
      left join received r on r.ratee_id = s.id
     where s.course_id = a.course_id and s.active
  )
  insert into results (activity_id, student_id, raw_score, adjusted_score,
                       participation_rate, evaluator_count, final_score, computed_at)
  select p_activity, f.student_id,
         round(100 * f.factor, 2),
         round(100 * least(f.factor, 1.0), 2),
         coalesce(p.rate, 0),
         coalesce(f.raters, 0),
         round(a.max_points * least(f.factor, 1.0)
               * (1 - a.participation_penalty * (1 - coalesce(p.rate, 0))), 2),
         now()
    from factored f
    left join participation p on p.student_id = f.student_id
  on conflict (activity_id, student_id) do update set
      raw_score          = excluded.raw_score,
      adjusted_score     = excluded.adjusted_score,
      participation_rate = excluded.participation_rate,
      evaluator_count    = excluded.evaluator_count,
      final_score        = excluded.final_score,
      computed_at        = now()
   where results.status <> 'approved';

  get diagnostics n_rows = row_count;
  return n_rows;
end $$;

-- ────────────────────────────────────────────────────────────
--  학생용 — 내가 해야 할 평가 목록
-- ────────────────────────────────────────────────────────────
create or replace function my_tasks()
returns table (
  activity_id   uuid,
  activity_kind text,
  activity_title text,
  closes_at     timestamptz,
  assignment_id uuid,
  target_id     uuid,
  target_title  text,
  submitted     boolean
)
language sql stable security definer set search_path = public as $$
  select a.id, a.kind, a.title, a.closes_at,
         s.id, t.id, t.title,
         (e.submitted_at is not null) as submitted
    from assignments s
    join activities a on a.id = s.activity_id
    join targets    t on t.id = s.target_id
    left join evaluations e on e.assignment_id = s.id
   where s.evaluator_id = jwt_student_id()
     and a.status in ('open','closed','finalized')
   order by (e.submitted_at is not null), a.closes_at nulls last, t.ord, t.title
$$;

-- ────────────────────────────────────────────────────────────
--  학생용 — 내가 받은 피드백
--
--  확정된 공개 정책: **코멘트만 익명으로, 점수는 절대 내보내지 않는다.**
--  평가자 신원도 반환하지 않는다. 반환 컬럼에 점수가 아예 없으므로
--  클라이언트를 조작해도 점수를 얻을 수 없다.
--
--  코멘트 순서는 활동+코멘트 해시로 섞어, 배정 순서에서 평가자를 역추적하지 못하게 한다.
-- ────────────────────────────────────────────────────────────
create or replace function my_feedback()
returns table (
  activity_id    uuid,
  activity_title text,
  target_title   text,
  comment        text
)
language sql stable security definer set search_path = public as $$
  select a.id, a.title, t.title, e.comment
    from evaluations e
    join assignments s on s.id = e.assignment_id
    join targets     t on t.id = s.target_id
    join activities  a on a.id = s.activity_id
    left join students me on me.id = jwt_student_id()
   where e.submitted_at is not null
     and a.show_comments_to_students
     and a.status in ('closed','finalized')
     and coalesce(nullif(btrim(e.comment), ''), '') <> ''
     -- 나에 대한 평가만: 개인 대상이면 나, 팀 대상이면 내 팀
     and ( t.student_id = jwt_student_id()
        or (t.team_id is not null and t.team_id = me.team_id) )
   order by a.created_at desc, md5(e.id::text || a.id::text)
$$;

-- 팀 기여도 코멘트도 같은 규칙으로
create or replace function my_contribution_feedback()
returns table (activity_id uuid, activity_title text, comment text)
language sql stable security definer set search_path = public as $$
  select a.id, a.title, c.comment
    from contributions c
    join activities a on a.id = c.activity_id
   where c.ratee_id = jwt_student_id()
     and c.submitted_at is not null
     and a.show_comments_to_students
     and a.status in ('closed','finalized')
     and coalesce(nullif(btrim(c.comment), ''), '') <> ''
   order by md5(c.id::text)
$$;

-- ────────────────────────────────────────────────────────────
--  교수용 — 활동 진행 현황
-- ────────────────────────────────────────────────────────────
create or replace function activity_progress(p_activity uuid)
returns table (
  assigned    int,
  submitted   int,
  targets     int,
  evaluators  int,
  min_per_target int
)
language sql stable security definer set search_path = public as $$
  select count(*)::int,
         count(*) filter (where e.submitted_at is not null)::int,
         count(distinct s.target_id)::int,
         count(distinct s.evaluator_id)::int,
         coalesce(min(cnt.c), 0)::int
    from assignments s
    left join evaluations e on e.assignment_id = s.id
    left join lateral (
      select count(*) c from assignments a2
        join evaluations e2 on e2.assignment_id = a2.id and e2.submitted_at is not null
       where a2.target_id = s.target_id
    ) cnt on true
   where s.activity_id = p_activity
     and owns_course((select course_id from activities where id = p_activity))
$$;

grant execute on function my_tasks(), my_feedback(), my_contribution_feedback() to anon, authenticated;
grant execute on function generate_assignments(uuid), compute_results(uuid),
                          compute_contribution_results(uuid), activity_progress(uuid) to authenticated;
