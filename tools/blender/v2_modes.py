# -*- coding: utf-8 -*-
"""게임 상자 표지 8종 (800x500, 그라데이션 하늘 + 둥근 섬 무대, 모서리 둥근 PNG).
스티커 친구들·아이콘·물고기·보스와 예전 GLB 모델(assets.py)을 다시 씀."""
import bpy, math, os, random, importlib
from mathutils import Vector, Matrix, Euler
import lib, assets
from lib import Builder, empty, set_color, rename_materials, reset
from v2lib import (toon, emissive, mark, poly, sweep, star_mesh, studio2, sky_world, persp_cam, outline_persp,
                   render_png, finalize_png, out_dir, font, INK, BLUE, LEMON, CORAL, MINT, GRAPE, PI, D2R)
import v2_chars, v2_icons, v2_fish, v2_boss
from v2_icons import T, R, S

H = PI / 2
W, HGT = 800, 500

MODES = {
    'race': '퀴즈 레이스',
    'live': '골든벨',
    'chest': '보물 상자',
    'territory': '땅따먹기',
    'shop': '퀴즈 부자',
    'fishing': '퀴즈 낚시',
    'raid': '보스 레이드',
    'royale': '뿅망치 대결',
}


# ---------------------------------------------------------------- helpers
def stage(top, bottom, ambient='#e6eeff'):
    studio2(W, HGT, samples=48, transparent=False, key=2.6, rim=3.0, fill=0.8)
    sky_world(top, bottom, ambient, 0.75)


def mark_tree(root, mul=1.0):
    for o in [root] + list(root.children_recursive):
        if o.type == 'MESH':
            mark(o, mul)
    return root


def place(root, loc=(0, 0, 0), rz=0.0, s=1.0, rx=0.0, ry=0.0):
    root.location = loc
    root.rotation_euler = (rx, ry, rz)
    root.scale = (s, s, s) if isinstance(s, (int, float)) else s
    return root


def char(cid, loc, rz=0.0, s=1.0, arms=None):
    v2_chars.POSE['arms'] = arms
    try:
        r = v2_chars.build_char(cid)
    finally:
        v2_chars.POSE['arms'] = None
    return place(r, loc, rz, s)


def hand_world(root, side='R', kind='up'):
    loc = {'up': Vector((0.72, -0.1, 1.12)), 'wave': Vector((0.7, -0.12, 0.92)),
           'hold': Vector((0.52, -0.38, 0.7))}[kind].copy()
    if side == 'L':
        loc.x = -loc.x
    bpy.context.view_layer.update()
    return root.matrix_world @ loc


def island(color='#93DD78', r=7.0, side='#7CC765', h=0.8):
    b = Builder('Island')
    b.add('cyl', toon('island_side', side, rough=0.8), loc=(0, 0, -h / 2 - 0.02), scale=(2 * r, 2 * r, h), seg=72,
          bevel=0.3, bevel_seg=3)
    b.add('cyl', toon('island_top', color, rough=0.8), loc=(0, 0, -0.06), scale=(2 * r - 0.25, 2 * r - 0.25, 0.14), seg=72,
          bevel=0.06, bevel_seg=2)
    return mark(b.build())


def clouds(spots):
    for x, y, z, s in spots:
        c = assets.build_cloud()
        place(c, (x, y, z), 0, s)
        mark_tree(c, 0.7)


def sparkles(spots, m=None):
    b = Builder('Sparks')
    m = m or emissive('Sparkle', '#FFE45C', 1.6)
    for x, y, z, s in spots:
        star_mesh(b, m, (x, y, z), s, rot=(H, 0, 0.2), depth=0.3, inner=0.42)
    return mark(b.build(), 0.8)


def sunburst(center, r=9.0, n=14, color='#FFF3B0', strength=1.0, name='Burst'):
    b = Builder(name)
    m = emissive(name + '_m', color, strength)
    for k in range(n):
        a0 = 2 * PI * k / n
        a1 = a0 + PI / n
        pts = [(0, 0), (r * math.cos(a0), r * math.sin(a0)), (r * math.cos(a1), r * math.sin(a1))]
        poly(b, m, pts, depth=0.02, mtx=T(*center), bevel=0.0)
    o = b.build()
    o.visible_shadow = False
    return o


def lathe(b, m, prof, seg=40, mtx=None):
    import bmesh
    bm = b.bm
    mi = b._mi(m)
    rings = []
    for r, z in prof:
        if r < 1e-4:
            rings.append([bm.verts.new((0, 0, z))])
        else:
            rings.append([bm.verts.new((r * math.cos(2 * PI * k / seg), r * math.sin(2 * PI * k / seg), z))
                          for k in range(seg)])
    faces = []
    for a, c in zip(rings[:-1], rings[1:]):
        if len(a) == 1 and len(c) == 1:
            continue
        for k in range(seg):
            if len(a) == 1:
                faces.append(bm.faces.new((a[0], c[k], c[(k + 1) % seg])))
            elif len(c) == 1:
                faces.append(bm.faces.new((a[k], a[(k + 1) % seg], c[0])))
            else:
                faces.append(bm.faces.new((a[k], a[(k + 1) % seg], c[(k + 1) % seg], c[k])))
    for f in faces:
        f.material_index = mi
        f.smooth = True
    bmesh.ops.recalc_face_normals(bm, faces=faces)
    if mtx is not None:
        vs = list({v for f in faces for v in f.verts})
        bmesh.ops.transform(bm, matrix=mtx, verts=vs)


def coins_builder(name, spots):
    """spots: [(mtx, r)] -> 동전 여러 개 (B 테두리 / D 무늬)."""
    B, D = Builder(name + '_b'), Builder(name + '_d')
    for mtx, r in spots:
        v2_icons.add_coin(B, D, mtx, r=r, th=r * 0.32)
    mark(B.build()); D.build()


def water_mat():
    m = toon('water', '#53BDFF', rough=0.08, emit='#7FD0FF', es=0.25)
    return m


def tree(loc, s=1.0, leaf='#7FDC63', pine=False):
    t = assets.build_tree_pine() if pine else assets.build_tree_round()
    rename_materials(t, '_%d' % int(abs(loc[0] * 100 + loc[1] * 7)))
    if not pine:
        for c in t.children:
            for sl in c.material_slots:
                if sl.material.name.startswith('Leaf'):
                    set_color(sl.material, leaf)
    place(t, loc, random.uniform(0, 6), s)
    mark_tree(t, 0.8)
    return t


def kart(paint, loc, rz=0.0, s=1.0, suffix='_k'):
    k = assets.build_kart()
    newm = rename_materials(k, suffix)
    set_color(newm['Paint'], paint)
    place(k, loc, rz, s)
    mark_tree(k)
    return k


def finish_scene(mid, cam, px=3.6):
    outline_persp(cam, px, W)
    p = os.path.join(out_dir('modes'), mid + '.png')
    render_png(p)
    print('MODE', mid, finalize_png(p, corner=30))


# ---------------------------------------------------------------- scenes
def sc_race():
    stage('#5DB8FF', '#DDF3FF')
    random.seed(3)
    island('#93DD78', r=8.5)
    road = toon('road', '#C4BEE6', rough=0.8)
    b = Builder('Road')
    b.add('cube', road, loc=(0, 1.0, 0.02), scale=(3.6, 17, 0.06))
    for y in range(-7, 10, 2):
        b.add('cube', toon('roadline', '#FFFFFF', rough=0.6), loc=(0, y, 0.06), scale=(0.16, 0.9, 0.04))
    for s in (-1, 1):
        for k, y in enumerate(range(-8, 10)):
            b.add('cube', toon('curb_r', CORAL, rough=0.6) if k % 2 else toon('curb_w', '#FFFFFF', rough=0.6),
                  loc=(s * 1.95, y + 0.5, 0.07), scale=(0.3, 1.0, 0.1))
    mark(b.build(), 0.6)
    g = assets.build_gate()
    rename_materials(g, '_g')
    place(g, (0, 2.6, 0), 0, 0.29)
    mark_tree(g)
    k1 = kart('#FF6F61', (-0.75, -0.9, 0.05), 0.12, 1.0, '_k1')
    k2 = kart(BLUE, (0.85, 1.0, 0.05), -0.08, 1.0, '_k2')
    char('fox', (-0.75 + 0.03, -0.9 + 0.3, 0.47), 0.12, 0.42)
    char('cat', (0.85 - 0.02, 1.0 + 0.3, 0.47), -0.08, 0.42, arms=('hold', 'hold'))
    for loc, rot in (((2.7, -1.1, 1.3), (0.3, 0.2, 0.6)), ((-2.1, 1.6, 1.6), (0.2, -0.3, 0.3))):
        ib = assets.build_itembox()
        place(ib, loc, rot[2], 0.55, rot[0], rot[1])
        mark_tree(ib)
    for x, y, sc, leaf in ((-4.6, 1.5, 0.6, '#7FDC63'), (-5.2, -1.6, 0.5, '#FF9FC4'), (4.4, 2.6, 0.62, '#9BE35C'),
                           (5.2, -0.6, 0.5, '#FFC46B'), (-3.6, 5.0, 0.55, '#66D6A0'), (3.4, 6.2, 0.5, '#7FDC63')):
        tree((x, y, 0), sc, leaf)
    clouds([(-7, 16, 5.5, 0.9), (6, 18, 6.5, 1.0), (13, 14, 3.5, 0.7), (-14, 13, 3.2, 0.7)])
    cam = persp_cam((3.7, -6.3, 2.5), (0.0, 0.7, 1.05), lens=38)
    finish_scene('race', cam)


def bell(B, D, mtx):
    gold = toon('bell_gold', '#FFC93C', rough=0.22, metal=0.45, emit='#FFB800', es=0.18)
    dark = toon('bell_in', '#C98A1A', rough=0.4)
    prof = [(0.0, 1.72), (0.22, 1.7), (0.42, 1.6), (0.55, 1.42), (0.6, 1.18), (0.64, 0.9), (0.72, 0.6), (0.86, 0.32),
            (1.02, 0.14), (1.08, 0.04), (1.04, -0.04), (0.92, -0.04), (0.0, 0.02)]
    lathe(B, gold, prof, seg=48, mtx=mtx)
    D.add('cyl', dark, mtx=mtx @ T(0, 0, 0.0), scale=(1.84, 1.84, 0.05), seg=40)
    B.add('sphere', gold, mtx=mtx @ T(0, 0, -0.18), scale=0.36, seg=20, rings=10)
    B.add('torus', gold, mtx=mtx @ T(0, 0, 1.86) @ R(H, 0, 0), R=0.17, r=0.06, seg=24, rings=8)
    B.add('torus', toon('bell_band', '#FFE27A', rough=0.3, metal=0.3), mtx=mtx @ T(0, 0, 0.5), R=0.76, r=0.05, seg=48, rings=8)
    D.add('star', toon('bell_star', '#FFF4B8', rough=0.3, emit='#FFE680', es=0.4), mtx=mtx @ T(0, -0.66, 0.95) @ R(H + 0.12, 0, 0),
          scale=(0.5, 0.5, 0.06), smooth=False, star_inner=0.47)


def answer_card(cid_root, symbol, color, side='R'):
    p = hand_world(cid_root, side, 'up')
    b = Builder('Card_' + symbol)
    d = Builder('CardS_' + symbol)
    m = T(p.x, p.y - 0.05, p.z + 0.42) @ R(0, 0, cid_root.rotation_euler.z) @ R(0, 0.12 if side == 'R' else -0.12, 0)
    sc = cid_root.scale.x
    b.add('cube', toon('card', '#FFFFFF', rough=0.5), mtx=m, scale=(1.05 * sc, 0.08 * sc, 0.82 * sc), bevel=0.05 * sc, bevel_seg=2)
    d.add('text', toon('card_' + symbol, color, rough=0.4), mtx=m @ T(0, -0.05 * sc, 0) @ R(H, 0, 0),
          scale=(0.8 * sc, 0.8 * sc, 1), text=symbol, depth=0.05 * sc, font=font())
    mark(b.build()); d.build()


def sc_live():
    stage('#6D57F0', '#E7DEFF', ambient='#ece6ff')
    sunburst((0, 3.4, 2.6), r=12, color='#9C86FF', strength=1.0)
    st = Builder('Stage')
    st.add('cube', toon('stage_top', '#FFE3A3', rough=0.6), loc=(0, 0.5, -0.25), scale=(11, 6, 0.5), bevel=0.15, bevel_seg=2)
    st.add('cube', toon('stage_edge', CORAL, rough=0.5), loc=(0, -2.5, -0.33), scale=(11.1, 0.3, 0.42), bevel=0.1, bevel_seg=2)
    for x in range(-5, 6):
        st.add('sphere', toon('bulb', '#FFF6C8', rough=0.3, emit='#FFE680', es=1.2), loc=(x, -2.68, -0.3), scale=0.16,
               seg=10, rings=5)
    for s in (-1, 1):  # 커튼
        for k in range(5):
            st.add('cyl', toon('curtain', '#FF6F7F', rough=0.7), loc=(s * (5.6 - k * 0.42), 2.6, 2.5), scale=(0.62, 0.62, 6),
                   seg=16)
    mark(st.build(), 0.6)
    B, D = Builder('Bell_b'), Builder('Bell_d')
    bell(B, D, T(0, 1.6, 1.15) @ R(0, 0.12, 0) @ S(1.25))
    st2 = Builder('Ped')
    st2.add('cyl', toon('ped', '#FFFFFF', rough=0.5), loc=(0, 1.6, 0.5), scale=(1.5, 1.5, 1.0), seg=32, bevel=0.06, bevel_seg=2)
    st2.add('cyl', toon('ped_band', GRAPE, rough=0.5), loc=(0, 1.6, 0.85), scale=(1.54, 1.54, 0.16), seg=32)
    mark(st2.build())
    mark(B.build()); D.build()
    sparkles([(-1.6, 1.0, 3.3, 0.36), (1.7, 1.0, 3.0, 0.3), (1.2, 1.0, 3.9, 0.2), (-1.1, 1.0, 4.0, 0.18)])
    cs = []
    for cid, x, rz, sym, col in (('bunny', -2.6, 0.25, 'O', MINT), ('bear', 0.0, 0.0, 'X', CORAL),
                                 ('penguin', 2.6, -0.25, 'O', MINT)):
        r = char(cid, (x, -1.0 if x else -1.4, 0), rz, 0.95, arms=('down', 'up'))
        answer_card(r, sym, col)
    cam = persp_cam((0.0, -9.6, 2.9), (0.0, 0.6, 1.75), lens=36)
    finish_scene('live', cam)


def sc_chest():
    stage('#3FCFA6', '#E2FBF2', ambient='#e8fff6')
    sunburst((0, 4.5, 2.0), r=13, color='#7EE6C6', strength=1.0)
    island('#9BE07E', r=8)
    c = assets.build_chest()
    rename_materials(c, '_c')
    place(c, (0.2, 0.6, 0), -0.12, 2.0)
    bpy.data.objects['Lid'].rotation_euler.x = -1.95
    mark_tree(c)
    pile = toon('coinpile', '#FFCF3A', rough=0.35, metal=0.2, emit='#FFD84D', es=0.6)
    b = Builder('Pile')
    b.add('sphere', pile, loc=(0.2, 0.6, 0.94), scale=(1.8, 1.15, 0.62), seg=24, rings=12)
    mark(b.build())
    rnd = random.Random(5)
    spots = []
    for i in range(16):
        a = rnd.uniform(0, 2 * PI); rr = rnd.uniform(0, 0.62)
        spots.append((T(0.2 + math.cos(a) * rr * 1.2, 0.6 + math.sin(a) * rr * 0.6, 1.05 + 0.18 * (1 - rr / 0.62)) @
                      R(rnd.uniform(-0.6, 0.6), rnd.uniform(-0.6, 0.6), 0), 0.2))
    for (x, y, z, rx, ry) in ((-1.0, -0.9, 0.06, 0, 0), (-0.4, -1.5, 0.06, 0, 0.0), (0.9, -1.2, 0.06, 0, 0),
                              (1.6, -0.3, 0.06, 0, 0), (-1.6, -0.2, 0.06, 0, 0), (0.3, -2.0, 0.25, 1.3, 0.4),
                              (-1.1, -1.8, 0.25, 1.4, -0.5), (1.4, -1.9, 0.06, 0, 0)):
        spots.append((T(x, y, z) @ R(rx, ry, rnd.uniform(0, 3)), 0.24))
    for (x, y, z) in ((-0.6, -0.2, 2.2), (0.9, -0.1, 2.5), (0.2, -0.3, 2.9), (1.4, 0.1, 1.8)):
        spots.append((T(x, y, z) @ R(H, rnd.uniform(-0.5, 0.5), rnd.uniform(-0.6, 0.6)), 0.24))
    coins_builder('Coins', spots)
    gb = Builder('Gems')
    for (x, y, z, col) in ((-0.3, 0.3, 1.35, CORAL), (0.7, 0.5, 1.3, BLUE), (-1.4, -1.2, 0.18, GRAPE), (1.9, -1.0, 0.18, MINT)):
        gb.add('sphere', toon('gem_' + col, col, rough=0.1, emit=col, es=0.3), loc=(x, y, z), scale=(0.34, 0.34, 0.42),
               rot=(0.3, 0.2, 0.5), seg=6, rings=3, smooth=False)
    mark(gb.build())
    lib.add_light('POINT', (0.2, 0.2, 1.7), 60, '#FFD75E', size=0.5, name='Glow')
    sparkles([(-0.9, 0.4, 2.6, 0.3), (1.5, 0.4, 2.9, 0.26), (0.5, 0.4, 3.4, 0.2), (-1.8, 0.4, 1.8, 0.18)])
    char('cat', (-2.6, -0.6, 0), 0.45, 0.95, arms=('up', 'up'))
    char('chick', (2.8, -0.2, 0), -0.4, 0.85)
    for x, y, sc, leaf in ((-5.2, 2.2, 0.55, '#7FDC63'), (5.0, 3.0, 0.6, '#FF9FC4'), (-4.0, 5.2, 0.5, '#66D6A0')):
        tree((x, y, 0), sc, leaf)
    cam = persp_cam((1.6, -8.4, 3.4), (0.1, 0.0, 1.3), lens=38)
    finish_scene('chest', cam)


def sc_territory():
    stage('#FFBE3B', '#FFF4CC', ambient='#fff6e0')
    teams = {0: '#FF6F91', 1: '#3D8BFF', 2: '#FFC83D', 3: '#2CCB7F', 9: '#EEF2FA'}
    r = 0.95
    dx, dy = 1.5 * r, math.sqrt(3) * r
    tiles = {}
    owner = {}
    rnd = random.Random(7)
    for q in range(-3, 4):
        for rr in range(-3, 4):
            if abs(q + rr) > 3:
                continue
            x = dx * q
            y = dy * (rr + q / 2)
            if x < -1.2 and y < 1.5:
                t = 0
            elif x > 1.2 and y < 0.8:
                t = 1
            elif y > 2.4:
                t = 3
            else:
                t = rnd.choice([9, 9, 2, 0, 1])
            owner[(q, rr)] = t
            tiles[(q, rr)] = (x, y)
    b = Builder('Hex')
    for k, (x, y) in tiles.items():
        t = owner[k]
        h = 0.5 + (0.15 if t != 9 else 0.0) + rnd.uniform(0, 0.12)
        b.add('cyl', toon('hex_side', '#D6CFC0', rough=0.8), loc=(x, y, h / 2 - 0.2), scale=(r * 1.94, r * 1.94, h), rot=(0, 0, PI / 6),
              seg=6, bevel=0.06, bevel_seg=2, smooth=False)
        b.add('cyl', toon('hex_%d' % t, teams[t], rough=0.6), loc=(x, y, h - 0.17), scale=(r * 1.8, r * 1.8, 0.08),
              rot=(0, 0, PI / 6), seg=6, bevel=0.03, bevel_seg=1, smooth=False)
        tiles[k] = (x, y, h - 0.13)
    mark(b.build(), 0.7)
    fb = Builder('Flags')
    for key, t in (((-2, 1), 0), ((2, -1), 1), ((0, 3), 3), ((1, 1), 2)):
        if key not in tiles:
            continue
        x, y, z = tiles[key]
        fb.add('cyl', toon('pole', '#FFFFFF', rough=0.5), loc=(x, y, z + 0.9), scale=(0.1, 0.1, 1.8), seg=10)
        fb.add('sphere', toon('pole_ball', LEMON, rough=0.4), loc=(x, y, z + 1.85), scale=0.2, seg=12, rings=6)
        poly(fb, toon('flag_%d' % t, teams[t], rough=0.5), [(0, 0), (0.9, -0.3), (0, -0.62)], depth=0.06,
             mtx=T(x + 0.05, y, z + 1.75), bevel=0.02)
    mark(fb.build())
    for cid, key, rz, arms in (('tiger', (-2, 0), 0.4, None), ('panda', (2, -2), -0.4, ('up', 'up')),
                               ('frog', (0, 2), 0.0, None)):
        x, y, z = tiles[key]
        char(cid, (x, y, z), rz, 1.05, arms=arms)
    clouds([(-9, 14, 4.0, 0.8), (8, 15, 5.0, 0.9)])
    cam = persp_cam((2.6, -8.2, 6.2), (0.0, 0.5, 0.5), lens=38)
    finish_scene('territory', cam)


def sc_shop():
    stage('#FF8B73', '#FFE6D9', ambient='#fff0ea')
    sunburst((0, 4.0, 2.2), r=13, color='#FFB09E', strength=1.0)
    fl = Builder('Floor')
    fl.add('cyl', toon('floor', '#FFF1DC', rough=0.7), loc=(0, 0, -0.25), scale=(14, 9, 0.5), seg=64, bevel=0.15, bevel_seg=2)
    mark(fl.build(), 0.6)
    wood = toon('counter', '#E9A35E', rough=0.6)
    top = toon('counter_top', LEMON, rough=0.4)
    b = Builder('Shop')
    b.add('cube', wood, loc=(0, 0.2, 0.62), scale=(4.6, 1.3, 1.24), bevel=0.1, bevel_seg=2)
    b.add('cube', top, loc=(0, 0.15, 1.3), scale=(4.9, 1.55, 0.16), bevel=0.06, bevel_seg=2)
    b.add('cube', toon('counter_panel', CORAL, rough=0.5), loc=(0, -0.47, 0.62), scale=(4.0, 0.06, 0.86), bevel=0.04, bevel_seg=1)
    for s in (-1, 1):
        b.add('cyl', toon('post', '#FFFFFF', rough=0.5), loc=(s * 2.2, 0.75, 1.9), scale=(0.16, 0.16, 3.8), seg=12)
    for k in range(9):  # 줄무늬 차양
        x = -2.4 + k * 0.6
        b.add('cube', toon('awn_c', CORAL, rough=0.5) if k % 2 == 0 else toon('awn_w', '#FFFFFF', rough=0.5),
              loc=(x + 0.3, 0.3, 3.75), scale=(0.6, 1.6, 0.14), rot=(-0.35, 0, 0))
        b.add('sphere', toon('awn_c', CORAL, rough=0.5) if k % 2 == 0 else toon('awn_w', '#FFFFFF', rough=0.5),
              loc=(x + 0.3, -0.45, 3.45), scale=(0.6, 0.2, 0.36), seg=12, rings=6)
    b.add('cube', toon('sign', '#FFFFFF', rough=0.5), loc=(0, 0.7, 4.55), scale=(2.4, 0.16, 0.9), bevel=0.12, bevel_seg=2)
    mark(b.build(), 0.7)
    sd = Builder('SignD')
    v2_icons.add_coin(sd, sd, T(-0.7, 0.58, 4.55) @ R(H, 0, 0), r=0.3, th=0.08)
    v2_icons.add_coin(sd, sd, T(0.7, 0.58, 4.55) @ R(H, 0, 0), r=0.3, th=0.08)
    v2_icons.add_coin(sd, sd, T(0, 0.58, 4.55) @ R(H, 0, 0), r=0.34, th=0.08)
    sd.build()
    char('hamster', (0, 0.95, 0.95), 0.0, 1.0, arms=('down', 'wave'))
    # 계산대 위 가젯
    for fn, loc, s, rz in ((v2_icons.ic_coins_stack, (-1.65, 0.05, 1.38), 0.75, 0.3),
                           (v2_icons.ic_per_question, (1.55, 0.0, 1.38), 0.72, -0.2),
                           (v2_icons.ic_multiplier, (-3.2, -0.6, 0.0), 0.95, 0.35),
                           (v2_icons.ic_magnet, (3.1, -0.8, 0.0), 0.8, -0.4),
                           (v2_icons.ic_rocket, (2.9, 0.6, 2.4), 0.6, -0.3)):
        r = fn()
        place(r, loc, rz, s)
    spots = [(T(x, y, z) @ R(H, a, b_), 0.24) for (x, y, z, a, b_) in ((-0.9, -0.6, 2.6, 0.3, 0.4), (1.0, -0.6, 2.9, -0.4, -0.3),
                                                                       (-2.6, -0.8, 2.2, 0.5, 0.1), (2.3, -0.8, 3.0, -0.2, 0.6))]
    coins_builder('Flying', spots)
    sparkles([(-1.9, -0.6, 3.1, 0.24), (1.9, -0.6, 2.4, 0.2)])
    cam = persp_cam((1.4, -9.2, 2.8), (0.0, 0.2, 2.0), lens=36)
    finish_scene('shop', cam)


def sc_fishing():
    stage('#58BFFF', '#E0F5FF')
    island('#93DD78', r=8.2)
    b = Builder('Pond')
    b.add('cyl', toon('sand', '#FFE4A3', rough=0.8), loc=(0, 0.3, 0.0), scale=(10.4, 7.6, 0.12), seg=64)
    b.add('cyl', water_mat(), loc=(0, 0.3, 0.04), scale=(9.4, 6.6, 0.1), seg=64)
    mark(b.build(), 0.5)
    rip = Builder('Ripple')
    rm = emissive('ripple', '#D8F2FF', 1.0)
    for (x, y, rr) in ((1.9, -0.2, 0.5), (1.9, -0.2, 0.85), (0.15, -1.2, 0.3), (0.15, -1.2, 0.55), (-2.6, 0.8, 0.5)):
        rip.add('torus', rm, loc=(x, y, 0.1), scale=(1, 0.7, 0.4), R=rr, r=0.035, seg=32, rings=4)
    rip.build()
    # 배
    bt = Builder('Boat')
    hull = toon('hull', '#F09A55', rough=0.6)
    bt.add('sphere', hull, loc=(0, 0, 0.42), scale=(2.6, 1.3, 1.0), seg=40, rings=20, cut=((0, 0, 0.42), (0, 0, -1), True))
    bt.add('torus', toon('rim', '#FFFFFF', rough=0.5), loc=(0, 0, 0.42), scale=(1, 0.5, 1), R=1.27, r=0.07, seg=48, rings=8)
    bt.add('cube', toon('seat', '#C97B3F', rough=0.6), loc=(0.3, 0, 0.36), scale=(0.3, 1.1, 0.08))
    boat = mark(bt.build())
    place(boat, (-1.3, 0.4, 0.05), 0.25)
    fr = char('frog', (-1.25, 0.35, 0.2), 0.45, 0.62, arms=('down', 'hold'))
    hw = hand_world(fr, 'R', 'hold')
    tip = Vector((1.5, -0.5, 2.6))
    rod = Builder('Rod')
    sweep(rod, toon('rodm', '#7A4E2D', rough=0.6), [hw + Vector((-0.15, 0.1, -0.15)), hw, (hw + tip) / 2 + Vector((0, 0, 0.25)), tip],
          [0.045, 0.04, 0.03, 0.02], seg=8, sub=4)
    mark(rod.build())
    ln = Builder('Line')
    bob = Vector((0.15, -1.2, 0.14))
    ln.tube(emissive('line', '#FFFFFF', 1.0), tip, bob + Vector((0, 0, 0.12)), 0.008, seg=6)
    ln.build()
    bb = Builder('Bobber')
    bb.add('sphere', toon('bob_r', CORAL, rough=0.4), loc=bob + Vector((0, 0, 0.08)), scale=0.24, seg=16, rings=8,
           cut=(tuple(bob + Vector((0, 0, 0.08))), (0, 0, 1), True))
    bb.add('sphere', toon('bob_w', '#FFFFFF', rough=0.4), loc=bob + Vector((0, 0, 0.08)), scale=0.24, seg=16, rings=8,
           cut=(tuple(bob + Vector((0, 0, 0.08))), (0, 0, -1), True))
    mark(bb.build())
    f = v2_fish.build_fish('goldfish')
    place(f, (2.2, -0.3, 1.45), -0.35, 0.95, ry=0.55)
    f2 = v2_fish.build_fish('golden_koi')
    place(f2, (-2.9, -1.7, 1.0), 0.4, 0.72, ry=-0.4)
    sp = Builder('Splash')
    wm = toon('water_drop', '#BFE6FF', rough=0.15, emit='#BFE6FF', es=0.25)
    for (x, y, z, s) in ((1.5, -0.3, 0.5, 0.16), (2.4, -0.3, 0.45, 0.13), (1.8, -0.4, 0.8, 0.12), (2.7, -0.2, 0.75, 0.1),
                         (1.3, -0.2, 0.25, 0.12), (-2.6, -1.6, 0.35, 0.12), (-3.2, -1.5, 0.3, 0.1)):
        sp.add('sphere', wm, loc=(x, y, z), scale=(s, s, s * 1.2), seg=12, rings=6)
    mark(sp.build(), 0.7)
    lp = Builder('Lily')
    for (x, y, s) in ((3.4, 1.8, 0.9), (-3.2, 2.0, 0.7), (2.6, 2.9, 0.6), (-0.2, 2.8, 0.55)):
        lp.add('cyl', toon('lily', '#4FC66B', rough=0.6), loc=(x, y, 0.12), scale=(s, s * 0.8, 0.06), seg=24)
    lp.add('sphere', toon('lotus', '#FF9FC4', rough=0.5), loc=(3.5, 1.85, 0.25), scale=(0.35, 0.35, 0.25), seg=12, rings=6)
    for (x, y) in ((-4.6, 2.6), (-4.9, 2.2), (4.7, 2.4), (5.0, 2.0), (4.4, 2.9)):
        lp.add('cyl', toon('reed', '#5DBB5A', rough=0.6), loc=(x, y, 0.8), scale=(0.07, 0.07, 1.6), seg=8)
        lp.add('sphere', toon('cattail', '#9A6A43', rough=0.7), loc=(x, y, 1.55), scale=(0.16, 0.16, 0.45), seg=10, rings=6)
    mark(lp.build(), 0.6)
    for x, y, sc, leaf in ((-6.0, 3.6, 0.6, '#7FDC63'), (6.2, 3.8, 0.6, '#9BE35C')):
        tree((x, y, 0), sc, leaf)
    clouds([(-7, 16, 5.5, 0.9), (7, 17, 6.5, 1.0)])
    cam = persp_cam((2.2, -9.0, 4.4), (0.0, 0.2, 0.8), lens=38)
    finish_scene('fishing', cam)


def projectile(b, frm, to, s=0.28, m=None):
    m = m or emissive('Sparkle', '#FFE45C', 1.6)
    frm, to = Vector(frm), Vector(to)
    d = (to - frm)
    star_mesh(b, m, to, s, rot=(H, 0, 0.3), depth=0.35, inner=0.42)
    tail = emissive('trail', '#FFF3B0', 1.2)
    for k, t in enumerate((0.35, 0.6, 0.8)):
        p = to - d * (t * 0.5)
        b.add('sphere', tail, loc=p, scale=s * (0.45 - 0.12 * k), seg=10, rings=5)


def sc_raid():
    stage('#7A5CFF', '#E9E1FF', ambient='#efe9ff')
    island('#C9BDFF', r=8.0, side='#A99AF0')
    bo = v2_boss.build_boss('slime_king', hurt=True)
    place(bo, (0.2, 2.2, 0.0), 0.0, (1.5 * 1.08, 1.5 * 1.08, 1.5 * 0.88))
    fx = Builder('Shots')
    projectile(fx, (-2.6, -1.0, 1.0), (-0.9, 1.2, 1.7), 0.32)
    projectile(fx, (2.8, -0.8, 1.0), (1.3, 1.3, 2.2), 0.3)
    projectile(fx, (0.4, -1.8, 1.0), (0.3, 0.9, 1.0), 0.26)
    burst = emissive('burst', '#FFFFFF', 1.4)
    for (x, y, z, s) in ((-0.85, 1.0, 1.75, 0.6), (1.25, 1.1, 2.25, 0.52)):
        fx.add('star', burst, loc=(x, y - 0.2, z), rot=(H, 0, 0.4), scale=(s, s, 0.05), smooth=False, points=8, star_inner=0.45)
    mark(fx.build(), 0.8)
    char('fox', (-2.8, -1.2, 0), -0.75, 0.85, arms=('down', 'up'))
    char('dino', (2.9, -1.0, 0), 0.8, 0.85, arms=('up', 'down'))
    char('bunny', (0.5, -2.2, 0), 0.15, 0.75, arms=('up', 'up'))
    for (x, y, s) in ((-5.0, 2.5, 1.0), (5.2, 2.8, 0.9), (-4.4, -2.5, 0.6)):
        rk = assets.build_rock()
        place(rk, (x, y, 0), random.uniform(0, 3), s)
        mark_tree(rk)
    cam = persp_cam((0.6, -9.6, 3.6), (0.0, 0.9, 1.6), lens=36)
    finish_scene('raid', cam)


def sc_royale():
    stage('#FF7A59', '#FFE3C8', ambient='#fff0e6')
    sunburst((0, 4.5, 2.4), r=13, color='#FFA488', strength=1.0)
    ar = Builder('Arena')
    ar.add('cyl', toon('arena_side', '#3D8BFF', rough=0.6), loc=(0, 0, -0.3), scale=(9.6, 7.2, 0.6), seg=64, bevel=0.15, bevel_seg=2)
    ar.add('cyl', toon('arena_top', '#FFF3D6', rough=0.7), loc=(0, 0, 0.01), scale=(9.0, 6.6, 0.06), seg=64)
    ar.add('torus', toon('arena_ring', LEMON, rough=0.5), loc=(0, 0, 0.06), scale=(1, 6.6 / 9.0, 1), R=3.2, r=0.08, seg=64, rings=6)
    for k in range(8):
        a = 2 * PI * k / 8 + PI / 8
        x, y = 4.3 * math.cos(a), 3.1 * math.sin(a)
        ar.add('cyl', toon('rope_post', '#FFFFFF', rough=0.5), loc=(x, y, 0.55), scale=(0.2, 0.2, 1.1), seg=12)
        ar.add('sphere', toon('rope_ball', CORAL, rough=0.4), loc=(x, y, 1.15), scale=0.3, seg=12, rings=6)
    ar.add('torus', toon('rope', CORAL, rough=0.5), loc=(0, 0, 0.95), scale=(1, 3.1 / 4.3, 1), R=4.3, r=0.05, seg=64, rings=6)
    mark(ar.build(), 0.6)
    c1 = char('cat', (-1.45, 0.0, 0.05), 0.95, 1.0, arms=('down', 'up'))
    c2 = char('dog', (1.45, 0.0, 0.05), -0.95, 1.0, arms=('up', 'down'))
    hb, hd = Builder('Ham_b'), Builder('Ham_d')
    p1 = hand_world(c1, 'R', 'up')
    v2_icons.hammer(hb, hd, T(*p1) @ R(0, 0.55, 0) @ T(0, 0, -0.15), 0.9)
    p2 = hand_world(c2, 'L', 'up')
    v2_icons.hammer(hb, hd, T(*p2) @ R(0, -0.55, 0) @ T(0, 0, -0.15), 0.9)
    mark(hb.build()); hd.build()
    vs = Builder('VS')
    vs.add('text', toon('vs', LEMON, rough=0.35, emit='#FFD43B', es=0.3), loc=(0, -0.4, 2.55), rot=(H, 0, 0),
           scale=(0.95, 0.95, 1), text='VS', depth=0.22, font=font())
    mark(vs.build())
    sparkles([(-0.6, -0.4, 3.35, 0.24), (0.7, -0.4, 1.8, 0.2), (0.0, -0.4, 1.5, 0.16)])
    cam = persp_cam((0.0, -7.4, 2.8), (0.0, 0.3, 1.45), lens=38)
    finish_scene('royale', cam)


SCENES = {k: globals()['sc_' + k] for k in MODES}


def render_all(only=()):
    for mid in MODES:
        if only and mid not in only:
            continue
        reset()
        random.seed(1)
        SCENES[mid]()
