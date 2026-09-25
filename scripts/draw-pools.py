# Draws the pool sprite family as top-down line art (black on transparent),
# matching the generated sheets: double-line coping, wavy water, ladders/steps.
# Usage: python3 scripts/draw-pools.py   (needs Pillow)  -> public/sprites/pool-*.png
import math, random
from PIL import Image, ImageDraw

OUT = "public/sprites"
S = 0.7   # px per cm at 1x
SS = 4    # supersample
LW = 2 * SS
random.seed(7)

def canvas(w_cm, h_cm, pad=14):
    W, H = int(w_cm * S) + pad * 2, int(h_cm * S) + pad * 2
    im = Image.new("RGBA", (W * SS, H * SS), (0, 0, 0, 0))
    return im, ImageDraw.Draw(im), pad * SS, (W * SS, H * SS)

def finish(im, name):
    w, h = im.size
    im = im.resize((w // SS, h // SS), Image.LANCZOS)
    im.save(f"{OUT}/{name}.png")
    print(name, im.size)

def wave_layer(size, spacing, mask):
    """Horizontal wavy lines over the whole canvas, clipped by `mask`."""
    layer = Image.new("RGBA", size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    W, H = size
    y = spacing
    phase = 0.0
    while y < H:
        pts = []
        x = 0
        while x <= W:
            yy = y + math.sin(x / (18 * SS) + phase) * 3 * SS + random.uniform(-0.6, 0.6) * SS
            pts.append((x, yy))
            x += 6 * SS
        d.line(pts, fill=(0, 0, 0, 255), width=LW)
        y += spacing
        phase += 1.7
    out = Image.new("RGBA", size, (0, 0, 0, 0))
    out.paste(layer, (0, 0), mask)
    return out

def poly_mask(size, poly, shrink):
    """Filled mask of `poly` eroded by `shrink` px (via scaling about the centroid)."""
    m = Image.new("L", size, 0)
    cx = sum(p[0] for p in poly) / len(poly)
    cy = sum(p[1] for p in poly) / len(poly)
    sp = []
    for x, y in poly:
        dx, dy = x - cx, y - cy
        l = math.hypot(dx, dy) or 1
        sp.append((x - dx / l * shrink, y - dy / l * shrink))
    ImageDraw.Draw(m).polygon(sp, fill=255)
    return m

def coping_ticks(d, pts, outer_off, inner_off, every=22 * SS):
    """Tile joints across the coping band, along a closed polyline."""
    n = len(pts)
    acc = 0.0
    for i in range(n):
        a, b = pts[i], pts[(i + 1) % n]
        seg = math.hypot(b[0] - a[0], b[1] - a[1])
        if seg == 0:
            continue
        ux, uy = (b[0] - a[0]) / seg, (b[1] - a[1]) / seg
        nx, ny = -uy, ux
        t = every - acc
        while t < seg:
            px, py = a[0] + ux * t, a[1] + uy * t
            d.line([(px + nx * outer_off, py + ny * outer_off), (px + nx * inner_off, py + ny * inner_off)], fill=(0, 0, 0, 255), width=LW // 2)
            t += every
        acc = (seg - t + every) % every

def ladder(d, x, y, dirx, diry):
    """Pool ladder: two rails from (x,y) going (dirx,diry), 3 rungs."""
    L = 26 * SS
    g = 9 * SS
    nx, ny = -diry, dirx
    for s in (-1, 1):
        d.line([(x + nx * g * s, y + ny * g * s), (x + nx * g * s + dirx * L, y + ny * g * s + diry * L)], fill=(0, 0, 0, 255), width=LW)
    for k in (0.25, 0.55, 0.85):
        px, py = x + dirx * L * k, y + diry * L * k
        d.line([(px - nx * g, py - ny * g), (px + nx * g, py + ny * g)], fill=(0, 0, 0, 255), width=LW)

def rect_pool(name, w_cm, h_cm, *, coping=8, steps=None, ladder_at=None, infinity=False, lanes=0):
    im, d, pad, size = canvas(w_cm, h_cm)
    W, H = size
    c = coping * SS
    x0, y0, x1, y1 = pad, pad, W - pad, H - pad
    outer = [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]
    inner = [(x0 + c, y0 + c), (x1 - c, y0 + c), (x1 - c, y1 - c), (x0 + c, y1 - c)]
    if infinity:
        # the far (south) edge is a weir: no coping, a thin double lip and a trough beyond
        inner[2] = (x1 - c, y1 - c * 0.35)
        inner[3] = (x0 + c, y1 - c * 0.35)
    d.polygon(outer, outline=(0, 0, 0, 255), width=LW)
    d.polygon(inner, outline=(0, 0, 0, 255), width=LW)
    # tile joints on the coping (skip the weir edge)
    tick_pts = outer if not infinity else None
    if tick_pts:
        coping_ticks(d, outer, 0, c)
    else:
        coping_ticks(d, [(x0, y0), (x1, y0)], 0, c)
        coping_ticks(d, [(x1, y0), (x1, y1)], 0, c)
        coping_ticks(d, [(x0, y1), (x0, y0)], 0, c)
        # trough + dashes below the weir
        d.line([(x0 + c, y1 + 3 * SS), (x1 - c, y1 + 3 * SS)], fill=(0, 0, 0, 255), width=LW // 2)
        for x in range(int(x0 + c + 10 * SS), int(x1 - c), 14 * SS):
            d.line([(x, y1 - c * 0.35), (x, y1 + 3 * SS)], fill=(0, 0, 0, 255), width=LW // 2)
    mask = poly_mask(size, inner, 4 * SS)
    im.alpha_composite(wave_layer(size, 26 * SS, mask))
    d = ImageDraw.Draw(im)
    if lanes:
        # lane ropes: dotted lines along the long axis
        for i in range(1, lanes):
            x = x0 + c + (x1 - x0 - 2 * c) * i / lanes
            for y in range(int(y0 + c + 6 * SS), int(y1 - c), 8 * SS):
                d.ellipse([x - 1.5 * SS, y - 1.5 * SS, x + 1.5 * SS, y + 1.5 * SS], fill=(0, 0, 0, 255))
    if steps == "corner":
        for r in (26, 44, 62):
            rr = r * SS
            d.arc([x0 + c - rr, y0 + c - rr, x0 + c + rr, y0 + c + rr], 0, 90, fill=(0, 0, 0, 255), width=LW)
    elif steps == "end":
        for k in (1, 2, 3):
            y = y0 + c + k * 14 * SS
            d.line([(x0 + c, y), (x1 - c, y)], fill=(0, 0, 0, 255), width=LW)
    if ladder_at == "ne":
        ladder(d, x1 - c - 30 * SS, y0 + c + 2 * SS, 0, 1)
    finish(im, name)

def l_pool(name, w_cm, h_cm, arm_w_cm, arm_h_cm, coping=8):
    im, d, pad, size = canvas(w_cm, h_cm)
    W, H = size
    c = coping * SS
    aw, ah = arm_w_cm * S * SS, arm_h_cm * S * SS  # left arm width, top arm height
    def L(dd):
        x0, y0, x1, y1 = pad + dd, pad + dd, W - pad - dd, H - pad - dd
        return [(x0, y0), (x1, y0), (x1, pad + ah - dd), (pad + aw - dd, pad + ah - dd), (pad + aw - dd, y1), (x0, y1)]
    outer, inner = L(0), L(c)
    d.polygon(outer, outline=(0, 0, 0, 255), width=LW)
    d.polygon(inner, outline=(0, 0, 0, 255), width=LW)
    coping_ticks(d, outer, 0, c)
    m = Image.new("L", size, 0)
    ImageDraw.Draw(m).polygon(L(c + 4 * SS), fill=255)
    im.alpha_composite(wave_layer(size, 26 * SS, m))
    d = ImageDraw.Draw(im)
    for r in (26, 44, 62):
        rr = r * SS
        d.arc([pad + c - rr, H - pad - c - rr, pad + c + rr, H - pad - c + rr], 270, 360, fill=(0, 0, 0, 255), width=LW)
    ladder(d, W - pad - c - 30 * SS, pad + c + 2 * SS, 0, 1)
    finish(im, name)

def blob_pool(name, w_cm, h_cm, kidney=False, coping=8, rings=0, ladder_on=True):
    im, d, pad, size = canvas(w_cm, h_cm)
    W, H = size
    c = coping * SS
    cx, cy = W / 2, H / 2
    a, b = (W - 2 * pad) / 2, (H - 2 * pad) / 2
    def shape(shr):
        pts = []
        for i in range(160):
            t = i / 160 * math.tau
            x, y = (a - shr) * math.cos(t), (b - shr) * math.sin(t)
            if kidney and y < 0:
                y += (b - shr) * 0.55 * math.exp(-(math.cos(t) ** 2) / 0.12)
            pts.append((cx + x, cy + y))
        return pts
    outer, inner = shape(0), shape(c)
    d.polygon(outer, outline=(0, 0, 0, 255), width=LW)
    d.polygon(inner, outline=(0, 0, 0, 255), width=LW)
    coping_ticks(d, outer, 0, c, every=20 * SS)
    if rings:
        for k in range(1, rings + 1):
            d.polygon(shape(c + k * 9 * SS), outline=(0, 0, 0, 255), width=LW // 2)
    m = Image.new("L", size, 0)
    ImageDraw.Draw(m).polygon(shape(c + 4 * SS), fill=255)
    im.alpha_composite(wave_layer(size, 26 * SS, m))
    d = ImageDraw.Draw(im)
    if ladder_on:
        ladder(d, cx + a * 0.55, cy + b * 0.62, 0, 1)
    finish(im, name)

rect_pool("pool-infinity", 480, 260, infinity=True, steps="corner")
rect_pool("pool-lap", 250, 800, lanes=2, ladder_at="ne", steps="end")
rect_pool("pool-plunge", 250, 200, steps="end")
l_pool("pool-l", 500, 400, 220, 200)
blob_pool("pool-oval", 450, 300)
blob_pool("pool-kidney", 450, 320, kidney=True)
blob_pool("kids-pool", 180, 180, rings=2, ladder_on=False, coping=10)
