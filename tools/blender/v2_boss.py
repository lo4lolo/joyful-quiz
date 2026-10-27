# -*- coding: utf-8 -*-
"""레이드 보스 3종 + 아파하는 _hurt 3종 (768², 투명). 귀엽고 무섭지 않게.
build_boss(id, hurt=False) -> 루트 empty."""
import bpy, math, os, random
from mathutils import Vector, Matrix, Euler
from lib import Builder, empty
from v2lib import (Ell, Face, on, arc, arc_pts, surf_mtx, toon, emissive, face_mats, mark, poly, sweep, star_mesh,
                   INK, BLUE, LEMON, CORAL, MINT, GRAPE, PI, D2R)
from v2_icons import T, R, S

BOSSES = [
    ('slime_king', '슬라임 킹', '#4FB8FF'),
    ('rock_golem', '바위 골렘', '#A9A3C9'),
    ('cloud_dragon', '구름 용', '#8C6CFF'),
]
H = PI / 2


def new(name):
    return empty(name), Builder(name + '_b'), Builder(name + '_d'), Builder(name + '_fx')


def done(root, B, D, X):
    mark(B.build(parent=root))
    D.build(parent=root)
    if X.bm.verts:
        mark(X.build(parent=root), 0.8)
    else:
        X.bm.free()
    return root


def hurt_fx(X, spots, drops=()):
    """맞은 표시: 노란 별 + 땀방울."""
    spark = emissive('Sparkle', '#FFE45C', 1.6)
    for (x, y, z, s) in spots:
        star_mesh(X, spark, (x, y, z), s, rot=(H, 0, 0.35), depth=0.3, inner=0.42)
    sweat = toon('sweat', '#9ED8FF', rough=0.15, emit='#BFE6FF', es=0.25)
    for (x, y, z, s) in drops:
        X.add('sphere', sweat, loc=(x, y, z), scale=(s, s, s), seg=14, rings=8)
        X.add('cone', sweat, loc=(x, y, z + s * 0.55), scale=(s * 0.86, s * 0.86, s * 0.8), r2=0.0, seg=14)


def boss_face(D, e, F, hurt, yaw=20, pitch=4, w=0.3, h=0.4, mouth_pitch=-16, msize=1.0, blush=(40, -14, 0.3, 0.16),
              mouth_ell=None):
    f = Face(D, e, F)
    if hurt:
        f.eyes(yaw, pitch, style='hurt')
        f.mouth('wavy', pitch=mouth_pitch, size=msize * 1.1, r=0.035, ell=mouth_ell)
    else:
        f.eyes(yaw, pitch, w=w, h=h)
        f.mouth('open', pitch=mouth_pitch, size=msize * 1.9, ell=mouth_ell)
    on(D, e, 'sphere', F['blush'], -blush[0], blush[1], (blush[2], blush[3], 0.04), out=0.0, seg=16, rings=8)
    on(D, e, 'sphere', F['blush'], blush[0], blush[1], (blush[2], blush[3], 0.04), out=0.0, seg=16, rings=8)


# ---------------------------------------------------------------- slime king
def b_slime_king(hurt=False):
    root, B, D, X = new('slime_king')
    F = face_mats()
    slime = toon('slime', '#56C2FF', rough=0.18)
    p = slime.node_tree.nodes['Principled BSDF']
    try:
        p.inputs['Coat Weight'].default_value = 0.6
        p.inputs['Subsurface Weight'].default_value = 0.15
    except Exception:
        pass
    deep = toon('slime_deep', '#3E9CF0', rough=0.25)
    gold = toon('crown_gold', '#FFC93C', rough=0.28, metal=0.4, emit='#FFB800', es=0.12)
    e = Ell((0, 0, 0.95), (1.05, 0.95, 0.9))
    B.add('sphere', slime, loc=e.c, scale=e.scale(), seg=48, rings=24)
    B.add('sphere', slime, loc=(0, 0, 0.36), scale=(2.25, 2.0, 0.7), seg=48, rings=20)
    for x, y, s in ((-0.8, -0.5, 0.34), (0.7, -0.65, 0.3), (1.02, 0.0, 0.26), (-1.08, 0.1, 0.28), (0.05, -0.92, 0.22)):
        B.add('sphere', slime, loc=(x, y, 0.14), scale=(s * 1.3, s * 1.3, s), seg=20, rings=10)
    D.add('sphere', emissive('slime_hi', '#E8F7FF', 1.0), mtx=surf_mtx(*e.pt(-38, 42, 0.0)), scale=(0.34, 0.2, 0.04),
          seg=16, rings=8)
    D.add('sphere', emissive('slime_hi', '#E8F7FF', 1.0), mtx=surf_mtx(*e.pt(-24, 54, 0.0)), scale=(0.1, 0.1, 0.03),
          seg=10, rings=5)
    for k in range(3):
        on(D, e, 'sphere', deep, 48 + k * 9, -40 + k * 14, (0.12 - k * 0.02,) * 2 + (0.03,), out=0.0, seg=12, rings=6)
    boss_face(D, e, F, hurt, yaw=22, pitch=4, w=0.34, h=0.46, mouth_pitch=-22, msize=1.25, blush=(42, -14, 0.3, 0.16))
    # 왕관
    tilt = (0.15, 0.35 if not hurt else 0.7, 0)
    lift = 0.0 if not hurt else 0.18
    cm = T(0.12, 0.05, 1.68 + lift) @ R(*tilt)
    B.add('cyl', gold, mtx=cm, scale=(0.95, 0.95, 0.3), seg=40, bevel=0.03, bevel_seg=1)
    for k in range(5):
        a = 2 * PI * k / 5 - H
        q = cm @ Vector((0.45 * math.cos(a), 0.45 * math.sin(a), 0.32))
        B.add('cone', gold, mtx=cm.to_3x3().to_4x4() @ T(0, 0, 0) if False else
              Matrix.Translation(q) @ cm.to_3x3().to_4x4(), scale=(0.26, 0.26, 0.4), r2=0.0, seg=16)
        B.add('sphere', gold, loc=cm @ Vector((0.45 * math.cos(a), 0.45 * math.sin(a), 0.54)), scale=0.12, seg=12, rings=6)
    for k, col in enumerate((CORAL, MINT, GRAPE)):
        a = -H + (k - 1) * 0.75
        g = toon('gem%d' % k, col, rough=0.1, emit=col, es=0.35)
        D.add('sphere', g, mtx=cm @ T(0.48 * math.cos(a), 0.48 * math.sin(a), 0.0) @ R(H, 0, a + H),
              scale=(0.16, 0.2, 0.08), seg=6, rings=3, smooth=False)
    if hurt:
        hurt_fx(X, [(1.35, -0.4, 1.9, 0.32), (-1.3, -0.4, 1.6, 0.24), (1.5, -0.4, 1.1, 0.2)],
                drops=[(-0.95, -0.6, 1.55, 0.13), (1.0, -0.6, 1.45, 0.11)])
        root.scale = (1.08, 1.08, 0.88)
    return done(root, B, D, X)


# ---------------------------------------------------------------- rock golem
def b_rock_golem(hurt=False):
    root, B, D, X = new('rock_golem')
    F = face_mats()
    rock = toon('rock', '#AEA8D4', rough=0.75)
    rock2 = toon('rock2', '#9690C2', rough=0.8)
    moss = toon('moss', '#7FD66E', rough=0.7)
    crys = toon('crystal', '#5FF0CF', rough=0.1, emit='#2ED3A0', es=0.9)
    flower = toon('flower', CORAL, rough=0.5)
    e = Ell((0, 0, 1.15), (1.0, 0.85, 0.95))
    B.add('ico', rock, loc=e.c, scale=e.scale(), subdiv=3, jitter=(0.02, 5))
    for s in (-1, 1):
        B.add('ico', rock2, loc=(s * 0.98, 0.05, 1.42), scale=(0.75, 0.7, 0.62), subdiv=2, jitter=(0.02, 7 + s))
        fist = (s * 1.3, -0.2, 0.62) if not (hurt or s < 0) else (s * 1.25, -0.25, 0.55)
        if not hurt and s > 0:
            fist = (1.35, -0.3, 1.0)  # 손 흔들기
        sweep(B, rock2, [(s * 0.98, 0.05, 1.3), fist], [0.24, 0.24], seg=14, sub=2)
        B.add('ico', rock, loc=fist, scale=(0.72, 0.66, 0.66), subdiv=2, jitter=(0.02, 9 + s))
        B.add('ico', rock2, loc=(s * 0.48, -0.05, 0.28), scale=(0.66, 0.66, 0.56), subdiv=2, jitter=(0.02, 11 + s))
    # 이끼 + 꽃 + 수정
    for (yw, pt, sx, sy) in ((-20, 72, 0.7, 0.5), (25, 66, 0.55, 0.42), (5, 84, 0.6, 0.5), (-50, 58, 0.36, 0.28)):
        on(D, e, 'sphere', moss, yw, pt, (sx, sy, 0.16), out=0.02, seg=20, rings=10)
    for x, y in ((-0.28, -0.32), (0.25, -0.26)):
        p, n = e.pt(-18 if x < 0 else 22, 64, 0.08)
        D.add('sphere', flower, loc=p, scale=0.16, seg=10, rings=5)
        D.add('sphere', toon('flower_c', LEMON, rough=0.5), loc=p + n * 0.05, scale=0.08, seg=8, rings=4)
    for (x, y, z, rx, ry, ln) in ((-0.95, 0.15, 1.85, 0, -0.5, 0.6), (-0.7, 0.3, 1.95, 0.2, -0.2, 0.42),
                                  (1.1, 0.2, 1.8, 0, 0.55, 0.45), (0.3, 0.4, 2.1, -0.3, 0.2, 0.5)):
        B.add('cone', crys, mtx=T(x, y, z) @ R(rx, ry, 0) @ T(0, 0, ln / 2), scale=(0.26, 0.26, ln), r2=0.0, seg=6,
              smooth=False)
    crack = toon('crack', '#7C76A8', rough=0.8)
    arc(D, e, crack, [(-60, -20), (-52, -32), (-58, -44)], 0.02, out=0.02)
    arc(D, e, crack, [(55, 30), (64, 22), (60, 10)], 0.02, out=0.02)
    boss_face(D, e, F, hurt, yaw=21, pitch=8, w=0.31, h=0.41, mouth_pitch=-16, msize=1.15, blush=(40, -8, 0.28, 0.14))
    if hurt:
        for (x, y, z, s) in ((-1.0, -0.6, 2.1, 0.14), (1.1, -0.5, 0.95, 0.12), (-0.7, -0.7, 0.3, 0.1)):
            X.add('ico', rock2, loc=(x, y, z), scale=s, subdiv=1, smooth=False)
        hurt_fx(X, [(1.3, -0.4, 2.15, 0.3), (-1.45, -0.4, 1.5, 0.24)], drops=[(0.95, -0.6, 1.8, 0.12)])
        root.scale = (1.06, 1.06, 0.9)
    return done(root, B, D, X)


# ---------------------------------------------------------------- cloud dragon
def b_cloud_dragon(hurt=False):
    root, B, D, X = new('cloud_dragon')
    F = face_mats()
    skin = toon('cd_skin', '#AFC2FF', rough=0.45)
    belly = toon('cd_belly', '#FFFFFF', rough=0.5)
    cloud = toon('cd_cloud', '#FFFFFF', rough=0.7, emit='#FFFFFF', es=0.12)
    horn = toon('cd_horn', LEMON, rough=0.3, emit='#FFC21A', es=0.25)
    acc = toon('cd_acc', GRAPE, rough=0.4)
    path = [(0.2, 0.35, 1.25), (0.85, 0.45, 0.85), (0.75, 0.5, 0.3), (-0.1, 0.45, 0.15), (-0.85, 0.35, 0.45),
            (-1.25, 0.25, 0.95), (-1.35, 0.15, 1.35)]
    rad = [0.46, 0.42, 0.38, 0.34, 0.28, 0.2, 0.12]
    sweep(B, skin, path, rad, seg=24, sub=6)
    # 등 구름 갈기
    for i, (p, r) in enumerate(zip(path[:-1], rad[:-1])):
        q = Vector(p) + Vector((0, 0.15, r * 0.85))
        B.add('sphere', cloud, loc=q, scale=r * 1.25, seg=16, rings=8)
    B.add('sphere', cloud, loc=(-1.4, 0.15, 1.45), scale=0.42, seg=16, rings=8)
    B.add('sphere', cloud, loc=(-1.6, 0.15, 1.3), scale=0.3, seg=16, rings=8)
    # 밑 구름
    for x, y, z, s in ((-0.3, -0.1, 0.05, 0.7), (0.35, -0.2, 0.0, 0.6), (0.9, 0.1, 0.1, 0.5), (-0.9, 0.0, 0.12, 0.5)):
        B.add('sphere', cloud, loc=(x, y, z), scale=(s * 1.4, s, s * 0.8), seg=20, rings=10)
    h = Ell((0.0, -0.15, 1.72), (0.78, 0.66, 0.62))
    B.add('sphere', skin, loc=h.c, scale=h.scale(), seg=48, rings=24)
    mz = Ell(h.c + Vector((0, -0.5, -0.2)), (0.5, 0.32, 0.3))
    B.add('sphere', belly, loc=mz.c, scale=mz.scale(), seg=32, rings=16)
    for s in (-1, 1):
        on(D, mz, 'sphere', acc, s * 18, 36, (0.06, 0.045, 0.03), out=0.0, seg=10, rings=5)
        hm = T(*(h.c + Vector((s * 0.36, 0.15, 0.48)))) @ R(-0.45, s * 0.35, 0)
        B.add('cone', horn, mtx=hm @ T(0, 0, 0.2), scale=(0.24, 0.24, 0.55), r2=0.04, seg=16)
        B.add('sphere', horn, mtx=hm @ T(0, 0, 0.5), scale=0.09, seg=10, rings=5)
        # 지느러미 귀
        em = T(*(h.c + Vector((s * 0.74, 0.1, 0.12)))) @ R(0, s * 1.2, 0)
        B.add('cone', acc, mtx=em @ T(0, 0, 0.18), scale=(0.34, 0.1, 0.42), r2=0.03, seg=12)
        B.add('sphere', cloud, loc=h.c + Vector((s * 0.6, 0.35, 0.22)), scale=0.42, seg=16, rings=8)
        # 작은 팔
        sh = Vector((s * 0.55, 0.0, 1.05))
        end = sh + (Vector((s * 0.35, -0.3, 0.25)) if (not hurt and s > 0) else Vector((s * 0.25, -0.35, -0.15)))
        sweep(B, skin, [sh, end], [0.13, 0.12], seg=12, sub=2)
        B.add('sphere', skin, loc=end, scale=0.28, seg=14, rings=7)
    B.add('sphere', cloud, loc=h.c + Vector((0.0, 0.38, 0.5)), scale=0.5, seg=16, rings=8)
    boss_face(D, h, F, hurt, yaw=24, pitch=10, w=0.26, h=0.34, mouth_pitch=-12, msize=1.3, blush=(48, -10, 0.24, 0.12),
              mouth_ell=mz)
    if hurt:
        # 입은 주둥이 위에 다시
        pass
    if hurt:
        hurt_fx(X, [(1.3, -0.4, 2.4, 0.3), (-1.2, -0.4, 2.25, 0.24), (1.5, -0.4, 1.4, 0.2)],
                drops=[(-0.85, -0.7, 2.15, 0.12)])
        root.scale = (1.06, 1.06, 0.9)
    return done(root, B, D, X)


BUILD = {'slime_king': b_slime_king, 'rock_golem': b_rock_golem, 'cloud_dragon': b_cloud_dragon}


def build_boss(bid, hurt=False):
    return BUILD[bid](hurt)


CAM_DIR = (0.3, -1.0, 0.25)


def render_all(only=()):
    import json
    from lib import reset
    from v2lib import studio2, frame_sprite, render_png, finalize_png, out_dir
    from v2lib import ortho_cam, eval_points, set_outline_px
    from mathutils import Vector
    d = out_dir('boss')
    tgt = (0, 0, 1.0)
    for bid, name, col in BOSSES:
        if only and not any(o.startswith(bid) for o in only):
            continue
        # 보통/아픔 두 장이 같은 카메라(같은 크기·위치)를 쓰도록 두 모양을 합친 범위로 맞춤
        local = []
        for hurt in (False, True):
            reset()
            build_boss(bid, hurt)
            cam = ortho_cam(CAM_DIR, tgt)
            bpy.context.view_layer.update()
            inv = cam.matrix_world.inverted()
            local += [inv @ p for p in eval_points()]
        xs = [p.x for p in local]; ys = [p.y for p in local]
        cx, cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
        sc = max(max(xs) - min(xs), max(ys) - min(ys)) / (1 - 2 * 0.075)
        for hurt in (False, True):
            oid = bid + ('_hurt' if hurt else '')
            reset()
            studio2(768, 768, samples=48)
            build_boss(bid, hurt)
            cam = ortho_cam(CAM_DIR, tgt)
            bpy.context.view_layer.update()
            cam.location = cam.matrix_world @ Vector((cx, cy, 0))
            cam.data.ortho_scale = sc
            bpy.context.view_layer.update()
            set_outline_px([o for o in bpy.context.scene.objects if o.type == 'MESH'], 8, sc, 768)
            p = os.path.join(d, oid + '.png')
            render_png(p)
            print('BOSS', oid, finalize_png(p))
    data = [dict(id=i, name=n, color=c) for i, n, c in BOSSES]
    with open(os.path.join(d, 'boss.json'), 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
