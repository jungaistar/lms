# 마이그레이션 적용하기

`0001` ~ `0005` 는 이미 적용되어 있다. 여기서는 **`0006` · `0007` · `0008` 과 시드**를 올린다.

Supabase CLI 는 이 PC 에 깔려 있지 않아서 **대시보드 SQL Editor** 로 간다.
(CLI 를 쓰고 싶으면 맨 아래 참고)

## 0. 먼저 확인할 것

교수 계정이 **이미 회원가입되어 있어야 한다.** 시드가 이메일로 그 계정을 찾아
과목 주인을 정하기 때문이다.

```sql
select email from auth.users order by created_at;
```

`radical8566@gmail.com` 이 보이면 된다. 없으면 앱에서 먼저 회원가입한다.

## 1. SQL Editor 열기

1. https://supabase.com/dashboard 접속
2. 프로젝트 `aujvpcpjpgxghxmsheur` 선택
3. 왼쪽 메뉴에서 **SQL Editor** → **New query**

## 2. 마이그레이션 세 개를 순서대로

파일 내용을 통째로 복사해 붙여넣고 **Run** 을 누른다. **한 번에 하나씩, 순서대로.**

| 순서 | 파일 | 무엇이 생기나 |
|---|---|---|
| 1 | `supabase/migrations/0006_course_ops.sql` | 주차·회차 · 공지 · 자료 · 과제 · 출석 · 시험 · 성적 |
| 2 | `supabase/migrations/0007_deductions_heyyoung.sql` | 감점 항목 · 기타 성적 · 헤이영 이의신청/유고결석 |
| 3 | `supabase/migrations/0008_fix_task_submission_insert.sql` | 학생이 자기 점수를 넣던 구멍 막기 |

`Success. No rows returned` 가 나오면 된 것이다.

**앞 단계가 실패하면 다음으로 넘어가지 말 것.** `0007` 은 `0006` 이 만든 표를
고치고, `0008` 은 `0006` 의 정책을 갈아 끼운다.

### 두 번 실행해도 되나

된다. `create table if not exists` · `add column if not exists` ·
`drop policy if exists` 로 쓰여 있어서 다시 돌려도 같은 상태가 된다.

## 3. 시드 — 6과목 만들기

`supabase/seed/2026-1-courses.sql` 을 같은 방식으로 붙여넣고 실행한다.

맨 끝의 확인 질의가 이런 표를 돌려주면 성공이다.

| title | class_no | join_code | peer_assessment | project_mode | … | weeks |
|---|---|---|---|---|---|---|
| 1인예술과창업실무 | Y2 | ART26Y2 | true | individual | | 15 |
| 문화예술콘텐츠창업 | Y5 | CUL26Y5 | true | **team** | | 15 |
| 문화예술콘텐츠창업 | Y6 | CUL26Y6 | true | **team** | | 15 |
| 자원관리능력 | Y1 | RES26Y1 | **false** | individual | | 15 |
| 창업과기업가정신 | Y4 | ENT26Y4 | true | individual | | 15 |
| 취업과경력개발 | Y3 | CAR26Y3 | true | individual | | 15 |

여섯 줄이 나오고 `weeks` 가 전부 15 면 된 것이다.

### 시드가 `auth.uid()` 를 못 쓰는 이유

SQL Editor 는 `postgres` 역할로 돌아서 `auth.uid()` 가 **NULL** 이다.
그대로 두면 `owner_id` 가 NULL 이 되어 NOT NULL 위반으로 통째로 실패한다.

그래서 시드 맨 앞에 `teacher_id()` 를 잠깐 만들어 이메일로 계정을 찾고,
끝나면 지운다. 교수 이메일이 다르면 `TEACHER_EMAIL` **한 줄만** 고치면 된다.

같은 이유로 시드는 `seed_deduction_kinds()` 를 부르지 않고 감점 항목을 직접
넣는다 — 그 함수는 `owns_course()` 로 소유자를 확인하는데 SQL Editor 에서는
`auth.uid()` 가 NULL 이라 걸리기 때문이다.

## 4. 잘 올라갔는지 확인

```sql
-- 새 표가 다 있나 (12 개가 나와야 한다)
select count(*) from information_schema.tables
 where table_schema = 'public'
   and table_name in ('course_weeks','course_sessions','notices','materials',
                      'tasks','task_submissions','attendance','attendance_imports',
                      'exams','exam_scores','grade_policies','final_grades');

-- 감점 항목이 과목마다 5 개씩 (6과목 × 5 = 30)
select count(*) from deduction_kinds;

-- 시험이 과목마다 2 개씩 (6과목 × 2 = 12)
select kind, count(*) from exams group by kind;

-- 0008 이 걸렸나 — score 조건이 보여야 한다
select with_check from pg_policies
 where tablename = 'task_submissions' and policyname = 'task_sub_student_insert';
```

## 5. 앱에서 확인

교수 계정으로 로그인하면 과목 6개가 보인다. 아무 과목이나 열어

- **주차** 탭에 15주차, 8주차와 15주차 제목에 중간·기말 표시
- **감점** 탭에 항목 5개
- **성적** 탭에 구성비와 시험 두 개
- **자원관리능력**만 루브릭·평가 활동 탭이 없음 (상호평가를 안 쓰는 과목)

여기까지 보이면 적용이 끝난 것이다.

## 문제가 생기면

| 오류 | 뜻 | 할 일 |
|---|---|---|
| `교수 계정(...)을 찾지 못했습니다` | 그 이메일로 가입한 적이 없다 | 앱에서 회원가입 후 다시 실행 |
| `relation "course_weeks" does not exist` | `0006` 을 건너뛰었다 | `0006` 부터 다시 |
| `null value in column "owner_id"` | `auth.uid()` 가 NULL 인 옛 시드를 쓰고 있다 | 저장소의 최신 시드를 다시 받아 실행 |
| `violates check constraint "grade_pct_sum"` | 구성비 합이 100 이 아니다 | 성적 화면에서 비율을 맞춘 뒤 저장 |

## CLI 를 쓰고 싶다면

```bash
npm i -g supabase
supabase login
supabase link --project-ref aujvpcpjpgxghxmsheur
supabase db push          # migrations/ 를 순서대로 올린다
```

다만 시드는 `db push` 대상이 아니다. 시드는 SQL Editor 에서 따로 실행한다.
