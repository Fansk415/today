"""生成「今日」的 PWA 图标。改配色后重跑即可。"""
from PIL import Image, ImageDraw
import os

S = 1024
TOP = (212, 88, 14)
BOT = (158, 52, 9)
WHITE = (255, 252, 248)

# 纵向渐变
grad = Image.new("RGB", (1, S))
for y in range(S):
    t = y / (S - 1)
    grad.putpixel((0, y), tuple(int(TOP[i] + (BOT[i] - TOP[i]) * t) for i in range(3)))
img = grad.resize((S, S), Image.BICUBIC)

d = ImageDraw.Draw(img)
pad = S * 0.215
bbox = (pad, pad, S - pad, S - pad)
w = int(S * 0.088)
# 开口圆环：缺口留在右上方
d.arc(bbox, start=-64, end=252, fill=WHITE, width=w)

r = S * 0.058
cx = cy = S / 2
d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=WHITE)

out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "icons")
os.makedirs(out, exist_ok=True)

for name, size in [
    ("icon-512.png", 512),
    ("icon-192.png", 192),
    ("apple-touch-icon-180.png", 180),
]:
    img.resize((size, size), Image.LANCZOS).save(os.path.join(out, name), "PNG", optimize=True)
    print("wrote", name)