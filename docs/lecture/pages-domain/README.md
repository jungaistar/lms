# 강의 교안 — GitHub Pages 사이트에 내 도메인 연결하기

같은 내용을 네 가지 형식으로 담았습니다. 편한 것을 쓰세요.

| 파일 | 용도 |
|---|---|
| `GitHub-Pages-도메인연결-강의교안.md` | 원본. 이 파일을 고치면 나머지를 다시 만들 수 있다 |
| `GitHub-Pages-도메인연결-강의교안.html` | 배포·인쇄용. 그림이 안에 박혀 있어 **이 파일 하나만 있으면 된다** |
| `GitHub-Pages-도메인연결-강의교안.docx` | 워드 배포용. 표·그림 포함 |
| `GitHub-Pages-도메인연결-강의슬라이드.pptx` | 강의용 슬라이드 20장 (발표자 노트 포함) |
| `svg/*.svg` | 그림 원본 — **편집 가능** |
| `png/*.png` | 위 SVG 를 2배 해상도로 렌더한 것 (워드·슬라이드 삽입용) |

## 그림 고치기

`svg/` 의 파일은 글자가 텍스트로 들어 있어 그대로 고칠 수 있습니다.

- **간단히** — 메모장으로 열어 `example.com`, `사용자이름` 을 기관 값으로 바꾸기
- **제대로** — Inkscape(무료) · Figma · Illustrator 로 열어 편집

| 파일 | 내용 |
|---|---|
| `01-overview.svg` | GitHub Pages 동작 개요 |
| `02-flow.svg` | 도메인 연결 5단계 흐름 |
| `03-dns-records.svg` | 루트 도메인 vs 서브도메인 레코드 |
| `04-github-pages-screen.svg` | GitHub Settings → Pages 화면 |
| `05-dns-screen.svg` | DNS 관리 화면 (Cloudflare 예시) |
| `06-browser-check.svg` | 브라우저 확인 화면 |
| `07-troubleshoot.svg` | 오류 진단 흐름도 |
| `08-case-study.svg` | 실전 사례 타임라인 |

## 다시 만들기

`.md` 를 고친 뒤 아래 순서로 다른 형식을 다시 만듭니다.

1. SVG 를 고쳤으면 PNG 재렌더 (헤드리스 크로미움으로 SVG → PNG, 2배 해상도)
2. HTML — 마크다운을 변환하고 SVG 를 인라인으로 박아 넣는다
3. DOCX — `docx`(npm) 로 생성, 그림은 PNG 삽입
4. PPTX — `pptxgenjs` 로 생성, 그림은 PNG 삽입

생성 스크립트는 이 저장소에 포함하지 않았습니다. 문서를 고칠 일이 잦아지면
`tools/` 로 옮겨 두면 됩니다.

## 출처

이 교안의 사례(6장)는 `lms.miraejob.co.kr` 을 실제로 연결하면서 겪은 과정입니다.
같은 저장소의 [`docs/60-domain.md`](../../60-domain.md) 에 운영용 절차가 따로 있습니다.
