import math, random, sys, subprocess, os
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

W, H, FPS = 1080, 1920, 30
DUR = 28.5
F = "/usr/share/fonts/opentype/inter/"
BLACK = F + "InterDisplay-Black.otf"
BOLD = F + "InterDisplay-Bold.otf"
ACC = (255, 214, 10)      # yellow highlight
ACC2 = (46, 230, 140)     # green
RED = (255, 72, 88)
WHITE = (255, 255, 255)

_fc = {}
def font(path, size):
    k = (path, size)
    if k not in _fc:
        _fc[k] = ImageFont.truetype(path, size)
    return _fc[k]

def ease_back(x, s=2.2):
    x = min(max(x, 0), 1) - 1
    return x * x * ((s + 1) * x + s) + 1

def ease_out(x):
    x = min(max(x, 0), 1)
    return 1 - (1 - x) ** 3

# ---------- text sprites ----------
_tc = {}
def text_sprite(txt, size, color=WHITE, box=None, path=BLACK, stroke=0):
    k = (txt, size, color, box, path)
    if k in _tc:
        return _tc[k]
    f = font(path, size)
    bb = f.getbbox(txt)
    tw, th = bb[2] - bb[0], bb[3] - bb[1]
    pad = int(size * 0.28)
    im = Image.new("RGBA", (tw + pad * 2, th + pad * 2), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    if box:
        d.rounded_rectangle([0, 0, im.width - 1, im.height - 1], radius=int(size * 0.22), fill=box)
    # soft shadow
    if not box:
        sh = Image.new("RGBA", im.size, (0, 0, 0, 0))
        ImageDraw.Draw(sh).text((pad - bb[0], pad - bb[1] + size * 0.06), txt, font=f, fill=(0, 0, 0, 170))
        sh = sh.filter(ImageFilter.GaussianBlur(size * 0.08))
        im = Image.alpha_composite(sh, im)
        d = ImageDraw.Draw(im)
    d.text((pad - bb[0], pad - bb[1]), txt, font=f, fill=color)
    _tc[k] = im
    return im

def paste_center(canvas, spr, cx, cy, scale=1.0, alpha=1.0, rot=0):
    if alpha <= 0.01 or scale <= 0.01:
        return
    s = spr
    if abs(scale - 1) > 0.005:
        s = s.resize((max(1, int(s.width * scale)), max(1, int(s.height * scale))), Image.BILINEAR)
    if rot:
        s = s.rotate(rot, resample=Image.BILINEAR, expand=True)
    if alpha < 0.999:
        a = s.getchannel("A").point(lambda v: int(v * alpha))
        s = s.copy(); s.putalpha(a)
    canvas.alpha_composite(s, (int(cx - s.width / 2), int(cy - s.height / 2)))

def slam(canvas, t, t0, spr, cx, cy, out_t=None):
    if t < t0:
        return
    p = (t - t0) / 0.28
    sc = 2.4 - 1.4 * ease_back(p) if p < 1 else 1.0
    al = min(1, (t - t0) / 0.09)
    if out_t is not None and t > out_t:
        al *= max(0, 1 - (t - out_t) / 0.15)
    paste_center(canvas, spr, cx, cy, sc, al)

# ---------- background ----------
def make_bg():
    y, x = np.mgrid[0:H, 0:W]
    r = np.sqrt((x - W / 2) ** 2 + ((y - H * 0.42) * 0.8) ** 2) / (H * 0.6)
    base = np.clip(1 - r, 0, 1) ** 1.6
    img = np.zeros((H, W, 3), np.float32)
    img[..., 0] = 8 + 70 * base
    img[..., 1] = 8 + 30 * base
    img[..., 2] = 20 + 140 * base
    return Image.fromarray(img.astype(np.uint8)).convert("RGBA")

def make_rays():
    S = 1400
    im = Image.new("L", (S, S), 0)
    d = ImageDraw.Draw(im)
    for i in range(18):
        a0 = i * 20 * math.pi / 180
        a1 = a0 + 7 * math.pi / 180
        d.polygon([(S / 2, S / 2), (S / 2 + S * math.cos(a0), S / 2 + S * math.sin(a0)),
                   (S / 2 + S * math.cos(a1), S / 2 + S * math.sin(a1))], fill=26)
    return im.filter(ImageFilter.GaussianBlur(6))

BG = make_bg()
RAYS = make_rays()
random.seed(7)
PARTS = [(random.random() * W, random.random() * H, random.uniform(2, 6), random.uniform(20, 70), random.random() * 6.28) for _ in range(70)]

def background(t, tint=(150, 110, 255)):
    c = BG.copy()
    r = RAYS.rotate(t * 9, resample=Image.BILINEAR)
    off = ((r.width - W) // 2, (r.height - H) // 2)
    # rays centred around upper-middle
    rl = Image.new("L", (W, H), 0)
    rl.paste(r, (int(W / 2 - r.width / 2), int(H * 0.42 - r.height / 2)))
    col = Image.new("RGBA", (W, H), tint + (0,))
    col.putalpha(rl)
    c.alpha_composite(col)
    d = ImageDraw.Draw(c)
    for (px, py, sz, sp, ph) in PARTS:
        yy = (py - t * sp) % H
        xx = px + 18 * math.sin(t * 0.8 + ph)
        a = int(110 + 80 * math.sin(t * 2 + ph))
        d.ellipse([xx - sz, yy - sz, xx + sz, yy + sz], fill=(200, 190, 255, a))
    return c

# ---------- logo ----------
def logo_sprite(scale=1.0):
    k = ("logo", scale)
    if k in _tc:
        return _tc[k]
    s = scale
    fx, fX = font(BLACK, int(150 * s)), font(BLACK, int(230 * s))
    fp = font(BOLD, int(110 * s))
    parts = [("X", fx), ("X", fX), ("M", fx)]
    widths = [f.getbbox(ch)[2] - f.getbbox(ch)[0] for ch, f in parts]
    gap = int(4 * s)
    pw = fp.getbbox("POS")[2]
    bw = sum(widths) + gap * 2 + int(70 * s) * 2
    bh = int(300 * s)
    tot = bw + int(36 * s) + pw
    im = Image.new("RGBA", (tot + 20, bh + 20), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([10, 10, 10 + bw, 10 + bh], radius=int(60 * s), fill=(0, 0, 0, 255), outline=(255, 255, 255, 60), width=max(2, int(3 * s)))
    x = 10 + int(70 * s)
    base = 10 + bh * 0.5
    for (ch, f), w in zip(parts, widths):
        bb = f.getbbox(ch)
        d.text((x - bb[0], base - (bb[1] + bb[3]) / 2), ch, font=f, fill=WHITE)
        x += w + gap
    bb = fp.getbbox("POS")
    d.text((10 + bw + int(36 * s) - bb[0], base - (bb[1] + bb[3]) / 2), "POS", font=fp, fill=WHITE)
    _tc[k] = im
    return im

# ---------- props ----------
def phone(canvas, t, t0, cx, cy):
    if t < t0:
        return
    p = ease_out((t - t0) / 0.5)
    pw, ph = 560, 980
    layer = Image.new("RGBA", (pw + 40, ph + 40), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    d.rounded_rectangle([20, 20, 20 + pw, 20 + ph], radius=80, fill=(14, 14, 22, 255), outline=(255, 255, 255, 90), width=6)
    d.rounded_rectangle([20 + pw / 2 - 70, 44, 20 + pw / 2 + 70, 74], radius=15, fill=(0, 0, 0, 255))
    d.text((70, 120), "Выручка сегодня", font=font(BOLD, 34), fill=(170, 170, 200))
    total = int(4_850_000 * ease_out((t - t0 - 0.3) / 2.0))
    s = f"{total:,}".replace(",", " ")
    d.text((70, 170), s, font=font(BLACK, 82), fill=ACC2)
    d.text((70, 270), "сум", font=font(BOLD, 40), fill=(170, 170, 200))
    rows = [("Кофе латте", "28 000"), ("Хлеб ×3", "15 000"), ("Шаурма", "35 000"), ("Сок", "12 000"), ("Торт", "180 000")]
    for i, (n, v) in enumerate(rows):
        tt = t - t0 - 0.6 - i * 0.35
        if tt < 0:
            continue
        a = ease_out(tt / 0.3)
        y = 360 + i * 120 + (1 - a) * 40
        d.rounded_rectangle([60, y, 20 + pw - 40, y + 96], radius=24, fill=(32, 32, 48, int(255 * a)))
        d.text((90, y + 26), n, font=font(BOLD, 36), fill=(255, 255, 255, int(255 * a)))
        d.text((20 + pw - 230, y + 26), "+" + v, font=font(BOLD, 36), fill=ACC2 + (int(255 * a),))
    paste_center(canvas, layer, cx, cy + (1 - p) * 500, 0.85 + 0.15 * p, p)

def bars(canvas, t, t0, cx, cy):
    if t < t0:
        return
    vals = [0.95, 0.78, 0.6, 0.42, 0.25]
    names = ["Кофе", "Хлеб", "Сок", "Торт", "Чай"]
    layer = Image.new("RGBA", (900, 640), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    d.rounded_rectangle([0, 0, 899, 639], radius=50, fill=(16, 16, 28, 230), outline=(255, 255, 255, 50), width=3)
    for i, (v, n) in enumerate(zip(vals, names)):
        g = ease_out((t - t0 - i * 0.12) / 0.6)
        y = 60 + i * 112
        d.text((40, y + 18), n, font=font(BOLD, 40), fill=WHITE)
        d.rounded_rectangle([210, y + 10, 210 + 640, y + 80], radius=35, fill=(40, 40, 60))
        if g > 0:
            col = ACC if i == 0 else (130, 110, 255)
            d.rounded_rectangle([210, y + 10, 210 + max(70, 640 * v * g), y + 80], radius=35, fill=col)
    a = ease_out((t - t0) / 0.35)
    paste_center(canvas, layer, cx, cy + (1 - a) * 200, 1, a)

def wifi(canvas, t, t0, t_ok, cx, cy):
    if t < t0:
        return
    a = ease_out((t - t0) / 0.3)
    layer = Image.new("RGBA", (520, 520), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    ok = t >= t_ok
    col = ACC2 if ok else (200, 200, 220)
    for i, r in enumerate([220, 150, 80]):
        d.arc([260 - r, 300 - r, 260 + r, 300 + r], 220, 320, fill=col, width=34)
    d.ellipse([235, 275, 285, 325], fill=col)
    if not ok:
        d.line([90, 90, 430, 430], fill=RED, width=40)
    else:
        g = ease_back((t - t_ok) / 0.3)
        c = Image.new("RGBA", (520, 520), (0, 0, 0, 0))
        cd = ImageDraw.Draw(c)
        cd.ellipse([300, 300, 500, 500], fill=ACC2)
        cd.line([345, 400, 390, 445, 460, 355], fill=(10, 30, 20), width=26, joint="curve")
        c = c.resize((520, 520))
        layer.alpha_composite(c)
    paste_center(canvas, layer, cx, cy, 0.7 + 0.3 * a, a)

def card(canvas, t, t0, cx, cy, title, sub, col):
    if t < t0:
        return
    layer = Image.new("RGBA", (400, 400), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    d.rounded_rectangle([0, 0, 399, 399], radius=48, fill=(18, 18, 30, 240), outline=col + (255,), width=6)
    f1 = font(BLACK, 58)
    for j, line in enumerate(title):
        bb = f1.getbbox(line)
        d.text((200 - (bb[2] - bb[0]) / 2 - bb[0], 90 + j * 80), line, font=f1, fill=col)
    f2 = font(BOLD, 34)
    bb = f2.getbbox(sub)
    d.text((200 - (bb[2] - bb[0]) / 2, 300), sub, font=f2, fill=(200, 200, 220))
    p = (t - t0) / 0.35
    sc = 1.8 - 0.8 * ease_back(p) if p < 1 else 1
    paste_center(canvas, layer, cx, cy, sc, min(1, (t - t0) / 0.1))

# ---------- timeline ----------
SCENES = [0.0, 3.85, 6.8, 10.15, 14.0, 18.15, 21.05, 25.05, DUR]
HITS = [0.1, 0.4, 1.2, 2.5, 3.9, 5.2, 6.9, 8.0, 9.1, 10.2, 11.3, 12.5, 14.1, 15.2, 16.9, 18.2, 19.3, 21.1, 22.0, 22.2, 24.2, 25.1, 25.9]

def scene_idx(t):
    for i in range(len(SCENES) - 1):
        if SCENES[i] <= t < SCENES[i + 1]:
            return i
    return len(SCENES) - 2

def content(t):
    si = scene_idx(t)
    tint = [(255, 80, 100), (255, 80, 100), (150, 110, 255), (60, 220, 150), (150, 110, 255), (60, 220, 150), (255, 200, 60), (150, 110, 255)][si]
    c = background(t, tint)
    T = text_sprite
    if si == 0:
        slam(c, t, 0.1, T("ВЫ НЕ", 150), W / 2, 560)
        slam(c, t, 0.4, T("В МАГАЗИНЕ", 130, (0, 0, 0), ACC), W / 2, 740)
        slam(c, t, 1.2, T("И НЕ ЗНАЕТЕ,", 110), W / 2, 980)
        slam(c, t, 2.5, T("ЧТО ТАМ", 120), W / 2, 1150)
        slam(c, t, 2.9, T("ПРОИСХОДИТ?", 120, RED), W / 2, 1300)
    elif si == 1:
        slam(c, t, 3.9, T("СКОЛЬКО ДЕНЕГ", 110), W / 2, 620)
        slam(c, t, 4.6, T("В КАССЕ?", 150, (0, 0, 0), ACC), W / 2, 810)
        slam(c, t, 5.2, T("ЧТО ПРОДАЛИ", 110), W / 2, 1080)
        slam(c, t, 5.8, T("СЕГОДНЯ?", 150, RED), W / 2, 1250)
        if t > 4.0:
            q = T("?", 420, (255, 255, 255, 40))
            paste_center(c, q, W / 2 + 330 + 20 * math.sin(t * 3), 380, 1, 0.5, rot=12 * math.sin(t * 2))
    elif si == 2:
        lg = logo_sprite(1.0)
        p = (t - 6.9) / 0.35
        sc = 3.0 - 2.0 * ease_back(p) if 0 <= p < 1 else (1.0 if p >= 1 else 0)
        if t >= 6.9:
            paste_center(c, lg, W / 2, 620, sc, min(1, (t - 6.9) / 0.08))
        slam(c, t, 8.0, T("ВЕСЬ ВАШ БИЗНЕС", 100), W / 2, 980)
        slam(c, t, 9.1, T("В КАРМАНЕ!", 150, (0, 0, 0), ACC2), W / 2, 1170)
    elif si == 3:
        slam(c, t, 10.2, T("КАЖДАЯ ПРОДАЖА", 96), W / 2, 330)
        slam(c, t, 11.3, T("КАЖДЫЙ СУМ", 110, (0, 0, 0), ACC), W / 2, 480)
        phone(c, t, 12.3, W / 2, 1180)
    elif si == 4:
        slam(c, t, 14.1, T("ОСТАТКИ НА СКЛАДЕ", 90), W / 2, 380)
        slam(c, t, 15.2, T("ТОП ТОВАРЫ", 120, (0, 0, 0), ACC), W / 2, 540)
        bars(c, t, 15.4, W / 2, 1050)
        slam(c, t, 16.9, T("С ОДНОГО ВЗГЛЯДА", 92, ACC2), W / 2, 1520)
    elif si == 5:
        slam(c, t, 18.2, T("НЕТ ИНТЕРНЕТА?", 110, RED), W / 2, 420)
        wifi(c, t, 18.25, 19.3, W / 2, 900)
        slam(c, t, 19.3, T("ПРОГРАММА", 120), W / 2, 1330)
        slam(c, t, 19.7, T("РАБОТАЕТ!", 150, (0, 0, 0), ACC2), W / 2, 1500)
    elif si == 6:
        card(c, t, 21.1, 250, 850, ["РАЗОВАЯ", "ОПЛАТА"], "навсегда ваша", ACC)
        if t > 22.0:
            paste_center(c, T("ИЛИ", 70), W / 2, 850, 1, min(1, (t - 22.0) / 0.1))
        card(c, t, 22.3, 830, 850, ["ПОД-", "ПИСКА"], "каждый месяц", ACC2)
        slam(c, t, 24.2, T("ВЫБИРАЙТЕ ВЫ!", 120, (0, 0, 0), ACC), W / 2, 1300)
        slam(c, t, 21.1, T("КАК УДОБНО ВАМ", 80, (210, 210, 230)), W / 2, 480)
    else:
        lg = logo_sprite(0.9)
        p = (t - 25.1) / 0.35
        sc = 2.6 - 1.6 * ease_back(p) if 0 <= p < 1 else 1.0
        paste_center(c, lg, W / 2, 640, sc if t >= 25.1 else 0, 1)
        slam(c, t, 25.5, T("ПИШИТЕ В ДИРЕКТ", 100), W / 2, 960)
        slam(c, t, 25.9, T("@xxmpos", 120, (0, 0, 0), ACC), W / 2, 1140)
        slam(c, t, 26.6, T("Магазин • Кафе • Ресторан", 56, (210, 210, 230), None, BOLD), W / 2, 1330)
    return c

def frame(t):
    c = content(t)
    # camera punch + shake on hits
    z, sx, sy = 1.0, 0.0, 0.0
    for h in HITS:
        if 0 <= t - h < 0.5:
            e = math.exp(-(t - h) * 9)
            z += 0.045 * e
            sx += 10 * e * math.sin((t - h) * 90 + h)
            sy += 10 * e * math.cos((t - h) * 77 + h)
    st = SCENES[scene_idx(t)]
    dt = t - st
    if st > 0 and dt < 0.3:
        z += 0.12 * (1 - ease_out(dt / 0.3))
    z += 0.02 * math.sin(t * 0.7)
    if abs(z - 1) > 0.002 or sx or sy:
        cw, ch = W / z, H / z
        x0 = (W - cw) / 2 - sx / z
        y0 = (H - ch) / 2 - sy / z
        c = c.transform((W, H), Image.EXTENT, (x0, y0, x0 + cw, y0 + ch), Image.BILINEAR)
    # flash on cut
    if st > 0 and dt < 0.18:
        fl = Image.new("RGBA", (W, H), (255, 255, 255, int(200 * (1 - dt / 0.18))))
        c.alpha_composite(fl)
    # progress bar
    d = ImageDraw.Draw(c)
    d.rectangle([0, H - 14, W, H], fill=(255, 255, 255, 40))
    d.rectangle([0, H - 14, W * t / DUR, H], fill=ACC)
    return c.convert("RGB")

def render_range(a, b, out):
    p = subprocess.Popen(["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
                          "-c:v", "libx264", "-preset", "veryfast", "-crf", "19", "-pix_fmt", "yuv420p", out], stdin=subprocess.PIPE)
    for i in range(a, b):
        p.stdin.write(frame(i / FPS).tobytes())
    p.stdin.close(); p.wait()

if __name__ == "__main__":
    if sys.argv[1] == "stills":
        ts = [float(x) for x in sys.argv[2].split(",")]
        ims = [frame(t).resize((270, 480)) for t in ts]
        sheet = Image.new("RGB", (270 * 5, 480 * ((len(ims) + 4) // 5)))
        for i, im in enumerate(ims):
            sheet.paste(im, ((i % 5) * 270, (i // 5) * 480))
        sheet.save("sheet.jpg", quality=85)
    else:
        a, b = int(sys.argv[2]), int(sys.argv[3])
        render_range(a, b, sys.argv[4])
