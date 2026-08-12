# 작업 기록

무엇을 왜 했는지 날짜순으로 남긴다. **최신이 위**다.

이 파일은 "무슨 일이 있었나" 를 위한 것이다. "어떻게 쓰나" 는 각 안내 문서에,
"왜 그렇게 만들었나" 는 코드 주석과 `CLAUDE.md` 에 있다.

---

## 2026-08-12 (저녁) — 학생 입장 방식 교체 (수업코드 → 승인)

안내: [`50-admin-console.md` 입장 승인](50-admin-console.md#입장-승인-2026-08-12-추가) ·
적용 순서: [`11-migrate.md` 3-2](11-migrate.md)

### 왜

수업코드는 한 번 새어 나가면 막을 방법이 없다. 단톡방에 올라가면 수강생이
아닌 사람도 학번만 알면 들어온다. 학번은 같은 수업 학생끼리 서로 안다.

### 무엇으로 바꿨나

이메일 + 학번 + 이름 → **명단 대조** → **교수 승인** → 입장.
이메일은 승인 뒤의 **두 번째 열쇠**가 된다.

### DB — `0010_student_access.sql`

- `courses.entry_mode` (`code` | `approval`, 기본 `approval`)
- `student_access` — 신청·승인·이메일·마지막 입장. **학생용 RLS 정책 없음**
- `approve_all_access()` · `access_list()` · `set_access_status()` · `clear_access_email()`

### Edge Function

`student-login` 을 두 방식 모두 받도록 다시 썼다. 세션 발급 경로(진짜 Supabase
세션 + `app_metadata`)는 그대로 두고, 앞단 판정만 갈라 놓았다.

- 명단 못 맞춤 → `audit_log` 에 남기고 거절
- 여러 과목에 걸림 → 과목 목록을 돌려주고 학생이 고름
- 대기 / 거절 → 상태를 값으로 돌려줌 (예외가 아니다 — 기다리는 게 정상이다)
- 승인 + 이메일 미묶임 → 지금 묶고 입장
- 승인 + 이메일 다름 → 거절하고 `audit_log` 에 남김

### 화면

- 학생 `수업 들어가기` — 이메일·학번·이름. **승인 대기**가 오류 화면이 아니라
  하나의 결과 화면이다. 옛 수업코드 입력은 접어서 남겼다
- 교수 `수강생 → 입장 승인` — 명단 전원이 보인다(미신청 포함).
  전원 승인 · 개별 승인/거절/되돌리기 · 이메일 풀기 · 입장 방식 전환

### 주의

`0010` 은 **SQL + Edge Function 재배포 + 전원 승인** 세 가지를 다 해야 끝난다.
SQL 만 올리면 모든 과목이 승인 방식이 되는데 아무도 승인돼 있지 않아 전원이 잠긴다.

---

## 2026-08-12 (오후) — 실기기 폭 점검과 수정

실제 계정으로 콘솔을 열어 보고, 이어서 360 ~ 1280px 폭으로 훑었다.

### 화면에서 드러나 고친 것

| # | 무엇 | 원인 |
|---|---|---|
| 1 | 학교 LMS 표의 이름이 전부 "학부" | 학번 **앞** 칸부터 한글을 찾았다. 학번 다음 칸부터 찾도록 고침 |
| 2 | 히어로에 `undefined` | `courses.project_mode` 칸이 없는데 그대로 찍었다. DB 기본값으로 메움 |
| 3 | type 없는 입력 칸이 스타일을 못 받음 | CSS 가 `input[type='text']` 만 잡았다. `input:not([type])` 추가 — 원래 있던 구멍 |
| 4 | 폰에서 메뉴 18개 중 3개만 보임 | 세로 메뉴를 눕힌 가로 띠였다. **네이티브 select** 로 교체 |
| 5 | 입력 글자 14px (iOS 확대) | 인라인으로 박혀 있었다. 900px 이하에서 16px 강제 |
| 6 | 수업 중 체크가 폰에서 세로로 길어짐 | 640px 이하에서 한 학생 두 줄, 출결 버튼 5개를 한 줄에 고르게 |

### 확인 방법도 남겼다

`web/tools/responsive-check.html` + `npm run responsive`.
앱을 고정 폭 iframe 에 띄운다 — 창을 줄이는 것으로는 안 된다(뷰포트가 안 따라왔다).

### 그리고 DB 상태를 정정했다

문서에는 `0006`~`0008` 이 적용된 것처럼 적혀 있었는데 **아니었다.**
실제로는 `0001`~`0005` 까지만 올라가 있다. `docs/11-migrate.md` 와
`CLAUDE.md` 를 실제 상태로 고쳤다.

---

## 2026-08-12 — 관리자 콘솔 · 학교 LMS 과제 연동 · 설문

안내 문서: [`50-admin-console.md`](50-admin-console.md)

### 배경

과목 화면이 가로 탭 아홉 개였는데 화면이 늘면서 탭이 밖으로 밀렸다.
그리고 과제는 학교 LMS 에만 쌓이는데 그 결과를 기타 점수로 옮길 길이 없었다.

두 사이트를 **로그인 상태로 직접 열어** 짜임새를 확인하고 옮겼다. 추측이 아니다.

| 확인한 곳 | 확인한 것 |
|---|---|
| `rest.dreamitbiz.com/admin/attendance` | 왼쪽 "관리자 메뉴" 14 항목과 그 짜임새 |
| `lms.dima.ac.kr` 강의실 | 왼쪽 메뉴 19 항목 (강의홈 · 주/회차 관리 · 과목공지 · 과제관리 · 설문등록/결과조회 …) |
| `lms.dima.ac.kr` 과제관리 | `과제관리(출제/채점)` 과 `학생별 과제` 두 표의 실제 열 구성 |

### DB — `0009_admin_console.sql`

| # | 무엇 |
|---|---|
| 1 | `deduction_kinds.source` 에 `attendance_absent` 추가. 이미 항목이 있는 과목에 결석(0점) 자동 삽입 |
| 2 | `task_submissions` 에 `origin` · `ext_state` · `ext_synced_at` |
| 3 | `task_sync_log` — 학교 LMS 에서 언제 무엇을 반영했는지 |
| 4 | `deduction_summary()` 다시 씀 — 결석 집계 + `ext_state` 우선 판정 |
| 5 | `surveys` · `survey_questions` · `survey_responses` · `survey_answers` + RLS + `survey_summary()` |
| 6 | `activities.phase` (`none`/`pre`/`result`) + `project_eval_summary()` · `project_eval_totals()` |
| 7 | `course_overview()` — 대시보드 숫자를 한 번에 |

`seed_deduction_kinds()` 도 결석을 포함하도록 다시 썼다.

### 새 화면 (교수)

- `AdminShell` + `adminMenu` + `AdminIcon` — 왼쪽 세로 메뉴. 넓은 화면은 세로,
  좁은 화면은 가로로 밀리는 줄. 같은 마크업을 CSS 로만 바꾼다
- `DashboardTab` — 숫자 타일 + "지금 할 일"
- `RosterMatchTab` — 명단 대조 (학번만 열쇠, 이름 불일치 따로 표시)
- `TeamsTab` — 팀 편성 (섞어서 라운드로빈 자동 배정)
- `LiveCheckTab` — 수업 중 체크 (오늘 회차 자동 선택, 한 번 누르면 저장)
- `TaskSyncTab` — 학교 LMS 과제 제출현황 두 모양 가져오기 + 학생별 현황판
- `SurveyTab` — 설문 등록 · 문항 · 결과 집계
- `ProjectEvalTab` — 사전/결과 평가 집계표 (`phase` 로 갈림)

`CourseView` 는 가로 탭에서 `AdminShell` 로 갈아탔고, 지금 메뉴를 주소
(`?m=...`)에 남긴다. `BoardTab` 은 `only` 로 공지/자료를 따로 그린다.

### 새 화면 (학생)

- `CourseHome` (`/home`) — 강의홈. 로그인하면 여기로 온다
- `SurveyAnswer` (`/survey/:id`) — 설문 참여
- `StudentNav` — 학생 화면 사이를 오가는 줄. 기존 화면에도 붙였다

### 새 라이브러리와 검사

- `lib/extTasks.ts` — 학교 LMS 과제 표 두 모양 읽기 + 학번 맞추기
- `test/exttasks.check.ts` — 29 항목. `npm test` 에 물려 두었다

### 확인

```
npm test      통과 39 + 31 + 27 + 29 · 실패 0
npm run build 성공
```

### 남은 것

- `0009` 는 아직 **적용 전**이다. Supabase SQL Editor 에서 실행해야 새 화면이
  실제로 동작한다 (`11-migrate.md` 3단계 참고)
- 학교 LMS 성적 입력은 여전히 잠겨 있다 (`SELECTORS_VERIFIED = false`)

---

## 2026-08-10 — 감점 요소 · 기타 성적 · 헤이영 출석부

`0007_deductions_heyyoung.sql`. 헤이영 세 화면을 로그인 상태로 확인하고 맞췄다.
가로형 출석부(학생 한 명이 한 줄, 주차마다 교시 열)를 통째로 읽는 파서와
감점 항목 · 기타 성적을 넣었다. 자세한 것은 [`40-course-ops.md`](40-course-ops.md).

## 2026-08-09 — 대학 홈페이지 톤으로 화면 정리

`univ-design/` 의 디자인 토큰(네이비 + 로열블루, Pretendard, 1px 헤어라인)을
`styles.css` 시맨틱 클래스로 옮기고 모든 화면에 적용했다.

## 2026-08-07 — 수업 운영 전체

`0006_course_ops.sql`. 주차 · 회차 · 공지 · 자료 · 과제 · 출석 · 시험 · 성적.
그리고 상호평가 본체(`0001`~`0005`)는 그 전에 끝나 있었다.
