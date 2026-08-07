# CLAUDE.md — LMS 채점 보조 도구

이 저장소에서 작업할 때 반드시 지켜야 할 규칙입니다.

## 대상 시스템의 성격

REST API가 **아닙니다.** 세션 쿠키(JSESSIONID) 기반 서버 렌더링 웹앱(`*.dunet`)입니다.
- 조회조차 대부분 POST이고, 응답은 HTML 조각입니다.
- 파싱은 cheerio 기본, 일부 그리드 엔드포인트만 JSON입니다. `Content-Type`으로 분기하세요.
- 상세: [docs/01-findings.md](docs/01-findings.md), [docs/02-endpoints.md](docs/02-endpoints.md)

## 절대 규칙

1. **읽기와 쓰기를 물리적으로 분리한다.**
   `src/lms/client.ts`는 조회만 가능합니다. 여기에 저장/수정 요청을 추가하지 마세요.
   쓰기는 오직 `src/automation/`의 브라우저 자동화 경로에만 존재합니다.

2. **미확인 엔드포인트를 추측해서 호출하지 않는다.**
   점수 저장(`doSaveReportMark.dunet` 류), 일괄 수정, 성적 확정은 파라미터가 확인되지 않았습니다.
   "아마 이런 파라미터일 것"이라는 코드를 작성하지 마세요.

3. **로그인은 자동화하지 않는다.**
   슬라이더 캡차가 있습니다. 사람이 로그인하고 세션을 재사용합니다.
   캡차 우회 코드를 제안하거나 작성하지 마세요.

4. **사람 확인 없이 저장하지 않는다.**
   `DRY_RUN` 기본값은 `true`입니다. 학생 단위 확인 프롬프트를 제거하지 마세요.

5. **식별자를 하드코딩하지 않는다.**
   `course_id`, `class_no`, 학번, 호스트명은 전부 `.env` 또는 CLI 인자에서 옵니다.
   테스트 픽스처에도 실제 학번을 넣지 마세요. 마스킹된 값을 쓰세요.

6. **실제 학생 데이터를 커밋하지 않는다.**
   `data/`, `.auth/`, `.env`는 `.gitignore` 처리되어 있습니다. 커밋 전 `git status`로 확인하세요.

7. **레이트리밋을 낮추지 않는다.**
   `REQUEST_INTERVAL_MS` 기본 1200ms. 병렬 요청 폭주 금지.

## 파서 작성 규칙

HTML 파서는 화면 개편에 쉽게 깨집니다.
- 셀렉터가 안 맞으면 **빈 배열을 반환하지 말고 명시적으로 throw** 하세요. 조용한 실패가 가장 위험합니다.
- 응답 원본(`raw_html`)을 항상 함께 저장해서, 나중에 파서만 고쳐 재처리할 수 있게 하세요.
- 응답에 로그인 폼이 섞여 오면 세션 만료입니다. 즉시 중단하고 재로그인을 요청하세요.

## 명령어

```bash
npm run auth                                  # 사람이 로그인 → 세션 저장
npm run collect -- --course <ID> --class <NO> # 읽기 전용 수집
npm run grade   -- --report <N>               # 채점 초안 생성
npm run review                                # 사람 검토·승인
npm run submit  -- --report <N> --dry-run     # 브라우저 자동화 입력
```

## 기술 스택

Node.js + TypeScript / undici(HTTP) / cheerio(HTML) / better-sqlite3(로컬 DB) /
Playwright(브라우저 자동화) / @anthropic-ai/sdk(채점 초안)

## 현재 상태

스캐폴드 단계입니다. `TODO(phase-N)` 주석이 붙은 곳이 미구현 지점이며,
[docs/04-roadmap.md](docs/04-roadmap.md)의 단계 순서대로 채워 나갑니다.
