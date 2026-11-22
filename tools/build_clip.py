"""Build the hero's video-synced point cloud from the real O-Hive capture.

Inputs (O-Hive repo, not committed here):
  DA3/scripts/output_frames/frame_XXXX.png   1920x1080 frames of da3_test_video.mp4
  DA3/scripts/depth_outputs/depth_XXXX.npy   280x504 per-frame depth (metres) from Depth Anything 3

Outputs:
  assets/video/ohive_clip.mp4   the source clip (640x360, H.264, muted)
  assets/video/ohive_clip.jpg   poster frame
  assets/data/cloud_seq.bin     N frames x (W*H depth bytes + W*H luminance bytes)
  assets/data/cloud_seq.json    metadata, also printed so it can be inlined in index.html

Run:  python tools/build_clip.py
"""
import json, subprocess, shutil, sys
from pathlib import Path
import numpy as np
import cv2

SRC = Path(r"C:/Users/zainu/Projects/OHive/3D_spatial_reconstruction/DA3/scripts")
ROOT = Path(__file__).resolve().parents[1]
START, LEN, STEP = 412, 120, 3           # 4 s of 30 fps video (lamp, chair, bed); one cloud every 3 frames = 10 per second
W, H = 160, 90

vid_dir = ROOT / "assets" / "video"; vid_dir.mkdir(parents=True, exist_ok=True)
dat_dir = ROOT / "assets" / "data"; dat_dir.mkdir(parents=True, exist_ok=True)

frames = list(range(START, START + LEN, STEP))
deps, lums = [], []
for fi in frames:
    d = np.load(SRC / "depth_outputs" / f"depth_{fi:04d}.npy").astype(np.float32)
    deps.append(cv2.resize(d, (W, H), interpolation=cv2.INTER_AREA))
    g = cv2.cvtColor(cv2.imread(str(SRC / "output_frames" / f"frame_{fi:04d}.png")), cv2.COLOR_BGR2GRAY)
    lums.append(cv2.resize(g, (W, H), interpolation=cv2.INTER_AREA))
allz = np.stack(deps)
zmin, zmax = float(np.percentile(allz, 1)), float(np.percentile(allz, 95))  # clip the far tail (windows, open doors)
buf = bytearray()
for d, l in zip(deps, lums):
    t = np.clip((d - zmin) / (zmax - zmin), 0, 1)
    buf += (t * 255).round().astype(np.uint8).tobytes() + l.astype(np.uint8).tobytes()
(dat_dir / "cloud_seq.bin").write_bytes(bytes(buf))
meta = {"w": W, "h": H, "n": len(frames), "fps": 30 / STEP, "start": START, "step": STEP,
        "zmin": round(zmin, 3), "zmax": round(zmax, 3)}
(dat_dir / "cloud_seq.json").write_text(json.dumps(meta), encoding="utf-8")

ff = shutil.which("ffmpeg") or sys.exit("ffmpeg not found")
subprocess.run([ff, "-y", "-loglevel", "error", "-framerate", "30", "-start_number", str(START),
                "-i", str(SRC / "output_frames" / "frame_%04d.png"), "-frames:v", str(LEN),
                "-vf", "scale=640:360:flags=lanczos,format=yuv420p", "-c:v", "libx264", "-preset", "slow",
                "-crf", "28", "-movflags", "+faststart", "-an", str(vid_dir / "ohive_clip.mp4")], check=True)
cv2.imwrite(str(vid_dir / "ohive_clip.jpg"),
            cv2.resize(cv2.imread(str(SRC / "output_frames" / f"frame_{START:04d}.png")), (640, 360),
                       interpolation=cv2.INTER_AREA), [cv2.IMWRITE_JPEG_QUALITY, 80])

# first frame, inlined in index.html so the hero renders even before the sequence loads
import base64
first = {"w": W, "h": H, "zmin": meta["zmin"], "zmax": meta["zmax"],
         "z": base64.b64encode(bytes(buf[:W * H])).decode(), "l": base64.b64encode(bytes(buf[W * H:2 * W * H])).decode()}
(dat_dir / "cloud_first.json").write_text(json.dumps(first, separators=(",", ":")), encoding="utf-8")
for p in [vid_dir / "ohive_clip.mp4", vid_dir / "ohive_clip.jpg", dat_dir / "cloud_seq.bin"]:
    print(p.name, p.stat().st_size)
print(meta)
