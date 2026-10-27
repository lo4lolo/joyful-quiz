# -*- coding: utf-8 -*-
"""낚시 모드 물고기 12종 + 쓰레기 2종 (256², 투명, 옆모습, 머리 = -X 왼쪽).
build_fish(id) -> 루트 empty. 장면(낚시 상자)에서도 씀."""
import bpy, math, os, random
from mathutils import Vector, Matrix, Euler
from lib import Builder, empty
from v2lib import (Ell, Face, on, arc, arc_pts, surf_mtx, toon, emissive, face_mats, mark, poly, sweep, star_mesh,
                   INK, BLUE, LEMON, CORAL, MINT, GRAPE, PI, D2R)
from v2_icons import T, R, S

FISH = [
    # id, 이름, 등급, 최소kg, 최대kg
    ('minnow', '송사리', 'common', 0.01, 0.05),
    ('goldfish', '금붕어', 'common', 0.05, 0.3),
    ('carp', '붕어', 'common', 0.3, 2.0),
    ('mackerel', '고등어', 'common', 0.3, 1.2),
    ('pufferfish', '복어', 'uncommon', 0.5, 3.0),
    ('clownfish', '흰동가리', 'uncommon', 0.1, 0.3),
    ('squid', '오징어', 'uncommon', 0.3, 2.0),
    ('swordfish', '황새치', 'rare', 30.0, 150.0),
    ('octopus2', '문어', 'rare', 2.0, 10.0),
    ('whale_baby', '아기 고래', 'rare', 200.0, 900.0),
    ('rainbow_trout', '무지개송어', 'epic', 1.0, 6.0),
    ('golden_koi', '황금 잉어', 'epic', 3.0, 15.0),
    ('boot', '낡은 장화', 'junk', 0.5, 1.5),
    ('can', '빈 깡통', 'junk', 0.05, 0.2),
]
H = PI / 2


def new(name):
    return empty(name), Builder(name + '_b'), Builder(name + '_d')


def done(root, B, D, extra=None):
    mark(B.build(parent=root))
    D.build(parent=root)
    if extra is not None:
        mark(extra.build(parent=root), 0.8)
    return root


def M(fid, k, c, **kw):
    return toon(f'{fid}_{k}', c, **kw)


def body(B, D, fid, L, Hh, W, col, back=None, belly=None, x0=0.0):
    e = Ell((x0, 0, 0), (L / 2, W / 2, Hh / 2))
    B.add('sphere', M(fid, 'body', col), loc=e.c, scale=e.scale(), seg=40, rings=20)
    if back:
        D.add('sphere', M(fid, 'back', back), loc=e.c + Vector((0, 0, Hh * 0.1)),
              scale=(L * 0.97, W * 0.98, Hh * 0.93), seg=40, rings=20)
    if belly:
        D.add('sphere', M(fid, 'belly', belly), loc=e.c + Vector((0.03 * L, 0, -Hh * 0.12)),
              scale=(L * 0.9, W * 0.97, Hh * 0.85), seg=40, rings=20)
    return e


def band(D, m, e, x, w, k=1.04):
    """몸을 두르는 띠 (흰동가리)."""
    t = (x - e.c.x) / e.r.x
    f = math.sqrt(max(0.0, 1 - t * t))
    D.add('sphere', m, loc=(x, e.c.y, e.c.z), scale=(w, 2 * e.r.y * f * k, 2 * e.r.z * f * k), seg=28, rings=14)


def tail(B, m, x, kind='fork', s=1.0, z=0.0, depth=0.08):
    if kind == 'fork':
        pts = [(0, 0.12), (0.5, 0.55), (0.62, 0.48), (0.42, 0.0), (0.62, -0.48), (0.5, -0.55), (0, -0.12)]
    elif kind == 'round':
        pts = [(0, 0.1)] + [(0.3 + 0.32 * math.cos(a * D2R), 0.42 * math.sin(a * D2R)) for a in range(70, -71, -20)] + [(0, -0.1)]
    elif kind == 'fan':  # 금붕어: 하늘하늘 큰 꼬리
        pts = [(0, 0.12), (0.42, 0.7), (0.72, 0.7), (0.62, 0.3), (0.82, 0.0), (0.62, -0.3), (0.72, -0.7), (0.42, -0.7), (0, -0.12)]
    elif kind == 'crescent':
        pts = [(0, 0.1), (0.35, 0.5), (0.7, 0.8), (0.55, 0.3), (0.45, 0.0), (0.55, -0.3), (0.7, -0.8), (0.35, -0.5), (0, -0.1)]
    pts = [(x + px * s, z + pz * s) for px, pz in pts]
    poly(B, m, pts, depth=depth, bevel=0.025)


def fin_top(B, m, pts, depth=0.06):
    poly(B, m, pts, depth=depth, bevel=0.02)


def side_fin(B, m, p, size=0.3, rot=0.5):
    B.add('sphere', m, mtx=T(*p) @ R(0, rot, 0.25), scale=(size * 0.45, 0.06, size), seg=14, rings=8)


def face(D, e, F, eye_yaw=-58, eye_pitch=14, ew=0.2, eh=0.24, mouth=True, blush=True, mouth_style='smile'):
    single = lambda yaw, pitch: (on(D, e, 'sphere', F['eye'], yaw, pitch, (ew, eh, 0.08), out=-0.004, seg=20, rings=10),
                                 on(D, e, 'sphere', F['hi'], yaw - 4, pitch + 6, (ew * 0.42, ew * 0.42, 0.03), out=0.04,
                                    seg=12, rings=6))
    single(eye_yaw, eye_pitch)
    if blush:
        on(D, e, 'sphere', F['blush'], eye_yaw + 22, eye_pitch - 26, (0.2, 0.11, 0.03), out=0.0, seg=14, rings=6)
    if mouth:
        f = Face(D, e, F)
        if mouth_style == 'smile':
            arc(D, e, F['mouth'], arc_pts(-82, -12, 5, 6, -70, 60), 0.022)
        elif mouth_style == 'o':
            on(D, e, 'sphere', F['mouth'], -86, -8, (0.1, 0.12, 0.04), out=0.0, seg=12, rings=6)


# ---------------------------------------------------------------- fish
def f_minnow():
    fid = 'minnow'; root, B, D = new(fid); F = face_mats()
    e = body(B, D, fid, 1.6, 0.56, 0.4, '#9CCBFF', back='#5E9BEA', belly='#F2F9FF')
    fin = M(fid, 'fin', '#7DB4FA')
    tail(B, fin, 0.68, 'fork', 0.8)
    fin_top(B, fin, [(-0.1, 0.22), (0.12, 0.42), (0.3, 0.38), (0.3, 0.2)])
    side_fin(B, fin, (-0.25, -0.16, -0.1), 0.24)
    on(D, e, 'sphere', M(fid, 'line', '#4E86D6'), 10, 0, (0.75, 0.035, 0.02), out=0.0, seg=16, rings=6)
    face(D, e, F, -60, 12, ew=0.16, eh=0.2)
    return done(root, B, D)


def f_goldfish():
    fid = 'goldfish'; root, B, D = new(fid); F = face_mats()
    e = body(B, D, fid, 1.1, 0.86, 0.6, '#FF7B3A', belly='#FFC48F')
    fin = toon('goldfish_fin', '#FFA05C', rough=0.4, emit='#FF8A3D', es=0.15)
    tail(B, fin, 0.45, 'fan', 0.85)
    fin_top(B, fin, [(-0.2, 0.36), (-0.05, 0.66), (0.22, 0.62), (0.32, 0.3)])
    side_fin(B, fin, (-0.1, -0.24, -0.18), 0.28)
    B.add('sphere', fin, mtx=T(0.05, 0, -0.42) @ R(0, -0.5, 0), scale=(0.18, 0.05, 0.3), seg=12, rings=6)
    face(D, e, F, -50, 14, ew=0.2, eh=0.25)
    return done(root, B, D)


def f_carp():
    fid = 'carp'; root, B, D = new(fid); F = face_mats()
    e = body(B, D, fid, 1.6, 0.86, 0.5, '#D7B55E', back='#A58E4A', belly='#FFF1C9')
    fin = M(fid, 'fin', '#C29A4E')
    tail(B, fin, 0.68, 'fork', 0.9)
    fin_top(B, fin, [(-0.32, 0.34), (-0.15, 0.62), (0.3, 0.52), (0.42, 0.25)])
    side_fin(B, fin, (-0.3, -0.22, -0.2), 0.3)
    sc = M(fid, 'scale', '#E9CB79')
    for i in range(3):
        for j in range(2):
            on(D, e, 'sphere', sc, -10 + i * 22, 6 - j * 18, (0.13, 0.11, 0.02), out=0.0, seg=10, rings=5)
    face(D, e, F, -60, 14, ew=0.17, eh=0.22)
    return done(root, B, D)


def f_mackerel():
    fid = 'mackerel'; root, B, D = new(fid); F = face_mats()
    e = body(B, D, fid, 1.9, 0.62, 0.45, '#5C93E6', back='#3A6FCC', belly='#EDF3FB')
    fin = M(fid, 'fin', '#4A7FD8')
    stripe = M(fid, 'stripe', '#1F468F')
    tail(B, fin, 0.8, 'fork', 0.85)
    fin_top(B, fin, [(-0.32, 0.25), (-0.2, 0.46), (0.0, 0.25)])
    fin_top(B, fin, [(0.2, 0.25), (0.32, 0.4), (0.45, 0.2)])
    side_fin(B, fin, (-0.4, -0.18, -0.08), 0.24)
    for k in range(5):
        yw = -18 + k * 16
        arc(D, e, stripe, [(yw, 50), (yw + 5, 38), (yw - 1, 26), (yw + 5, 16)], 0.022, out=0.008)
    face(D, e, F, -62, 10, ew=0.15, eh=0.19)
    return done(root, B, D)


def f_pufferfish():
    fid = 'pufferfish'; root, B, D = new(fid); F = face_mats()
    e = body(B, D, fid, 1.0, 0.92, 0.9, '#FFD458', belly='#FFF7DA')
    spk = M(fid, 'spike', '#E8A93A')
    fin = M(fid, 'fin', '#FFB84A')
    for yw in range(-150, 181, 30):
        for pt in (-50, -15, 20, 55):
            if -95 < yw < -40 and -20 < pt < 40:
                continue  # 얼굴 자리 비움
            on(B, e, 'cone', spk, yw + (pt % 2) * 15, pt, (0.1, 0.1, 0.14), out=0.05, r2=0.0, seg=8)
    for pt in (85, -85):
        on(B, e, 'cone', spk, 0, pt, (0.1, 0.1, 0.14), out=0.05, r2=0.0, seg=8)
    tail(B, fin, 0.44, 'round', 0.55)
    side_fin(B, fin, (-0.05, -0.42, -0.05), 0.26)
    face(D, e, F, -48, 16, ew=0.2, eh=0.24, mouth_style='o')
    return done(root, B, D)


def f_clownfish():
    fid = 'clownfish'; root, B, D = new(fid); F = face_mats()
    e = body(B, D, fid, 1.3, 0.76, 0.46, '#FF8A2A')
    white = M(fid, 'white', '#FFFFFF'); ink = M(fid, 'edge', '#2A2F45')
    fin = M(fid, 'fin', '#FF9A3D')
    for x, w in ((-0.3, 0.17), (0.08, 0.2), (0.45, 0.12)):
        band(D, ink, e, x, w + 0.05, k=1.03)
        band(D, white, e, x, w, k=1.05)
    tail(B, fin, 0.56, 'round', 0.6)
    fin_top(B, fin, [(-0.3, 0.3), (-0.15, 0.5), (0.1, 0.48), (0.3, 0.3)])
    side_fin(B, fin, (-0.15, -0.2, -0.15), 0.26)
    face(D, e, F, -62, 14, ew=0.17, eh=0.21)
    return done(root, B, D)


def f_squid():
    fid = 'squid'; root, B, D = new(fid); F = face_mats()
    col = M(fid, 'body', '#FFB0A6'); spot = M(fid, 'spot', '#FF8C86')
    # 몸통(외투막)은 왼쪽, 다리는 오른쪽
    mant = Ell((-0.25, 0, 0.05), (0.7, 0.3, 0.3))
    B.add('sphere', col, loc=mant.c, scale=mant.scale(), seg=32, rings=16)
    poly(B, col, [(-0.95, 0.05), (-0.62, 0.45), (-0.5, 0.1), (-0.5, 0.0), (-0.62, -0.35), (-0.95, 0.05)][:-1],
         depth=0.06, bevel=0.02)
    head = Ell((0.48, 0, 0.0), (0.24, 0.24, 0.22))
    B.add('sphere', col, loc=head.c, scale=head.scale(), seg=24, rings=12)
    for k, (dz, ln, amp) in enumerate(((0.12, 0.6, 0.08), (0.04, 0.7, -0.1), (-0.06, 0.66, 0.09), (-0.14, 0.58, -0.07),
                                        (0.0, 1.0, 0.14), (-0.08, 0.95, -0.12))):
        pts = [(0.6 + ln * t, -0.04 * (k % 2), dz + amp * math.sin(t * PI * 1.6) - 0.05 * t) for t in (0, 0.25, 0.5, 0.75, 1.0)]
        sweep(B, col, pts, [0.06, 0.05, 0.045, 0.04, 0.035] if ln < 0.9 else [0.05, 0.04, 0.035, 0.05, 0.06], seg=10, sub=4)
    for x, z in ((-0.5, 0.1), (-0.25, -0.08), (-0.05, 0.12), (-0.7, -0.02)):
        p, n = mant.pt(math.degrees(math.asin(max(-1, min(1, (x - mant.c.x) / mant.r.x)))), z * 100, 0.0)
        D.add('sphere', spot, mtx=surf_mtx(p, n), scale=(0.08, 0.08, 0.02), seg=10, rings=5)
    on(D, head, 'sphere', F['eye'], -10, 12, (0.15, 0.18, 0.07), out=-0.004, seg=16, rings=8)
    on(D, head, 'sphere', F['hi'], -16, 20, (0.06, 0.06, 0.03), out=0.035, seg=10, rings=5)
    on(D, mant, 'sphere', F['blush'], 30, -10, (0.14, 0.08, 0.03), out=0.0, seg=12, rings=6)
    return done(root, B, D)


def f_swordfish():
    fid = 'swordfish'; root, B, D = new(fid); F = face_mats()
    e = body(B, D, fid, 2.0, 0.66, 0.5, '#4D92FF', back='#2E6CD8', belly='#E3EEFF')
    fin = M(fid, 'fin', '#2C66CC')
    B.add('cone', M(fid, 'bill', '#3C7EEA'), mtx=T(-1.45, 0, 0.04) @ R(0, -H, 0), scale=(0.16, 0.12, 1.1), r2=0.0, seg=12)
    tail(B, fin, 0.9, 'crescent', 0.95)
    fin_top(B, fin, [(-0.55, 0.2), (-0.45, 0.85), (-0.2, 0.75), (0.15, 0.25)])
    side_fin(B, fin, (-0.45, -0.22, -0.15), 0.34, rot=0.9)
    face(D, e, F, -66, 12, ew=0.14, eh=0.18)
    return done(root, B, D)


def f_octopus2():
    fid = 'octopus2'; root, B, D = new(fid); F = face_mats()
    col = M(fid, 'body', '#FF7262'); spot = M(fid, 'spot', '#FFB2A6')
    h = Ell((-0.15, 0, 0.35), (0.55, 0.5, 0.6))
    B.add('sphere', col, mtx=T(*h.c) @ R(0, 0.35, 0), scale=h.scale(), seg=36, rings=18)
    for k in range(6):
        a = -1.0 + k * 0.42
        base = Vector((0.0 + 0.3 * math.sin(a), -0.15 + 0.08 * (k % 3), -0.12))
        d = Vector((math.sin(a) * 0.9 + 0.25, 0, -0.55))
        pts = [base, base + d * 0.4, base + d * 0.75 + Vector((0.08, 0, 0.05)), base + d * 0.9 + Vector((0.22, 0, 0.18)),
               base + d * 0.8 + Vector((0.26, 0, 0.3))]
        sweep(B, col, pts, [0.13, 0.1, 0.075, 0.055, 0.045], seg=12, sub=4)
    for yw, pt, sz in ((20, 50, 0.12), (40, 20, 0.09), (-20, 62, 0.08)):
        on(D, h, 'sphere', spot, yw, pt, (sz, sz, 0.03), out=0.0, seg=10, rings=5)
    hh = Ell(h.c, h.r)
    for s in (-1, 1):
        on(D, hh, 'sphere', F['eye'], s * 22 - 6, -12, (0.13, 0.17, 0.08), out=-0.004, seg=16, rings=8)
        on(D, hh, 'sphere', F['hi'], s * 22 - 10, -6, (0.055, 0.055, 0.03), out=0.035, seg=10, rings=5)
        on(D, hh, 'sphere', F['blush'], s * 38 - 6, -30, (0.13, 0.07, 0.03), out=0.0, seg=10, rings=5)
    arc(D, hh, F['mouth'], arc_pts(-6, -30, 6, 5, -70, 70), 0.018)
    return done(root, B, D)


def f_whale_baby():
    fid = 'whale_baby'; root, B, D = new(fid); F = face_mats()
    e = body(B, D, fid, 1.8, 1.15, 1.0, '#6AA4FF')
    belly = M(fid, 'belly', '#EAF4FF'); groove = M(fid, 'groove', '#B7D3F5')
    D.add('sphere', belly, loc=(-0.12, 0, -0.18), scale=(1.5, 0.98, 0.84), seg=40, rings=20)
    for k in range(3):
        on(D, e, 'sphere', groove, -30 + k * 18, -38, (0.04, 0.3, 0.02), out=0.045, seg=8, rings=6)
    fl = M(fid, 'fluke', '#4F8BEE')
    sweep(B, M(fid, 'body', '#6AA4FF'), [(0.6, 0, 0.0), (0.95, 0, 0.12), (1.15, 0, 0.3)], [0.32, 0.18, 0.1], seg=16)
    B.add('sphere', fl, mtx=T(1.18, 0, 0.32) @ R(0, -0.4, 0.0), scale=(0.34, 0.95, 0.1), seg=20, rings=10)
    B.add('sphere', fl, mtx=T(-0.25, -0.45, -0.3) @ R(0.3, 0.6, 0.2), scale=(0.38, 0.08, 0.2), seg=14, rings=8)
    water = toon('water_drop', '#BFE6FF', rough=0.15, emit='#BFE6FF', es=0.2)
    for i, (dx, dz, sz) in enumerate(((0, 0.1, 0.13), (0, 0.26, 0.12), (-0.13, 0.4, 0.11), (0.13, 0.4, 0.11),
                                      (-0.28, 0.4, 0.09), (0.28, 0.4, 0.09), (-0.38, 0.28, 0.08), (0.38, 0.28, 0.08))):
        B.add('sphere', water, loc=(-0.35 + dx, 0, 0.55 + dz), scale=sz, seg=12, rings=6)
    face(D, e, F, -56, 6, ew=0.17, eh=0.21)
    return done(root, B, D)


def f_rainbow_trout():
    fid = 'rainbow_trout'; root, B, D = new(fid); F = face_mats()
    e = body(B, D, fid, 1.8, 0.62, 0.46, '#A9C77E', back='#7FA35E', belly='#FFF5F2')
    fin = M(fid, 'fin', '#9DB774')
    pink = toon('trout_band', '#FF8DB4', rough=0.4, emit='#FF8DB4', es=0.15)
    on(D, e, 'sphere', pink, 8, -4, (1.25, 0.16, 0.04), out=0.0, seg=24, rings=10)
    for k in range(9):
        on(D, e, 'sphere', M(fid, 'dot', '#3E4A3A'), -30 + k * 10 + (k % 2) * 4, 30 + (k % 3) * 9, (0.05, 0.05, 0.02),
           out=0.005, seg=8, rings=4)
    tail(B, fin, 0.76, 'fork', 0.8)
    fin_top(B, fin, [(-0.25, 0.24), (-0.12, 0.46), (0.12, 0.4), (0.18, 0.22)])
    side_fin(B, fin, (-0.4, -0.18, -0.12), 0.26)
    S_ = Builder(fid + '_s')
    for (x, z, s) in ((-0.95, 0.5, 0.22), (0.95, 0.55, 0.16)):
        star_mesh(S_, emissive('Sparkle', '#FFE45C', 1.6), (x, -0.2, z), s, rot=(H, 0, 0), depth=0.3, inner=0.45)
    face(D, e, F, -62, 12, ew=0.15, eh=0.19)
    return done(root, B, D, S_)


def f_golden_koi():
    fid = 'golden_koi'; root, B, D = new(fid); F = face_mats()
    gold = toon('koi_gold', '#FFC93C', rough=0.25, metal=0.35, emit='#FFB800', es=0.2)
    e = Ell((0, 0, 0), (0.85, 0.24, 0.32))
    B.add('sphere', gold, loc=e.c, scale=e.scale(), seg=40, rings=20)
    patchm = M(fid, 'patch', '#FF7A3D')
    for yw, pt, sw, sh in ((-20, 40, 0.42, 0.26), (25, 10, 0.36, 0.3), (5, 60, 0.3, 0.16)):
        on(D, e, 'sphere', patchm, yw, pt, (sw, sh, 0.03), out=0.0, seg=16, rings=8)
    fin = toon('koi_fin', '#FFE38A', rough=0.3, emit='#FFD24D', es=0.3)
    tail(B, fin, 0.7, 'fan', 0.85)
    fin_top(B, fin, [(-0.35, 0.22), (-0.15, 0.48), (0.25, 0.42), (0.38, 0.2)])
    side_fin(B, fin, (-0.35, -0.2, -0.18), 0.34, rot=0.9)
    for s in (0.05, -0.05):
        sweep(D, M(fid, 'whisker', '#E8A93A'), [(-0.8, -0.1 + s, -0.08), (-0.95, -0.12 + s, -0.18), (-1.0, -0.1 + s, -0.3)],
              [0.025, 0.02, 0.015], seg=8, sub=3)
    S_ = Builder(fid + '_s')
    spark = emissive('Sparkle', '#FFE45C', 1.6)
    for (x, z, s) in ((-0.9, 0.55, 0.26), (0.7, 0.62, 0.2), (0.15, -0.55, 0.15)):
        star_mesh(S_, spark, (x, -0.2, z), s, rot=(H, 0, 0), depth=0.3, inner=0.45)
    face(D, e, F, -64, 14, ew=0.13, eh=0.17)
    return done(root, B, D, S_)


def f_boot():
    fid = 'boot'; root, B, D = new(fid)
    rub = M(fid, 'rubber', '#4FAE6A'); sole = M(fid, 'sole', '#3B4258'); trim = M(fid, 'trim', LEMON)
    m = R(0, 0.2, 0)
    B.add('cube', rub, mtx=m @ T(0.0, 0, 0.55), scale=(0.62, 0.55, 1.0), bevel=0.18, bevel_seg=3)
    B.add('cube', rub, mtx=m @ T(-0.35, 0, 0.18), scale=(1.15, 0.58, 0.42), bevel=0.18, bevel_seg=3)
    B.add('cube', sole, mtx=m @ T(-0.32, 0, -0.02), scale=(1.24, 0.62, 0.12), bevel=0.05, bevel_seg=2)
    B.add('cube', trim, mtx=m @ T(0.0, 0, 1.03), scale=(0.68, 0.6, 0.12), bevel=0.05, bevel_seg=2)
    D.add('cyl', M(fid, 'hole', '#2F6B44'), mtx=m @ T(0.0, 0, 1.095) , scale=(0.5, 0.42, 0.02), seg=24)
    water = toon('water_drop', '#BFE6FF', rough=0.15, emit='#BFE6FF', es=0.2)
    for x, z, s in ((-0.75, 0.25, 0.1), (0.42, 0.1, 0.08), (0.48, 0.32, 0.06)):
        B.add('sphere', water, loc=(x, -0.2, z), scale=(s, s, s * 1.3), seg=10, rings=6)
    return done(root, B, D)


def f_can():
    fid = 'can'; root, B, D = new(fid)
    metal = M(fid, 'metal', '#CAD3E2', rough=0.3, metal=0.55)
    label = M(fid, 'label', CORAL); white = M(fid, 'stripe', '#FFFFFF')
    m = R(0.0, 1.15, 0.25)
    B.add('cyl', metal, mtx=m, scale=(0.62, 0.62, 1.0), seg=28, bevel=0.03, bevel_seg=1, jitter=(0.012, 3))
    D.add('cyl', label, mtx=m, scale=(0.64, 0.64, 0.62), seg=28)
    D.add('cyl', white, mtx=m, scale=(0.645, 0.645, 0.14), seg=28)
    for s in (-1, 1):
        B.add('torus', metal, mtx=m @ T(0, 0, s * 0.5), R=0.3, r=0.035, seg=28, rings=6)
    B.add('cyl', metal, mtx=m @ T(0.0, 0.12, 0.62) @ R(-0.9, 0, 0), scale=(0.5, 0.5, 0.03), seg=24)
    return done(root, B, D)


BUILD = {f[0]: globals()['f_' + f[0]] for f in FISH}


def build_fish(fid):
    return BUILD[fid]()


CAM_DIR = (-0.22, -1.0, 0.22)


def render_all(only=()):
    import json
    from lib import reset
    from v2lib import studio2, frame_sprite, render_png, finalize_png, out_dir
    d = out_dir('fish')
    for fid, *_ in FISH:
        if only and fid not in only:
            continue
        reset()
        studio2(256, 256, samples=48)
        build_fish(fid)
        frame_sprite(CAM_DIR, 256, 256, pad=0.07, px=4)
        p = os.path.join(d, fid + '.png')
        render_png(p)
        print('FISH', fid, finalize_png(p))
    data = [dict(id=i, name=n, rarity=r, weightMin=a, weightMax=b) for i, n, r, a, b in FISH]
    with open(os.path.join(d, 'fish.json'), 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
