#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
원본 PDF 대조 — 만든 자료가 원본 내용을 얼마나 담고 있는지 글자로 확인한다.

원본 PDF 의 글을 쪽마다 뽑아 공백을 없앤 뒤 5글자씩 잘라, 그 조각이
결과물(PPTX · HTML · Markdown) 안에 있는지 센다. 사람 눈이 아니라 글자로
따지므로 "비슷해 보인다" 가 아니라 "몇 %가 그대로 들어 있다" 를 말할 수 있다.

    python3 materials/pptx/verify_coverage.py <원본.pdf>

결과는 화면과 dist/원본대조표.md 에 남는다.
"""

import re
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"
MINRUN = 4                  # 이만큼 이어져야 '그대로 들어 있다' 로 친다

# 원본 쪽 → 우리 슬라이드. 원본 25쪽 + 이번에 넣은 「생성형 AI 사용 지침」 1장.
PAGE_MAP = [
    (1, 1, "표지"),
    (2, 2, "강사 소개"),
    (3, 3, "목차"),
    (4, 4, "CHAPTER 1"),
    (5, 5, "강의 소개"),
    (6, 6, "교과 목표"),
    (7, 7, "수업 목표를 달성하면"),
    (8, 8, "CHAPTER 2"),
    (9, 9, "성적 평가 기준"),
    (10, 10, "출석 기준"),
    (11, 11, "CHAPTER 3"),
    (12, 12, "주차 별 강의 계획"),
    (13, 13, "과제물 제출 안내"),
    (14, 14, "CHAPTER 4"),
    (15, 15, "강의 요구 분석"),
    (16, 16, "CHAPTER 5"),
    (17, 17, "창업 인식도 조사"),
    (18, 18, "창업 인식도 조사 — 설문 방법"),
    (19, 19, "CHAPTER 6"),
    (20, 20, "진로준비도 검사란?"),
    (21, 21, "진로준비도 검사 — 접속 경로"),
    (22, 21, "고용24 화면 → 접속 경로 인포그래픽"),
    (23, 22, "고용24 검사 목록 → 검사 목록 인포그래픽"),
    (24, 23, "질의응답"),
    (25, 25, "다음 차시 안내"),
]

# 원본 22·23쪽은 브라우저 화면 갈무리다. 사이트 껍데기(메뉴·배너·안내문)는
# 강의 내용이 아니라서 인포그래픽으로 바꾸며 일부러 옮기지 않았다.
CHROME_PAGES = {22, 23}


def norm(t):
    t = unicodedata.normalize("NFKC", t or "")
    t = t.replace("〮", "·").replace("・", "·").replace("‧", "·")
    t = t.replace("–", "-").replace("—", "-").replace("‐", "-")
    t = t.replace("’", "'").replace("‘", "'").replace("“", '"').replace("”", '"')
    # 글머리표·화살표는 꾸밈이라 내용 대조에서 뺀다
    t = re.sub(r"[➢✓✔•▪▸▶‣◦●○□■❑※]", "", t)
    return re.sub(r"\s+", "", t)


def pdf_pages(path):
    import pypdfium2 as pdfium
    doc = pdfium.PdfDocument(str(path))
    return [doc[i].get_textpage().get_text_range() for i in range(len(doc))]


def pptx_text(path):
    from pptx import Presentation
    out = []
    prs = Presentation(str(path))
    for sl in prs.slides:
        buf = []
        for sh in sl.shapes:
            if sh.has_text_frame:
                buf.append(sh.text_frame.text)
            if getattr(sh, "has_table", False) and sh.has_table:
                for r in sh.table.rows:
                    for c in r.cells:
                        buf.append(c.text)
        out.append("\n".join(buf))
    return out


def cover(page_text, haystack):
    """원본 글자 가운데 결과물에 '이어진 채로' 들어 있는 비율.

    원본 PDF 에서 뽑은 글은 차례가 뒤죽박죽이고, 우리 슬라이드는 배치가
    다르다. 그래서 앞에서부터 가장 긴 일치를 욕심껏 집어 나가며 덮인
    글자 수를 센다 — 차례가 달라도 내용이 있으면 잡힌다.
    """
    P, D = norm(page_text), norm(haystack)
    if not P:
        return 1.0, []
    covered, gaps, i = 0, [], 0
    while i < len(P):
        lo, hi = MINRUN, len(P) - i
        best = 0
        if hi >= lo and P[i:i + lo] in D:
            while lo <= hi:                       # 가장 긴 일치를 이분 탐색
                mid = (lo + hi) // 2
                if P[i:i + mid] in D:
                    best, lo = mid, mid + 1
                else:
                    hi = mid - 1
        if best:
            covered += best
            i += best
        else:
            j = i
            while j < len(P) and not (j + MINRUN <= len(P) and P[j:j + MINRUN] in D):
                j += 1
            if j - i >= MINRUN:
                gaps.append(P[i:j])
            i = max(j, i + 1)
    return covered / len(P), gaps


def main():
    pdf = Path(sys.argv[1]) if len(sys.argv) > 1 else None
    if not pdf or not pdf.exists():
        sys.exit("원본 PDF 경로를 넘겨주세요:  python3 materials/pptx/verify_coverage.py <원본.pdf>")

    pages = pdf_pages(pdf)
    deck = DIST / "1주차_오리엔테이션.pptx"
    slides = pptx_text(deck)
    html = (DIST / "1주차_오리엔테이션.html").read_text(encoding="utf-8")
    html = re.sub(r"<script.*?</script>|<style.*?</style>", " ", html, flags=re.S)
    html = re.sub(r"<[^>]+>", " ", html)
    md = (DIST / "1주차_오리엔테이션.md").read_text(encoding="utf-8")

    all_pptx = "\n".join(slides)
    rows, total_hit, total_all = [], 0, 0

    for src, dst, name in PAGE_MAP:
        raw = pages[src - 1]
        if not norm(raw):
            continue
        ps, gaps = cover(raw, slides[dst - 1])
        pa, gaps_all = cover(raw, all_pptx)
        rows.append((src, dst, name, len(norm(raw)), ps * 100, pa * 100, gaps_all))
        if src not in CHROME_PAGES:
            total_hit += pa * len(norm(raw))
            total_all += len(norm(raw))

    def block(label, hay):
        hit = tot = 0
        for src, *_ in PAGE_MAP:
            if src in CHROME_PAGES:
                continue
            raw = pages[src - 1]
            n = len(norm(raw))
            if not n:
                continue
            c, _ = cover(raw, hay)
            hit += c * n
            tot += n
        return hit / tot * 100 if tot else 0.0

    print(f"\n원본 {pdf.name} — {len(pages)}쪽\n")
    print(f"{'원본':>4} {'슬라이드':>6}  {'해당 장':>6} {'전체':>6}  {'제목'}")
    print("-" * 78)
    for src, dst, name, n, ps, pa, miss in rows:
        flag = "※" if src in CHROME_PAGES else " "
        print(f"{src:>4} → {dst:>4}  {ps:>5.1f}% {pa:>5.1f}% {flag} {name}")
    print("-" * 78)
    print(f"원본 내용 반영률 (22·23쪽 화면 갈무리 제외)")
    print(f"  PPTX     {total_hit / total_all * 100:.1f}%")
    print(f"  HTML     {block('HTML', html):.1f}%")
    print(f"  Markdown {block('MD', md):.1f}%")

    # ---------------------------------------------------------------- 보고서
    out = ["# 원본 대조표 — 1주차 학습자료", "",
           f"원본 `{pdf.name}` {len(pages)}쪽에서 뽑은 글자 가운데, 결과물 안에",
           f"{MINRUN}글자 이상 이어진 채로 들어 있는 비율입니다. 배치 차례가 달라도 잡힙니다.", "",
           "| 원본 쪽 | 슬라이드 | 내용 | 해당 장 | 자료 전체 |",
           "|---:|---:|---|---:|---:|"]
    for src, dst, name, n, ps, pa, miss in rows:
        mark = " ※" if src in CHROME_PAGES else ""
        out.append(f"| {src} | {dst} | {name}{mark} | {ps:.1f}% | {pa:.1f}% |")
    out += ["",
            f"**PPTX 전체 반영률 {total_hit / total_all * 100:.1f}%** "
            f"· HTML {block('HTML', html):.1f}% · Markdown {block('MD', md):.1f}% "
            "(원본 22·23쪽 제외)",
            "",
            "※ 원본 22·23쪽은 고용24 누리집 화면 갈무리입니다. 사이트 메뉴·배너 같은",
            "껍데기 글자는 강의 내용이 아니라, 접속 경로와 검사 목록 인포그래픽으로",
            "바꾸어 담았습니다. 검사 이름·소요 시간·경로 같은 알맹이는 그대로 있습니다.",
            ""]
    out += ["## 일부러 다르게 한 것", "",
            "1. **디자인** — 2주차 학습자료의 시각 언어(헤더 그라디언트 띠 · 노란 섹션 칩 ·",
            "   3중 스트라이프 · 반원 챕터 배지 · 앰버 강조박스)를 입혔습니다. 글은 그대로입니다.",
            "2. **원본 22·23쪽** — 고용24 누리집 화면 갈무리를 접속 경로·검사 목록",
            "   인포그래픽으로 다시 그렸습니다. 사이트 메뉴·배너 같은 껍데기는 옮기지 않았습니다.",
            "3. **한 장 추가** — 24번째 슬라이드 「생성형 AI 사용 지침」은 원본에 없던 새 장입니다.",
            "4. **그림** — 원본의 그림은 모두 SVG 로 다시 그렸습니다 (`dist/svg/`).",
            ""]

    gaps = [(s, d, nm, m) for s, d, nm, n, ps, pa, m in rows if m and s not in CHROME_PAGES]
    if not gaps:
        out += ["## 빠진 글", "",
                f"**없습니다.** 원본에서 {MINRUN}글자 이상 이어진 글월은 모두 결과물 안에 있습니다.",
                "",
                "위 표의 100% 미만은 원본 PDF 에서 글을 뽑을 때 낱개로 떨어져 나온",
                f"쪽번호·목차 숫자·문장부호 같은 {MINRUN}글자 미만 조각 때문입니다.", ""]
        print(f"\n  빠진 글 없음 — 원본의 {MINRUN}글자 이상 이어진 글월은 모두 들어 있습니다.")
    if gaps:
        out += ["## 자료 어디에서도 찾지 못한 조각", "",
                "(아래가 비어 있으면 원본의 모든 글이 그대로 옮겨진 것입니다)", ""]
        for s, d, nm, m in gaps:
            out.append(f"- **원본 {s}쪽 → 슬라이드 {d}** {nm}")
            for x in m[:12]:
                out.append(f"  - `{x}`")
    (DIST / "원본대조표.md").write_text("\n".join(out) + "\n", encoding="utf-8")
    print(f"\n✓ dist/원본대조표.md")


if __name__ == "__main__":
    main()
