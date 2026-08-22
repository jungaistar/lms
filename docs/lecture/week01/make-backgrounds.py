# -*- coding: utf-8 -*-
"""assets/bg-*.jpg 를 다시 만든다.

원본 1주차 PDF 안에 들어 있던 사진 세 장(교문·부조정실·본관)을
파란 그라디언트 아래 겹쳐 슬라이드 배경 세 장을 합성한다.

    python3 make-backgrounds.py            # assets/ 안에서 읽고 쓴다
"""
import os
from PIL import Image, ImageEnhance

A = os.path.join(os.path.dirname(os.path.abspath(__file__)), "assets")
BLUE = [(0.00, (0x00, 0xA5, 0xDE)), (0.28, (0x00, 0x89, 0xD6)),
        (0.58, (0x00, 0x71, 0xCE)), (1.00, (0x00, 0x5B, 0xAC))]

def _ramp(w, h, stops, mode="RGB"):
    im = Image.new(mode, (w, h)); px = im.load()
    lerp = lambda a, b, t: (tuple(int(a[i] + (b[i]-a[i])*t) for i in range(3))
                            if mode == "RGB" else int(a + (b-a)*t))
    for x in range(w):
        t = x / (w - 1); v = stops[-1][1]
        for i in range(len(stops) - 1):
            p0, c0 = stops[i]; p1, c1 = stops[i + 1]
            if p0 <= t <= p1:
                v = lerp(c0, c1, (t - p0) / max(p1 - p0, 1e-9)); break
        for y in range(h): px[x, y] = v
    return im

hgrad = lambda w, h, s: _ramp(w, h, s, "RGB")
mask  = lambda w, h, s: _ramp(w, h, s, "L")

def fit(img, w, h):
    """box 를 꽉 채우도록 잘라 맞춘다 (object-fit: cover)"""
    r = max(w / img.width, h / img.height)
    im = img.resize((round(img.width * r), round(img.height * r)), Image.LANCZOS)
    l, t = (im.width - w) // 2, (im.height - h) // 2
    return im.crop((l, t, l + w, t + h))

gate   = Image.open(f"{A}/campus-gate.jpg").convert("RGB")
studio = Image.open(f"{A}/studio-control.jpg").convert("RGB")
hall   = Image.open(f"{A}/campus-hall.jpg").convert("RGB")

def band(w, h, out):
    base = hgrad(w, h, BLUE)
    s = ImageEnhance.Brightness(ImageEnhance.Color(fit(studio, w, h)).enhance(0.12)).enhance(1.10)
    base.paste(s, (0, 0), mask(w, h, [(0.0, 0), (0.44, 0), (0.60, 40), (0.74, 52), (1.0, 52)]))
    g = ImageEnhance.Brightness(ImageEnhance.Color(fit(gate, w, h)).enhance(0.08)).enhance(1.30)
    base.paste(g, (0, 0), mask(w, h, [(0.0, 34), (0.30, 34), (0.46, 0), (1.0, 0)]))
    base.save(out, quality=86, optimize=True); print(out, base.size)

band(1280, 518, f"{A}/bg-cover.jpg")
band(1280, 374, f"{A}/bg-chapter.jpg")

w, h = 1280, 658
wash = hgrad(w, h, [(0.0, (0xFF, 0xFF, 0xFF)), (1.0, (0xE4, 0xE7, 0xEB))])
faint = ImageEnhance.Brightness(ImageEnhance.Color(fit(hall, w, h)).enhance(0.0)).enhance(1.35)
Image.blend(wash, faint, 0.085).save(f"{A}/bg-content.jpg", quality=86, optimize=True)
print(f"{A}/bg-content.jpg", (w, h))

hgrad(1280, 62, BLUE).save(f"{A}/bg-header.jpg", quality=90)
print(f"{A}/bg-header.jpg")
