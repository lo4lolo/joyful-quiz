"""그림을 WebP 로 바꿔 무게를 줄여요 (교실 와이파이에서 30명이 한꺼번에 열 때 빨라짐).
사용: python tools/to_webp.py            # public/assets 의 png·jpg → webp, 화면 코드의 주소도 함께 바꿈
      python tools/to_webp.py --keep     # 원본 png·jpg 를 지우지 않음
Blender 로 그림을 다시 만든 뒤에도 이 스크립트를 한 번 더 돌리면 돼요.
"""
import os, re, sys
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUB = os.path.join(ROOT, 'public')
ASSETS = os.path.join(PUB, 'assets')
DIRS = ['chars', 'modes', 'fish', 'boss', 'icons', 'trad', 'img']
keep = '--keep' in sys.argv

before = after = 0
for d in DIRS:
    for dirpath, _, files in os.walk(os.path.join(ASSETS, d)):
        for f in files:
            if not f.lower().endswith(('.png', '.jpg', '.jpeg')):
                continue
            src = os.path.join(dirpath, f)
            dst = os.path.splitext(src)[0] + '.webp'
            im = Image.open(src)
            if im.mode not in ('RGB', 'RGBA'):
                im = im.convert('RGBA' if 'A' in im.getbands() or im.mode == 'P' else 'RGB')
            if f.lower().endswith('.png'):
                im.save(dst, 'WEBP', quality=84, method=6, alpha_quality=90)
            else:
                im.convert('RGB').save(dst, 'WEBP', quality=80, method=6)
            before += os.path.getsize(src); after += os.path.getsize(dst)
            if not keep:
                os.remove(src)

# 화면 코드·JSON 의 주소 바꾸기: assets/<폴더>/....png|jpg → .webp
pat = re.compile(r'(assets/(?:' + '|'.join(DIRS) + r')/[^\'"`)\s<>]*?)\.(png|jpe?g)\b')
changed = []
for dirpath, _, files in os.walk(PUB):
    if os.sep + 'vendor' in dirpath:
        continue
    for f in files:
        if not f.endswith(('.js', '.css', '.html', '.json')):
            continue
        p = os.path.join(dirpath, f)
        s = open(p, encoding='utf-8').read()
        n = pat.sub(lambda m: m.group(1) + '.webp', s)
        # JSON 안의 파일 이름 (예: trad.json "file": "team_x.png")
        if f.endswith('.json') and os.sep + 'assets' + os.sep in p:
            n = re.sub(r'("[^"/]+)\.(png|jpe?g)"', r'\1.webp"', n)
        if n != s:
            open(p, 'w', encoding='utf-8').write(n); changed.append(os.path.relpath(p, ROOT))
print(f'그림: {before/1024/1024:.1f} MB → {after/1024/1024:.1f} MB')
print('주소를 바꾼 파일:', len(changed)); [print('  ', c) for c in changed]
