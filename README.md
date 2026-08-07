# LMS 채점 보조 도구 (LMS Grading Assistant)

대학 LMS(BLU 3.0 계열, `*.dunet` 서버 렌더링 웹앱)를 대상으로 한
**읽기 전용 데이터 수집 + AI 채점 초안 생성 + 사람 확인 후 브라우저 자동화 입력** 파이프라인.

📖 **개발 가이드 사이트: https://jungaistar.github.io/lms/**

---

## 왜 이런 구조인가

조사 결과 이 LMS는 REST/JSON API가 아니라 **세션 쿠키(JSESSIONID) 기반 서버 렌더링 웹앱**입니다.
따라서 다음 3원칙으로 설계했습니다.

| 원칙 | 내용 |
|---|---|
| **로그인은 사람이** | 로그인 화면에 슬라이더 캡차가 있어 자동화 불가. 사람이 로그인하고 세션 쿠키를 재사용한다. |
| **읽기는 프로그램이** | 과제 목록·제출물·학생 명단·성적 그리드는 확인된 엔드포인트로 안전하게 수집한다. |
| **쓰기는 브라우저가** | 점수 저장은 추측한 POST 파라미터로 직접 호출하지 않는다. 실제 화면을 열어 입력창을 채우고 저장 버튼을 누른다. 학생 단위로 확인을 받는다. |

## 빠른 시작

```bash
npm install
cp .env.example .env      # LMS_HOST, 학기/과목 식별자 입력
npm run auth              # 브라우저 열림 → 사람이 로그인 → 세션 저장
npm run collect -- --course <COURSE_ID> --class <CLASS_NO>
npm run grade -- --report <REPORT_NO>     # 채점 초안 생성 (사람 검토용)
npm run review                             # 초안 검토/수정
npm run submit -- --report <REPORT_NO> --dry-run
```

## 프로젝트 구조

```
src/
  lms/          세션·HTTP 클라이언트·엔드포인트 정의·HTML 파서
  collect/      읽기 전용 수집기 (과목/과제/제출물/학생/성적)
  db/           로컬 SQLite 스키마 및 접근 계층
  grade/        채점 기준(루브릭) + AI 초안 생성 + 사람 검토
  automation/   Playwright 기반 점수 입력 (최종 단계, 확인 필수)
  cli/          명령행 진입점
docs/           개발 가이드 원문 (마크다운)
index.html      GitHub Pages 가이드 사이트
```

## ⚠️ 사용 전 확인

- 조사 당시 화면에 **"LMS(BLU3.0) Demo"** 표기가 있었습니다. 운영 시스템 여부를 먼저 확인하세요.
- 실제 운영 시스템이라면 **소속 기관 원격교육지원센터에 비공식 자동화 도구 사용 가능 여부를 반드시 확인**한 뒤 사용하세요.
- 본인이 담당하는 과목의 데이터에만 사용하세요.
- 이 저장소의 호스트명·과목코드·학번은 모두 마스킹되어 있습니다. 실제 값은 `.env`(git 제외)에만 두세요.

## 라이선스

MIT
