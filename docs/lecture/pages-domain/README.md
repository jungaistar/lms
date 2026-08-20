# 강의 교안 — GitHub Pages 사이트에 내 도메인 연결하기

**화면 한 장 = 한 단계.** 학습자가 붉은 번호를 따라 누르면 사이트가 완성됩니다.

| 파일 | 용도 |
|---|---|
| `GitHub-Pages-도메인연결-강의교안.md` | 원본. 이 파일을 고치면 나머지를 다시 만들 수 있다 |
| `GitHub-Pages-도메인연결-강의교안.html` | 배포·인쇄용. 그림이 안에 박혀 있어 **이 파일 하나만 있으면 된다** |
| `GitHub-Pages-도메인연결-강의교안.docx` | 워드 배포용 (표 31 · 그림 20) |
| `GitHub-Pages-도메인연결-강의슬라이드.pptx` | 강의용 슬라이드 27장 (발표자 노트 포함) |
| `svg/step-*.svg` | **단계별 화면 15장** — 편집 가능 |
| `svg/concept-*.svg` | 개념도 5장 — 편집 가능 |
| `png/*.png` | 위 SVG 를 2배 해상도로 렌더한 것 (워드·슬라이드 삽입용) |

## 단계별 화면

| 파일 | 장면 | 콜아웃 |
|---|---|---|
| `step-01` | 저장소 상단 Settings 탭 | ① 탭 위치 |
| `step-02` | Settings 왼쪽 메뉴 Pages | ① 메뉴 위치 |
| `step-03` | Build and deployment → Source | ① 드롭다운 + 두 방식 비교 |
| `step-03b` | Actions 탭 배포 성공 확인 | ① 초록 체크 |
| `step-04` | Your site is live at | ① 주소 ② Visit site |
| `step-05` | Cloudflare DNS → Records | ① DNS 메뉴 ② Add record |
| `step-06` | 레코드 입력 폼 | ①~⑤ 다섯 칸 |
| `step-07` | 저장된 레코드 표 | ① 내 줄 ② 회색 구름 |
| `step-08` | 루트 도메인 A 레코드 4줄 | ① Name @ ② IP |
| `step-09` | 명령 프롬프트 nslookup | ① 성공 줄 + 결과 3가지 |
| `step-10` | Custom domain 입력 | ① 입력칸 ② Save |
| `step-11` | DNS check unsuccessful | ① 오류 ② Check again + 원인 3 |
| `step-12` | 리셋 절차 3컷 | Remove → 10분 → 재입력 |
| `step-13` | DNS 성공 → Enforce HTTPS | ① 초록불 ② 체크박스 |
| `step-14` | 브라우저 최종 확인 | ① 자물쇠 ② 화면 |

## 개념도

| 파일 | 내용 |
|---|---|
| `concept-01-overview` | GitHub Pages 동작 개요 |
| `concept-02-flow` | 도메인 연결 5단계 흐름 |
| `concept-03-records` | 루트 vs 서브도메인 레코드 |
| `concept-04-troubleshoot` | 오류 진단 흐름도 |
| `concept-05-case` | 실전 사례 타임라인 |

## 우리 기관 값으로 바꾸기

화면 그림의 글자는 모두 **텍스트**라 그대로 고칠 수 있습니다.

- **간단히** — 메모장으로 열어 `사용자이름` · `내도메인.kr` · `저장소` 를 찾아 바꾸기
- **제대로** — Inkscape(무료) · Figma · Illustrator 로 열어 편집
- 바꾼 뒤 PNG 를 다시 렌더하면 워드·슬라이드에도 반영됩니다

## 다시 만들기

`.md` 를 고친 뒤: ① SVG → PNG 재렌더(헤드리스 크로미움, 2배) ② HTML(마크다운 변환 + SVG 인라인)
③ DOCX(`docx` npm) ④ PPTX(`pptxgenjs`). 그림은 PNG 로 삽입합니다.

## 출처

6장(실전 사례)은 `lms.miraejob.co.kr` 을 실제로 연결하면서 겪은 과정입니다.
운영용 절차는 같은 저장소의 [`docs/60-domain.md`](../../60-domain.md) 에 있습니다.
