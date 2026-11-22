"""Build the source video shown beside the hero point cloud (3D monocular depth demo).

Input (local frames, not committed here):
  DA3/scripts/output_frames/frame_XXXX.png   1920x1080 frames of da3_test_video.mp4

Output:
  assets/video/depth_poster.jpg   poster frame (frame 412)
  assets/video/depth_full.mp4   every frame, 0000-0705 (960x540, 30 fps, H.264, muted), keyframe every 15 frames for scrubbing

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
cv2.imwrite(str(out / "depth_poster.jpg"),
            cv2.resize(cv2.imread(str(SRC / f"frame_{START:04d}.png")), (640, 360), interpolation=cv2.INTER_AREA),
            [cv2.IMWRITE_JPEG_QUALITY, 80])
subprocess.run([ff, "-y", "-loglevel", "error", "-framerate", "30", "-start_number", "0",
                "-i", str(SRC / "frame_%04d.png"),
                "-vf", "scale=960:540:flags=lanczos,format=yuv420p", "-c:v", "libx264", "-preset", "slow",
                "-crf", "27", "-g", "15", "-movflags", "+faststart", "-an", str(out / "depth_full.mp4")], check=True)
print("ok")
