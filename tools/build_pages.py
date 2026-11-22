"""Generate the tab pages from index.html (the single source of truth).

Each page is index.html with a different <body data-page>, title, description and active tab;
CSS rules keyed on data-page decide which sections show. Edit index.html, then run:

    python tools/build_pages.py
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = (ROOT / "index.html").read_text(encoding="utf-8")

PAGES = {
    "hardware": ("hardware.html", "Hardware | Zain Usmani",
                 "FPGA flight computer, depth network to RTL, board bring-up, power distribution and RTL projects, with live demos."),
    "robotics": ("robotics.html", "Robotics and vision | Zain Usmani",
                 "Monocular depth and point clouds, race-car autonomy and drivers, wearable sensing and robot projects."),
    "about": ("about.html", "About | Zain Usmani",
              "Zain Usmani: third-year Electrical and Computer Engineering student, hardware first, then vision and embedded."),
}

for key, (fname, title, desc) in PAGES.items():
    s = SRC.replace('<body data-page="home">', f'<body data-page="{key}">', 1)
    s = re.sub(r"<title>.*?</title>", f"<title>{title}</title>", s, count=1)
    s = re.sub(r'<meta name="description" content="[^"]*">', f'<meta name="description" content="{desc}">', s, count=1)
    s = s.replace('<a href="index.html" class="act" aria-current="page">Home</a>', '<a href="index.html">Home</a>', 1)
    s = s.replace(f'<a href="{fname}">', f'<a href="{fname}" class="act" aria-current="page">', 1)
    (ROOT / fname).write_text(s, encoding="utf-8")
    print("wrote", fname)
