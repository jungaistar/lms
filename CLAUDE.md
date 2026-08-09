# CLAUDE.md — 동료평가 학습보조 시스템

## 이 저장소가 만드는 것

전문대 학생들이 서로의 발표·토론·팀 기여·과제를 평가하고, 그 결과를 집계해
학교 LMS 성적으로 넘기는 시스템. **학교 LMS를 분석하는 도구가 아니다** —
학교 LMS 연동은 `bridge/` 하위의 한 부품일 뿐이다.

```
web/       React + Vite 정적 프론트 (GitHub Pages)
supabase/  Postgres 스키마 · RLS · 집계 RPC · 학생 로그인 Edge Function
bridge/    학교 LMS(*.dunet) 연동
docs/      설계·설치·운영 문서
```

## 절대 규칙

1. **점수를 학생에게 노출하지 않는다.**
   확정된 공개 정책은 "코멘트만 익명 공개, 점수 비공개"다.
   `results` 테이블에는 학생용 RLS 정책이 아예 없고, `my_feedback()` RPC는
   점수 컬럼을 반환하지 않는다. 이 두 가지를 우회하는 코드를 만들지 말 것.
   화면에서 숨기는 방식으로 바꾸지 말 것 — 데이터 계층에서 막아야 한다.

2. **권한 판단은 RLS에서 한다.**
   클라이언트에서 `if (isTeacher)` 같은 분기로 접근을 통제하지 않는다.
   새 테이블을 만들면 반드시 RLS 정책을 같이 쓴다.

3. **점수 계산은 DB 함수에서 한다.**
   `compute_results()` / `compute_contribution_results()` 가 유일한 집계 경로다.
   클라이언트가 보낸 점수를 그대로 믿고 저장하는 코드를 만들지 말 것.

4. **service_role 키를 프론트에 두지 않는다.**
   `web/` 에는 anon key만 들어간다. service_role은 Edge Function 환경변수에만.

5. **학생 데이터를 커밋하지 않는다.**
   `data/`, `.env`, `*_성적.csv` 는 `.gitignore` 처리되어 있다.

6. **관리자 판정을 프론트에서 하지 않는다.**
   `is_admin()` 은 JWT의 email 클레임을 DB에서 직접 본다.
   `ADMIN_EMAIL` 상수는 화면 표시용이며, 그걸 고쳐도 권한은 넘어가지 않는다.
   승인 여부도 마찬가지 — `courses` INSERT 정책이 `is_approved()` 를 요구한다.
   버튼을 감추는 방식으로 바꾸지 말 것.

7. **학교 LMS의 미확인 저장 엔드포인트를 추측해 호출하지 않는다.**
   `bridge/` 의 원칙은 그대로다 — 읽기는 HTTP, 쓰기는 브라우저 자동화 + 사람 확인.
   `SELECTORS_VERIFIED = false` 인 동안 성적 입력은 실행되지 않는다.

8. **로그인 캡차를 우회하지 않는다.** (학교 LMS 쪽)

## 설계상 이미 결정된 것 — 되묻지 말 것

| 항목 | 결정 |
|---|---|
| 백엔드 | Supabase (Postgres + RLS + Edge Functions) |
| 학생 인증 | 학번 + 수업코드 → Edge Function이 **진짜 Supabase 세션** 발급 (식별자는 `app_metadata`). JWT를 직접 서명하는 방식으로 되돌리지 말 것 — 프로젝트 서명 키가 ES256이라 legacy 키 폐기 시 전부 죽는다 |
| 교수 인증 | Supabase Auth 회원가입 (이메일+비밀번호). 가입은 열려 있고 **관리자 승인**이 문지기 |
| 관리자 | `radical8566@gmail.com` — DB의 `admin_email()` 에 하드코딩. 프론트 상수는 표시용일 뿐 |
| 익명성 | 코멘트만 익명 공개, 점수 비공개 |
| 활동 종류 | 발표 상호평가 · 토론 참여 · 팀 기여도 · 과제 동료 첨삭 |
| 과제·출석 공개 | **과제 점수와 출결은 본인 것만 학생에게 공개.** 시험 점수·상호평가 원점수·최종 성적은 비공개 — 정책을 아예 만들지 않는 방식으로 막는다 |
| 출석 | 헤이영. 공개 API 가 없어 **CSV 올리기**로 받는다 (`web/src/lib/heyyoung.ts`) |
| 학교 LMS 방향 | **학교 LMS 가 원본, 이쪽이 사본.** 주차·공지·자료·과제를 가져온다. `locked=true` 인 줄은 가져오기가 덮어쓰지 않는다 |
| 성적 산출 | `compute_final_grades()` 하나가 유일한 경로. 구성비 합은 DB CHECK 로 100 강제 |
| 배포 | GitHub Actions → GitHub Pages (`web/dist`) |
| 라우팅 | HashRouter (Pages에 SPA 리라이트를 걸 수 없어서) |

## 화면 작업 규칙

- **모바일 우선.** 학생은 수업 중 휴대폰으로 평가를 넣는다.
  입력 필드 `font-size`를 16px 아래로 내리지 말 것 (iOS가 화면을 확대한다).
  터치 대상은 44px 이상.
- 만점이 10 이하인 루브릭 항목은 숫자 입력이 아니라 버튼으로 고르게 한다.
- 제출 버튼은 `.sticky-actions` 로 화면 아래 고정한다.

### 디자인 시스템

2학기부터 학생에게 공개하는 화면이라 대학 홈페이지 톤을 따른다.
근거는 `univ-design/` (한빛대 학부대학 목업 + KDN 디자인 토큰).

- 색: 네이비 `#1B2A4A`(헤더·푸터·표 머리) + 로열블루 `#0046C8`(링크·주요 버튼·강조).
  히어로는 `linear-gradient(135deg, …)` 하나만 쓴다. **버튼·작은 요소에 그라디언트를 쓰지 말 것.**
- 글꼴: Pretendard(본문) + Outfit(숫자·영문 라벨). `index.html` 에서 CDN 으로 받는다.
- 테두리 1px `#E5E9F2`, 라운드 12px(카드)·16px(히어로)·999px(pill). **그림자는 기본이 아니다** — 호버에서만.
- 섹션 제목은 `.section-title` (강조색 4px 좌측 룰). 이 시스템에서 가장 특징적인 패턴이다.
- 하위 화면 상단은 `<PageHero>` 로 통일한다 (breadcrumb + 제목 + 영문 라벨).
- 스타일은 전부 `web/src/styles.css` 의 시맨틱 클래스에 있다. 화면 코드에 색을 인라인으로 박지 말 것.

### 표기·브랜드

학교/기관 이름, 소장 정보, 연락처, 푸터 링크는 **`web/src/brand.ts` 한 파일**에만 있다.
기관이 바뀌면 그 파일만 고친다. 화면 코드에 기관명을 직접 쓰지 말 것.
표시용 문자열일 뿐이고 권한과는 무관하다 — 고쳐도 남의 과목은 열리지 않는다.

## 명령어

```bash
# 프론트
cd web && npm run dev          # 개발 서버
cd web && npm run build        # 빌드 (dist/)
cd web && npm run typecheck
cd web && npm test               # 헤이영 CSV 파서 검사 (프레임워크 없이 tsx 로 실행)

# DB — Supabase CLI 를 쓰는 경우
supabase db push
supabase functions deploy student-login

# 학교 LMS 연동
cd bridge && npm run auth      # 사람이 로그인 → 세션 저장
cd bridge && npm run push -- --csv "...성적.csv" --dry-run
```

## 현재 상태 (2026-08-07)

- Supabase 프로젝트 `aujvpcpjpgxghxmsheur` 에 마이그레이션 4개 적용 완료,
  `student-login` 함수 배포 완료, 공개 회원가입 차단 완료
- GitHub Pages 배포 동작 중 (저장소 Secrets 에 URL/anon key 등록됨)
- **실제 프로젝트 대상 end-to-end 검증 27항목 통과** — 배정(자기 팀 제외),
  학생 로그인, 평가 제출, 만점 초과 거부, RLS 격리, 집계·감점 계산,
  점수 비공개, 과목 격리
- 학교 LMS 성적 입력만 화면 셀렉터 미확인으로 잠김 (`SELECTORS_VERIFIED = false`)

`TODO(selector)` 주석이 남은 곳이 유일한 미구현 지점이다.
