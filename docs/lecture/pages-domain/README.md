# GitHub Pages 사이트에 내 도메인 연결하기 — 가이드 패키지

**화면 한 장 = 한 단계.** 학습자가 주황 번호가 가리키는 곳만 누르면 사이트가 완성됩니다.
기존 `githubpagesguide v1.1` 과 같은 형식(1280×720 슬라이드, 왼쪽 화면 · 오른쪽 목표/행동/팁)입니다.

| 파일 | 용도 |
|---|---|
| `GitHub-Pages-도메인연결-가이드.html` | **슬라이드 덱 22장.** 그림이 안에 박혀 있어 파일 하나로 열리고, 브라우저 인쇄로 PDF 가 된다 |
| `GitHub-Pages-도메인연결-가이드.pptx` | 파워포인트 22장 (같은 배치) |
| `GitHub-Pages-도메인연결-가이드.docx` | 워드 배포용 |
| `GitHub-Pages-도메인연결-가이드.md` | 원본 텍스트 |
| `shots/*.svg` | **화면 19장 — 편집 가능** |
| `png/*.png` | 위 SVG 를 2배로 렌더 (워드·PPT 삽입용) |

## 화면 목록

| 파일 | 단계 | 주황 번호가 가리키는 것 |
|---|---|---|
| `shot-01` | STEP 1 | 상단 Settings 탭 |
| `shot-02` | STEP 2 | 왼쪽 메뉴 Pages |
| `shot-03` | STEP 3 | Source 드롭다운 |
| `shot-04` | STEP 3+ | Actions 초록 체크 |
| `shot-05` | STEP 4 | 기본 주소 · Visit site |
| `shot-06` | STEP 5 | DNS → Records · Add record |
| `shot-07` | STEP 6 | Type · Name · Target · Proxy · Save |
| `shot-08` | STEP 7 | 내 레코드 줄 · 회색 구름 |
| `shot-09` | STEP 8 | Name `@` · IPv4 |
| `shot-10` | STEP 9 | nslookup 성공 줄 |
| `shot-11` | STEP 10 | Custom domain 입력 · Save |
| `shot-12` | STEP 11 | DNS check unsuccessful · Check again |
| `shot-13` | STEP 12 | Remove → 10분 → 재입력 |
| `shot-14` | STEP 13 | 초록불 · Enforce HTTPS |
| `shot-15` | STEP 14 | 자물쇠 · 화면 |
| `flow` · `records` · `diagnose` · `case` | — | 전체 흐름 · 레코드 종류 · 진단 · 실전 사례 |

## 우리 기관 값으로 바꾸기

화면 안의 글자는 전부 텍스트라 그대로 고칠 수 있습니다.

1. `shots/*.svg` 를 메모장(또는 Inkscape·Figma)으로 연다
2. `사용자이름` · `내도메인.kr` · `저장소` 를 찾아 바꾼다
3. PNG 를 다시 렌더하면 워드·PPT 에도 반영된다

## 표기 규칙 (예시 가이드와 동일)

| 요소 | 값 |
|---|---|
| 네이비 | `#0E2A47` (제목·목표 상자) |
| 강조 주황 | `#F26B21` (표시 사각형·번호·태그) |
| 경고 빨강 | `#C4341C` |
| 면 · 선 | `#F4F6F9` · `#D9E0E8` |
| 슬라이드 | 1280 × 720 · 화면 SVG 는 900 × 560 |

## 출처

실전 사례는 `lms.miraejob.co.kr` 을 실제로 연결하면서 겪은 과정입니다.
운영용 절차는 [`docs/60-domain.md`](../../60-domain.md) 에 있습니다.
