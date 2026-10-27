# -*- coding: utf-8 -*-
"""즐거운 퀴즈 3D 에셋 모델링 함수들. 각 build_*()는 현재 씬에 만들고 루트 객체를 반환.
Blender 좌표: 앞 = -Y, 위 = +Z, 바닥 z=0 (glTF 로 내보내면 앞 +Z, 위 +Y)."""
import bpy, bmesh, math
from mathutils import Vector, Matrix, Euler
from lib import Builder, mat, empty, link, default_font, pastel

PI = math.pi
H = PI / 2


# ====================================================================== KART
KART_SEAT = (0.0, 0.30, 0.63)


def _wheel(name, loc, radius, width, root, M):
    b = Builder(name)
    rot = (0, H, 0)  # 원기둥 축 Z -> X
    b.add('cyl', M['Tire'], scale=(radius * 2, radius * 2, width), rot=rot, seg=16,
          bevel=min(0.07, width * 0.3), bevel_seg=1)
    side = 1 if loc[0] > 0 else -1
    b.add('cyl', M['Metal'], loc=(side * 0.02, 0, 0), scale=(radius * 1.15, radius * 1.15, width + 0.02),
          rot=rot, seg=12)
    b.add('sphere', M['Paint'], loc=(side * (width / 2 + 0.01), 0, 0),
          scale=(0.1, radius * 0.6, radius * 0.6), seg=10, rings=4)
    return b.build(parent=root, loc=loc)


def build_kart():
    M = {
        'Paint': mat('Paint', '#f5f5fa', rough=0.35),
        'Trim': mat('Trim', '#3b3c4e', rough=0.6),
        'Tire': mat('Tire', '#232328', rough=0.85),
        'Metal': mat('Metal', '#cdd2dc', rough=0.3, metal=0.8),
    }
    root = empty('Kart')
    b = Builder('Body')
    P, T, Me = M['Paint'], M['Trim'], M['Metal']
    # 바닥판과 몸통
    b.add('cube', T, loc=(0, 0, 0.17), scale=(0.88, 1.9, 0.12), bevel=0.05, bevel_seg=1)
    b.add('cube', P, loc=(0, 0.25, 0.37), scale=(0.86, 1.0, 0.36), bevel=0.16, bevel_seg=2)
    # 동글동글한 코(보닛)
    b.add('sphere', P, loc=(0, -0.55, 0.33), scale=(0.74, 1.0, 0.38), seg=14, rings=7)
    b.add('cube', T, loc=(0, -1.0, 0.22), scale=(1.0, 0.16, 0.14), bevel=0.06, bevel_seg=2)
    for x in (-0.2, 0.2):  # 전조등
        b.add('sphere', Me, loc=(x, -0.93, 0.37), scale=(0.13, 0.08, 0.11), seg=8, rings=4)
    # 옆 사이드포드
    for x in (-0.44, 0.44):
        b.add('sphere', P, loc=(x, 0.1, 0.3), scale=(0.28, 0.6, 0.24), seg=10, rings=6)
    # 뒤 범퍼, 엔진, 배기구
    b.add('cube', T, loc=(0, 1.04, 0.25), scale=(1.0, 0.14, 0.16), bevel=0.06, bevel_seg=2)
    b.add('cube', Me, loc=(0, 0.88, 0.5), scale=(0.5, 0.3, 0.24), bevel=0.06, bevel_seg=1)
    for x in (-0.14, 0.14):
        b.add('cyl', Me, loc=(x, 1.06, 0.5), scale=(0.11, 0.11, 0.2), rot=(H, 0, 0), seg=10)
        b.add('cyl', T, loc=(x, 1.165, 0.5), scale=(0.07, 0.07, 0.02), rot=(H, 0, 0), seg=10)
    # 스포일러
    b.add('cube', P, loc=(0, 1.0, 0.92), scale=(1.12, 0.28, 0.07), bevel=0.03, bevel_seg=1)
    for x in (-0.3, 0.3):
        b.add('cube', T, loc=(x, 1.0, 0.73), scale=(0.06, 0.1, 0.34))
    for x in (-0.57, 0.57):
        b.add('cube', T, loc=(x, 1.0, 0.92), scale=(0.05, 0.32, 0.2), bevel=0.02, bevel_seg=1)
    # 좌석
    b.add('cube', T, loc=(0, 0.3, 0.585), scale=(0.52, 0.46, 0.1), bevel=0.04, bevel_seg=1)
    b.add('cube', T, loc=(0, 0.58, 0.82), scale=(0.54, 0.12, 0.5), rot=(-0.2, 0, 0), bevel=0.05, bevel_seg=1)
    # 운전대
    b.tube(Me, (0, -0.32, 0.5), (0, -0.14, 0.72), 0.03, seg=8, caps=False)
    b.add('torus', T, loc=(0, -0.12, 0.74), rot=(-1.0, 0, 0), R=0.14, r=0.032, seg=12, rings=5)
    b.add('sphere', P, loc=(0, -0.12, 0.74), scale=(0.08, 0.08, 0.08), rot=(-1.0, 0, 0), seg=8, rings=4)
    # 차축
    b.add('cyl', Me, loc=(0, -0.72, 0.26), scale=(0.07, 0.07, 1.0), rot=(0, H, 0), seg=8)
    b.add('cyl', Me, loc=(0, 0.72, 0.30), scale=(0.07, 0.07, 1.0), rot=(0, H, 0), seg=8)
    b.build(parent=root)
    # 바퀴 (+X = 운전자 왼쪽)
    _wheel('Wheel_FL', (0.58, -0.72, 0.26), 0.26, 0.22, root, M)
    _wheel('Wheel_FR', (-0.58, -0.72, 0.26), 0.26, 0.22, root, M)
    _wheel('Wheel_RL', (0.58, 0.72, 0.30), 0.30, 0.28, root, M)
    _wheel('Wheel_RR', (-0.58, 0.72, 0.30), 0.30, 0.28, root, M)
    empty('Seat', KART_SEAT, parent=root, size=0.15)
    return root


# ====================================================================== DRIVER
def build_driver():
    M = {
        'Suit': mat('Suit', '#f4f4fa', rough=0.6),
        'Skin': mat('Skin', '#f2c08a', rough=0.7),
        'Helmet': mat('Helmet', '#fafafa', rough=0.25),
        'Eye': mat('Eye', '#2b2236', rough=0.2),
        'White': mat('White', '#fff8ee', rough=0.5),
        'Cheek': mat('Cheek', '#ff9eb5', rough=0.6),
        'Lens': mat('Lens', '#9fe6ff', rough=0.1, emit='#9fe6ff', emit_strength=0.3),
    }
    S, K, Hm, E, W = M['Suit'], M['Skin'], M['Helmet'], M['Eye'], M['White']
    root = empty('Driver')
    b = Builder('DriverBody')
    # 몸통
    b.add('sphere', S, loc=(0, 0.03, 0.2), scale=(0.42, 0.38, 0.44), seg=12, rings=7)
    b.add('sphere', W, loc=(0, -0.13, 0.2), scale=(0.24, 0.08, 0.26), seg=8, rings=5)  # 배
    b.add('torus', Hm, loc=(0, 0.02, 0.4), R=0.12, r=0.035, seg=10, rings=4)  # 목깃
    # 다리 + 신발
    for s in (-1, 1):
        b.tube(S, (s * 0.1, -0.05, 0.1), (s * 0.12, -0.3, 0.13), 0.075, seg=8, caps=False)
        b.add('sphere', Hm, loc=(s * 0.12, -0.36, 0.13), scale=(0.15, 0.2, 0.14), seg=8, rings=5)
    # 팔 + 앞발 (핸들 높이로)
    for s in (-1, 1):
        b.tube(S, (s * 0.18, 0.0, 0.3), (s * 0.15, -0.36, 0.13), 0.06, seg=8, caps=False)
        b.add('sphere', S, loc=(s * 0.18, 0.0, 0.3), scale=0.13, seg=8, rings=5)
        b.add('sphere', K, loc=(s * 0.14, -0.41, 0.12), scale=0.13, seg=8, rings=5)
    # 머리
    hc = Vector((0, -0.02, 0.62))
    b.add('sphere', K, loc=hc, scale=(0.6, 0.56, 0.54), seg=16, rings=10)
    b.add('sphere', W, loc=(0, -0.265, 0.55), scale=(0.25, 0.12, 0.15), seg=10, rings=5)  # 주둥이
    b.add('sphere', E, loc=(0, -0.33, 0.585), scale=(0.08, 0.05, 0.055), seg=8, rings=4)  # 코
    for s in (-1, 1):
        b.add('sphere', E, loc=(s * 0.11, -0.255, 0.675), scale=(0.075, 0.05, 0.1), seg=8, rings=5)
        b.add('sphere', W, loc=(s * 0.095 + s * -0.0, -0.29, 0.705), scale=0.032, seg=6, rings=4)
        b.add('sphere', M['Cheek'], loc=(s * 0.19, -0.2, 0.55), scale=(0.09, 0.05, 0.06), seg=8, rings=4)
    # 귀 (헬멧 위로)
    for s in (-1, 1):
        b.add('sphere', K, loc=(s * 0.2, 0.03, 0.85), scale=(0.17, 0.09, 0.17), rot=(0, s * -0.4, 0), seg=8, rings=5)
        b.add('sphere', M['Cheek'], loc=(s * 0.2, -0.015, 0.855), scale=(0.1, 0.03, 0.1), rot=(0, s * -0.4, 0), seg=8, rings=4)
    # 헬멧: 머리보다 큰 반구, 얼굴 쪽이 열리게 비스듬히 자름
    b.add('sphere', Hm, loc=(0, 0.0, 0.64), scale=(0.66, 0.62, 0.6), seg=16, rings=10,
          cut=((0, 0, 0.67), (0, 0.5, 1.0), False))
    # 이마 위 고글
    for s in (-1, 1):
        b.add('cyl', M['Lens'], loc=(s * 0.1, -0.215, 0.835), scale=(0.13, 0.13, 0.05), rot=(0.93, 0, 0), seg=12)
        b.add('torus', E, loc=(s * 0.1, -0.2, 0.825), rot=(0.93, 0, 0), R=0.068, r=0.018, seg=10, rings=4)
    b.add('cube', E, loc=(0, -0.21, 0.83), scale=(0.08, 0.03, 0.03), rot=(0.93, 0, 0))
    b.build(parent=root)
    return root


# ====================================================================== ITEM BOX
def build_itembox():
    font = default_font()
    box = mat('Box', '#ffffff', rough=0.3, vcol='Col')
    mark = mat('Mark', '#ffffff', rough=0.3, emit='#ffffff', emit_strength=0.25)
    root = empty('ItemBox')
    b = Builder('ItemBoxMesh')
    b.add('cube', box, scale=1.2, bevel=0.2, bevel_seg=3)
    faces = [((H, 0, 0), (0, -1, 0)), ((H, 0, H), (1, 0, 0)), ((H, 0, PI), (0, 1, 0)),
             ((H, 0, -H), (-1, 0, 0)), ((0, 0, 0), (0, 0, 1)), ((PI, 0, 0), (0, 0, -1))]
    for rot, n in faces:
        b.add('text', mark, loc=Vector(n) * 0.6, rot=rot, scale=(0.95, 0.95, 1.0), depth=0.1,
              font=font)
    ob = b.build(parent=root)
    # 무지개 파스텔 그라데이션 (정점색 'Col', Box 재질만)
    me = ob.data
    ca = me.color_attributes.new('Col', 'BYTE_COLOR', 'CORNER')
    bi = list(me.materials).index(box)
    for poly in me.polygons:
        for li in poly.loop_indices:
            v = me.vertices[me.loops[li].vertex_index].co
            if poly.material_index == bi:
                h = 0.92 - ((v.x + v.y * 0.6 + v.z * 1.2) / 1.6 + 0.5) * 0.8
                c = pastel(h, 0.62, 1.0)
            else:
                c = (1, 1, 1)
            ca.data[li].color = (*c, 1.0)
    return root


# ====================================================================== GATE
def _pillar(b, x, top, Mp, Ms, Mb, Mball, r=0.55, ball=True):
    b.add('cube', Mb, loc=(x, 0, 0.3), scale=(1.6, 1.6, 0.6), bevel=0.15, bevel_seg=2)
    z, i, step = 0.6, 0, 0.6
    while z < top - 0.01:
        h = min(step, top - z)
        b.add('cyl', Mp if i % 2 == 0 else Ms, loc=(x, 0, z + h / 2), scale=(r * 2, r * 2, h), seg=14)
        z += h; i += 1
    b.add('cyl', Mb, loc=(x, 0, top + 0.1), scale=(r * 2.6, r * 2.6, 0.22), seg=14, bevel=0.06, bevel_seg=1)
    if ball:
        b.add('sphere', Mball, loc=(x, 0, top + 0.75), scale=1.1, seg=14, rings=8)


def build_gate():
    font = default_font()
    M = dict(
        Banner=mat('Banner', '#ffb8d2', rough=0.45),
        Pillar=mat('Pillar', '#8fd3ff', rough=0.45),
        Stripe=mat('Stripe', '#ffffff', rough=0.45),
        Base=mat('Base', '#ff9ec7', rough=0.5),
        Ball=mat('Ball', '#ffd84d', rough=0.35),
        Mark=mat('Mark', '#6a4bd6', rough=0.4),
    )
    root = empty('Gate')
    b = Builder('GateMesh')
    for x in (-6.8, 6.8):
        _pillar(b, x, 4.3, M['Pillar'], M['Stripe'], M['Base'], M['Ball'])
    b.add('cube', M['Stripe'], loc=(0, 0, 3.95), scale=(13.0, 0.45, 1.6), bevel=0.22, bevel_seg=2)
    b.add('cube', M['Banner'], loc=(0, 0, 3.95), scale=(12.4, 0.7, 1.25), bevel=0.18, bevel_seg=2)
    for side in (-1, 1):  # 앞뒤 배지 + 물음표
        y = side * 0.35
        rz = 0 if side < 0 else PI
        b.add('cyl', M['Ball'], loc=(0, y + side * 0.03, 3.95), scale=(1.35, 1.35, 0.1), rot=(H, 0, rz), seg=20)
        b.add('text', M['Mark'], loc=(0, y + side * 0.1, 3.95), rot=(H, 0, rz),
              scale=(1.15, 1.15, 1), depth=0.08, font=font)
        for x in (-3.9, 3.9):  # 양옆 노란 별
            b.add('star', M['Ball'], loc=(x, y + side * 0.06, 3.95), rot=(H, 0, rz),
                  scale=(1.0, 1.0, 0.14), smooth=False)
    b.build(parent=root)
    return root


# ====================================================================== FINISH
def build_finish():
    M = dict(
        Pillar=mat('Pillar', '#ff8fb1', rough=0.45),
        Stripe=mat('Stripe', '#ffffff', rough=0.45),
        Base=mat('Base', '#8fd3ff', rough=0.5),
        Ball=mat('Ball', '#ffd84d', rough=0.35),
        Frame=mat('Frame', '#ffd84d', rough=0.4),
        CheckWhite=mat('CheckWhite', '#ffffff', rough=0.5),
        CheckBlack=mat('CheckBlack', '#2c2c3c', rough=0.5),
        Flag=mat('Flag', '#ff6f91', rough=0.5),
    )
    root = empty('Finish')
    b = Builder('FinishMesh')
    for x in (-7.6, 7.6):
        _pillar(b, x, 4.9, M['Pillar'], M['Stripe'], M['Base'], M['Ball'], r=0.6, ball=False)
        b.tube(M['Stripe'], (x, 0, 5.0), (x, 0, 6.6), 0.05, seg=6, caps=False)
        b.add('sphere', M['Ball'], loc=(x, 0, 6.65), scale=0.22, seg=8, rings=5)
        b.add('cube', M['Flag'], loc=(x + (0.45 if x < 0 else -0.45), 0, 6.25), scale=(0.9, 0.04, 0.6),
              bevel=0.02, bevel_seg=1)
    W, Hh, zc = 14.0, 1.4, 4.5
    b.add('cube', M['CheckBlack'], loc=(0, 0, zc), scale=(W, 0.3, Hh))
    for side in (-1, 1):
        b.add('grid', M['CheckWhite'], loc=(0, side * 0.2, zc), scale=(W, Hh, 1),
              rot=(H if side < 0 else -H, 0, 0), seg=40, rings=4, checker=(M['CheckBlack'],), smooth=False)
    for z in (zc + Hh / 2 + 0.1, zc - Hh / 2 - 0.1):
        b.add('cube', M['Frame'], loc=(0, 0, z), scale=(W + 0.6, 0.6, 0.22), bevel=0.08, bevel_seg=1)
    b.build(parent=root)
    return root


# ====================================================================== SMALL PROPS
def build_banana():
    peel = mat('Peel', '#ffe066', rough=0.45)
    fruit = mat('Fruit', '#fff4c4', rough=0.6)
    tip = mat('Tip', '#7a5232', rough=0.7)
    root = empty('Banana')
    b = Builder('BananaMesh')
    # 알맹이(통통한 캡슐) + 아래쪽 껍질 컵 + 바닥으로 늘어진 껍질 3장
    b.add('sphere', fruit, loc=(0, 0, 0.28), scale=(0.2, 0.2, 0.4), seg=10, rings=7)
    b.add('cone', peel, loc=(0, 0, 0.1), scale=(0.25, 0.25, 0.2), r2=0.46, seg=10)
    for k in range(3):
        a = 2 * PI * k / 3 + 0.3
        rad = Vector((math.cos(a), math.sin(a), 0))
        tan = Vector((-math.sin(a), math.cos(a), 0))
        pts = [rad * 0.1 + Vector((0, 0, 0.19)), rad * 0.2 + Vector((0, 0, 0.15)),
               rad * 0.3 + Vector((0, 0, 0.035))]
        for i, w in ((0, 0.17), (1, 0.14)):
            p0, p1 = pts[i], pts[i + 1]
            d = (p1 - p0)
            zax = d.normalized(); xax = tan; yax = zax.cross(xax)
            m3 = Matrix((xax, yax, zax)).transposed()
            mtx = Matrix.Translation((p0 + p1) / 2) @ m3.to_4x4()
            b.add('sphere', peel, mtx=mtx, scale=(w, 0.05, d.length * 1.6), seg=10, rings=6)
        b.add('sphere', tip, loc=rad * 0.33 + Vector((0, 0, 0.025)), scale=(0.06, 0.06, 0.04), seg=6, rings=4)
    b.build(parent=root)
    return root


def build_cone():
    orange = mat('Cone', '#ff8c42', rough=0.45)
    white = mat('Stripe', '#ffffff', rough=0.45)
    base = mat('Base', '#ff7033', rough=0.55)
    root = empty('Cone')
    b = Builder('ConeMesh')
    b.add('cube', base, loc=(0, 0, 0.04), scale=(0.52, 0.52, 0.08), bevel=0.04, bevel_seg=2)
    z0, z1, r0, r1 = 0.08, 0.66, 0.2, 0.045
    bands = [(0.08, 0.27, orange), (0.27, 0.37, white), (0.37, 0.48, orange), (0.48, 0.56, white), (0.56, 0.66, orange)]
    for za, zb, m in bands:
        ra = r0 + (r1 - r0) * (za - z0) / (z1 - z0)
        rb = r0 + (r1 - r0) * (zb - z0) / (z1 - z0)
        b.add('cone', m, loc=(0, 0, (za + zb) / 2), scale=(ra * 2, ra * 2, zb - za), r2=0.5 * rb / ra, seg=16)
    b.add('sphere', orange, loc=(0, 0, 0.665), scale=(0.09, 0.09, 0.07), seg=12, rings=5)
    b.build(parent=root)
    return root


def build_tree_round():
    trunk = mat('Trunk', '#b98458', rough=0.7)
    leaf = mat('Leaf', '#7fdc63', rough=0.6)
    root = empty('TreeRound')
    b = Builder('TreeRoundMesh')
    b.add('cyl', trunk, loc=(0, 0, 1.25), scale=(0.55, 0.55, 2.5), taper=(0.65, 0.65), seg=10)
    b.add('ico', leaf, loc=(0, 0, 2.78), scale=2.45, subdiv=3, smooth=False)
    b.build(parent=root)
    return root


def build_tree_pine():
    trunk = mat('Trunk', '#a8754f', rough=0.7)
    leaf = mat('Leaf', '#4cc78f', rough=0.6)
    root = empty('TreePine')
    b = Builder('TreePineMesh')
    b.add('cyl', trunk, loc=(0, 0, 0.55), scale=(0.42, 0.42, 1.1), seg=8)
    for z0, h, r in ((0.8, 2.0, 1.55), (2.0, 1.8, 1.2), (3.1, 1.9, 0.85)):
        b.add('cone', leaf, loc=(0, 0, z0 + h / 2), scale=(r * 2, r * 2, h), r2=0.0, seg=9, smooth=False)
    b.build(parent=root)
    return root


def build_rock():
    rock = mat('Rock', '#aab5c8', rough=0.8)
    root = empty('Rock')
    b = Builder('RockMesh')
    b.add('ico', rock, loc=(0, 0, 0.45), scale=(1.5, 1.2, 1.05), subdiv=2, jitter=(0.07, 7), smooth=False)
    b.add('ico', rock, loc=(0.7, -0.35, 0.18), scale=(0.55, 0.5, 0.42), subdiv=1, jitter=(0.04, 3), smooth=False)
    b.build(parent=root)
    return root


def build_cloud():
    cloud = mat('Cloud', '#ffffff', rough=0.9, emit='#ffffff', emit_strength=0.15)
    root = empty('Cloud')
    b = Builder('CloudMesh')
    for x, y, z, r in ((0, 0, 1.3, 1.6), (-1.7, 0.1, 0.95, 1.15), (1.7, -0.1, 1.0, 1.2),
                       (-2.6, 0, 0.65, 0.7), (2.6, 0.1, 0.65, 0.72), (0.7, 0.5, 1.9, 1.0),
                       (-0.8, -0.4, 1.8, 0.9)):
        b.add('sphere', cloud, loc=(x, y, z), scale=(r * 2, r * 1.7, r * 1.8), seg=14, rings=8)
    b.build(parent=root)
    return root


# ====================================================================== CHEST
CHEST_W, CHEST_D, CHEST_H = 1.0, 0.7, 0.5


def build_chest():
    wood = mat('Wood', '#c98a4b', rough=0.65)
    gold = mat('Gold', '#ffd24d', rough=0.3, metal=0.4)
    W, D, Hh = CHEST_W, CHEST_D, CHEST_H
    root = empty('Chest')
    b = Builder('Base')
    b.add('cube', wood, loc=(0, 0, Hh / 2), scale=(W, D, Hh), bevel=0.05, bevel_seg=2)
    b.add('cube', gold, loc=(0, 0, 0.045), scale=(W + 0.05, D + 0.05, 0.09), bevel=0.03, bevel_seg=1)
    b.add('cube', gold, loc=(0, 0, Hh - 0.03), scale=(W + 0.04, D + 0.04, 0.06), bevel=0.02, bevel_seg=1)
    for x in (-0.3, 0.3):
        b.add('cube', gold, loc=(x, 0, Hh / 2), scale=(0.1, D + 0.03, Hh + 0.01), bevel=0.02, bevel_seg=1)
    b.add('cube', gold, loc=(0, -D / 2 - 0.02, Hh - 0.1), scale=(0.2, 0.06, 0.22), bevel=0.03, bevel_seg=1)
    b.add('cyl', wood, loc=(0, -D / 2 - 0.055, Hh - 0.1), scale=(0.06, 0.06, 0.02), rot=(H, 0, 0), seg=8)
    b.build(parent=root)
    # 뚜껑: 원점 = 뒤쪽 위 경첩
    L = Builder('Lid')
    R = D / 2
    cut = ((0, 0, 0.0), (0, 0, 1), True)
    L.add('cyl', wood, loc=(0, -R, 0), scale=(D, D, W), rot=(0, H, 0), seg=20, cut=cut, bevel=0.0)
    for x in (-0.3, 0.3):
        L.add('cyl', gold, loc=(x, -R, 0), scale=(D + 0.04, D + 0.04, 0.1), rot=(0, H, 0), seg=20, cut=cut)
    for x in (-W / 2, W / 2):
        L.add('cyl', gold, loc=(x, -R, 0), scale=(D + 0.03, D + 0.03, 0.05), rot=(0, H, 0), seg=20, cut=cut)
    L.add('cube', gold, loc=(0, -R, 0.03), scale=(W + 0.04, D + 0.04, 0.06), bevel=0.02, bevel_seg=1)
    L.add('cube', gold, loc=(0, -D - 0.02, 0.0), scale=(0.16, 0.05, 0.14), bevel=0.02, bevel_seg=1)
    L.build(parent=root, loc=(0, D / 2, Hh))
    return root


def build_coin(name='Coin'):
    gold = mat('CoinGold', '#ffcf3a', rough=0.3, metal=0.5)
    star = mat('CoinStar', '#fff3a6', rough=0.3, metal=0.3, emit='#ffe680', emit_strength=0.2)
    root = empty(name)
    b = Builder(name + 'Mesh')
    b.add('cyl', gold, scale=(1.0, 1.0, 0.14), rot=(H, 0, 0), seg=28, bevel=0.035, bevel_seg=2)
    for s in (-1, 1):
        b.add('torus', gold, loc=(0, s * 0.07, 0), rot=(H, 0, 0), R=0.4, r=0.03, seg=28, rings=5)
        b.add('star', star, loc=(0, s * 0.07, 0), scale=(0.52, 0.52, 0.06), rot=(H, 0, 0 if s < 0 else PI),
              smooth=False, star_inner=0.45)
    b.build(parent=root)
    return root
