# 작업 기록

무엇을 왜 했는지 날짜순으로 남긴다. **최신이 위**다.

이 파일은 "무슨 일이 있었나" 를 위한 것이다. "어떻게 쓰나" 는 각 안내 문서에,
"왜 그렇게 만들었나" 는 코드 주석과 `CLAUDE.md` 에 있다.

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
