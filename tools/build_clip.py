"""Cut the source-footage clip shown beside the hero point cloud.

Input (O-Hive repo, not committed here):
  DA3/scripts/output_frames/frame_XXXX.png   1920x1080 frames of da3_test_video.mp4

Output:
  assets/video/ohive_clip.mp4   4 s clip (640x360, H.264, muted)
  assets/video/ohive_clip.jpg   poster frame

Run:  python tools/build_clip.py   (needs ffmpeg on PATH)
"""
import shutil, subprocess, sys
from pathlib import Path
import cv2

SRC = Path(r"C:/Users/zainu/Projects/OHive/3D_spatial_reconstruction/DA3/scripts/output_frames")
ROOT = Path(__file__).resolve().parents[1]
START, LEN = 412, 120                     # lamp, chair, bed

out = ROOT / "assets" / "video"; out.mkdir(parents=True, exist_ok=True)
ff = shutil.which("ffmpeg") or sys.exit("ffmpeg not found")
subprocess.run([ff, "-y", "-loglevel", "error", "-framerate", "30", "-start_number", str(START),
                "-i", str(SRC / "frame_%04d.png"), "-frames:v", str(LEN),
                "-vf", "scale=640:360:flags=lanczos,format=yuv420p", "-c:v", "libx264", "-preset", "slow",
                "-crf", "28", "-movflags", "+faststart", "-an", str(out / "ohive_clip.mp4")], check=True)
cv2.imwrite(str(out / "ohive_clip.jpg"),
            cv2.resize(cv2.imread(str(SRC / f"frame_{START:04d}.png")), (640, 360), interpolation=cv2.INTER_AREA),
            [cv2.IMWRITE_JPEG_QUALITY, 80])
print("ok")
