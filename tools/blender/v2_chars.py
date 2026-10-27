# -*- coding: utf-8 -*-
"""스티커 친구들 16종 (꼬마 2.5등신, 큰 머리). build_char(id) -> 루트 empty.
좌표: 앞 -Y, 위 +Z, 바닥 z=0. 몸(B, 잉크 테두리) + 얼굴·무늬(D, 테두리 없음)."""
import bpy, math
from mathutils import Vector, Matrix, Euler
from lib import Builder, empty
from v2lib import (Ell, Face, on, arc, arc_pts, surf_mtx, toon, emissive, face_mats, mark, star_mesh, sweep,
                   INK, BLUE, LEMON, CORAL, MINT, GRAPE, BLUSH, PI, D2R)

CHARS = [
    # id, 이름, 등급, 이모지
    ('cat', '냥냥이', 'common', '🐱'),
    ('dog', '멍뭉이', 'common', '🐶'),
    ('bunny', '토토', 'common', '🐰'),
    ('bear', '곰돌이', 'common', '🐻'),
    ('panda', '판다곰', 'common', '🐼'),
    ('fox', '여우비', 'common', '🦊'),
    ('frog', '개굴이', 'common', '🐸'),
    ('penguin', '펭펭', 'common', '🐧'),
    ('hamster', '햄찌', 'common', '🐹'),
    ('chick', '삐약이', 'common', '🐥'),
    ('tiger', '호랑이', 'rare', '🐯'),
    ('koala', '코코', 'rare', '🐨'),
    ('octopus', '문문이', 'rare', '🐙'),
    ('dino', '공룡이', 'rare', '🦖'),
    ('unicorn', '유니콘', 'legendary', '🦄'),
    ('dragon', '꼬마용', 'legendary', '🐲'),
]

HEAD = Ell((0, 0, 1.2), (0.68, 0.6, 0.58))
BODY = Ell((0, 0.04, 0.5), (0.4, 0.36, 0.42))


def M(cid, key, color, **kw):
    return toon(f'{cid}_{key}', color, **kw)


def ell_add(b, m, e, seg=40, rings=20):
    b.add('sphere', m, loc=e.c, scale=e.scale(), seg=seg, rings=rings)


def patch(b, m, e, shift=(0, -0.08, 0), k=0.88, seg=36, rings=18):
    """타원체를 앞으로 조금 민 작은 복사본 -> 표면에 딱 맞는 무늬(배, 가면)."""
    if isinstance(k, (int, float)):
        k = (k, k, k)
    c = e.c + Vector(shift)
    b.add('sphere', m, loc=c, scale=tuple(2 * e.r[i] * k[i] for i in range(3)), seg=seg, rings=rings)
    return Ell(c, tuple(e.r[i] * k[i] for i in range(3)))


def chain(b, m, pts, radii, seg=12):
    """부드러운 관 하나 (꼬리·촉수)."""
    sweep(b, m, pts, radii, seg=max(14, seg), sub=5)


def axis_mtx(p, axis, flat=(0, 1, 0)):
    """로컬 Z = axis, 로컬 Y ≈ flat (얇은 쪽)."""
    z = Vector(axis).normalized()
    y = Vector(flat)
    y = (y - z * y.dot(z)).normalized()
    x = y.cross(z)
    return Matrix.Translation(Vector(p)) @ Matrix((x, y, z)).transposed().to_4x4()


def single_eye(b, e, yaw, pitch, w, h, F):
    on(b, e, 'sphere', F['eye'], yaw, pitch, (w, h, 0.08), out=-0.005, seg=20, rings=10)
    on(b, e, 'sphere', F['hi'], yaw - 5.5 * w / 0.15 * (0.6 / max(e.r)), pitch + 4.5 * h / 0.2 * (0.6 / max(e.r)),
       (w * 0.42, w * 0.42, 0.03), out=0.035, seg=12, rings=6)


POSE = {'arms': None}   # 장면에서 팔 자세 바꾸기: v2_chars.POSE['arms'] = ('up', 'up')


def base(cid, B, D, fur, belly=None, feet=None, arms=('down', 'wave'), arm_m=None, head=HEAD, body=BODY,
         hand=None):
    arms = POSE['arms'] or arms
    ell_add(B, fur, head)
    ell_add(B, fur, body, seg=32, rings=16)
    if belly:
        patch(D, belly, body, shift=(0, -0.07, -0.04), k=(0.78, 0.86, 0.8))
    fm = feet or fur
    for s in (-1, 1):
        B.add('sphere', fm, loc=(s * 0.19, -0.13, 0.09), scale=(0.3, 0.38, 0.2), seg=20, rings=10)
    am = arm_m or fur
    hm = hand or am
    for s, kind in zip((-1, 1), arms):
        sh = Vector((s * 0.3, -0.02, 0.68))
        if kind == 'down':
            end = Vector((s * 0.5, -0.1, 0.4))
        elif kind == 'wave':
            end = Vector((s * 0.7, -0.12, 0.92))
        elif kind == 'front':
            end = Vector((s * 0.14, -0.42, 0.56))
        elif kind == 'up':
            end = Vector((s * 0.72, -0.1, 1.12))
        elif kind == 'hold':
            end = Vector((s * 0.52, -0.38, 0.7))
        elif isinstance(kind, (tuple, list, Vector)):  # 손 위치 직접 (v3 줄다리기 등)
            end = Vector(kind)
        else:
            continue
        B.tube(am, sh, end, 0.1, seg=14, caps=False)
        B.add('sphere', hm, loc=end, scale=0.25, seg=16, rings=8)


def new(cid):
    root = empty(cid.capitalize())
    B = Builder(cid + '_body')
    D = Builder(cid + '_detail')
    return root, B, D


def finish(root, B, D, extra=()):
    ob = mark(B.build(parent=root))
    od = D.build(parent=root)
    for e in extra:
        e.parent = root
    return root


def sparkles(B, spots, m):
    for (x, y, z, s) in spots:
        star_mesh(B, m, (x, y, z), s, rot=(PI / 2, 0, 0.45), depth=0.3, inner=0.45)


# ====================================================================== common
def build_cat():
    cid = 'cat'
    root, B, D = new(cid)
    fur = M(cid, 'fur', '#C3C8F2'); white = M(cid, 'white', '#FFFFFF')
    pink = M(cid, 'pink', '#FFB3C8'); stripe = M(cid, 'stripe', '#9AA0DA')
    F = face_mats()
    base(cid, B, D, fur, belly=white, feet=white)
    h = HEAD
    for s in (-1, 1):
        mt = Matrix.Translation(h.c + Vector((s * 0.38, 0.03, 0.42))) @ Euler((0, s * 0.42, 0)).to_matrix().to_4x4()
        B.add('cone', fur, mtx=mt, scale=(0.4, 0.24, 0.44), r2=0.08, seg=16)
        mt2 = Matrix.Translation(h.c + Vector((s * 0.37, -0.06, 0.4))) @ Euler((0, s * 0.42, 0)).to_matrix().to_4x4()
        D.add('cone', pink, mtx=mt2, scale=(0.24, 0.08, 0.3), r2=0.06, seg=12)
    for yw in (-11, 0, 11):
        on(D, h, 'sphere', stripe, yw, 52 if yw else 56, (0.06, 0.2, 0.025), out=0.0, seg=10, rings=6)
    chain(B, fur, [(-0.3, 0.3, 0.3), (-0.55, 0.36, 0.4), (-0.7, 0.3, 0.65), (-0.66, 0.2, 0.88), (-0.55, 0.16, 0.95)],
          [0.09, 0.09, 0.085, 0.08, 0.08])
    f = Face(D, h, F)
    f.eyes(24, 2)
    f.blush(46, -16)
    on(D, h, 'sphere', pink, 0, -8, (0.1, 0.07, 0.05), out=0.01, seg=12, rings=6)
    f.mouth('w', pitch=-13, size=0.9)
    for s in (-1, 1):
        for k, dp in enumerate((-8, -15)):
            arc(D, h, F['mouth'], [(s * 54, dp), (s * 64, dp + (2 - k * 4) * 0.5), (s * 72, dp + (1 - k * 3))], 0.012)
    return finish(root, B, D)


def build_dog():
    cid = 'dog'
    root, B, D = new(cid)
    fur = M(cid, 'fur', '#F6CD98'); ear = M(cid, 'ear', '#B9784C'); cream = M(cid, 'cream', '#FFF4E2')
    F = face_mats()
    base(cid, B, D, fur, belly=cream, feet=cream)
    h = HEAD
    for s in (-1, 1):
        mt = Matrix.Translation(h.c + Vector((s * 0.66, 0.02, 0.1))) @ Euler((0.1, -s * 0.42, 0)).to_matrix().to_4x4()
        B.add('sphere', ear, mtx=mt, scale=(0.26, 0.36, 0.6), seg=20, rings=10)
    mz = Ell(h.c + Vector((0, -0.46, -0.17)), (0.26, 0.18, 0.18))
    ell_add(B, cream, mz, seg=24, rings=12)
    on(D, h, 'sphere', ear, 27, 4, (0.32, 0.36, 0.04), out=-0.012, spin=-15, seg=20, rings=10)  # 눈 얼룩
    f = Face(D, h, F)
    f.eyes(24, 3)
    f.blush(48, -15)
    on(D, mz, 'sphere', F['eye'], 0, 40, (0.15, 0.1, 0.1), out=0.0, seg=16, rings=8)
    on(D, mz, 'sphere', F['hi'], -6, 52, (0.045, 0.03, 0.02), out=0.045, seg=8, rings=4)
    f.mouth('open', pitch=-28, size=1.0, ell=mz)
    chain(B, fur, [(-0.3, 0.3, 0.32), (-0.48, 0.32, 0.48), (-0.55, 0.26, 0.66)], [0.08, 0.075, 0.07])
    return finish(root, B, D)


def build_bunny():
    cid = 'bunny'
    root, B, D = new(cid)
    fur = M(cid, 'fur', '#FFF8F4'); pink = M(cid, 'pink', '#FFB0C6')
    F = face_mats()
    base(cid, B, D, fur, belly=None, feet=fur)
    h = HEAD
    for s, tilt in ((-1, -0.12), (1, 0.42)):
        mt = Matrix.Translation(h.c + Vector((s * 0.24, 0.04, 0.76 if s < 0 else 0.7))) @ \
            Euler((0.05, tilt, 0)).to_matrix().to_4x4()
        B.add('sphere', fur, mtx=mt, scale=(0.28, 0.17, 0.78), seg=20, rings=12)
        D.add('sphere', pink, mtx=mt @ Matrix.Translation((0, -0.062, 0.02)), scale=(0.15, 0.06, 0.58), seg=16, rings=10)
    f = Face(D, h, F)
    f.eyes(24, 0, w=0.15, h=0.2)
    f.blush(44, -16, w=0.19, h=0.11)
    on(D, h, 'sphere', pink, 0, -9, (0.1, 0.07, 0.05), out=0.012, seg=12, rings=6)
    f.mouth('w', pitch=-14, size=0.85)
    on(D, h, 'cube', fur, 0, -21, (0.08, 0.07, 0.03), out=0.0)  # 앞니
    return finish(root, B, D)


def build_bear():
    cid = 'bear'
    root, B, D = new(cid)
    fur = M(cid, 'fur', '#C98A5C'); light = M(cid, 'light', '#F6DEC2'); inner = M(cid, 'inner', '#F2A98E')
    F = face_mats()
    base(cid, B, D, fur, belly=light, feet=fur, hand=fur)
    h = HEAD
    for s in (-1, 1):
        p = h.c + Vector((s * 0.47, 0.03, 0.4))
        B.add('sphere', fur, loc=p, scale=(0.32, 0.22, 0.32), seg=20, rings=10)
        D.add('sphere', inner, loc=p + Vector((0, -0.075, 0)), scale=(0.18, 0.08, 0.18), seg=14, rings=8)
    mz = Ell(h.c + Vector((0, -0.47, -0.15)), (0.23, 0.16, 0.16))
    ell_add(B, light, mz, seg=24, rings=12)
    f = Face(D, h, F)
    f.eyes(24, 4, w=0.14, h=0.18)
    f.blush(48, -14)
    on(D, mz, 'sphere', F['eye'], 0, 35, (0.17, 0.11, 0.1), out=0.0, seg=16, rings=8)
    on(D, mz, 'sphere', F['hi'], -7, 48, (0.05, 0.03, 0.02), out=0.045, seg=8, rings=4)
    f.mouth('w', pitch=-25, size=1.6, ell=mz, r=0.02)
    return finish(root, B, D)


def build_panda():
    cid = 'panda'
    root, B, D = new(cid)
    white = M(cid, 'white', '#FBFBF8'); dark = M(cid, 'dark', '#363C55'); ring = M(cid, 'ring', '#FFFFFF')
    F = face_mats()
    base(cid, B, D, white, belly=None, feet=dark, arm_m=dark)
    h = HEAD
    for s in (-1, 1):
        B.add('sphere', dark, loc=h.c + Vector((s * 0.46, 0.04, 0.42)), scale=(0.32, 0.22, 0.32), seg=20, rings=10)
        on(D, h, 'sphere', dark, s * 25, 0, (0.27, 0.34, 0.05), out=-0.012, spin=s * 28, seg=20, rings=10)
        on(D, h, 'sphere', ring, s * 24, 1, (0.16, 0.21, 0.07), out=-0.01, seg=16, rings=8)
    f = Face(D, h, F)
    f.eyes(24, 1, w=0.12, h=0.165)
    f.blush(50, -18, w=0.14, h=0.08)
    mz = Ell(h.c + Vector((0, -0.48, -0.17)), (0.2, 0.14, 0.14))
    ell_add(B, white, mz, seg=24, rings=12)
    on(D, mz, 'sphere', dark, 0, 35, (0.14, 0.09, 0.08), out=0.0, seg=14, rings=8)
    f.mouth('smile', pitch=-25, size=1.7, ell=mz, r=0.02)
    # 몸의 검은 어깨띠
    B.add('torus', dark, loc=(0, 0.04, 0.72), scale=(1, 0.95, 1), R=0.27, r=0.1, seg=24, rings=10)
    return finish(root, B, D)


def build_fox():
    cid = 'fox'
    root, B, D = new(cid)
    fur = M(cid, 'fur', '#FF8F45'); white = M(cid, 'white', '#FFF8EE'); dark = M(cid, 'dark', '#5A3A3A')
    F = face_mats()
    base(cid, B, D, fur, belly=white, feet=dark, hand=dark)
    h = HEAD
    for s in (-1, 1):
        mt = Matrix.Translation(h.c + Vector((s * 0.37, 0.04, 0.48))) @ Euler((0, s * 0.32, 0)).to_matrix().to_4x4()
        B.add('cone', fur, mtx=mt, scale=(0.44, 0.24, 0.58), r2=0.05, seg=16)
        D.add('cone', white, mtx=mt @ Matrix.Translation((0, -0.07, -0.04)), scale=(0.26, 0.08, 0.4), r2=0.04, seg=12)
    mz = Ell(h.c + Vector((0, -0.36, -0.25)), (0.4, 0.26, 0.21))
    ell_add(B, white, mz, seg=28, rings=14)
    f = Face(D, h, F)
    f.eyes(25, 7, w=0.14, h=0.19)
    f.blush(50, -10, w=0.15, h=0.08)
    on(D, mz, 'sphere', F['eye'], 0, 32, (0.13, 0.09, 0.09), out=0.0, seg=14, rings=8)
    f.mouth('w', pitch=0, size=1.1, ell=mz, r=0.018)
    # 큰 꼬리 + 흰 끝
    mt = Matrix.Translation((-0.62, 0.22, 0.5)) @ Euler((0, -0.75, 0)).to_matrix().to_4x4()
    B.add('sphere', fur, mtx=mt, scale=(0.46, 0.42, 0.85), seg=24, rings=12)
    B.add('sphere', white, mtx=mt @ Matrix.Translation((0, 0, 0.34)), scale=(0.3, 0.3, 0.32), seg=16, rings=8)
    return finish(root, B, D)


def build_frog():
    cid = 'frog'
    root, B, D = new(cid)
    fur = M(cid, 'fur', '#78D86A'); belly = M(cid, 'belly', '#E8F8B8'); white = M(cid, 'white', '#FFFFFF')
    F = face_mats()
    h = Ell((0, 0, 1.12), (0.76, 0.6, 0.5))
    base(cid, B, D, fur, belly=belly, feet=fur, head=h)
    for s in (-1, 1):
        bump = Ell(h.c + Vector((s * 0.36, -0.12, 0.42)), (0.22, 0.2, 0.21))
        ell_add(B, fur, bump, seg=24, rings=12)
        lid = Ell(bump.c + Vector((0, -0.05, 0.01)), (0.17, 0.16, 0.16))
        ell_add(D, white, lid, seg=20, rings=10)
        single_eye(D, lid, 0, 4, 0.13, 0.17, F)
    f = Face(D, h, F)
    f.blush(46, -6, w=0.18, h=0.09)
    arc(D, h, F['mouth'], arc_pts(0, -4, 24, 14, -72, 72, n=11), 0.022)
    for s in (-1, 1):
        on(D, h, 'sphere', F['mouth'], s * 6, 8, (0.035, 0.025, 0.02), out=0.005, seg=8, rings=4)
    return finish(root, B, D)


def build_penguin():
    cid = 'penguin'
    root, B, D = new(cid)
    fur = M(cid, 'fur', '#3F5FA8'); white = M(cid, 'white', '#FFFFFF'); beak = M(cid, 'beak', '#FFB23E')
    F = face_mats()
    h = HEAD
    ell_add(B, fur, h)
    body = Ell((0, 0.04, 0.5), (0.44, 0.4, 0.45))
    ell_add(B, fur, body, seg=32, rings=16)
    patch(D, white, body, shift=(0, -0.09, -0.04), k=(0.8, 0.86, 0.8))
    # 하트 모양 흰 얼굴
    for s in (-1, 1):
        patch(D, white, h, shift=(s * 0.14, -0.11, -0.02), k=(0.62, 0.86, 0.72))
    patch(D, white, h, shift=(0, -0.1, -0.12), k=(0.72, 0.86, 0.6))
    for s in (-1, 1):
        B.add('sphere', beak, loc=(s * 0.19, -0.15, 0.08), scale=(0.3, 0.4, 0.16), seg=16, rings=8)
        mt = Matrix.Translation((s * 0.44, -0.02, 0.56)) @ Euler((0, -s * (0.5 if s < 0 else -0.9), 0)).to_matrix().to_4x4()
        B.add('sphere', fur, mtx=mt @ Matrix.Translation((0, 0, -0.12)), scale=(0.16, 0.3, 0.46), seg=16, rings=8)
    p, n = h.pt(0, -12, 0.06)
    B.add('cone', beak, mtx=axis_mtx(p, n, (0, 0, 1)), scale=(0.24, 0.16, 0.18), r2=0.12, seg=14)
    f = Face(D, h, F)
    f.eyes(24, 3, w=0.13, h=0.18)
    f.blush(42, -14, w=0.15, h=0.08)
    return finish(root, B, D)


def build_hamster():
    cid = 'hamster'
    root, B, D = new(cid)
    fur = M(cid, 'fur', '#F7B46C'); white = M(cid, 'white', '#FFF7EC'); pink = M(cid, 'pink', '#FFB0BE')
    seed = M(cid, 'seed', '#4B4A5E')
    F = face_mats()
    h = Ell((0, 0, 1.1), (0.7, 0.62, 0.6))
    body = Ell((0, 0.04, 0.48), (0.46, 0.42, 0.44))
    base(cid, B, D, fur, belly=white, feet=pink, arms=('front', 'front'), head=h, body=body, hand=pink)
    for s in (-1, 1):
        p = h.c + Vector((s * 0.42, 0.06, 0.46))
        B.add('sphere', fur, loc=p, scale=(0.26, 0.16, 0.24), seg=16, rings=8)
        D.add('sphere', pink, loc=p + Vector((0, -0.06, 0)), scale=(0.15, 0.06, 0.14), seg=12, rings=6)
    # 볼주머니: 머리 아래쪽 양옆이 통통
    for s in (-1, 1):
        B.add('sphere', fur, loc=h.c + Vector((s * 0.4, -0.08, -0.26)), scale=(0.62, 0.62, 0.5), seg=24, rings=12)
    patch(D, white, h, shift=(0, -0.1, -0.18), k=(0.6, 0.84, 0.58))
    B.add('sphere', seed, loc=(0, -0.55, 0.58), scale=(0.17, 0.12, 0.27), rot=(0.25, 0, 0.2), seg=16, rings=8)
    D.add('sphere', white, loc=(0.0, -0.6, 0.6), scale=(0.05, 0.04, 0.2), rot=(0.25, 0, 0.2), seg=8, rings=6)
    f = Face(D, h, F)
    f.eyes(25, 8, w=0.13, h=0.17)
    for s in (-1, 1):
        D.add('sphere', F['blush'], mtx=surf_mtx(*Ell(h.c + Vector((s * 0.4, -0.08, -0.26)), (0.31, 0.31, 0.25)).pt(s * 32, 6)),
              scale=(0.16, 0.09, 0.03), seg=14, rings=6)
    on(D, h, 'sphere', pink, 0, -5, (0.09, 0.06, 0.05), out=0.03, seg=12, rings=6)
    f.mouth('w', pitch=-11, size=0.85, r=0.018)
    return finish(root, B, D)


def build_chick():
    cid = 'chick'
    root, B, D = new(cid)
    fur = M(cid, 'fur', '#FFE14D'); beak = M(cid, 'beak', '#FF9B3D')
    F = face_mats()
    h = Ell((0, 0, 0.98), (0.74, 0.68, 0.72))
    ell_add(B, fur, h)
    ell_add(B, fur, Ell((0, 0.02, 0.42), (0.5, 0.46, 0.38)), seg=32, rings=16)
    for k, (dx, ry) in enumerate(((-0.1, -0.35), (0.0, 0.0), (0.1, 0.4))):
        mt = Matrix.Translation(h.c + Vector((dx, 0.0, 0.7))) @ Euler((0, ry, 0)).to_matrix().to_4x4()
        B.add('sphere', fur, mtx=mt @ Matrix.Translation((0, 0, 0.1)), scale=(0.1, 0.08, 0.32 - abs(dx)), seg=12, rings=8)
    for s in (-1, 1):
        B.add('sphere', beak, loc=(s * 0.2, -0.12, 0.07), scale=(0.3, 0.36, 0.14), seg=16, rings=8)
        ang = 0.5 if s < 0 else -1.1
        mt = Matrix.Translation((s * 0.66, -0.02, 0.62)) @ Euler((0, ang * -s if s < 0 else ang, 0)).to_matrix().to_4x4()
        B.add('sphere', fur, mtx=mt @ Matrix.Translation((0, 0, -0.08)), scale=(0.2, 0.3, 0.44), seg=16, rings=8)
    p, n = h.pt(0, -12, 0.05)
    B.add('sphere', beak, mtx=axis_mtx(p, n, (0, 0, 1)), scale=(0.24, 0.13, 0.16), seg=14, rings=8)
    f = Face(D, h, F)
    f.eyes(23, 4, w=0.14, h=0.19)
    f.blush(44, -12, w=0.17, h=0.09)
    return finish(root, B, D)


# ====================================================================== rare
def build_tiger():
    cid = 'tiger'
    root, B, D = new(cid)
    fur = M(cid, 'fur', '#FFA23C'); white = M(cid, 'white', '#FFF8EC'); stripe = M(cid, 'stripe', '#3C2F43')
    scarf = M(cid, 'scarf', CORAL); band = M(cid, 'band', LEMON)
    F = face_mats()
    base(cid, B, D, fur, belly=white, feet=white, hand=white)
    h = HEAD
    for s in (-1, 1):
        p = h.c + Vector((s * 0.46, 0.03, 0.4))
        B.add('sphere', fur, loc=p, scale=(0.3, 0.2, 0.3), seg=20, rings=10)
        D.add('sphere', white, loc=p + Vector((0, -0.07, 0)), scale=(0.17, 0.08, 0.17), seg=14, rings=8)
    for yw, pt, ln in ((-12, 50, 0.2), (0, 56, 0.24), (12, 50, 0.2)):
        on(D, h, 'sphere', stripe, yw, pt, (0.06, ln, 0.025), out=0.0, seg=10, rings=6)
    for s in (-1, 1):
        for pt in (12, -4):
            on(D, h, 'sphere', stripe, s * 66, pt, (0.2, 0.05, 0.025), out=0.0, spin=s * 8, seg=10, rings=6)
    mz = Ell(h.c + Vector((0, -0.46, -0.17)), (0.26, 0.17, 0.16))
    ell_add(B, white, mz, seg=24, rings=12)
    f = Face(D, h, F)
    f.eyes(24, 5, w=0.14, h=0.19)
    f.blush(48, -12)
    on(D, mz, 'sphere', M(cid, 'nose', '#FF8FA0'), 0, 38, (0.13, 0.08, 0.08), out=0.0, seg=14, rings=8)
    f.mouth('w', pitch=-18, size=1.6, ell=mz, r=0.02)
    # 목도리 (액세서리)
    B.add('torus', scarf, loc=(0, -0.0, 0.76), scale=(1, 0.95, 0.9), R=0.32, r=0.11, seg=28, rings=12)
    mt = Matrix.Translation((0.22, -0.32, 0.5)) @ Euler((0.25, 0.25, 0.1)).to_matrix().to_4x4()
    B.add('cube', scarf, mtx=mt, scale=(0.2, 0.08, 0.4), bevel=0.035, bevel_seg=2)
    D.add('cube', band, mtx=mt @ Matrix.Translation((0, 0, -0.1)), scale=(0.205, 0.085, 0.06))
    D.add('cube', band, mtx=mt @ Matrix.Translation((0, 0, 0.04)), scale=(0.205, 0.085, 0.06))
    chain(B, fur, [(-0.3, 0.3, 0.3), (-0.55, 0.34, 0.38), (-0.68, 0.3, 0.6), (-0.64, 0.2, 0.82)],
          [0.08, 0.08, 0.075, 0.075])
    return finish(root, B, D)


def build_koala():
    cid = 'koala'
    root, B, D = new(cid)
    fur = M(cid, 'fur', '#AEB8CC'); fluff = M(cid, 'fluff', '#F5F1FA'); nose = M(cid, 'nose', '#3D4259')
    leaf = M(cid, 'leaf', '#4FC66B'); leaf2 = M(cid, 'leaf2', '#8BE07A'); vine = M(cid, 'vine', '#2F9E58')
    F = face_mats()
    base(cid, B, D, fur, belly=fluff, feet=fur)
    h = HEAD
    for s in (-1, 1):
        p = h.c + Vector((s * 0.64, 0.05, 0.26))
        B.add('sphere', fur, loc=p, scale=(0.5, 0.26, 0.48), seg=20, rings=10)
        D.add('sphere', fluff, loc=p + Vector((s * 0.0, -0.09, -0.02)), scale=(0.32, 0.08, 0.3), seg=16, rings=8)
    on(B, h, 'sphere', nose, 0, -6, (0.22, 0.28, 0.14), out=0.02, seg=20, rings=10)
    on(D, h, 'sphere', F['hi'], -5, 2, (0.06, 0.04, 0.02), out=0.11, seg=8, rings=4)
    f = Face(D, h, F)
    f.eyes(30, 6, w=0.12, h=0.16)
    f.blush(52, -14, w=0.15, h=0.08)
    f.mouth('smile', pitch=-25, size=0.7, r=0.018)
    # 머리 위 유칼립투스 잎 세 장 (액세서리)
    top = h.c + Vector((0.1, 0.0, 0.5))
    stem_top = top + Vector((0.02, -0.02, 0.2))
    B.tube(vine, top, stem_top, 0.03, seg=8)
    for i, (ax, ln) in enumerate((((-0.9, -0.1, 0.75), 0.36), ((0.05, -0.2, 1.0), 0.42), ((0.95, -0.1, 0.7), 0.36))):
        ax = Vector(ax).normalized()
        B.add('sphere', leaf if i != 1 else leaf2, mtx=axis_mtx(stem_top + ax * ln * 0.5, ax, (0, 1, 0)),
              scale=(0.2, 0.06, ln), seg=14, rings=8)
        off = Vector((0, -0.026, 0))
        D.tube(vine, stem_top + ax * 0.08 + off, stem_top + ax * ln * 0.8 + off, 0.012, seg=6)
    return finish(root, B, D)


def build_octopus():
    cid = 'octopus'
    root, B, D = new(cid)
    fur = M(cid, 'fur', '#FF80B3'); spot = M(cid, 'spot', '#FFC4DC'); hat = M(cid, 'hat', '#FFFFFF')
    band = M(cid, 'band', BLUE)
    F = face_mats()
    h = Ell((0, 0, 1.02), (0.72, 0.66, 0.68))
    ell_add(B, fur, h)
    prof = [(0.36, 0.5), (0.52, 0.3), (0.72, 0.16), (0.9, 0.14), (1.0, 0.24), (0.97, 0.36), (0.88, 0.37)]
    rad = [0.17, 0.15, 0.125, 0.105, 0.085, 0.07, 0.06]
    for k in range(6):
        a = (-90 + 60 * k + 30) * D2R
        c, s_ = math.cos(a), math.sin(a)
        pts = [(d * c, d * s_ * 0.9, z) for d, z in prof]
        chain(B, fur, pts, rad, seg=12)
    for yw, pt, sz in ((-40, 30, 0.12), (52, 36, 0.1), (-58, 6, 0.08), (30, 55, 0.08)):
        on(D, h, 'sphere', spot, yw, pt, (sz, sz, 0.03), out=0.0, seg=12, rings=6)
    f = Face(D, h, F)
    f.eyes(22, -8, w=0.15, h=0.2)
    f.blush(42, -22, w=0.16, h=0.09)
    f.mouth('smile', pitch=-28, size=0.8)
    # 꼬마 선원 모자 (액세서리)
    tm = Matrix.Translation(h.c + Vector((0.16, 0.04, 0.6))) @ Euler((-0.12, 0.3, 0)).to_matrix().to_4x4()
    B.add('cyl', hat, mtx=tm @ Matrix.Translation((0, 0, 0.06)), scale=(0.48, 0.48, 0.2), seg=24, bevel=0.03)
    B.add('torus', hat, mtx=tm @ Matrix.Translation((0, 0, -0.02)), R=0.26, r=0.06, seg=24, rings=8)
    D.add('cyl', band, mtx=tm @ Matrix.Translation((0, 0, 0.06)), scale=(0.495, 0.495, 0.07), seg=24)
    return finish(root, B, D)


def build_dino():
    cid = 'dino'
    root, B, D = new(cid)
    fur = M(cid, 'fur', '#33D19E'); belly = M(cid, 'belly', '#EFFFC8'); spike = M(cid, 'spike', LEMON)
    egg = M(cid, 'egg', '#FFFAEE'); dot = M(cid, 'dot', '#8C6CFF')
    F = face_mats()
    h = Ell((0, -0.02, 1.18), (0.66, 0.6, 0.56))
    base(cid, B, D, fur, belly=belly, feet=fur, head=h)
    mz = Ell(h.c + Vector((0, -0.42, -0.17)), (0.42, 0.26, 0.26))
    ell_add(B, fur, mz, seg=28, rings=14)
    for s in (-1, 1):
        on(D, mz, 'sphere', F['mouth'], s * 14, 34, (0.045, 0.035, 0.02), out=0.0, seg=8, rings=4)
    f = Face(D, h, F)
    f.eyes(26, 12, w=0.14, h=0.19)
    f.blush(52, -6, w=0.15, h=0.08)
    f.mouth('smile', pitch=-6, size=2.2, ell=mz, r=0.022)
    # 등 가시 (왼쪽 실루엣으로 보이게)
    for p, sz in (((-0.5, 0.28, 1.42), 0.22), ((-0.62, 0.3, 1.12), 0.24), ((-0.52, 0.32, 0.82), 0.2),
                  ((-0.4, 0.3, 0.58), 0.17)):
        p = Vector(p)
        n = Vector((p.x, p.y * 0.6, 0)).normalized()
        B.add('cone', spike, mtx=axis_mtx(p, n, (0, 0, 1)), scale=(sz * 0.5, sz * 0.9, sz), r2=0.05, seg=10)
    chain(B, fur, [(-0.3, 0.32, 0.3), (-0.6, 0.36, 0.28), (-0.85, 0.32, 0.36), (-1.0, 0.25, 0.5)],
          [0.2, 0.15, 0.1, 0.06], seg=16)
    for x, z, sz in ((-0.6, 0.46, 0.16), (-0.84, 0.5, 0.12)):
        B.add('cone', spike, loc=(x, 0.36, z), scale=(sz * 0.9, sz * 0.5, sz), r2=0.05, seg=10)
    # 달걀 껍데기 모자 (액세서리)
    tm = Matrix.Translation(h.c + Vector((0.14, 0.02, 0.44))) @ Euler((0.1, 0.4, 0)).to_matrix().to_4x4()
    B.add('sphere', egg, mtx=tm, scale=(0.64, 0.62, 0.66), seg=28, rings=14, cut=((0, 0, 0), (0, 0, 1), True))
    rot = tm.to_3x3().to_4x4()
    for i in range(14):
        a = 2 * PI * i / 14
        p = tm @ Vector((0.31 * math.cos(a), 0.3 * math.sin(a), 0.01))
        out_d = (rot @ Vector((math.cos(a), math.sin(a), 0))).normalized()
        B.add('cone', egg, mtx=axis_mtx(p, rot @ Vector((0, 0, -1)), out_d), scale=(0.13, 0.03, 0.12), r2=0.0,
              seg=4, smooth=False)
    for a, z in ((-110, 0.2), (-60, 0.12), (-155, 0.08)):
        ar = a * D2R
        p = tm @ Vector((0.31 * math.cos(ar) * 0.93, 0.3 * math.sin(ar) * 0.93, z))
        D.add('sphere', dot, loc=p, scale=0.075, seg=10, rings=6)
    return finish(root, B, D)


# ====================================================================== legendary
def build_unicorn():
    cid = 'unicorn'
    root, B, D = new(cid)
    fur = M(cid, 'fur', '#FFFAFD'); pink = M(cid, 'pink', '#FFB6CD'); hoof = M(cid, 'hoof', '#C7B4FF')
    horn = toon('unicorn_horn', '#FFD54A', rough=0.25, metal=0.3, emit='#FFC21A', es=0.55)
    hornL = toon('unicorn_hornL', '#FFF1A8', rough=0.25, metal=0.2, emit='#FFE680', es=0.6)
    spark = emissive('Sparkle', '#FFE45C', 1.6)
    spark2 = emissive('Sparkle2', '#FFB8E6', 1.4)
    rainbow = [M(cid, 'm%d' % i, c) for i, c in enumerate(('#FF8FB8', '#FFD45E', '#7EE6C0', '#7FB2FF', '#B79CFF'))]
    F = face_mats()
    base(cid, B, D, fur, belly=None, feet=hoof, hand=fur)
    h = HEAD
    for s in (-1, 1):
        mt = Matrix.Translation(h.c + Vector((s * 0.44, 0.08, 0.4))) @ Euler((0, s * 0.55, 0)).to_matrix().to_4x4()
        B.add('cone', fur, mtx=mt, scale=(0.26, 0.16, 0.34), r2=0.05, seg=14)
        D.add('cone', pink, mtx=mt @ Matrix.Translation((0, -0.05, -0.02)), scale=(0.15, 0.06, 0.22), r2=0.04, seg=10)
    # 뿔
    hm = Matrix.Translation(h.c + Vector((0, -0.2, 0.62))) @ Euler((0.3, 0, 0)).to_matrix().to_4x4()
    B.add('cone', horn, mtx=hm @ Matrix.Translation((0, 0, 0.22)), scale=(0.24, 0.24, 0.56), r2=0.03, seg=18)
    for k, z in enumerate((0.06, 0.2, 0.33)):
        B.add('torus', hornL, mtx=hm @ Matrix.Translation((0, 0, z)) @ Euler((0.25, 0, 0)).to_matrix().to_4x4(),
              R=0.105 - 0.03 * k, r=0.025, seg=16, rings=6)
    # 무지개 갈기: 이마 앞머리(왼쪽으로 넘김) + 정수리에서 뒤통수로
    for i, (yw, pt, sc) in enumerate(((-12, 58, 0.3), (-34, 48, 0.28), (-50, 30, 0.24), (-60, 10, 0.2))):
        p, n = h.pt(yw, pt, 0.03)
        B.add('sphere', rainbow[i % 5], loc=p, scale=sc, seg=16, rings=8)
    for i, rel in enumerate(((0.05, 0.12, 0.6), (-0.12, 0.34, 0.52), (-0.26, 0.5, 0.32), (-0.34, 0.54, 0.06),
                             (-0.34, 0.46, -0.2))):
        B.add('sphere', rainbow[(i + 4) % 5], loc=h.c + Vector(rel), scale=0.3, seg=16, rings=8)
    pts = [(-0.34, 0.3, 0.4), (-0.56, 0.34, 0.45), (-0.7, 0.3, 0.62), (-0.74, 0.24, 0.84)]
    for i, p in enumerate(pts):
        B.add('sphere', rainbow[i % 5], loc=p, scale=0.22 + 0.02 * i, seg=16, rings=8)
    mz = Ell(h.c + Vector((0, -0.47, -0.21)), (0.27, 0.16, 0.15))
    ell_add(B, M(cid, 'muzzle', '#FFE3EE'), mz, seg=24, rings=12)
    for s in (-1, 1):
        on(D, mz, 'sphere', pink, s * 24, 28, (0.045, 0.03, 0.02), out=0.0, seg=8, rings=4)
    f = Face(D, h, F)
    f.eyes(25, 8, w=0.14, h=0.2)
    f.blush(50, -8, w=0.15, h=0.08)
    f.mouth('smile', pitch=-18, size=1.7, ell=mz, r=0.019)
    # 전설: 반짝이 별
    S = Builder(cid + '_spark')
    sparkles(S, [(0.95, -0.1, 1.95, 0.26), (-0.95, -0.2, 1.55, 0.18), (1.0, -0.2, 0.9, 0.15)], spark)
    sparkles(S, [(-0.85, -0.2, 2.05, 0.12)], spark2)
    so = mark(S.build(parent=root), 0.8)
    return finish(root, B, D)


def build_dragon():
    cid = 'dragon'
    root, B, D = new(cid)
    fur = M(cid, 'fur', '#8C6CFF'); belly = M(cid, 'belly', '#FFE9A6'); wing = M(cid, 'wing', '#C6B6FF')
    horn = toon('dragon_horn', '#FFE14D', rough=0.3, metal=0.2, emit='#FFC21A', es=0.5)
    gem = toon('dragon_gem', '#4DF0C8', rough=0.1, emit='#2ED3A0', es=1.2)
    spark = emissive('Sparkle', '#FFE45C', 1.6)
    F = face_mats()
    h = Ell((0, -0.02, 1.18), (0.66, 0.6, 0.56))
    base(cid, B, D, fur, belly=belly, feet=fur, head=h)
    mz = Ell(h.c + Vector((0, -0.42, -0.17)), (0.4, 0.26, 0.25))
    ell_add(B, fur, mz, seg=28, rings=14)
    for s in (-1, 1):
        on(D, mz, 'sphere', F['mouth'], s * 15, 34, (0.05, 0.035, 0.02), out=0.0, seg=8, rings=4)
        hm = Matrix.Translation(h.c + Vector((s * 0.3, 0.1, 0.46))) @ Euler((-0.55, s * 0.35, 0)).to_matrix().to_4x4()
        B.add('cone', horn, mtx=hm @ Matrix.Translation((0, 0, 0.16)), scale=(0.2, 0.2, 0.44), r2=0.03, seg=14)
        # 날개: 뼈 + 막
        sh = Vector((s * 0.3, 0.32, 0.82))
        tip = Vector((s * 1.02, 0.4, 1.26))
        sweep(B, fur, [sh, (sh + tip) / 2 + Vector((0, 0, 0.08)), tip], [0.07, 0.06, 0.04], seg=12)
        # 손가락 모양 막 3장 -> 아래 가장자리가 물결
        for k in range(3):
            q = sh + (tip - sh) * (0.42 + 0.27 * k) + Vector((0, 0, 0.04))
            down = Vector((-s * (0.32 - 0.12 * k), 0.0, -1.0)).normalized()
            ln = 0.62 - 0.1 * k
            B.add('sphere', wing, mtx=axis_mtx(q + down * ln * 0.42, down, (0, 1, 0)), scale=(0.34, 0.05, ln),
                  seg=18, rings=10)
    on(B, h, 'sphere', gem, 0, 40, (0.16, 0.2, 0.1), out=0.02, seg=4, rings=2, smooth=False)
    f = Face(D, h, F)
    f.eyes(27, 12, w=0.14, h=0.19)
    f.blush(52, -6, w=0.15, h=0.08)
    f.mouth('smile', pitch=-6, size=2.1, ell=mz, r=0.022)
    on(D, mz, 'cone', M(cid, 'fang', '#FFFFFF'), 14, -20, (0.06, 0.06, 0.07), out=0.01, r2=0.0, seg=8)
    chain(B, fur, [(-0.3, 0.32, 0.3), (-0.6, 0.36, 0.26), (-0.86, 0.32, 0.34), (-1.0, 0.26, 0.5)],
          [0.18, 0.13, 0.09, 0.05], seg=16)
    B.add('sphere', horn, loc=(-1.04, 0.24, 0.6), scale=(0.18, 0.06, 0.24), rot=(0, -0.6, 0), seg=4, rings=2, smooth=False)
    S = Builder(cid + '_spark')
    sparkles(S, [(1.05, -0.1, 1.9, 0.24), (-1.05, -0.2, 1.75, 0.17), (1.08, -0.2, 0.75, 0.14)], spark)
    mark(S.build(parent=root), 0.8)
    return finish(root, B, D)


BUILDERS = {k: globals()['build_' + k] for k, *_ in CHARS}


def build_char(cid):
    return BUILDERS[cid]()


# ====================================================================== render
CAM_DIR = (0.5, -1.0, 0.3)   # 앞 3/4, 살짝 위에서


def render_all(only=()):
    import os, json
    from lib import reset
    from v2lib import studio2, frame_sprite, render_png, finalize_png, out_dir
    d = out_dir('chars')
    for cid, name, rarity, emoji in CHARS:
        if only and cid not in only:
            continue
        reset()
        studio2(512, 512, samples=48)
        build_char(cid)
        frame_sprite(CAM_DIR, 512, 512, pad=0.08, px=6)
        p = os.path.join(d, cid + '.png')
        render_png(p)
        print('CHAR', cid, finalize_png(p))
    data = [dict(id=c, name=n, rarity=r, emoji=e) for c, n, r, e in CHARS]
    with open(os.path.join(d, 'chars.json'), 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
