import json
import subprocess
from pathlib import Path

VIDEO = Path("docs/submission/media/final/0-infinity-mechanism-led-candidate.mp4")
WIDTH, HEIGHT = 160, 90
FRAME_BYTES = WIDTH * HEIGHT * 3

proc = subprocess.Popen(
    [
        "ffmpeg", "-v", "error", "-i", str(VIDEO),
        "-vf", f"fps=1,scale={WIDTH}:{HEIGHT}",
        "-f", "rawvideo", "-pix_fmt", "rgb24", "-",
    ],
    stdout=subprocess.PIPE,
)
frames = []
assert proc.stdout is not None
while True:
    frame = proc.stdout.read(FRAME_BYTES)
    if len(frame) < FRAME_BYTES:
        break
    frames.append(frame)
return_code = proc.wait()
if return_code != 0 or not frames:
    raise SystemExit("ffmpeg could not decode the candidate video")

diffs = [
    sum(abs(a - b) for a, b in zip(frames[i - 1], frames[i])) / FRAME_BYTES
    for i in range(1, len(frames))
]
meaningful = [value > 0.8 for value in diffs]
peaks = sorted(enumerate(diffs, start=1), key=lambda item: item[1], reverse=True)[:12]
qa = {
    "sampled_frames": len(frames),
    "intervals": len(diffs),
    "mean_abs_diff_mean": round(sum(diffs) / len(diffs), 3),
    "mean_abs_diff_max": round(max(diffs), 3),
    "meaningful_intervals_gt_0.8": sum(meaningful),
    "meaningful_ratio": round(sum(meaningful) / len(meaningful), 3),
    "largest_change_seconds": [int(index) for index, _ in peaks[:8]],
    "largest_change_values": [round(value, 3) for _, value in peaks[:8]],
}
output = Path("docs/submission/media/final/0-infinity-mechanism-led-qa.json")
output.write_text(json.dumps(qa, indent=2) + "\n")
print(json.dumps(qa, indent=2))
