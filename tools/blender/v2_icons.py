# -*- coding: utf-8 -*-
"""상점·파워업 아이콘 13종 (256², 투명). 부품 함수(add_coin, gear, hammer ...)는 게임 상자 장면에서도 씀.
좌표: 앞 -Y, 위 +Z."""
import bpy, math, os
from mathutils import Vector, Matrix, Euler
from lib import Builder, empty
from v2lib import (toon, emissive, mark, poly, sweep, star_mesh, font, INK, BLUE, LEMON, CORAL, MINT, GRAPE, PI, D2R)

ICONS = ['coin', 'coins_stack', 'per_question', 'streak', 'multiplier', 'insurance', 'gift', 'rocket', 'magnet',
         'hourglass', 'star', 'hammer', 'heart']
H = PI / 2


def T(x=0, y=0, z=0):
    return Matrix.Translation((x, y, z))


def R(x=0, y=0, z=0):
    return Euler((x, y, z)).to_matrix().to_4x4()


def S(*s):
    if len(s) == 1:
        s = s * 3
    return Matrix.Diagonal((*s, 1))


def gold_mats():
    return dict(gold=toon('ic_gold', '#FFC23A', rough=0.32, metal=0.35),
                face=toon('ic_goldface', '#FFD95E', rough=0.35, metal=0.25),
                star=toon('ic_goldstar', '#FFF2A6', rough=0.3, emit='#FFE680', es=0.35))


# ---------------------------------------------------------------- parts
def add_coin(B, D, mtx, r=0.5, th=0.16, symbol='star'):
    """동전. 로컬 Z = 동전 축(눕힌 동전). 세우려면 mtx 에 R(H,0,0)."""
    G = gold_mats()
    B.add('cyl', G['gold'], mtx=mtx, scale=(2 * r, 2 * r, th), seg=36, bevel=min(0.04, th * 0.3), bevel_seg=2)
    for s in (-1, 1):
        flip = R(PI, 0, 0) if s < 0 else Matrix.Identity(4)
        D.add('cyl', G['face'], mtx=mtx @ T(0, 0, s * th / 2) @ flip, scale=(1.55 * r, 1.55 * r, 0.02), seg=32)
        D.add('torus', G['gold'], mtx=mtx @ T(0, 0, s * th / 2) @ flip, R=0.8 * r, r=0.035 * r / 0.5, seg=36, rings=6)
        if symbol == 'star':
            D.add('star', G['star'], mtx=mtx @ T(0, 0, s * (th / 2 + 0.012)) @ flip, scale=(1.05 * r, 1.05 * r, 0.04),
                  smooth=False, star_inner=0.47)


def gear(B, m, mtx, r=0.5, th=0.18, teeth=8, hub=None):
    B.add('cyl', m, mtx=mtx, scale=(2 * r * 0.82, 2 * r * 0.82, th), seg=32, bevel=0.03, bevel_seg=1)
    for k in range(teeth):
        a = 2 * PI * k / teeth
        B.add('cube', m, mtx=mtx @ R(0, 0, a) @ T(r * 0.86, 0, 0), scale=(r * 0.36, r * 0.36, th), bevel=0.025, bevel_seg=1)
    if hub:
        B.add('cyl', hub, mtx=mtx, scale=(r * 0.62, r * 0.62, th + 0.04), seg=24, bevel=0.02, bevel_seg=1)


def arrow_pts(w=0.5, h=1.0, head=0.48, shaft=0.22):
    return [(-shaft / 2, 0), (shaft / 2, 0), (shaft / 2, h - head), (w / 2 + 0.06, h - head), (0, h),
            (-w / 2 - 0.06, h - head), (-shaft / 2, h - head)]


def heart_pts(n=40):
    pts = []
    for i in range(n):
        t = 2 * PI * i / n
        x = 16 * math.sin(t) ** 3
        y = 13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)
        pts.append((x / 32, y / 32))
    return pts[::-1]


def shield_pts():
    pts = []
    for i in range(9):  # 위쪽 둥근 모서리 두 개 + 볼록한 위 가장자리
        a = PI * i / 8
        pts.append((-0.5 + 0.0, 0.5))
    pts = [(-0.5, 0.42), (-0.42, 0.5), (-0.2, 0.55), (0.0, 0.6), (0.2, 0.55), (0.42, 0.5), (0.5, 0.42)]
    for i in range(1, 12):  # 오른쪽 아래로 휘어 뾰족
        t = i / 12
        pts.append((0.5 * (1 - t ** 1.6) + 0.0, 0.42 - t * 1.0))
    pts.append((0.0, -0.62))
    for i in range(11, 0, -1):
        t = i / 12
        pts.append((-0.5 * (1 - t ** 1.6), 0.42 - t * 1.0))
    return pts[::-1]


def flame_pts():
    pts = [(0.5 * math.cos(a * D2R), 0.5 + 0.5 * math.sin(a * D2R)) for a in range(180, 361, 12)]
    pts += [(0.52, 0.72), (0.46, 0.95), (0.56, 1.22), (0.32, 1.1), (0.24, 1.32), (0.04, 1.66), (-0.1, 1.38),
            (-0.32, 1.48), (-0.4, 1.16), (-0.5, 0.86)]
    return pts[::-1]


def hammer(B, D, mtx, size=1.0):
    """뿅망치. 로컬: 손잡이 아래(z 0) -> 머리 위(z 1.25)."""
    head = toon('ic_hammer_head', CORAL, rough=0.4)
    cap = toon('ic_hammer_cap', LEMON, rough=0.4)
    stick = toon('ic_hammer_stick', BLUE, rough=0.4)
    m = mtx @ S(size)
    B.add('cyl', stick, mtx=m @ T(0, 0, 0.5), scale=(0.16, 0.16, 1.0), seg=16)
    B.add('sphere', stick, mtx=m @ T(0, 0, 0.0), scale=(0.24, 0.24, 0.24), seg=16, rings=8)
    hm = m @ T(0, 0, 1.15) @ R(0, H, 0)
    B.add('cyl', head, mtx=hm, scale=(0.62, 0.62, 0.62), seg=28, bevel=0.06, bevel_seg=2)
    for s in (-1, 1):
        B.add('cyl', cap, mtx=hm @ T(0, 0, s * 0.39), scale=(0.66, 0.66, 0.16), seg=28, bevel=0.05, bevel_seg=2)
        D.add('torus', toon('ic_hammer_ring', '#FFFFFF', rough=0.4), mtx=hm @ T(0, 0, s * 0.17), R=0.31, r=0.03, seg=28, rings=6)


def sparkle_star(B, loc, size, m=None, rot=(H, 0, 0)):
    m = m or emissive('ic_spark', '#FFE45C', 1.5)
    star_mesh(B, m, loc, size, rot=rot, depth=0.3, inner=0.42)


# ---------------------------------------------------------------- icons (각각 루트 반환)
def new(name):
    root = empty(name)
    return root, Builder(name + '_b'), Builder(name + '_d')


def done(root, B, D):
    mark(B.build(parent=root))
    if D.bm.verts:
        D.build(parent=root)
    else:
        D.bm.free()
    return root


def ic_coin():
    root, B, D = new('coin')
    add_coin(B, D, R(H, 0, 0.3), r=0.5, th=0.18)
    return done(root, B, D)


def ic_coins_stack():
    root, B, D = new('coins_stack')
    for (x, y, n) in ((-0.36, 0.15, 5), (0.32, 0.25, 3), (0.0, -0.3, 2)):
        for k in range(n):
            add_coin(B, D, T(x + 0.02 * ((k * 7) % 3 - 1), y, 0.09 + k * 0.17) @ R(0, 0, k), r=0.32, th=0.15)
    add_coin(B, D, T(0.55, -0.35, 0.36) @ R(H, 0, 0.5) @ R(0, 0.25, 0), r=0.34, th=0.15)
    return done(root, B, D)


def ic_per_question():
    root, B, D = new('per_question')
    gear(B, toon('ic_gear', BLUE, rough=0.35), T(0.36, 0.25, 0.74) @ R(H, 0, 0), r=0.42, th=0.16,
         hub=toon('ic_gear_hub', '#BFD8FF', rough=0.35))
    add_coin(B, D, T(-0.12, -0.05, 0.42) @ R(H, 0, 0.2), r=0.42, th=0.16)
    poly(B, toon('ic_arrow', MINT, rough=0.35), arrow_pts(0.55, 0.95, 0.42, 0.22), depth=0.16,
         mtx=T(0.5, -0.3, 0.05) @ R(0, 0.0, 0.2), bevel=0.04)
    return done(root, B, D)


def ic_streak():
    root, B, D = new('streak')
    fp = flame_pts()
    poly(B, toon('ic_flame0', CORAL, rough=0.45, emit='#FF5A3D', es=0.25), fp, depth=0.3, mtx=S(1.0), bevel=0.06)
    poly(D, toon('ic_flame1', '#FF9F3A', rough=0.45, emit='#FF8A1A', es=0.3), fp, depth=0.1,
         mtx=T(0.02, -0.17, 0.02) @ S(0.7), bevel=0.03)
    poly(D, toon('ic_flame2', LEMON, rough=0.45, emit='#FFE14D', es=0.4), fp, depth=0.1,
         mtx=T(0.03, -0.24, 0.03) @ S(0.42), bevel=0.02)
    return done(root, B, D)


def ic_multiplier():
    root, B, D = new('multiplier')
    B.add('star', toon('ic_burst', LEMON, rough=0.4), loc=(0, 0, 0.6), rot=(H, 0, 0), scale=(1.25, 1.25, 0.2),
          smooth=False, points=12, star_inner=0.8)
    B.add('cyl', toon('ic_badge', GRAPE, rough=0.35), loc=(0, -0.08, 0.6), rot=(H, 0, 0), scale=(0.9, 0.9, 0.12), seg=40,
          bevel=0.03, bevel_seg=2)
    D.add('text', toon('ic_x2', '#FFFFFF', rough=0.4), loc=(0, -0.17, 0.6), rot=(H, 0, 0), scale=(0.58, 0.58, 1.0),
          text='x2', depth=0.06, font=font())
    return done(root, B, D)


def ic_insurance():
    root, B, D = new('insurance')
    sp = shield_pts()
    poly(B, toon('ic_shield', BLUE, rough=0.35), sp, depth=0.22, mtx=T(0, 0, 0.62) @ S(1.0), bevel=0.05)
    poly(D, toon('ic_shield_in', '#9CC6FF', rough=0.35), sp, depth=0.06, mtx=T(0, -0.11, 0.64) @ S(0.8), bevel=0.02)
    add_coin(B, D, T(0, -0.2, 0.62) @ R(H, 0, 0), r=0.27, th=0.1)
    return done(root, B, D)


def ic_gift():
    root, B, D = new('gift')
    box = toon('ic_gift', CORAL, rough=0.4)
    rib = toon('ic_ribbon', LEMON, rough=0.35)
    B.add('cube', box, loc=(0, 0, 0.36), scale=(0.9, 0.9, 0.7), bevel=0.05, bevel_seg=2)
    B.add('cube', box, loc=(0, 0, 0.77), scale=(1.0, 1.0, 0.2), bevel=0.05, bevel_seg=2)
    D.add('cube', rib, loc=(0, 0, 0.36), scale=(0.2, 0.92, 0.71))
    D.add('cube', rib, loc=(0, 0, 0.36), scale=(0.92, 0.2, 0.71))
    D.add('cube', rib, loc=(0, 0, 0.77), scale=(0.21, 1.02, 0.21))
    D.add('cube', rib, loc=(0, 0, 0.77), scale=(1.02, 0.21, 0.21))
    for s in (-1, 1):
        B.add('torus', rib, mtx=T(s * 0.22, 0, 1.0) @ R(0, -s * 0.7, 0) @ R(H, 0, 0) @ S(1.0, 0.75, 1.0),
              R=0.2, r=0.07, seg=24, rings=8)
    B.add('sphere', rib, loc=(0, -0.02, 0.92), scale=0.18, seg=16, rings=8)
    return done(root, B, D)


def ic_rocket():
    root, B, D = new('rocket')
    body = toon('ic_rocket', '#F7F9FF', rough=0.35)
    red = toon('ic_rocket_red', CORAL, rough=0.4)
    win = toon('ic_window', '#7FC4FF', rough=0.15, emit='#9fd8ff', es=0.25)
    fl1 = toon('ic_rflame', '#FF9F3A', rough=0.5, emit='#FF8A1A', es=0.6)
    fl2 = toon('ic_rflame2', LEMON, rough=0.5, emit='#FFE14D', es=0.8)
    m = T(0, 0, 0.6) @ R(0, 0.65, 0)
    B.add('sphere', body, mtx=m, scale=(0.6, 0.6, 1.3), seg=32, rings=16)
    B.add('sphere', red, mtx=m @ T(0, 0, 0.42), scale=(0.44, 0.44, 0.46), seg=28, rings=14)
    B.add('cyl', red, mtx=m @ T(0, 0, -0.52) , scale=(0.38, 0.38, 0.14), seg=24)
    for k in range(3):
        a = 2 * PI * k / 3 - H
        poly(B, red, [(0, 0.2), (0.0, -0.22), (0.34, -0.42), (0.32, -0.12)], depth=0.08,
             mtx=m @ R(0, 0, a) @ T(0.2, 0, -0.18) @ R(0, 0, 0) @ R(0, 0, 0), bevel=0.025)
    D.add('cyl', win, mtx=m @ T(0, -0.29, 0.06) @ R(H, 0, 0), scale=(0.28, 0.28, 0.04), seg=28)
    B.add('torus', toon('ic_window_rim', '#B9C4DA', rough=0.3, metal=0.4), mtx=m @ T(0, -0.29, 0.06) @ R(H, 0, 0),
          R=0.15, r=0.035, seg=28, rings=8)
    B.add('cone', fl1, mtx=m @ T(0, 0, -0.86) @ R(PI, 0, 0), scale=(0.44, 0.44, 0.66), r2=0.0, seg=20)
    D.add('cone', fl2, mtx=m @ T(0, -0.1, -0.8) @ R(PI, 0, 0), scale=(0.24, 0.24, 0.46), r2=0.0, seg=16)
    return done(root, B, D)


def ic_magnet():
    root, B, D = new('magnet')
    red = toon('ic_magnet', CORAL, rough=0.35)
    tip = toon('ic_magnet_tip', '#E8EEF8', rough=0.25, metal=0.5)
    m = T(0, 0, 0.62) @ R(0, -0.6, 0)
    up = (m.to_3x3() @ Vector((0, 0, 1))).normalized()
    B.add('torus', red, mtx=m @ T(0, 0, 0.1) @ R(H, 0, 0), R=0.36, r=0.17, seg=32, rings=14,
          cut=(tuple(m @ Vector((0, 0, 0.1))), tuple(up), False))
    for s in (-1, 1):
        B.add('cyl', red, mtx=m @ T(s * 0.36, 0, -0.08), scale=(0.34, 0.34, 0.36), seg=24)
        B.add('cyl', tip, mtx=m @ T(s * 0.36, 0, -0.38), scale=(0.34, 0.34, 0.24), seg=24, bevel=0.03, bevel_seg=1)
    sp = emissive('ic_spark', '#FFE45C', 1.5)
    for (x, z, a) in ((-0.62, 0.0, 0.0), (-0.45, -0.28, 0.0)):
        pass
    return done(root, B, D)


def ic_hourglass():
    root, B, D = new('hourglass')
    wood = toon('ic_hg_wood', GRAPE, rough=0.4)
    glass = toon('ic_glass', '#CFE9FF', rough=0.1)
    sand = toon('ic_sand', LEMON, rough=0.6, emit='#FFC83D', es=0.15)
    p = glass.node_tree.nodes['Principled BSDF']
    p.inputs['Alpha'].default_value = 0.35
    try:
        glass.surface_render_method = 'BLENDED'
    except Exception:
        pass
    m = T(0, 0, 0) @ R(0, 0.22, 0)
    for z in (0.06, 1.24):
        B.add('cyl', wood, mtx=m @ T(0, 0, z), scale=(0.9, 0.9, 0.14), seg=32, bevel=0.04, bevel_seg=2)
    for k in range(3):
        a = 2 * PI * k / 3 + 0.5
        B.add('cyl', wood, mtx=m @ T(0.37 * math.cos(a), 0.37 * math.sin(a), 0.65), scale=(0.08, 0.08, 1.12), seg=10)
    for z, sgn in ((0.37, 1), (0.93, -1)):
        D.add('sphere', glass, mtx=m @ T(0, 0, z), scale=(0.6, 0.6, 0.66), seg=24, rings=12)
    D.add('cone', sand, mtx=m @ T(0, 0, 0.27), scale=(0.48, 0.48, 0.3), r2=0.06, seg=24)
    D.add('cone', sand, mtx=m @ T(0, 0, 0.8) @ R(PI, 0, 0), scale=(0.34, 0.34, 0.16), r2=0.18, seg=24)
    D.add('cyl', sand, mtx=m @ T(0, 0, 0.55), scale=(0.04, 0.04, 0.4), seg=8)
    return done(root, B, D)


def ic_star():
    root, B, D = new('star')
    B.add('star', toon('ic_star', LEMON, rough=0.35, emit='#FFD43B', es=0.15), loc=(0, 0, 0.6), rot=(H, 0, 0.0),
          scale=(1.3, 1.3, 0.36), smooth=False, star_inner=0.5, bevel=0.07, bevel_seg=3)
    D.add('star', toon('ic_star_in', '#FFF6B8', rough=0.35, emit='#FFF0A0', es=0.3), loc=(0, -0.19, 0.6), rot=(H, 0, 0.0),
          scale=(0.62, 0.62, 0.04), smooth=False, star_inner=0.5)
    return done(root, B, D)


def ic_hammer():
    root, B, D = new('hammer')
    hammer(B, D, T(-0.1, 0, 0.0) @ R(0, 0.6, 0), 1.0)
    return done(root, B, D)


def ic_heart():
    root, B, D = new('heart')
    hp = heart_pts()
    poly(B, toon('ic_heart', '#FF5C7A', rough=0.35), hp, depth=0.34, mtx=T(0, 0, 0.6) @ S(1.25), bevel=0.11, bevel_seg=4)
    D.add('sphere', emissive('ic_heart_hi', '#FFE3EA', 1.0), loc=(-0.28, -0.32, 0.86), scale=(0.2, 0.06, 0.13),
          rot=(0, 0.6, 0), seg=12, rings=6)
    return done(root, B, D)


BUILD = {k: globals()['ic_' + k] for k in ICONS}
CAM_DIR = (0.32, -1.0, 0.32)


def render_all(only=()):
    from lib import reset
    from v2lib import studio2, frame_sprite, render_png, finalize_png, out_dir
    d = out_dir('icons')
    for k in ICONS:
        if only and k not in only:
            continue
        reset()
        studio2(256, 256, samples=48)
        BUILD[k]()
        frame_sprite(CAM_DIR, 256, 256, pad=0.07, px=4)
        p = os.path.join(d, k + '.png')
        render_png(p)
        print('ICON', k, finalize_png(p))
