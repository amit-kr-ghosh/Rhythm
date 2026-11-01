"""Regenerates every app icon from one mark: a lime progress ring with a pulse line on charcoal.
Usage: python3 scripts/gen-icons.py   (needs Pillow)"""
import math
from PIL import Image, ImageDraw

BG = (31, 29, 38)          # charcoal
LIME = (216, 230, 127)
TRACK = (74, 73, 60)
WHITE = (255, 255, 255)
SS = 4                     # supersampling

def mark(size, ring_frac=0.58, bg=BG, track=TRACK, mono=False, pct=0.72):
    S = size * SS
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0) if bg is None else bg + (255,))
    d = ImageDraw.Draw(img)
    c = S / 2
    R = S * ring_frac / 2
    w = S * 0.085
    box = [c - R, c - R, c + R, c + R]
    ring_col = WHITE if mono else LIME
    if not mono:
        d.ellipse(box, outline=track, width=int(w))
    start = -90
    end = start + 360 * pct
    d.arc(box, start, end, fill=ring_col, width=int(w))
    for ang in (start, end):  # round caps
        x = c + (R - w / 2) * math.cos(math.radians(ang)); y = c + (R - w / 2) * math.sin(math.radians(ang))
        d.ellipse([x - w / 2, y - w / 2, x + w / 2, y + w / 2], fill=ring_col)
    # pulse line
    u = R * 0.9
    pts = [(-0.95, 0.0), (-0.38, 0.0), (-0.2, -0.45), (0.05, 0.5), (0.22, -0.12), (0.3, 0.0), (0.95, 0.0)]
    pts = [(c + x * u * 0.6, c + y * u * 0.6) for x, y in pts]
    lw = int(S * 0.04)
    d.line(pts, fill=WHITE, width=lw, joint='curve')
    for x, y in (pts[0], pts[-1]):
        d.ellipse([x - lw / 2, y - lw / 2, x + lw / 2, y + lw / 2], fill=WHITE)
    return img.resize((size, size), Image.LANCZOS)

def rounded(img, radius_frac):
    s = img.size[0]
    m = Image.new('L', (s * SS, s * SS), 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, s * SS - 1, s * SS - 1], radius=int(s * SS * radius_frac), fill=255)
    m = m.resize((s, s), Image.LANCZOS)
    out = Image.new('RGBA', (s, s), (0, 0, 0, 0)); out.paste(img, (0, 0), m); return out

# Launcher icon (full bleed — the OS applies its own mask)
mark(1024).convert('RGB').save('assets/icon.png')
# Android adaptive foreground: transparent, artwork inside the central safe zone
mark(1024, ring_frac=0.46, bg=None).save('assets/adaptive-icon.png')
# Splash: rounded tile on a transparent canvas (background colour comes from app.json)
tile = rounded(mark(600), 0.24)
canvas = Image.new('RGBA', (1024, 1024), (0, 0, 0, 0)); canvas.paste(tile, (212, 212), tile); canvas.save('assets/splash.png')
# Web favicon
rounded(mark(192), 0.22).resize((48, 48), Image.LANCZOS).save('assets/favicon.png')
# Android notification small icon: white on transparent
mark(96, ring_frac=0.8, bg=None, mono=True).save('assets/notification-icon.png')
print('icons written')
