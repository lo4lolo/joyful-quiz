# -*- coding: utf-8 -*-
"""v0.2 스티커 그림 만들기 (Blender 5.2 헤드리스, Eevee).

PowerShell, 48_즐거운 퀴즈 폴더에서:
  $b = "C:\\Users\\경남교육청\\blender-portable\\Blender Foundation\\Blender 5.2\\blender.exe"
  & $b -b --python-exit-code 1 --python tools\\blender\\build_v2.py -- chars      # 캐릭터 16
  & $b -b --python-exit-code 1 --python tools\\blender\\build_v2.py -- modes      # 게임 상자 8
  & $b -b --python-exit-code 1 --python tools\\blender\\build_v2.py -- fish       # 물고기 12 + 쓰레기 2
  & $b -b --python-exit-code 1 --python tools\\blender\\build_v2.py -- boss       # 보스 3 + _hurt 3
  & $b -b --python-exit-code 1 --python tools\\blender\\build_v2.py -- icons      # 아이콘 13
  & $b -b --python-exit-code 1 --python tools\\blender\\build_v2.py -- all        # 전부 + 검사 + 모음 시트
  & $b -b --python-exit-code 1 --python tools\\blender\\build_v2.py -- chars cat fox   # 일부 id 만
  & $b -b --python-exit-code 1 --python tools\\blender\\build_v2.py -- verify sheet    # 검사 / 모음 시트만
  & $b -b --python-exit-code 1 --python tools\\blender\\build_v2.py -- trad          # v0.3 전통놀이 (v3_trad.py) 전부 / trad <ids> / trad verify
"""
import sys, os, json, time, importlib
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lib, v2lib
importlib.reload(lib); importlib.reload(v2lib)
import bpy
from v2lib import out_dir, png_info, finalize_png, contact_sheet, SHOTS

args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
GROUPS = ['chars', 'modes', 'fish', 'boss', 'icons']

# 그룹별 기대 크기 / 크기 목표(바이트)
SPEC = {
    'chars': (512, 512, 125_000),
    'modes': (800, 500, 400_000),
    'fish': (256, 256, 60_000),
    'boss': (768, 768, 220_000),
    'icons': (256, 256, 60_000),
}


def group_ids(g):
    if g == 'chars':
        import v2_chars; return [c[0] for c in v2_chars.CHARS]
    if g == 'modes':
        import v2_modes; return list(v2_modes.MODES)
    if g == 'fish':
        import v2_fish; return [f[0] for f in v2_fish.FISH]
    if g == 'boss':
        import v2_boss; return [i for b in v2_boss.BOSSES for i in (b[0], b[0] + '_hurt')]
    if g == 'icons':
        import v2_icons; return list(v2_icons.ICONS)
    return []


def run_group(g, only):
    t0 = time.time()
    mod = importlib.import_module('v2_' + g)
    importlib.reload(mod)
    mod.render_all(only)
    print(f'GROUP {g} done in {time.time() - t0:.1f}s')


def verify(groups):
    ok = True
    total = 0
    for g in groups:
        w, h, lim = SPEC[g]
        ids = group_ids(g)
        d = out_dir(g)
        gs = 0
        for i in ids:
            p = os.path.join(d, i + '.png')
            if not os.path.exists(p):
                print('VERIFY MISSING', g, i); ok = False; continue
            info = png_info(p)
            gs += info['bytes']
            bad = []
            if (info['w'], info['h']) != (w, h):
                bad.append('size %dx%d' % (info['w'], info['h']))
            if not info['rgba'] or info['depth'] != 8:
                bad.append('not RGBA8')
            if info['bytes'] > lim:
                bad.append('big %d' % info['bytes'])
            print('VERIFY', g, i, info['w'], info['h'], 'RGBA8' if info['rgba'] and info['depth'] == 8 else '??',
                  info['bytes'], 'OK' if not bad else 'WARN ' + ', '.join(bad))
            if bad and 'big' not in bad[0]:
                ok = False
        jp = os.path.join(d, {'chars': 'chars', 'fish': 'fish', 'boss': 'boss'}.get(g, '') + '.json')
        if g in ('chars', 'fish', 'boss'):
            print('VERIFY json', jp, os.path.exists(jp))
            ok = ok and os.path.exists(jp)
        print(f'VERIFY {g}: {len(ids)} files, {gs / 1024:.1f} KB')
        total += gs
    print(f'VERIFY total {total / 1024:.1f} KB, ok={ok}')
    return ok


def sheet(groups=GROUPS, path=None):
    rows = []
    layout = {'chars': (180, 180, 8), 'modes': (380, 238, 4), 'fish': (200, 200, 7), 'boss': (240, 240, 6),
              'icons': (160, 160, 9)}
    for g in groups:
        ids = group_ids(g)
        cw, ch, cols = layout[g]
        rows.append((g, [os.path.join(out_dir(g), i + '.png') for i in ids], cw, ch, cols))
    os.makedirs(SHOTS, exist_ok=True)
    contact_sheet(rows, path or os.path.join(SHOTS, 'v2-art-sheet.png'), width=1600)


if __name__ == '__main__':
    todo = args[:1] or ['all']
    cmd = todo[0]
    only = args[1:]
    if cmd == 'all':
        for g in GROUPS:
            run_group(g, [])
        verify(GROUPS)
        sheet()
    elif cmd in GROUPS:
        run_group(cmd, only)
        verify([cmd])
    elif cmd == 'verify':
        verify([g for g in (only or GROUPS) if g in GROUPS])
        if 'sheet' in only or not only:
            sheet()
    elif cmd == 'trad':  # v0.3 전통놀이 (v3_trad.py): trad / trad <ids> / trad verify
        import v3_trad
        importlib.reload(v3_trad)
        v3_trad.main(['trad'] + only)
    elif cmd == 'sheet':
        gs = [g for g in only if g in GROUPS] or GROUPS
        out = [a for a in only if a.endswith('.png')]
        sheet(gs, out[0] if out else None)
    else:
        raise SystemExit('unknown command ' + cmd)
