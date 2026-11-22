"""Generate the abstract background art in assets/art/.

Every piece is derived from something real in the portfolio:
  isodepth.svg  contour lines of the actual depth frame (frame 276) shown in the hero point cloud
  traces.svg    45-degree PCB routing with vias and a QFP footprint
  orbits.svg    Kepler ellipses sharing one focus, like the Lambert transfer search
  clock.svg     a timing diagram strip (clk, bus, valid), as seen in GTKWave

Run:  python tools/gen_art.py   (needs numpy + matplotlib)
"""
import base64, json, math, random, re
from pathlib import Path
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets" / "art"
OUT.mkdir(parents=True, exist_ok=True)
INK = "#1b1915"


def svg(w, h, body, extra=""):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}" {extra}>'
            f'{body}</svg>\n')


def isodepth():
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    m = re.search(r"const CLOUD=(\{.*?\});", html)
    cloud = json.loads(m.group(1))
    w, h = cloud["w"], cloud["h"]
    z = np.frombuffer(base64.b64decode(cloud["z"]), dtype=np.uint8).astype(float).reshape(h, w) / 255
    # upsample 4x and smooth so contours are calm, flowing lines
    z = np.kron(z, np.ones((4, 4)))
    k = np.ones(9) / 9
    pad = 16
    z = np.pad(z, pad, mode="edge")  # edge padding so the blur doesn't draw a frame
    for _ in range(3):
        z = np.apply_along_axis(lambda r: np.convolve(r, k, mode="same"), 1, z)
        z = np.apply_along_axis(lambda c: np.convolve(c, k, mode="same"), 0, z)
    z = z[pad:-pad, pad:-pad]
    H, W = z.shape
    fig = plt.figure()
    cs = plt.contour(np.arange(W), np.arange(H), z, levels=np.linspace(0.08, 0.92, 13))
    paths = []
    for li, segs in enumerate(cs.allsegs):
        for seg in segs:
            if len(seg) < 12:
                continue
            seg = seg[::4]
            d = "M" + " L".join(f"{x:.1f} {y:.1f}" for x, y in seg)
            op = 0.35 + 0.65 * (li / 12)
            paths.append(f'<path d="{d}" stroke-opacity="{op:.2f}"/>')
    plt.close(fig)
    body = f'<g fill="none" stroke="{INK}" stroke-width="1" stroke-linejoin="round" stroke-linecap="round">{"".join(paths)}</g>'
    (OUT / "isodepth.svg").write_text(svg(W, H, body), encoding="utf-8")


def traces():
    rnd = random.Random(7)
    W, H, g = 900, 600, 12
    out = []
    # QFP footprint
    cx, cy, s = 640, 300, 96
    out.append(f'<rect x="{cx-s/2}" y="{cy-s/2}" width="{s}" height="{s}" rx="4" fill="none" stroke="{INK}" stroke-width="1.2"/>')
    out.append(f'<circle cx="{cx-s/2+12}" cy="{cy-s/2+12}" r="3" fill="none" stroke="{INK}"/>')
    pins = []
    for i in range(10):
        o = -s / 2 + 8 + i * (s - 16) / 9
        for (px, py, dx, dy) in [(cx - s/2, cy + o, -1, 0), (cx + o, cy - s/2, 0, -1), (cx + o, cy + s/2, 0, 1)]:
            out.append(f'<rect x="{px + (dx*8 if dx else -1.5) - (0 if dx>=0 else 0)}" y="{py + (dy*8 if dy else -1.5)}" '
                       f'width="{8 if dx else 3}" height="{3 if dx else 8}" fill="{INK}" '
                       f'transform="translate({(-8 if dx<0 else 0)},{(-8 if dy<0 else 0)})"/>')
            pins.append((px + dx * 12, py + dy * 12, dx, dy))
    # route each pin out with one 45-degree jog, ending in a via
    for (x, y, dx, dy) in pins:
        if rnd.random() < 0.25:
            continue
        L1 = rnd.randint(2, 7) * g
        jog = rnd.choice([-1, 1]) * rnd.randint(1, 5) * g
        L2 = rnd.randint(4, 22) * g
        pts = [(x, y)]
        if dx:
            x1 = x + dx * L1; pts.append((x1, y))
            x2 = x1 + dx * abs(jog); y2 = y + jog; pts.append((x2, y2))
            pts.append((x2 + dx * L2, y2))
        else:
            y1 = y + dy * L1; pts.append((x, y1))
            y2 = y1 + dy * abs(jog); x2 = x + jog; pts.append((x2, y2))
            pts.append((x2, y2 + dy * L2))
        d = "M" + " L".join(f"{a:.0f} {b:.0f}" for a, b in pts)
        out.append(f'<path d="{d}" fill="none" stroke="{INK}" stroke-width="1.1" stroke-linejoin="round"/>')
        ex, ey = pts[-1]
        out.append(f'<circle cx="{ex:.0f}" cy="{ey:.0f}" r="3.2" fill="none" stroke="{INK}" stroke-width="1.1"/>')
    # a bus of parallel traces sweeping in from the left
    for i in range(7):
        y = 120 + i * 9
        d = f"M0 {y} L{220 - i*9} {y} L{300 - i*9} {y + 80} L{300 - i*9} {460 + i*9} L{330} {460 + i*9}"
        out.append(f'<path d="{d}" fill="none" stroke="{INK}" stroke-width="1"/>')
    (OUT / "traces.svg").write_text(svg(W, H, "".join(out)), encoding="utf-8")


def orbits():
    W, H = 900, 900
    fx, fy = 450, 450
    out = [f'<circle cx="{fx}" cy="{fy}" r="4" fill="#f2c46d"/>']
    for a, e, rot in [(110, .05, 0), (170, .02, 20), (240, .09, -30), (330, .05, 60), (430, .04, 10)]:
        b = a * math.sqrt(1 - e * e); c = a * e
        out.append(f'<ellipse cx="{fx - c}" cy="{fy}" rx="{a}" ry="{b:.1f}" transform="rotate({rot} {fx} {fy})" '
                   f'fill="none" stroke="#f2c46d" stroke-width="1"/>')
        for k in range(0, 360, 15):
            t = math.radians(k)
            x = fx - c + a * math.cos(t); y = fy + b * math.sin(t)
            r = math.radians(rot)
            X = fx + (x - fx) * math.cos(r) - (y - fy) * math.sin(r)
            Y = fy + (x - fx) * math.sin(r) + (y - fy) * math.cos(r)
            out.append(f'<circle cx="{X:.1f}" cy="{Y:.1f}" r="1.1" fill="#f2c46d"/>')
    # a transfer arc between orbit 2 and 4
    out.append(f'<path d="M{fx-170} {fy} A250 246 0 0 1 {fx+330} {fy}" fill="none" stroke="#9fd8ff" stroke-width="1" stroke-dasharray="3 6"/>')
    (OUT / "orbits.svg").write_text(svg(W, H, "".join(out)), encoding="utf-8")


def clock():
    W, H = 1600, 96
    out = []
    # clk
    d = "M0 22"
    for i in range(50):
        x = i * 32
        d += f" L{x} 22 L{x} 8 L{x+16} 8 L{x+16} 22"
    out.append(f'<path d="{d} L{W} 22" fill="none" stroke="{INK}" stroke-width="1"/>')
    # bus with values
    rnd = random.Random(3)
    x = 0; d = ""
    labels = []
    while x < W:
        n = rnd.choice([2, 3, 4, 6]) * 32
        x2 = min(W, x + n)
        d += f"M{x+3} 40 L{x2-3} 40 M{x+3} 58 L{x2-3} 58 M{x2-3} 40 L{x2+3} 58 M{x2-3} 58 L{x2+3} 40 "
        labels.append((x + (x2 - x) / 2, rnd.choice(["A5", "5A", "01", "1C", "28", "00", "FF", "3B", "C7", "10"])))
        x = x2
    out.append(f'<path d="{d}" fill="none" stroke="{INK}" stroke-width="1"/>')
    for lx, t in labels:
        out.append(f'<text x="{lx:.0f}" y="53" font-family="JetBrains Mono, monospace" font-size="10" text-anchor="middle" fill="{INK}">{t}</text>')
    # valid
    d = "M0 88"; x = 0; hi = False
    while x < W:
        n = rnd.choice([3, 5, 8]) * 32
        y = 76 if not hi else 88
        d += f" L{x} {88 if hi else 76}"
        hi = not hi
        x += n
        d += f" L{x} {88 if not hi else 76}"
    out.append(f'<path d="{d}" fill="none" stroke="{INK}" stroke-width="1"/>')
    (OUT / "clock.svg").write_text(svg(W, H, "".join(out)), encoding="utf-8")


if __name__ == "__main__":
    isodepth(); traces(); orbits(); clock()
    for p in sorted(OUT.iterdir()):
        print(p.name, p.stat().st_size)
