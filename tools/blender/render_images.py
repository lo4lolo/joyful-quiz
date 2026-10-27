# -*- coding: utf-8 -*-
"""PNG/JPG 렌더 (Eevee). 실행:
  & "<blender.exe>" -b --python-exit-code 1 --python tools\\blender\\render_images.py            # 전부
  & "<blender.exe>" -b --python-exit-code 1 --python tools\\blender\\render_images.py -- chest coin hero lobby
  ... -- preview <폴더>   (모델 확인용 미리보기 이미지를 <폴더>에 저장)
"""
import sys, os, math, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import importlib, lib, assets
importlib.reload(lib); importlib.reload(assets)
import bpy, bmesh
from mathutils import Vector, Matrix, Euler
from lib import (reset, setup_render, add_sun, add_light, add_camera, render_to, set_color, mat,
                 Builder, empty, link, rename_materials, hexcol, IMG)

PI = math.pi
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []


def studio(w, h, samples=64, sun_strength=2.4, transparent=True):
    setup_render(w, h, transparent=transparent, samples=samples, world='#d8ecff', world_strength=0.55)
    add_sun(rot=(math.radians(50), 0, math.radians(-35)), strength=sun_strength, angle_deg=20)
    add_light('AREA', (-3, -2, 3), 60, '#ffe9f2', size=4, name='Fill')


def bbox_world():
    lo = Vector((1e9,) * 3); hi = Vector((-1e9,) * 3)
    for o in bpy.context.scene.objects:
        if o.type == 'MESH':
            for c in o.bound_box:
                p = o.matrix_world @ Vector(c)
                lo = Vector(map(min, lo, p)); hi = Vector(map(max, hi, p))
    return lo, hi


# ---------------------------------------------------------------- preview (확인용)
def preview(folder):
    jobs = [('kart', assets.build_kart), ('driver', assets.build_driver), ('itembox', assets.build_itembox),
            ('gate', assets.build_gate), ('finish', assets.build_finish), ('banana', assets.build_banana),
            ('cone', assets.build_cone), ('tree_round', assets.build_tree_round),
            ('tree_pine', assets.build_tree_pine), ('rock', assets.build_rock), ('cloud', assets.build_cloud),
            ('chest', assets.build_chest)]
    only = args[2:]
    for name, fn in jobs:
        if only and name not in only:
            continue
        reset()
        fn()
        studio(420, 420, samples=16, transparent=False)
        lo, hi = bbox_world()
        c = (lo + hi) / 2
        r = (hi - lo).length / 2
        d = Vector((0.75, -1.0, 0.6)).normalized()
        add_camera(c + d * r * 3.1, c, lens=50)
        render_to(os.path.join(folder, f'pv_{name}.png'))


# ---------------------------------------------------------------- chest
CHEST_VARIANTS = {
    'wood': dict(Wood=('#c98a4b', 0.65, 0.0), Gold=('#ffd24d', 0.3, 0.4)),
    'silver': dict(Wood=('#7d92c2', 0.35, 0.35), Gold=('#f4f7fc', 0.2, 0.6)),
    'gold': dict(Wood=('#ffc93a', 0.3, 0.55), Gold=('#ff7fa8', 0.35, 0.2)),
}


def chest_scene(variant='wood', open_=False):
    reset()
    root = assets.build_chest()
    for mname, (col, rough, metal) in CHEST_VARIANTS[variant].items():
        set_color(bpy.data.materials[mname], col, rough=rough, metal=metal)
    studio(512, 512, samples=64)
    target = (0, 0, 0.45)
    if open_:
        lid = bpy.data.objects['Lid']
        lid.rotation_euler.x = -1.95
        glow = mat('CoinGlow', '#ffc21a', rough=0.3, metal=0.3, emit='#ffb800', emit_strength=0.35)
        pile = mat('CoinPile', '#ffcf3a', rough=0.35, metal=0.2, emit='#ffd84d', emit_strength=0.9)
        spark = mat('Spark', '#ffffff', emit='#fff3a0', emit_strength=6.0)
        b = Builder('Coins')
        b.add('sphere', pile, loc=(0, 0, 0.47), scale=(0.88, 0.58, 0.3), seg=16, rings=8)
        rnd = random.Random(4)
        for i in range(22):
            a = rnd.uniform(0, 2 * PI); rr = rnd.uniform(0, 0.3)
            x, y = math.cos(a) * rr * 1.3, math.sin(a) * rr * 0.75
            z = 0.47 + 0.15 * (1 - (rr / 0.32) ** 2) + 0.025
            b.add('cyl', glow, loc=(x, y, z), scale=(0.2, 0.2, 0.035),
                  rot=(rnd.uniform(-0.5, 0.5), rnd.uniform(-0.5, 0.5), 0), seg=14)
        for x, y, z, s in ((-0.35, -0.2, 0.95, 0.12), (0.4, -0.1, 1.05, 0.09), (0.05, -0.3, 1.2, 0.07),
                           (-0.15, 0.1, 1.1, 0.06), (0.3, -0.35, 0.8, 0.06)):
            b.add('star', spark, loc=(x, y, z), scale=(s * 1.6, s * 1.6, s * 0.4), rot=(1.1, 0, 0.4), smooth=False)
        b.build()
        add_light('POINT', (0, -0.15, 1.0), 10, '#ffd75e', size=0.3, name='Glow')
        target = (0, 0.08, 0.66)
    add_camera((1.85, -2.55, 2.05), target, lens=64 if not open_ else 54)
    return root


# ---------------------------------------------------------------- coin
def coin_scene():
    reset()
    assets.build_coin()
    studio(256, 256, samples=64)
    add_camera((0.75, -2.9, 0.75), (0, 0, 0), lens=60)


# ---------------------------------------------------------------- kart + driver
def place_kart(paint, suit, helmet, loc=(0, 0, 0), heading=0.0, scale=1.0, suffix=''):
    k = assets.build_kart()
    d = assets.build_driver()
    d.parent = k
    d.location = assets.KART_SEAT
    newm = rename_materials(k, suffix or '_' + paint)
    set_color(newm['Paint'], paint)
    set_color(newm['Suit'], suit)
    set_color(newm['Helmet'], helmet)
    k.location = loc
    k.rotation_euler = (0, 0, heading)
    k.scale = (scale,) * 3
    return k


def hero_scene():
    reset()
    place_kart('#ff6f91', '#59c3ff', '#ffd84d', heading=0)
    studio(1024, 768, samples=64)
    add_camera((-3.4, -4.3, 2.2), (0, -0.05, 0.5), lens=62)


# ---------------------------------------------------------------- lobby background
def terrain_h(x, y):
    d = math.hypot(x / 50.0, (y - 38.0) / 30.0)
    t = min(1.0, max(0.0, (d - 1.05) / 0.9))
    t = t * t * (3 - 2 * t)
    gentle = 0.5 * math.sin(x * 0.11) * math.sin(y * 0.09 + 1)
    hills = (7 + 5 * math.sin(x * 0.045 + 1.3) + 3 * math.cos(y * 0.06)) * t
    return gentle + hills


def track_pt(t):
    x = 36 * math.cos(t) + 3 * math.cos(2 * t)
    y = 38 + 17 * math.sin(t) + 3.5 * math.sin(3 * t)
    return Vector((x, y, 0))


def lobby_scene():
    reset()
    s = setup_render(1920, 1080, transparent=False, samples=48, world='#d3ecff', world_strength=0.9)
    add_sun(rot=(math.radians(52), 0, math.radians(-30)), strength=3.4, angle_deg=6)

    # 하늘 돔 (위로 갈수록 진한 하늘색)
    sky = bpy.data.materials.new('Sky')
    nt = sky.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    em = nt.nodes.new('ShaderNodeEmission')
    tc = nt.nodes.new('ShaderNodeTexCoord')
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    nt.links.new(tc.outputs['Generated'], sep.inputs[0])
    nt.links.new(sep.outputs['Z'], ramp.inputs['Fac'])
    nt.links.new(ramp.outputs['Color'], em.inputs['Color'])
    nt.links.new(em.outputs[0], out.inputs[0])
    ramp.color_ramp.elements[0].position = 0.5
    ramp.color_ramp.elements[0].color = (*hexcol('#eaf8ff'), 1)
    ramp.color_ramp.elements[1].position = 0.72
    ramp.color_ramp.elements[1].color = (*hexcol('#5fb8f5'), 1)
    em.inputs['Strength'].default_value = 1.0
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=32, v_segments=16, radius=420)
    me = bpy.data.meshes.new('SkyDome'); bm.to_mesh(me); bm.free()
    for p in me.polygons:
        p.use_smooth = True
    me.materials.append(sky)
    dome = link(bpy.data.objects.new('SkyDome', me))
    dome.visible_shadow = False

    # 땅
    grass = mat('Grass', '#ffffff', rough=0.9, vcol='Col')
    bm = bmesh.new()
    N, S = 90, 360.0
    vs = []
    for j in range(N + 1):
        row = []
        for i in range(N + 1):
            x = -S / 2 + S * i / N
            y = -60 + S * j / N
            row.append(bm.verts.new((x, y, terrain_h(x, y))))
        vs.append(row)
    for j in range(N):
        for i in range(N):
            f = bm.faces.new((vs[j][i], vs[j][i + 1], vs[j + 1][i + 1], vs[j + 1][i]))
            f.smooth = True
            f.material_index = 0
    me = bpy.data.meshes.new('Ground'); bm.to_mesh(me); bm.free()
    me.materials.append(grass)
    ca = me.color_attributes.new('Col', 'BYTE_COLOR', 'CORNER')
    ga, gb = hexcol('#8fdf78'), hexcol('#b9f08f')
    for li, lp in enumerate(me.loops):
        v = me.vertices[lp.vertex_index].co
        k = 0.5 + 0.35 * math.sin(v.x * 0.06 + 0.5) * math.sin(v.y * 0.05 + 1.0) + 0.15 * math.sin((v.x + v.y) * 0.13)
        k = min(1.0, max(0.0, k))
        ca.data[li].color = tuple(ga[i] + (gb[i] - ga[i]) * k for i in range(3)) + (1.0,)
    link(bpy.data.objects.new('Ground', me))

    # 트랙 리본 + 연석 + 가운데 점선
    road = mat('Road', '#c3bce0', rough=0.8)
    curb_r = mat('CurbRed', '#ff7b9c', rough=0.6)
    curb_w = mat('CurbWhite', '#ffffff', rough=0.6)
    line = mat('Line', '#ffffff', rough=0.6)
    bm = bmesh.new()
    n = 260
    W = 7.0
    pts = [track_pt(2 * PI * i / n) for i in range(n)]
    for p in pts:
        p.z = terrain_h(p.x, p.y)

    def strip(off_a, off_b, zoff, mat_fn):
        ring_a, ring_b = [], []
        for i in range(n):
            p = pts[i]
            tng = (pts[(i + 1) % n] - pts[i - 1]); tng.z = 0; tng.normalize()
            nor = Vector((-tng.y, tng.x, 0))
            a = p + nor * off_a; b = p + nor * off_b
            a.z = terrain_h(a.x, a.y) + zoff; b.z = terrain_h(b.x, b.y) + zoff
            ring_a.append(bm.verts.new(a)); ring_b.append(bm.verts.new(b))
        for i in range(n):
            mi = mat_fn(i)
            if mi is None:
                continue
            f = bm.faces.new((ring_a[i], ring_b[i], ring_b[(i + 1) % n], ring_a[(i + 1) % n]))
            f.material_index = mi
            f.smooth = True

    strip(-W / 2, W / 2, 0.12, lambda i: 0)
    strip(W / 2, W / 2 + 0.9, 0.16, lambda i: 1 if (i // 2) % 2 else 2)
    strip(-W / 2 - 0.9, -W / 2, 0.16, lambda i: 1 if (i // 2) % 2 else 2)
    strip(-0.18, 0.18, 0.15, lambda i: 3 if (i // 2) % 2 == 0 else None)
    me = bpy.data.meshes.new('Track'); bm.to_mesh(me); bm.free()
    for m in (road, curb_r, curb_w, line):
        me.materials.append(m)
    trk = link(bpy.data.objects.new('Track', me))
    # 법선이 아래로 향하면 뒤집기
    me.update()
    if sum(p.normal.z for p in me.polygons) < 0:
        bm = bmesh.new(); bm.from_mesh(me)
        bmesh.ops.reverse_faces(bm, faces=bm.faces); bm.to_mesh(me); bm.free()

    def on_track(t, lateral=0.0):
        p = track_pt(t)
        q = track_pt(t + 0.01)
        tng = (q - p).normalized()
        nor = Vector((-tng.y, tng.x, 0))
        p = p + nor * lateral
        p.z = terrain_h(p.x, p.y) + 0.12
        heading = math.atan2(tng.x, -tng.y)  # 카트 앞(-Y)을 진행방향으로
        return p, heading

    # 카트 3대 (앞쪽 커브 위)
    for t, lat, col in ((4.33, -1.4, ('#ff6f91', '#59c3ff', '#ffd84d')),
                        (4.62, 1.6, ('#59c3ff', '#ffb443', '#ffffff')),
                        (5.05, -0.8, ('#ffd84d', '#9b7bff', '#ff8fb1'))):
        p, hd = on_track(-t if False else t, lat)
        place_kart(*col, loc=p, heading=hd + PI, scale=1.6, suffix='_%d' % int(t * 100))

    # 퀴즈 게이트 (왼쪽 트랙)
    g = assets.build_gate()
    p, hd = on_track(3.97)
    g.location = p; g.rotation_euler = (0, 0, hd); g.scale = (0.75,) * 3
    set_color(bpy.data.materials['Banner'], '#ffb3cf')
    rename_materials(g, '_g')
    # 결승 아치 (오른쪽 뒤)
    f = assets.build_finish()
    p, hd = on_track(0.35)
    f.location = p; f.rotation_euler = (0, 0, hd); f.scale = (0.68,) * 3
    rename_materials(f, '_f')

    # 나무 / 바위 / 구름
    rnd = random.Random(11)
    spots = []
    for _ in range(150):
        x = rnd.uniform(-130, 130); y = rnd.uniform(8, 190)
        # 트랙과 화면 중앙(잔디밭) 피하기
        dmin = min((Vector((x, y, 0)) - pts[i].to_2d().to_3d()).length for i in range(0, n, 4))
        if dmin < 7:
            continue
        if math.hypot(x / 26.0, (y - 38) / 12.0) < 1.0:
            continue
        spots.append((x, y))
    for k, (x, y) in enumerate(spots[:90]):
        kind = rnd.random()
        if kind < 0.55:
            o = assets.build_tree_round(); sc = rnd.uniform(0.9, 1.4)
            rename_materials(o, '_t%d' % k)
            leafm = [sl.material for c in o.children for sl in c.material_slots if sl.material.name.startswith('Leaf')][0]
            set_color(leafm, rnd.choice(['#7fdc63', '#9be35c', '#ff9fc4', '#ffc46b', '#66d6a0']))
        elif kind < 0.9:
            o = assets.build_tree_pine(); sc = rnd.uniform(0.9, 1.5)
        else:
            o = assets.build_rock(); sc = rnd.uniform(0.8, 1.6)
        o.location = (x, y, terrain_h(x, y) - 0.1)
        o.rotation_euler.z = rnd.uniform(0, 2 * PI)
        o.scale = (sc,) * 3
    for x, y, z, sc in ((-95, 190, 44, 3.6), (-35, 230, 52, 3.2), (55, 210, 47, 3.4), (120, 180, 40, 3.8),
                        (-160, 230, 36, 4.0), (175, 250, 50, 4.2), (10, 300, 66, 4.5)):
        c = assets.build_cloud()
        c.location = (x, y, z); c.scale = (sc,) * 3
        c.rotation_euler.z = rnd.uniform(-0.3, 0.3)
    # 떠 있는 물음표 상자 몇 개
    for t, lat in ((3.3, 0), (5.6, 1.5)):
        p, hd = on_track(t, lat)
        ib = assets.build_itembox(); ib.location = p + Vector((0, 0, 1.6)); ib.scale = (1.3,) * 3
        ib.rotation_euler = (0.3, 0.2, 0.6)

    cam = add_camera((0, -26, 20), (0, 90, 6), lens=28, clip_end=1500)


# ---------------------------------------------------------------- main
if __name__ == '__main__':
    if args and args[0] == 'preview':
        preview(args[1])
        sys.exit(0)
    todo = args or ['chest', 'coin', 'hero', 'lobby']
    if 'chest' in todo:
        for v in ('wood', 'silver', 'gold'):
            chest_scene(v)
            render_to(os.path.join(IMG, f'chest_{v}.png'))
        chest_scene('wood', open_=True)
        render_to(os.path.join(IMG, 'chest_open.png'))
    if 'coin' in todo:
        coin_scene()
        render_to(os.path.join(IMG, 'coin.png'))
    if 'hero' in todo:
        hero_scene()
        render_to(os.path.join(IMG, 'kart_hero.png'))
    if 'lobby' in todo:
        lobby_scene()
        render_to(os.path.join(IMG, 'lobby_bg.jpg'), fmt='JPEG', quality=80)
