"""Cover image: engine stills of the device + an HTML layout, exported with headless Chrome.

1. cd app && bun scripts/render.ts stills --t 137.5,150 --samples 36 --scale 3 --out ../out/cover/hero
2. analysis/.venv/bin/python cover/build.py      -> out/cover/cover-4k.png, cover-1280.jpg,
   cover-vertical-4k.png (2160x3840, key content in the centre 4:5 band), cover-vertical-1080.jpg,
   cover-43-4k.png (2880x2160), cover-43-1440.jpg
"""
import subprocess

from PIL import Image

OUT = 'out/cover'
# Device crops from the 5760x3240 stills, composited with `screen` in the page. The stills' background
# is a lit near-black with grain, so lift it out (subtract the corner level) and feather the crop edges,
# otherwise the crops show as rectangles.
import numpy as np


def cut(src, box, dst):
    a = np.asarray(Image.open(src).convert('RGB').crop(box), dtype=np.float32)
    h, w, _ = a.shape
    k = 60
    bg = np.median(np.concatenate([a[:k, :k].reshape(-1, 3), a[:k, -k:].reshape(-1, 3), a[-k:, :k].reshape(-1, 3), a[-k:, -k:].reshape(-1, 3)]), axis=0)
    a = np.clip((a - bg * 1.6) * 255 / (255 - bg * 1.6), 0, 255)
    f = 0.16  # feather: fraction of each side
    ramp = lambda n: np.clip(np.minimum(np.arange(n), np.arange(n)[::-1]) / (n * f), 0, 1) ** 1.5
    a *= (ramp(h)[:, None] * ramp(w)[None, :])[..., None]
    Image.fromarray(a.astype(np.uint8)).save(dst)


cut(f'{OUT}/hero/f_0137.50.png', (2074, 324, 3802, 2981), f'{OUT}/back.png')
cut(f'{OUT}/hero/f_0150.00.png', (806, 389, 2477, 2689), f'{OUT}/front.png')
CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
subprocess.run([CHROME, '--headless=new', '--hide-scrollbars', '--force-device-scale-factor=1', '--window-size=3840,2160',
                '--allow-file-access-from-files', '--virtual-time-budget=4000', f'--screenshot={OUT}/cover-4k.png',
                'file://' + __import__('os').path.abspath('cover/cover.html')], check=True)
im = Image.open(f'{OUT}/cover-4k.png').convert('RGB')
print(im.size)
im.resize((1280, 720), Image.LANCZOS).save(f'{OUT}/cover-1280.jpg', quality=92)
im.resize((1920, 1080), Image.LANCZOS).save(f'{OUT}/cover-1080.png')

# vertical 9:16
subprocess.run([CHROME, '--headless=new', '--hide-scrollbars', '--force-device-scale-factor=1', '--window-size=2160,3840',
                '--allow-file-access-from-files', '--virtual-time-budget=4000', f'--screenshot={OUT}/cover-vertical-4k.png',
                'file://' + __import__('os').path.abspath('cover/cover-vertical.html')], check=True)
v = Image.open(f'{OUT}/cover-vertical-4k.png').convert('RGB')
print(v.size)
v.resize((1080, 1920), Image.LANCZOS).save(f'{OUT}/cover-vertical-1080.jpg', quality=92)

# landscape 4:3
subprocess.run([CHROME, '--headless=new', '--hide-scrollbars', '--force-device-scale-factor=1', '--window-size=2880,2160',
                '--allow-file-access-from-files', '--virtual-time-budget=4000', f'--screenshot={OUT}/cover-43-4k.png',
                'file://' + __import__('os').path.abspath('cover/cover-43.html')], check=True)
q = Image.open(f'{OUT}/cover-43-4k.png').convert('RGB')
print(q.size)
q.resize((1440, 1080), Image.LANCZOS).save(f'{OUT}/cover-43-1440.jpg', quality=92)
