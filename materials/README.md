# materials — 강의 학습자료

`취업과 경력개발` 학습자료를 **한 벌의 내용**에서 다섯 가지로 만들어 낸다.

```
materials/
  theme.css            디자인 시스템 (2주차 학습자료의 시각 언어)
  figures.mjs          SVG 인포그래픽
  build.mjs            빌드 — Markdown · HTML · SVG · 캔버스 아트보드
  week01/slides.mjs    ← 내용은 여기 한 곳에만 있다
  pptx/
    extract-layout.mjs   HTML 이 실제로 그려진 좌표를 뽑는다
    build_pptx.py        그 좌표대로 파워포인트 도형을 놓는다
    verify_coverage.py   원본 PDF 와 글자로 대조한다
  dist/
    1주차_오리엔테이션.md      Markdown (Marp 호환)
    1주차_오리엔테이션.html    HTML 슬라이드 (발표 · 인쇄 · 브라우저 편집)
    1주차_오리엔테이션.pptx    파워포인트 (도형·글상자·표 — 전부 편집 가능)
    svg/                     그림 낱개 파일 + index.html 목록
    canvas/                  디자인 캔버스 아트보드
    원본대조표.md             원본 PDF 대비 반영률
```

## 만들기

```bash
cd materials
npm install                 # playwright (좌표 뽑기에만 쓴다)
pip install python-pptx pypdfium2 pillow

npm run build               # .md · .html · svg/ · canvas/
npm run pptx                # 위 + .pptx
npm run verify -- <원본.pdf>   # 원본 대조표
```

`npm run build` 만 쓰면 의존성이 하나도 없다 (Node 만 있으면 된다).
PPTX 는 브라우저로 좌표를 재기 때문에 playwright 가 필요하다.

## 어떻게 PPTX 가 HTML 과 똑같이 나오나

파워포인트에서 자리를 다시 계산하지 않는다. **브라우저가 잡아 놓은 좌표를
그대로 읽어다 쓴다.**

```
slides.mjs  →  build.mjs  →  .html
                                ↓  extract-layout.mjs (크로미움이 실제로 그린 자리)
                             layout.json
                                ↓  build_pptx.py
                             .pptx   (사각형 · 타원 · 선 · 자유형 · 글상자 · 표)
```

그래서 HTML 을 고치면 PPTX 도 같이 맞는다. 그림 파일을 붙이는 게 아니라
파워포인트 기본 도형으로 놓기 때문에 글자 하나까지 그 자리에서 고칠 수 있다.

- 좌표 1px = 9525 EMU (13.333in × 7.5in, 16:9)
- 글꼴은 **맑은 고딕** (한글 윈도우 오피스에 반드시 있다)
- 이모지는 **구글 이모지(Noto Color Emoji)** 를 PNG 로 구워 넣는다
- `::before` 로 그린 목록 표식·소제목 막대는 좌표가 없어 규칙대로 되살린다
  (`extract-layout.mjs` 의 `marker()` · `subBar()`)

### 손대면 안 되는 것

- `build_pptx.py` 의 `tf.auto_size = MSO_AUTO_SIZE.NONE` — 파워포인트 기본값인
  `spAutoFit` 을 그대로 두면 글상자가 글에 맞춰 줄어들며 **가운데로 당겨져**
  줄마다 왼쪽 끝이 들쭉날쭉해진다.
- `SLACK = 1.0` — 글상자를 넓히면 강조 상자 테두리 밖으로 글이 삐져나간다.
  글꼴 너비 차이는 세로로(줄이 하나 더 생기는 쪽으로) 흡수한다.
  폭이 글에 맞춰 줄어드는 요소(`shrink`)에만 여유를 준다.

## 고칠 때

- **글을 고친다** → `week01/slides.mjs`. 다섯 가지 산출물이 같이 바뀐다.
- **모양을 고친다** → `theme.css`. 화면 코드에 색을 인라인으로 박지 말 것.
- **그림을 고친다** → `figures.mjs`. SVG 안에서는 CSS 변수가 안 통하므로
  색을 리터럴로 쓴다 (파일 맨 위 `C` 팔레트를 볼 것).
  같은 그림이 여러 장에 들어가므로 **id 는 `uid()` 로 만든다** — 겹치면
  `url(#…)` 과 `<textPath href>` 가 첫 번째 것으로 몰린다.

`dist/` 는 생성물이지만 배포용 결과물이라 저장소에 함께 둔다.
직접 고치지 말 것 — 다음 빌드에서 지워진다.

## HTML 슬라이드로 할 수 있는 것

| 단추 | 하는 일 |
|---|---|
| 발표 (F) | 한 장씩 꽉 차게. `←` `→` 로 넘기고 `Esc` 로 빠져나온다 |
| 편집 | 글자를 눌러 그 자리에서 고친다. 고친 내용은 그 브라우저에 남는다 |
| 인쇄 · PDF | 한 슬라이드가 한 쪽. 배경색까지 그대로 나온다 |
| 원본 | 브라우저에 저장해 둔 편집 내용을 지우고 처음으로 |

슬라이드 한 장은 `<section class="slide" data-index data-kind data-name>` 이고,
고칠 수 있는 자리는 `data-edit` 로 표시되어 있다.

## 내용 표기

`slides.mjs` 안에서 쓰는 인라인 표기는 두 가지뿐이다.

- `**굵게**` → 강조
- `!!빨강!!` → 중요 표시

## 자기 점검

빌드는 슬라이드가 넘치는지까지는 보지 않는다. **고쳤으면 눈으로 확인할 것.**

1. `npm run build` → 브라우저로 `dist/…html` 을 열고 `인쇄 · PDF` 로 뽑아
   마지막 줄까지 들어왔는지 본다.
2. `npm run pptx` → `.pptx` 를 파워포인트로 열어 본다.
3. `npm run verify -- <원본.pdf>` → 원본 대비 반영률과 빠진 조각을 확인한다.

슬라이드가 빽빽하면 `slides.mjs` 의 그 슬라이드에 `dense: true`(한 단계 축소),
`tiny: true`(두 단계 축소)를 준다. 그림은 `{ t: 'fig', name, max: 150 }` 으로
높이를 눌러 둘 수 있다.
