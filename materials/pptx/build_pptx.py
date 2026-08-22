#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
layout.json → 편집 가능한 파워포인트 (.pptx)

extract-layout.mjs 가 뽑아 놓은 '실제로 그려진 자리'를 읽어, 슬라이드 위에
파워포인트 기본 도형으로 그대로 다시 놓는다. 그림 파일을 붙이는 게 아니라
글상자·사각형·타원·선·표·자유형으로 놓기 때문에 파워포인트에서 글자 하나까지
고칠 수 있다.

    node materials/build.mjs
    node materials/pptx/extract-layout.mjs
    python3 materials/pptx/build_pptx.py

좌표는 1280×720 px 기준이고 1px = 9525 EMU (13.333in × 7.5in, 16:9) 다.
"""

import json
import math
import re
import sys
from io import BytesIO
from pathlib import Path

from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE, MSO_CONNECTOR
from pptx.enum.text import MSO_ANCHOR, MSO_AUTO_SIZE, PP_ALIGN
from pptx.oxml.ns import qn
from pptx.util import Emu, Pt

ROOT = Path(__file__).resolve().parent.parent
LAYOUT = ROOT / "dist" / "layout.json"
ASSETS = ROOT / "assets"
CONTENT = ROOT / "dist" / "slides.json"

PX = 9525                      # 1 px (96dpi) = 9525 EMU
EMOJI_FONT = "/usr/share/fonts/truetype/noto/NotoColorEmoji.ttf"

# 파워포인트에서 쓸 글꼴. 한글 윈도우 오피스에 반드시 들어 있는 것으로 고른다.
FONT_KO = "맑은 고딕"
FONT_LATIN = "Arial"           # 원본의 Outfit(숫자·영문 라벨) 자리


def px(v):
    return Emu(int(round(v * PX)))


def pt(v):                     # px → pt (96dpi 기준)
    return Pt(v * 0.75)


def rgb(h):
    h = (h or "000000").lstrip("#")
    return RGBColor.from_string(h.upper()[:6])


# --------------------------------------------------------------- 이모지 그림
_emoji_cache = {}


def emoji_png(ch, size_px):
    """구글 이모지(Noto Color Emoji)를 그대로 PNG 로 뽑는다."""
    key = (ch, size_px)
    if key in _emoji_cache:
        return BytesIO(_emoji_cache[key])
    from PIL import Image, ImageDraw, ImageFont
    try:
        font = ImageFont.truetype(EMOJI_FONT, 109)     # 이 글꼴은 109px 한 종류뿐
    except OSError:
        return None
    img = Image.new("RGBA", (160, 160), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    try:
        d.text((80, 80), ch, font=font, anchor="mm", embedded_color=True)
    except Exception:
        return None
    bbox = img.getbbox()
    if not bbox:
        return None
    img = img.crop(bbox)
    side = max(img.size)
    sq = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    sq.paste(img, ((side - img.width) // 2, (side - img.height) // 2))
    out = sq.resize((max(64, size_px * 4),) * 2, Image.LANCZOS)
    buf = BytesIO()
    out.save(buf, "PNG")
    _emoji_cache[key] = buf.getvalue()
    buf.seek(0)
    return buf


# ------------------------------------------------------------------ 도형 손질
def picture(sl, name, x, y, w, h, *, alpha=None, behind=False):
    """배경 사진. alpha 는 0~1 (파워포인트 그림 투명도)."""
    f = ASSETS / name
    if not f.exists():
        return None
    pic = sl.shapes.add_picture(str(f), px(x), px(y), px(w), px(h))
    if alpha is not None:
        from pptx.oxml import parse_xml
        ns = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"'
        blip = pic._element.blipFill.find(qn("a:blip"))
        blip.append(parse_xml(f'<a:alphaModFix {ns} amt="{int(alpha * 100000)}"/>'))
    if behind:
        spTree = sl.shapes._spTree
        spTree.remove(pic._element)
        spTree.insert(2, pic._element)
    return pic


def plain(shape):
    """파워포인트 기본 테마가 씌우는 그림자·테두리를 걷어낸다."""
    shape.shadow.inherit = False
    shape.line.fill.background()
    return shape


def set_gradient(shape, grad):
    """CSS linear-gradient 를 DrawingML gradFill 로 옮긴다.

    CSS 0deg = 위쪽, 90deg = 오른쪽 / DrawingML 0° = 오른쪽, 시계방향.
    """
    stops = grad["stops"]
    ang = int(round((grad["angle"] - 90) % 360 * 60000))
    xml = ['<a:gradFill xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" rotWithShape="1"><a:gsLst>']
    for s in stops:
        pos = int(round(max(0.0, min(1.0, s["pos"])) * 100000))
        alpha = s.get("alpha", 1)
        a = "" if alpha >= 1 else f'<a:alpha val="{int(round(alpha * 100000))}"/>'
        xml.append(f'<a:gs pos="{pos}"><a:srgbClr val="{s["color"]}">{a}</a:srgbClr></a:gs>')
    xml.append(f'</a:gsLst><a:lin ang="{ang}" scaled="0"/></a:gradFill>')

    from pptx.oxml import parse_xml
    spPr = shape.fill._xPr
    for tag in ("a:noFill", "a:solidFill", "a:gradFill", "a:blipFill", "a:pattFill", "a:grpFill"):
        el = spPr.find(qn(tag))
        if el is not None:
            spPr.remove(el)
    grad_el = parse_xml("".join(xml))
    ln = spPr.find(qn("a:ln"))
    spPr.insert(list(spPr).index(ln) if ln is not None else len(spPr), grad_el)


def set_font(run, *, size, bold=False, color="16181D", latin=False, tracking=0):
    f = run.font
    f.size = pt(size)
    f.bold = bool(bold)
    f.color.rgb = rgb(color)
    f.name = FONT_LATIN if latin else FONT_KO
    # 한글은 latin typeface 가 아니라 ea typeface 를 본다
    rPr = run._r.get_or_add_rPr()
    for tag in ("a:ea", "a:cs"):
        old = rPr.find(qn(tag))
        if old is not None:
            rPr.remove(old)
    from pptx.oxml import parse_xml
    ns = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"'
    rPr.append(parse_xml(f'<a:ea {ns} typeface="{FONT_KO}"/>'))
    rPr.append(parse_xml(f'<a:cs {ns} typeface="{FONT_KO}"/>'))
    if tracking:
        rPr.set("spc", str(int(round(tracking * 0.75 * 100))))     # 1/100 pt


ALIGN = {"left": PP_ALIGN.LEFT, "center": PP_ALIGN.CENTER, "right": PP_ALIGN.RIGHT,
         "justify": PP_ALIGN.JUSTIFY, "start": PP_ALIGN.LEFT, "end": PP_ALIGN.RIGHT}


# ----------------------------------------------------------------- 그리기들
def draw_box(sl, n):
    r = n.get("radius", 0)
    w, h = n["w"], n["h"]
    if r > 1 and min(w, h) > 0:
        sh = sl.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, px(n["x"]), px(n["y"]), px(w), px(h))
        try:
            sh.adjustments[0] = min(0.5, r / min(w, h))
        except Exception:
            pass
    else:
        sh = sl.shapes.add_shape(MSO_SHAPE.RECTANGLE, px(n["x"]), px(n["y"]), px(w), px(h))
    sh.shadow.inherit = False
    sh.text_frame.word_wrap = False

    if n.get("grad"):
        set_gradient(sh, n["grad"])
    elif n.get("fill"):
        sh.fill.solid()
        sh.fill.fore_color.rgb = rgb(n["fill"])
    else:
        sh.fill.background()

    if n.get("stroke") and n.get("strokeW"):
        sh.line.color.rgb = rgb(n["stroke"])
        sh.line.width = px(n["strokeW"])
        if n.get("dashed"):
            sh.line.dash_style = 4          # MSO_LINE_DASH_STYLE.DASH
    else:
        sh.line.fill.background()

    # 네 변의 굵기·색이 다르면 변마다 선을 따로 놓는다 (제목 밑줄 등)
    for b in n.get("rules", []):
        x, y, W, H = n["x"], n["y"], n["w"], n["h"]
        seg = {"top": (x, y, x + W, y), "bottom": (x, y + H, x + W, y + H),
               "left": (x, y, x, y + H), "right": (x + W, y, x + W, y + H)}[b["side"]]
        ln = sl.shapes.add_connector(MSO_CONNECTOR.STRAIGHT, px(seg[0]), px(seg[1]), px(seg[2]), px(seg[3]))
        ln.line.color.rgb = rgb(b.get("color") or "D9E2EC")
        ln.line.width = px(max(1, b["w"]))
        ln.shadow.inherit = False
    return sh


# 글상자 가로 여유. 1.0 = 브라우저와 같은 폭.
# 늘리면 강조 상자 밖으로 글이 삐져나가므로 늘리지 말 것 —
# 글꼴 너비 차이는 세로로(줄이 하나 더 생기는 쪽으로) 흡수한다.
SLACK = 1.0


def draw_text(sl, n):
    padL, padT = n.get("padL", 0), n.get("padT", 0)
    padR, padB = n.get("padR", 0), n.get("padB", 0)
    x, y = n["x"] + padL, n["y"] + padT
    w = max(8, n["w"] - padL - padR)
    h = max(8, n["h"] - padT - padB)
    align = n.get("align", "left")
    one_line = n.get("nowrap") or n.get("lines", 2) <= 1

    if one_line and n.get("textW"):
        # 한 줄짜리는 접히면 안 된다. 상자를 넉넉히 잡되 맞춤 기준선(왼쪽/오른쪽/
        # 가운데)은 글이 실제로 놓였던 자리에 맞춘다. 세로는 글줄의 한가운데에
        # 맞춰 두어, 그리는 쪽이 위 정렬이든 가운데 정렬이든 같은 자리에 온다.
        tw = n["textW"]
        th = n.get("textH") or n["size"] * 1.35
        w = tw * 1.6 + 40
        if align == "right":
            x = n["textX"] + tw - w
        elif align == "center":
            x = n["textX"] + tw / 2 - w / 2
        else:
            x = n["textX"]
        h = max(th, n["size"] * 1.7)
        y = y + th / 2 - h / 2
    else:
        # 폭이 글에 맞춰 줄어든 요소만 여유를 준다. 강조 상자 안의 글은
        # 상자 폭 그대로 둬야 테두리 밖으로 삐져나가지 않는다.
        slack = 1.12 if n.get("shrink") else SLACK
        extra = w * (slack - 1)
        if align == "right":
            x -= extra
        elif align == "center":
            x -= extra / 2
        w += extra

    tb = sl.shapes.add_textbox(px(x), px(y - 2), px(w), px(h + 6))
    tf = tb.text_frame
    tf.word_wrap = not one_line
    tf.vertical_anchor = MSO_ANCHOR.TOP
    # python-pptx 기본값은 spAutoFit 이다. 그대로 두면 그리는 쪽이 상자를
    # 글에 맞춰 줄이면서 가운데로 당겨, 줄마다 왼쪽 끝이 들쭉날쭉해진다.
    tf.auto_size = MSO_AUTO_SIZE.NONE
    if one_line:
        tf.vertical_anchor = MSO_ANCHOR.MIDDLE
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0

    p = tf.paragraphs[0]
    p.alignment = ALIGN.get(align, PP_ALIGN.LEFT)
    lh = n.get("lineHeight") or n["size"] * 1.4
    p.line_spacing = pt(lh)
    p.space_before = Pt(0)
    p.space_after = Pt(0)

    for r in n["runs"]:
        for i, chunk in enumerate(str(r["text"]).split("\n")):
            if i:
                p = tf.add_paragraph()
                p.alignment = ALIGN.get(align, PP_ALIGN.LEFT)
                p.line_spacing = pt(lh)
                p.space_before = Pt(0)
                p.space_after = Pt(0)
            run = p.add_run()
            run.text = chunk
            latin = "Outfit" in (r.get("font") or "")
            set_font(run, size=r.get("size") or n["size"], bold=r.get("bold"),
                     color=r.get("color") or n.get("color"), latin=latin,
                     tracking=n.get("tracking", 0))
    return tb


def draw_centered_text(sl, x, y, w, h, text, *, size, bold, color, latin=False, anchor="middle"):
    """SVG 안의 글자. anchor 로 어느 끝을 붙잡을지 정한다 (text-anchor 와 같다)."""
    H = max(h, size * 1.7)
    pad = max(24, w * 0.35)
    if anchor == "start":
        X, align = x, PP_ALIGN.LEFT
    elif anchor == "end":
        X, align = x - pad * 2, PP_ALIGN.RIGHT
    else:
        X, align = x - pad, PP_ALIGN.CENTER
    tb = sl.shapes.add_textbox(px(X), px(y + h / 2 - H / 2), px(w + pad * 2), px(H))
    tf = tb.text_frame
    tf.word_wrap = False
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    tf.vertical_anchor = MSO_ANCHOR.MIDDLE
    tf.auto_size = MSO_AUTO_SIZE.NONE
    p = tf.paragraphs[0]
    p.alignment = align
    p.line_spacing = pt(size * 1.2)
    run = p.add_run()
    run.text = text
    set_font(run, size=size, bold=bold, color=color, latin=latin)
    return tb


def draw_marker(sl, n):
    kind = n["kind"]
    if kind == "square":
        sh = plain(sl.shapes.add_shape(MSO_SHAPE.RECTANGLE, px(n["x"]), px(n["y"]), px(n["d"]), px(n["d"])))
        sh.fill.solid(); sh.fill.fore_color.rgb = rgb(n["fill"])
    elif kind == "circle":
        sh = plain(sl.shapes.add_shape(MSO_SHAPE.OVAL, px(n["x"]), px(n["y"]), px(n["d"]), px(n["d"])))
        sh.fill.solid(); sh.fill.fore_color.rgb = rgb(n["fill"])
        if n.get("text"):
            draw_centered_text(sl, n["x"], n["y"], n["d"], n["d"], n["text"],
                               size=n.get("size", 16), bold=True,
                               color=n.get("color", "FFFFFF"), latin=True)
    elif kind == "bar":
        sh = plain(sl.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, px(n["x"]), px(n["y"]), px(n["w"]), px(n["h"])))
        set_gradient(sh, {"angle": 180, "stops": [{"color": n["from"], "pos": 0, "alpha": 1},
                                                  {"color": n["to"], "pos": 1, "alpha": 1}]})
    elif kind == "glyph":
        draw_centered_text(sl, n["x"], n["y"], n["size"], n["size"] * 1.3,
                           n["ch"], size=n["size"], bold=n.get("bold", False), color=n["color"])


def draw_emoji(sl, x, y, w, h, ch):
    buf = emoji_png(ch, int(max(w, h)) or 24)
    if buf is None:
        return
    side = min(w, h)
    sl.shapes.add_picture(buf, px(x + (w - side) / 2), px(y + (h - side) / 2), px(side), px(side))


# ------------------------------------------------------- SVG path → 자유형
def flatten_path(d, tx, ty, k, ox, oy):
    """d 속성을 점 목록으로 편다. 우리가 쓰는 명령(M L l H h V v A z)만 다룬다."""
    toks = re.findall(r"[MmLlHhVvAaZz]|-?\d*\.?\d+(?:e-?\d+)?", d)
    pts, i = [], 0
    cx = cy = sx = sy = 0.0
    cmd = None

    def emit(x, y):
        pts.append((ox + (x + tx) * k, oy + (y + ty) * k))

    while i < len(toks):
        t = toks[i]
        if re.match(r"[A-Za-z]", t):
            cmd = t
            i += 1
            if cmd in "Zz":
                if pts:
                    cx, cy = sx, sy
                continue
        nums = []
        need = {"M": 2, "m": 2, "L": 2, "l": 2, "H": 1, "h": 1, "V": 1, "v": 1, "A": 7, "a": 7}[cmd]
        while len(nums) < need and i < len(toks):
            nums.append(float(toks[i])); i += 1
        if cmd in "Mm":
            cx = nums[0] + (cx if cmd == "m" else 0)
            cy = nums[1] + (cy if cmd == "m" else 0)
            sx, sy = cx, cy
            emit(cx, cy)
            cmd = "L" if cmd == "M" else "l"
        elif cmd in "Ll":
            cx = nums[0] + (cx if cmd == "l" else 0)
            cy = nums[1] + (cy if cmd == "l" else 0)
            emit(cx, cy)
        elif cmd in "Hh":
            cx = nums[0] + (cx if cmd == "h" else 0); emit(cx, cy)
        elif cmd in "Vv":
            cy = nums[0] + (cy if cmd == "v" else 0); emit(cx, cy)
        elif cmd in "Aa":
            rx, ry, rot, laf, sf, ex, ey = nums
            if cmd == "a":
                ex += cx; ey += cy
            for x, y in arc_points(cx, cy, rx, ry, rot, laf, sf, ex, ey):
                emit(x, y)
            cx, cy = ex, ey
    return pts


def arc_points(x1, y1, rx, ry, rot, laf, sf, x2, y2, steps=None):
    """SVG 타원호를 잘게 나눈다 (끝점 → 중심 매개변수화)."""
    if rx == 0 or ry == 0:
        return [(x2, y2)]
    phi = math.radians(rot)
    dx2, dy2 = (x1 - x2) / 2.0, (y1 - y2) / 2.0
    x1p = math.cos(phi) * dx2 + math.sin(phi) * dy2
    y1p = -math.sin(phi) * dx2 + math.cos(phi) * dy2
    rx, ry = abs(rx), abs(ry)
    lam = x1p**2 / rx**2 + y1p**2 / ry**2
    if lam > 1:
        s = math.sqrt(lam); rx *= s; ry *= s
    num = rx**2 * ry**2 - rx**2 * y1p**2 - ry**2 * x1p**2
    den = rx**2 * y1p**2 + ry**2 * x1p**2
    co = math.sqrt(max(0.0, num / den)) * (-1 if laf == sf else 1)
    cxp, cyp = co * rx * y1p / ry, -co * ry * x1p / rx
    cx = math.cos(phi) * cxp - math.sin(phi) * cyp + (x1 + x2) / 2
    cy = math.sin(phi) * cxp + math.cos(phi) * cyp + (y1 + y2) / 2

    def ang(ux, uy, vx, vy):
        d = (ux * vx + uy * vy) / (math.hypot(ux, uy) * math.hypot(vx, vy))
        a = math.acos(max(-1.0, min(1.0, d)))
        return -a if ux * vy - uy * vx < 0 else a

    th1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry)
    dth = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry)
    if sf == 0 and dth > 0:
        dth -= 2 * math.pi
    elif sf == 1 and dth < 0:
        dth += 2 * math.pi
    n = steps or max(6, int(abs(dth) / (math.pi / 36)))          # 5° 마다
    out = []
    for i in range(1, n + 1):
        t = th1 + dth * i / n
        px_ = math.cos(phi) * rx * math.cos(t) - math.sin(phi) * ry * math.sin(t) + cx
        py_ = math.sin(phi) * rx * math.cos(t) + math.cos(phi) * ry * math.sin(t) + cy
        out.append((px_, py_))
    return out


def draw_path(sl, it):
    pts = flatten_path(it["d"], it["tx"], it["ty"], it["k"], it["ox"], it["oy"])
    if len(pts) < 2:
        return
    builder = sl.shapes.build_freeform(px(pts[0][0]), px(pts[0][1]), scale=1.0)
    builder.add_line_segments([(px(x), px(y)) for x, y in pts[1:]], close=True)
    sh = builder.convert_to_shape()
    sh.shadow.inherit = False
    if it.get("grad"):
        set_gradient(sh, it["grad"])
    elif it.get("fill"):
        sh.fill.solid(); sh.fill.fore_color.rgb = rgb(it["fill"])
    else:
        sh.fill.background()
    if it.get("stroke"):
        sh.line.color.rgb = rgb(it["stroke"]); sh.line.width = px(it.get("strokeW") or 1)
    else:
        sh.line.fill.background()


def draw_svg(sl, n):
    for it in n["items"]:
        s = it["shape"]
        if s == "rect":
            r = it.get("rx", 0)
            if r > 1:
                sh = sl.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, px(it["x"]), px(it["y"]), px(it["w"]), px(it["h"]))
                try:
                    sh.adjustments[0] = min(0.5, r / min(it["w"], it["h"]))
                except Exception:
                    pass
            else:
                sh = sl.shapes.add_shape(MSO_SHAPE.RECTANGLE, px(it["x"]), px(it["y"]), px(it["w"]), px(it["h"]))
            sh.shadow.inherit = False
            sh.text_frame.word_wrap = False
            if it.get("grad"):
                set_gradient(sh, it["grad"])
            elif it.get("fill"):
                sh.fill.solid(); sh.fill.fore_color.rgb = rgb(it["fill"])
                if it.get("opacity", 1) < 1:
                    _set_alpha(sh, it["opacity"])
            else:
                sh.fill.background()
            if it.get("stroke"):
                sh.line.color.rgb = rgb(it["stroke"]); sh.line.width = px(it.get("strokeW") or 1)
            else:
                sh.line.fill.background()
        elif s == "oval":
            sh = plain(sl.shapes.add_shape(MSO_SHAPE.OVAL, px(it["x"]), px(it["y"]), px(it["w"]), px(it["h"])))
            if it.get("grad"):
                set_gradient(sh, it["grad"])
            elif it.get("fill"):
                sh.fill.solid(); sh.fill.fore_color.rgb = rgb(it["fill"])
            else:
                sh.fill.background()
            if it.get("stroke"):
                sh.line.color.rgb = rgb(it["stroke"]); sh.line.width = px(it.get("strokeW") or 1)
        elif s == "line":
            ln = sl.shapes.add_connector(MSO_CONNECTOR.STRAIGHT, px(it["x1"]), px(it["y1"]), px(it["x2"]), px(it["y2"]))
            ln.line.color.rgb = rgb(it.get("stroke") or "9DC3E6")
            ln.line.width = px(it.get("strokeW") or 2)
            ln.shadow.inherit = False
        elif s == "text":
            if it.get("emoji"):
                draw_emoji(sl, it["x"], it["y"], it["w"], it["h"], it["text"].strip())
            else:
                draw_centered_text(sl, it["x"], it["y"], it["w"], it["h"], it["text"],
                                   size=it["size"], bold=it["bold"], color=it["color"],
                                   latin=not re.search(r"[가-힣]", it["text"]),
                                   anchor=it.get("anchor", "middle"))
        elif s == "arctext":
            for c in it["chars"]:
                side = it["size"] * 2.2
                tb = draw_centered_text(sl, c["cx"] - side / 2, c["cy"] - side / 2, side, side,
                                        c["ch"], size=it["size"], bold=it["bold"],
                                        color=it["color"], latin=True)
                tb.rotation = c["rot"]
        elif s == "path":
            draw_path(sl, it)


def _set_alpha(shape, a):
    from pptx.oxml import parse_xml
    srgb = shape.fill._xPr.find(qn("a:solidFill")).find(qn("a:srgbClr"))
    ns = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"'
    srgb.append(parse_xml(f'<a:alpha {ns} val="{int(a * 100000)}"/>'))


# ------------------------------------------------------------------------ 표
def _cell_border(cell, color="9DC3E6", w=1):
    from pptx.oxml import parse_xml
    ns = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"'
    tcPr = cell._tc.get_or_add_tcPr()
    for tag in ("a:lnL", "a:lnR", "a:lnT", "a:lnB"):
        old = tcPr.find(qn(tag))
        if old is not None:
            tcPr.remove(old)
    for tag in ("a:lnL", "a:lnR", "a:lnT", "a:lnB"):
        tcPr.append(parse_xml(
            f'<{tag} {ns} w="{int(w * PX)}" cap="flat" cmpd="sng" algn="ctr">'
            f'<a:solidFill><a:srgbClr val="{color}"/></a:solidFill></{tag}>'))


def draw_table(sl, n):
    rows = n["rows"]
    ncols = max(len(r["cells"]) for r in rows)
    gf = sl.shapes.add_table(len(rows), ncols, px(n["x"]), px(n["y"]), px(n["w"]), px(n["h"]))
    tbl = gf.table
    tbl.first_row = False
    tbl.horz_banding = False

    for j, c in enumerate(rows[0]["cells"][:ncols]):
        tbl.columns[j].width = px(c["w"])
    for i, r in enumerate(rows):
        tbl.rows[i].height = px(r["cells"][0]["h"] if r["cells"] else 24)

    for i, r in enumerate(rows):
        for j, c in enumerate(r["cells"][:ncols]):
            cell = tbl.cell(i, j)
            cell.margin_left = px(10)
            cell.margin_right = px(10)
            cell.margin_top = px(3)
            cell.margin_bottom = px(3)
            cell.vertical_anchor = MSO_ANCHOR.MIDDLE
            if c.get("fill"):
                cell.fill.solid(); cell.fill.fore_color.rgb = rgb(c["fill"])
            else:
                cell.fill.background()
            _cell_border(cell)
            tf = cell.text_frame
            tf.word_wrap = True
            p = tf.paragraphs[0]
            p.alignment = ALIGN.get(c.get("align", "left"), PP_ALIGN.LEFT)
            p.line_spacing = pt(c["size"] * 1.3)
            for run_spec in (c["runs"] or [{"text": "", "size": c["size"], "bold": c.get("head"), "color": c["color"]}]):
                run = p.add_run()
                run.text = str(run_spec["text"])
                set_font(run, size=run_spec.get("size") or c["size"],
                         bold=run_spec.get("bold") or c.get("head"),
                         color=run_spec.get("color") or c["color"])
        if r.get("current") or r.get("shadow"):
            c0, cN = r["cells"][0], r["cells"][-1]
            y, h = c0["y"], c0["h"]
            box = sl.shapes.add_shape(MSO_SHAPE.RECTANGLE,
                                      px(c0["x"]), px(y), px(cN["x"] + cN["w"] - c0["x"]), px(h))
            box.shadow.inherit = False
            box.fill.background()
            box.line.color.rgb = rgb("C00000")
            box.line.width = px(2)
            box.line.dash_style = 4


# --------------------------------------------------------------------- 본체
def build():
    if not LAYOUT.exists():
        sys.exit(f"먼저 좌표를 뽑으세요: node materials/pptx/extract-layout.mjs\n  없는 파일: {LAYOUT}")
    data = json.loads(LAYOUT.read_text(encoding="utf-8"))
    content = json.loads(CONTENT.read_text(encoding="utf-8"))
    meta = content["meta"]
    names = {s["index"]: s for s in data["slides"]}

    prs = Presentation()
    prs.slide_width = px(data["w"])
    prs.slide_height = px(data["h"])
    blank = prs.slide_layouts[6]

    for s in data["slides"]:
        sl = prs.slides.add_slide(blank)
        for n in s["nodes"]:
            t = n["type"]
            if t in ("bg", "box"):
                if t == "bg":
                    base = dict(n); base["grad"] = None
                    draw_box(sl, base)
                    if s.get("campus"):
                        c = s["campus"]
                        picture(sl, "bg-campus.jpg", c["x"], c["y"], c["w"], c["h"] - c["y"], alpha=0.5)
                elif n.get("bgImage"):
                    picture(sl, {"cover": "bg-cover.jpg", "band": "bg-band.jpg"}[n["bgImage"]],
                            n["x"], n["y"], n["w"], n["h"])
                else:
                    draw_box(sl, n)
            elif t == "text":
                draw_text(sl, n)
            elif t == "marker":
                draw_marker(sl, n)
            elif t == "emoji":
                draw_emoji(sl, n["x"], n["y"], n["w"], n["h"], n["char"])
            elif t == "svg":
                draw_svg(sl, n)
            elif t == "table":
                draw_table(sl, n)

        note = sl.notes_slide.notes_text_frame
        src = content["slides"][s["index"] - 1]
        note.text = f"{s['index']}. {s['name']}" + ("  · 이번에 추가한 장" if src.get("added") else "")

    out = ROOT / "dist" / f"{meta['slug']}.pptx"
    prs.save(out)
    print(f"✓ {out.name}   (슬라이드 {len(data['slides'])}장)")
    return out


if __name__ == "__main__":
    build()
