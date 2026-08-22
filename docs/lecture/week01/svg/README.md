# 그림 요소 (SVG)

1주차 원본 PDF 에 그림으로 들어 있던 것을 낱장 SVG 로 다시 그려 정리했다.
모두 **홀로 서는 파일**이다 — 바깥 참조가 없어 브라우저 · 일러스트레이터 ·
PowerPoint · Figma 어디서나 그대로 열린다. 색은 원본에서 뽑은 값 그대로다.

| 파일 | 크기 | 쓰이는 곳 |
|---|---|---|
| `band-cover.svg` | 1280×518 | 표지 파란 띠 |
| `band-chapter.svg` | 1280×374 | 챕터 표지 띠 (4·8·11·14·16·20쪽) |
| `band-header.svg` | 1280×62 | 본문 슬라이드 머리띠 |
| `wash-content.svg` | 1280×658 | 본문 바탕 워터마크 |
| `rules-stripes.svg` | 560×46 | 띠 아래 줄무늬 네 줄 |
| `dial-chapter.svg` | 180×200 | 챕터 원형 다이얼 — 가운데 숫자만 바꿔 쓴다 |
| `logo-dima.svg` | 420×150 | dima 워드마크 (흰색, 파란 띠 위) |
| `logo-dima-ink.svg` | 420×150 | dima 워드마크 (남색, 밝은 바탕 위) |
| `chart-grade-donut.svg` | 386×386 | 성적 반영 비율 도넛 — 출석20·중간30·기말30·과제20 |
| `timeline-submission.svg` | 900×300 | 과제물 제출 타임라인 (13쪽) |
| `flow-ai-guideline.svg` | 512×248 | 생성형 AI 활용 3단계 흐름 (19쪽) |
| `book-main.svg` | 172×300 | 주 교재 표지 도식 |
| `book-sub.svg` | 172×300 | 부 교재 표지 도식 |
| `avatar-professor.svg` | 176×176 | 교수 프로필 원 |
| `icon-checkbox-red.svg` | 32×32 | 빨간 체크박스 |
| `badge-ex-star.svg` | 80×80 | `ex` 별표 배지 |

## 색

```
cyan   #00A5DE     navy   #17365D     tint   #DEEBF7
blue   #0071CE     yellow #FFF100     line   #9DC3E6
deep   #005BAC     red    #C00000     ink    #3B3838
```

## 사진은 SVG 가 아니다

원본 PDF 에는 사진 세 장이 함께 들어 있었다. 사진은 벡터로 옮길 대상이 아니라
원본 그대로 뽑아 `../assets/` 에 두었다.

| 파일 | 원본 |
|---|---|
| `../assets/campus-gate.jpg` | 교문 · 벚꽃 (dima 표지석) |
| `../assets/studio-control.jpg` | 방송 부조정실 (CAM 1·2·3) |
| `../assets/campus-hall.jpg` | 본관 건물 |
| `../assets/bg-cover.jpg` | 위 두 장을 파란 그라디언트 아래 겹친 표지 배경 |
| `../assets/bg-chapter.jpg` | 같은 방식의 챕터 배경 |
| `../assets/bg-content.jpg` | 본관을 아주 옅게 깐 본문 바탕 |

`bg-*.jpg` 는 `../make-backgrounds.py` 로 다시 만들 수 있다.

## 부 교재 표지는 다시 그렸다

원본 7쪽에 실린 『밸류 프로포지션 디자인』 실제 책 표지는 출판사 저작물이라
그대로 쓰지 않고, `book-sub.svg` 로 서지사항만 담은 도식을 새로 그렸다.
