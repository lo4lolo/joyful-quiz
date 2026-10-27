# -*- coding: utf-8 -*-
"""즐거운 퀴즈 Blender 공용 도우미 (Blender 5.2, 헤드리스).

좌표: Blender Z-up, 앞쪽 = -Y, 바닥 = z 0  ->  glTF/three.js 에서 앞 +Z, 위 +Y.
"""
import bpy, bmesh, math, os, colorsys
from mathutils import Vector, Matrix, Euler

HERE = os.path.dirname(os.path.abspath(__file__))
PROJ = os.path.abspath(os.path.join(HERE, '..', '..'))
MODELS = os.path.join(PROJ, 'public', 'assets', 'models')
IMG = os.path.join(PROJ, 'public', 'assets', 'img')
os.makedirs(MODELS, exist_ok=True)
os.makedirs(IMG, exist_ok=True)


# ---------------------------------------------------------------- scene
_first_reset = [True]


def reset():
    """빈 씬으로. 처음 한 번만 factory reset, 이후엔 데이터만 지움
    (렌더 후 factory reset 을 반복하면 Eevee 가 가끔 죽음)."""
    if _first_reset[0]:
        bpy.ops.wm.read_factory_settings(use_empty=True)
        _first_reset[0] = False
        return
    for coll in (bpy.data.objects, bpy.data.meshes, bpy.data.materials, bpy.data.lights,
                 bpy.data.cameras, bpy.data.curves, bpy.data.images):
        ids = [i for i in coll if not (coll is bpy.data.images and i.name == 'Render Result')]
        if ids:
            bpy.data.batch_remove(ids)
    s = bpy.context.scene
    s.render.film_transparent = False


def link(obj, parent=None):
    bpy.context.scene.collection.objects.link(obj)
    if parent is not None:
        obj.parent = parent
    return obj


def empty(name, loc=(0, 0, 0), parent=None, size=0.3):
    o = bpy.data.objects.new(name, None)
    o.empty_display_size = size
    o.location = loc
    return link(o, parent)


# ---------------------------------------------------------------- colors / materials
def srgb2lin(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hexcol(h):
    h = h.lstrip('#')
    return tuple(srgb2lin(int(h[i:i + 2], 16) / 255.0) for i in (0, 2, 4))


def mat(name, color='#ffffff', rough=0.5, metal=0.0, emit=None, emit_strength=1.0, vcol=None):
    """Principled BSDF 단색 재질 (이미 있으면 그대로 반환)."""
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    nt = m.node_tree
    p = nt.nodes.get('Principled BSDF')
    if p is None:
        p = nt.nodes.new('ShaderNodeBsdfPrincipled')
        nt.links.new(p.outputs[0], nt.nodes['Material Output'].inputs[0])
    rgb = hexcol(color) if isinstance(color, str) else tuple(color)
    p.inputs['Base Color'].default_value = (*rgb, 1.0)
    p.inputs['Roughness'].default_value = rough
    p.inputs['Metallic'].default_value = metal
    if emit:
        e = hexcol(emit) if isinstance(emit, str) else tuple(emit)
        p.inputs['Emission Color'].default_value = (*e, 1.0)
        p.inputs['Emission Strength'].default_value = emit_strength
    if vcol:
        a = nt.nodes.new('ShaderNodeVertexColor')
        a.layer_name = vcol
        nt.links.new(a.outputs['Color'], p.inputs['Base Color'])
    m.diffuse_color = (*rgb, 1.0)
    return m


def set_color(m, color, rough=None, metal=None, emit=None, emit_strength=None):
    p = m.node_tree.nodes['Principled BSDF']
    rgb = hexcol(color) if isinstance(color, str) else tuple(color)
    p.inputs['Base Color'].default_value = (*rgb, 1.0)
    m.diffuse_color = (*rgb, 1.0)
    if rough is not None:
        p.inputs['Roughness'].default_value = rough
    if metal is not None:
        p.inputs['Metallic'].default_value = metal
    if emit is not None:
        e = hexcol(emit) if isinstance(emit, str) else tuple(emit)
        p.inputs['Emission Color'].default_value = (*e, 1.0)
    if emit_strength is not None:
        p.inputs['Emission Strength'].default_value = emit_strength


# ---------------------------------------------------------------- mesh building
def _torus(bm, R, r, seg, ring):
    verts = []
    for i in range(seg):
        a = 2 * math.pi * i / seg
        row = []
        for j in range(ring):
            b = 2 * math.pi * j / ring
            x = (R + r * math.cos(b)) * math.cos(a)
            y = (R + r * math.cos(b)) * math.sin(a)
            z = r * math.sin(b)
            row.append(bm.verts.new((x, y, z)))
        verts.append(row)
    for i in range(seg):
        for j in range(ring):
            a = verts[i][j]; b = verts[(i + 1) % seg][j]
            c = verts[(i + 1) % seg][(j + 1) % ring]; d = verts[i][(j + 1) % ring]
            bm.faces.new((a, b, c, d))


def _text_bm(bm, body, size, depth, bevel, font=None, res=2):
    cu = bpy.data.curves.new('tmp_text', 'FONT')
    cu.body = body
    cu.size = size
    cu.extrude = depth / 2
    cu.bevel_depth = bevel
    cu.bevel_resolution = 1
    cu.resolution_u = res
    cu.align_x = 'CENTER'
    cu.align_y = 'CENTER'
    if font:
        cu.font = font
    ob = bpy.data.objects.new('tmp_text', cu)
    bpy.context.scene.collection.objects.link(ob)
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    bm.from_mesh(me)
    bpy.data.objects.remove(ob)
    bpy.data.curves.remove(cu)
    bpy.data.meshes.remove(me)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)
    # 글자 실제 중심으로 맞춤
    if bm.verts:
        mn = Vector((min(v.co.x for v in bm.verts), min(v.co.y for v in bm.verts), 0))
        mx = Vector((max(v.co.x for v in bm.verts), max(v.co.y for v in bm.verts), 0))
        c = (mn + mx) / 2
        for v in bm.verts:
            v.co -= c


class Builder:
    """여러 기본 도형을 하나의 메시(여러 재질)로 합친다."""

    def __init__(self, name):
        self.name = name
        self.bm = bmesh.new()
        self.mats = []

    def _mi(self, m):
        if m not in self.mats:
            self.mats.append(m)
        return self.mats.index(m)

    def add(self, kind, m, loc=(0, 0, 0), scale=(1, 1, 1), rot=(0, 0, 0), smooth=True,
            seg=16, rings=8, bevel=0.0, bevel_seg=2, r2=0.0, R=0.5, r=0.15, text='?',
            font=None, depth=0.1, subdiv=2, jitter=None, taper=None, checker=None,
            cut=None, mtx=None, star_inner=0.45, points=5):
        """checker=(m2, nx, ny): grid 칸을 번갈아 m/m2.
        cut=(co, no, fill): 변환 후 평면으로 잘라 no 반대쪽 제거 (fill=True면 구멍 메움).
        mtx: loc/rot 대신 쓸 4x4 행렬."""
        tmp = bmesh.new()
        cell_mat = {}
        if isinstance(scale, (int, float)):
            scale = (scale, scale, scale)
        if kind == 'cube':
            bmesh.ops.create_cube(tmp, size=1.0)
        elif kind == 'sphere':
            bmesh.ops.create_uvsphere(tmp, u_segments=seg, v_segments=rings, radius=0.5)
        elif kind == 'ico':
            bmesh.ops.create_icosphere(tmp, subdivisions=subdiv, radius=0.5)
        elif kind == 'cyl':
            bmesh.ops.create_cone(tmp, cap_ends=True, cap_tris=False, segments=seg,
                                  radius1=0.5, radius2=0.5, depth=1.0)
        elif kind == 'cone':
            bmesh.ops.create_cone(tmp, cap_ends=True, cap_tris=False, segments=seg,
                                  radius1=0.5, radius2=r2, depth=1.0)
        elif kind == 'torus':
            _torus(tmp, R, r, seg, rings)
        elif kind == 'text':
            _text_bm(tmp, text, 1.0, depth, 0.0 if bevel == 0 else bevel, font)
            bevel = 0.0
        elif kind == 'grid':  # 단위 사각형 -0.5..0.5 (XY), seg x rings 칸
            vs = [[tmp.verts.new((i / seg - 0.5, j / rings - 0.5, 0)) for i in range(seg + 1)]
                  for j in range(rings + 1)]
            for j in range(rings):
                for i in range(seg):
                    f = tmp.faces.new((vs[j][i], vs[j][i + 1], vs[j + 1][i + 1], vs[j + 1][i]))
                    cell_mat[f] = (i + j) % 2
        elif kind == 'star':  # 별 기둥 (XY 별, z -0.5..0.5)
            n = points * 2
            top, bot = [], []
            for k in range(n):
                a = math.pi / 2 + 2 * math.pi * k / n
                rr = 0.5 if k % 2 == 0 else 0.5 * star_inner
                top.append(tmp.verts.new((rr * math.cos(a), rr * math.sin(a), 0.5)))
                bot.append(tmp.verts.new((rr * math.cos(a), rr * math.sin(a), -0.5)))
            ct = tmp.verts.new((0, 0, 0.5)); cb = tmp.verts.new((0, 0, -0.5))
            for k in range(n):
                k2 = (k + 1) % n
                tmp.faces.new((ct, top[k], top[k2]))
                tmp.faces.new((cb, bot[k2], bot[k]))
                tmp.faces.new((bot[k], bot[k2], top[k2], top[k]))
        else:
            raise ValueError(kind)
        if taper is not None:  # taper=(sx, sy) 위(z>0)쪽 단면 배율
            for v in tmp.verts:
                t = v.co.z + 0.5
                v.co.x *= 1 + (taper[0] - 1) * t
                v.co.y *= 1 + (taper[1] - 1) * t
        bmesh.ops.scale(tmp, vec=Vector(scale), verts=tmp.verts)
        if bevel > 0:
            sharp = [e for e in tmp.edges if len(e.link_faces) == 2 and e.calc_face_angle(0) > 0.6]
            sv = list({v for e in sharp for v in e.verts})
            bmesh.ops.bevel(tmp, geom=sharp + sv, offset=bevel,
                            offset_type='OFFSET', segments=bevel_seg, profile=0.5,
                            affect='EDGES', clamp_overlap=True)
        if jitter:
            import random
            rnd = random.Random(jitter[1])
            bmesh.ops.remove_doubles(tmp, verts=tmp.verts, dist=1e-5)
            for v in tmp.verts:
                v.co += Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(-1, 1))) * jitter[0]
        if mtx is None:
            mtx = Matrix.Translation(Vector(loc)) @ Euler(rot).to_matrix().to_4x4()
        bmesh.ops.transform(tmp, matrix=mtx, verts=tmp.verts)
        mi = self._mi(m)
        mi2 = self._mi(checker[0]) if checker else mi
        for f in tmp.faces:
            f.material_index = mi2 if cell_mat.get(f) == 1 else mi
            f.smooth = smooth
        if cut:
            co, no = Vector(cut[0]), Vector(cut[1]).normalized()
            geom = list(tmp.verts) + list(tmp.edges) + list(tmp.faces)
            bmesh.ops.bisect_plane(tmp, geom=geom, dist=1e-5, plane_co=co, plane_no=no,
                                   clear_inner=True)
            if len(cut) > 2 and cut[2]:
                bnd = [e for e in tmp.edges if e.is_boundary]
                res = bmesh.ops.holes_fill(tmp, edges=bnd, sides=0)
                for f in res['faces']:
                    f.material_index = mi
                    f.smooth = False
        me = bpy.data.meshes.new('tmp')
        tmp.to_mesh(me)
        tmp.free()
        self.bm.from_mesh(me)
        bpy.data.meshes.remove(me)
        return self

    def tube(self, m, p0, p1, radius, seg=10, smooth=True, caps=True):
        """p0 -> p1 방향 원기둥 (팔·다리·막대)."""
        p0, p1 = Vector(p0), Vector(p1)
        d = p1 - p0
        L = d.length
        rot = d.to_track_quat('Z', 'Y').to_euler()
        mid = (p0 + p1) / 2
        self.add('cyl', m, loc=mid, scale=(radius * 2, radius * 2, L), rot=rot, seg=seg, smooth=smooth)
        if caps:
            self.add('sphere', m, loc=p0, scale=radius * 2, seg=seg, rings=6, smooth=smooth)
            self.add('sphere', m, loc=p1, scale=radius * 2, seg=seg, rings=6, smooth=smooth)
        return self

    def build(self, parent=None, loc=(0, 0, 0), sharp_deg=50, name=None):
        bm = self.bm
        thr = math.radians(sharp_deg)
        for e in bm.edges:
            if len(e.link_faces) == 2:
                try:
                    if e.calc_face_angle() > thr:
                        e.smooth = False
                except ValueError:
                    pass
            else:
                e.smooth = False
        me = bpy.data.meshes.new(name or self.name)
        bm.to_mesh(me)
        bm.free()
        for m in self.mats:
            me.materials.append(m)
        ob = bpy.data.objects.new(name or self.name, me)
        ob.location = loc
        return link(ob, parent)


# ---------------------------------------------------------------- export / stats
def tri_count(objs=None):
    n = 0
    dg = bpy.context.evaluated_depsgraph_get()
    for o in (objs or bpy.context.scene.objects):
        if o.type == 'MESH':
            me = o.evaluated_get(dg).to_mesh()
            me.calc_loop_triangles()
            n += len(me.loop_triangles)
            o.evaluated_get(dg).to_mesh_clear()
    return n


def export_glb(fname):
    path = os.path.join(MODELS, fname)
    bpy.ops.export_scene.gltf(
        filepath=path, export_format='GLB', use_selection=False, export_apply=True,
        export_texcoords=False, export_normals=True, export_tangents=False,
        export_materials='EXPORT', export_cameras=False, export_yup=True,
        export_animations=False, export_extras=False)
    print('EXPORTED', fname, os.path.getsize(path), 'bytes', tri_count(), 'tris')
    return path


def default_font():
    for f in ('ARLRDBD.TTF', 'seguibl.ttf', 'arialbd.ttf'):
        p = os.path.join(os.environ.get('WINDIR', r'C:\Windows'), 'Fonts', f)
        if os.path.exists(p):
            try:
                return bpy.data.fonts.load(p, check_existing=True)
            except Exception:
                pass
    return None  # Blender 내장 폰트


def pastel(h, s=0.45, v=1.0):
    return colorsys.hsv_to_rgb(h % 1.0, s, v)


# ---------------------------------------------------------------- render helpers
def look_at(obj, target):
    d = Vector(target) - obj.location
    obj.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()


def setup_render(w, h, transparent=True, samples=64, world='#cfe7ff', world_strength=0.9):
    s = bpy.context.scene
    s.render.engine = 'BLENDER_EEVEE'
    s.render.resolution_x = w
    s.render.resolution_y = h
    s.render.resolution_percentage = 100
    s.render.film_transparent = transparent
    try:
        s.eevee.taa_render_samples = samples
    except Exception:
        pass
    try:
        s.view_settings.view_transform = 'Standard'
        s.view_settings.look = 'None'
    except Exception as e:
        print('view transform', e)
    if s.world is None:
        s.world = bpy.data.worlds.new('World')
    wt = s.world.node_tree
    bg = wt.nodes.get('Background')
    if bg is None:
        bg = wt.nodes.new('ShaderNodeBackground')
        out = wt.nodes.get('World Output') or wt.nodes.new('ShaderNodeOutputWorld')
        wt.links.new(bg.outputs[0], out.inputs[0])
    bg.inputs[0].default_value = (*hexcol(world), 1)
    bg.inputs[1].default_value = world_strength
    return s


def add_sun(rot=(0.75, 0.2, -0.6), strength=3.0, angle_deg=8, color='#fff6e8', name='Sun'):
    ld = bpy.data.lights.new(name, 'SUN')
    ld.energy = strength
    ld.angle = math.radians(angle_deg)
    ld.color = hexcol(color)
    o = bpy.data.objects.new(name, ld)
    o.rotation_euler = rot
    return link(o)


def add_light(kind, loc, energy, color='#ffffff', size=1.0, name='L'):
    ld = bpy.data.lights.new(name, kind)
    ld.energy = energy
    ld.color = hexcol(color)
    if kind == 'AREA':
        ld.size = size
    else:
        ld.shadow_soft_size = size
    o = bpy.data.objects.new(name, ld)
    o.location = loc
    return link(o)


def add_camera(loc, target, lens=50, ortho=None, clip_end=1000):
    cd = bpy.data.cameras.new('Cam')
    cd.lens = lens
    cd.clip_end = clip_end
    if ortho:
        cd.type = 'ORTHO'
        cd.ortho_scale = ortho
    o = bpy.data.objects.new('Cam', cd)
    o.location = loc
    link(o)
    look_at(o, target)
    bpy.context.scene.camera = o
    return o


def render_to(path, fmt='PNG', quality=85):
    s = bpy.context.scene
    st = s.render.image_settings
    st.file_format = fmt
    if fmt == 'PNG':
        st.color_mode = 'RGBA' if s.render.film_transparent else 'RGB'
        st.compression = 90
    else:
        st.color_mode = 'RGB'
        st.quality = quality
    s.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print('RENDERED', path, os.path.getsize(path))


def rename_materials(root, suffix):
    """루트 아래 모든 재질을 복제·개명 (같은 모델을 다른 색으로 여러 개 놓을 때)."""
    done = {}
    objs = [root] + list(root.children_recursive)
    for o in objs:
        if o.type != 'MESH':
            continue
        for slot in o.material_slots:
            m = slot.material
            if m is None:
                continue
            if m.name not in done:
                done[m.name] = m.copy()
                done[m.name].name = m.name + suffix
            slot.material = done[m.name]
    # 원본 이름을 비워 다음 빌드가 새 재질을 만들도록
    for name in list(done):
        old = bpy.data.materials.get(name)
        if old and old.users == 0:
            bpy.data.materials.remove(old)
    return {k[:len(k)] : v for k, v in done.items()}