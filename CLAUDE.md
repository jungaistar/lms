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

6. **학교 LMS의 미확인 저장 엔드포인트를 추측해 호출하지 않는다.**
   `bridge/` 의 원칙은 그대로다 — 읽기는 HTTP, 쓰기는 브라우저 자동화 + 사람 확인.
   `SELECTORS_VERIFIED = false` 인 동안 성적 입력은 실행되지 않는다.

7. **로그인 캡차를 우회하지 않는다.** (학교 LMS 쪽)

## 설계상 이미 결정된 것 — 되묻지 말 것

| 항목 | 결정 |
|---|---|
| 백엔드 | Supabase (Postgres + RLS + Edge Functions) |
| 학생 인증 | 학번 + 수업코드 → Edge Function이 커스텀 JWT 발급 |
| 교수 인증 | Supabase Auth (이메일 + 비밀번호) |
| 익명성 | 코멘트만 익명 공개, 점수 비공개 |
| 활동 종류 | 발표 상호평가 · 토론 참여 · 팀 기여도 · 과제 동료 첨삭 |
| 배포 | GitHub Actions → GitHub Pages (`web/dist`) |
| 라우팅 | HashRouter (Pages에 SPA 리라이트를 걸 수 없어서) |

## 화면 작업 규칙

- **모바일 우선.** 학생은 수업 중 휴대폰으로 평가를 넣는다.
  입력 필드 `font-size`를 16px 아래로 내리지 말 것 (iOS가 화면을 확대한다).
  터치 대상은 44px 이상.
- 만점이 10 이하인 루브릭 항목은 숫자 입력이 아니라 버튼으로 고르게 한다.
- 제출 버튼은 `.sticky-actions` 로 화면 아래 고정한다.

## 명령어

```bash
# 프론트
cd web && npm run dev          # 개발 서버
cd web && npm run build        # 빌드 (dist/)
cd web && npm run typecheck

# DB — Supabase CLI 를 쓰는 경우
supabase db push
supabase functions deploy student-login

# 학교 LMS 연동
cd bridge && npm run auth      # 사람이 로그인 → 세션 저장
cd bridge && npm run push -- --csv "...성적.csv" --dry-run
```

## 현재 상태

- 스키마 · RLS · 집계 함수 · 학생 로그인: 작성 완료, **실제 Supabase 프로젝트에서 미검증**
- 프론트: 타입체크와 빌드 통과, **실데이터 미검증**
- 학교 LMS 성적 입력: 화면 셀렉터 미확인으로 잠김

`TODO(selector)` 주석이 남은 곳이 미구현 지점이다.
