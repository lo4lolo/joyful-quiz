# -*- coding: utf-8 -*-
"""v0.2 '칭찬 스티커 공책' 스프라이트용 공용 도우미.

- 잉크 테두리(inverted hull, Solidify + 뒷면 숨김)
- 스튜디오 조명(키 + 채움 + 림)
- 직교 카메라 자동 맞춤(여백 %)
- 타원체 표면에 얼굴 붙이기(Ell, surf_mtx)
- PNG 후처리(투명 픽셀 RGB 0, 둥근 모서리, Paeth+zlib9 다시 쓰기) / 헤더 검사 / 모음 시트
lib.py 의 Builder, mat, set_color 등을 그대로 씁니다.
"""
import bpy, math, os, zlib, struct, random
import numpy as np
from mathutils import Vector, Matrix, Euler
import lib
from lib import Builder, mat, hexcol, link, empty, set_color, look_at, setup_render

PI = math.pi
D2R = PI / 180.0
ASSETS = os.path.join(lib.PROJ, 'public', 'assets')
SHOTS = os.path.join(lib.PROJ, 'docs', 'screenshots')

INK = '#1B2A4A'
BLUE = '#3D8BFF'
LEMON = '#FFE14D'
CORAL = '#FF6F61'
MINT = '#2ED3A0'
GRAPE = '#8C6CFF'
PAPER = '#EEF6FF'
BLUSH = '#FF8FA8'
WHITE = '#FFFFFF'


def out_dir(group):
    p = os.path.join(ASSETS, group)
    os.makedirs(p, exist_ok=True)
    return p


# ---------------------------------------------------------------- materials
def toon(name, color, rough=0.5, metal=0.0, emit=None, es=0.0, sheen=0.0):
    """mat() 와 같지만 살짝 장난감 느낌(코트)을 줌."""
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = mat(name, color, rough=rough, metal=metal, emit=emit, emit_strength=es if emit else 1.0)
    p = m.node_tree.nodes['Principled BSDF']
    try:
        p.inputs['Coat Weight'].default_value = 0.08
        p.inputs['Coat Roughness'].default_value = 0.25
    except Exception:
        pass
    return m


def emissive(name, color, strength=1.0):
    """빛을 받지 않는 단색(눈 하이라이트, 반짝이)."""
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    em = nt.nodes.new('ShaderNodeEmission')
    em.inputs['Color'].default_value = (*hexcol(color), 1)
    em.inputs['Strength'].default_value = strength
    nt.links.new(em.outputs[0], out.inputs[0])
    m.diffuse_color = (*hexcol(color), 1)
    return m


def ink_mat():
    m = bpy.data.materials.get('InkLine')
    if m:
        return m
    m = emissive('InkLine', INK, 1.0)
    m.use_backface_culling = True
    for attr in ('use_backface_culling_shadow',):
        try:
            setattr(m, attr, True)
        except Exception:
            pass
    return m


def outline(ob, t):
    """잉크 테두리: 뒤집힌 껍데기(Solidify). t = 오브젝트 로컬 단위 두께."""
    if ob.type != 'MESH':
        return
    ink = ink_mat()
    me = ob.data
    if ink.name not in [m.name for m in me.materials if m]:
        me.materials.append(ink)
    idx = [m.name for m in me.materials].index(ink.name)
    mod = ob.modifiers.get('Outline') or ob.modifiers.new('Outline', 'SOLIDIFY')
    mod.thickness = -abs(t)
    mod.offset = -1.0
    mod.use_flip_normals = True
    mod.use_rim = False
    mod.use_even_offset = False
    mod.use_quality_normals = True
    mod.material_offset = idx
    ob['outline'] = True


def set_outline_px(objs, px, ortho_scale, res):
    """화면에서 px 픽셀 두께가 되도록 (직교 카메라)."""
    world = px * ortho_scale / res
    for o in objs:
        if o.type == 'MESH' and o.get('want_outline', False):
            sc = max(o.matrix_world.to_scale())
            outline(o, world / sc * o.get('outline_mul', 1.0))


def mark(ob, outline_mul=1.0):
    ob['want_outline'] = True
    ob['outline_mul'] = outline_mul
    return ob


# ---------------------------------------------------------------- lights / render
def sun_dir(d, strength, color='#ffffff', angle=10, name='Sun'):
    ld = bpy.data.lights.new(name, 'SUN')
    ld.energy = strength
    ld.angle = math.radians(angle)
    ld.color = hexcol(color)
    o = bpy.data.objects.new(name, ld)
    o.rotation_euler = Vector(d).normalized().to_track_quat('-Z', 'Y').to_euler()
    return link(o)


def studio2(w, h, samples=48, transparent=True, world='#e4ecff', ws=0.7, key=2.7, rim=3.6, fill=0.8):
    w0 = bpy.context.scene.world
    if w0 is not None and 'Light Path' in w0.node_tree.nodes:  # sky_world 를 썼던 world 는 단순하게 되돌림
        nt = w0.node_tree
        for n in list(nt.nodes):
            nt.nodes.remove(n)
        nt.links.new(nt.nodes.new('ShaderNodeBackground').outputs[0], nt.nodes.new('ShaderNodeOutputWorld').inputs[0])
    s = setup_render(w, h, transparent=transparent, samples=samples, world=world, world_strength=ws)
    sun_dir((0.55, 1.0, -1.15), key, '#fff6ea', angle=18, name='Key')        # 앞 왼쪽 위
    sun_dir((-1.0, 0.35, -0.25), fill, '#dfe8ff', angle=30, name='Fill')     # 오른쪽 낮게
    sun_dir((-0.35, -1.0, -0.7), rim, '#ffffff', angle=6, name='Rim')        # 뒤에서 (윤곽 빛)
    try:
        s.eevee.use_shadows = True
    except Exception:
        pass
    try:
        s.render.film_filter_size = 1.2
    except Exception:
        pass
    return s


def eval_points(objs=None):
    dg = bpy.context.evaluated_depsgraph_get()
    pts = []
    for o in (objs or bpy.context.scene.objects):
        if o.type != 'MESH' or o.hide_render:
            continue
        oe = o.evaluated_get(dg)
        me = oe.to_mesh()
        mw = oe.matrix_world
        pts.extend(mw @ v.co for v in me.vertices)
        oe.to_mesh_clear()
    return pts


def ortho_cam(direction, target=(0, 0, 0.9)):
    cd = bpy.data.cameras.new('Cam')
    cd.type = 'ORTHO'
    cd.clip_start = 0.1
    cd.clip_end = 200
    o = bpy.data.objects.new('Cam', cd)
    o.location = Vector(target) + Vector(direction).normalized() * 40
    link(o)
    look_at(o, target)
    bpy.context.scene.camera = o
    return o


def fit_ortho(cam, w, h, pad=0.08, pad_bottom=None, objs=None):
    """모든 메쉬가 여백 pad 안에 들어오게 카메라 위치·ortho_scale 맞춤."""
    bpy.context.view_layer.update()
    inv = cam.matrix_world.inverted()
    pts = [inv @ p for p in eval_points(objs)]
    xs = [p.x for p in pts]; ys = [p.y for p in pts]
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    bw, bh = x1 - x0, y1 - y0
    aspect = w / h
    # ortho_scale = 화면의 긴 변 길이
    if aspect >= 1:
        sc = max(bw / (1 - 2 * pad), bh / (1 - 2 * pad) * aspect)
    else:
        sc = max(bw / (1 - 2 * pad) / aspect, bh / (1 - 2 * pad))
    cam.data.ortho_scale = sc
    cam.location = cam.matrix_world @ Vector((cx, cy, 0))
    bpy.context.view_layer.update()
    return sc


def frame_sprite(direction, w, h, pad=0.08, px=6, target=(0, 0, 0.9)):
    """카메라 만들고 맞추고 잉크 테두리 두께를 픽셀 기준으로 넣은 뒤 다시 맞춤."""
    cam = ortho_cam(direction, target)
    sc = fit_ortho(cam, w, h, pad)
    objs = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    set_outline_px(objs, px, sc, max(w, h))
    sc = fit_ortho(cam, w, h, pad)
    set_outline_px(objs, px, sc, max(w, h))
    fit_ortho(cam, w, h, pad)
    return cam


def render_png(path):
    s = bpy.context.scene
    st = s.render.image_settings
    st.file_format = 'PNG'
    st.color_mode = 'RGBA'
    st.color_depth = '8'
    st.compression = 100
    s.render.filepath = path
    bpy.ops.render.render(write_still=True)
    return path


# ---------------------------------------------------------------- PNG io (pure python + numpy)
def png_info(path):
    with open(path, 'rb') as f:
        head = f.read(33)
    if head[:8] != b'\x89PNG\r\n\x1a\n':
        return None
    w, h, depth, ctype = struct.unpack('>IIBB', head[16:26])
    return dict(w=w, h=h, depth=depth, ctype=ctype, rgba=(ctype == 6), bytes=os.path.getsize(path))


def _chunk(tag, data):
    c = struct.pack('>I', len(data)) + tag + data
    return c + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff)


def write_png(path, rgba):
    """rgba: (h, w, 4) uint8, 위가 0행. Paeth 필터 + zlib 9."""
    h, w, _ = rgba.shape
    a = rgba.astype(np.int16)
    left = np.zeros_like(a); left[:, 1:] = a[:, :-1]
    up = np.zeros_like(a); up[1:] = a[:-1]
    ul = np.zeros_like(a); ul[1:, 1:] = a[:-1, :-1]
    p = left + up - ul
    pa, pb, pc = np.abs(p - left), np.abs(p - up), np.abs(p - ul)
    pred = np.where((pa <= pb) & (pa <= pc), left, np.where(pb <= pc, up, ul))
    filt = ((a - pred) % 256).astype(np.uint8)
    raw = np.concatenate([np.full((h, 1), 4, np.uint8), filt.reshape(h, w * 4)], axis=1)
    data = zlib.compress(raw.tobytes(), 9)
    out = b'\x89PNG\r\n\x1a\n' + _chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0))
    out += _chunk(b'IDAT', data) + _chunk(b'IEND', b'')
    with open(path, 'wb') as f:
        f.write(out)
    return len(out)


def read_png_rgba(path):
    """Blender 로 PNG 읽어서 (h, w, 4) uint8 (위가 0행)."""
    img = bpy.data.images.load(path, check_existing=False)
    img.colorspace_settings.name = 'Non-Color'  # 저장된 값 그대로
    w, h = img.size
    px = np.empty(w * h * 4, np.float32)
    img.pixels.foreach_get(px)
    bpy.data.images.remove(img)
    arr = (px.reshape(h, w, 4)[::-1] * 255.0 + 0.5).clip(0, 255).astype(np.uint8)
    return arr


def round_corners(arr, radius):
    h, w, _ = arr.shape
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32) + 0.5
    cx = np.clip(xx, radius, w - radius)
    cy = np.clip(yy, radius, h - radius)
    d = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2)
    m = np.clip(radius - d + 0.5, 0, 1)
    arr = arr.copy()
    arr[..., 3] = (arr[..., 3].astype(np.float32) * m + 0.5).astype(np.uint8)
    return arr


def finalize_png(path, corner=0, alpha_floor=3, q=2):
    """렌더 PNG 다듬기: 거의 투명한 먼지 제거, 투명 픽셀 RGB=0, 둥근 모서리, 더 작게 다시 쓰기."""
    before = os.path.getsize(path)
    arr = read_png_rgba(path)
    a = arr[..., 3]
    arr[a < alpha_floor] = 0
    if q > 1:  # 색 단계 128 -> 압축이 더 잘 됨 (눈으로는 차이 없음)
        arr[..., :3] = np.minimum((arr[..., :3] // q) * q + q // 2, 255)
        arr[arr[..., 3] == 0] = 0
    if corner:
        arr = round_corners(arr, corner)
        arr[arr[..., 3] == 0] = 0
    tmp = path + '.tmp'
    n = write_png(tmp, arr)
    if n < before or corner:
        os.replace(tmp, path)
    else:
        os.remove(tmp)
    return os.path.getsize(path)


# ---------------------------------------------------------------- contact sheet
def contact_sheet(groups, path, width=1600, gap=16, bg=PAPER):
    """groups: [(title, [png paths], cell_w, cell_h, cols)] -> 종이색 바탕 모음 이미지."""
    rows = []
    H = gap
    for title, files, cw, ch, cols in groups:
        nrow = (len(files) + cols - 1) // cols
        rows.append((files, cw, ch, cols, H))
        H += nrow * (ch + gap) + gap
    bgc = np.array([int(bg[i:i + 2], 16) for i in (1, 3, 5)], np.float32)
    sheet = np.ones((H, width, 3), np.float32) * bgc
    # 모눈 선
    grid = np.array([0xD6, 0xE7, 0xF8], np.float32)
    sheet[::32, :] = grid
    sheet[:, ::32] = grid
    for files, cw, ch, cols, y0 in rows:
        for i, f in enumerate(files):
            if not os.path.exists(f):
                continue
            img = bpy.data.images.load(f, check_existing=False)
            img.colorspace_settings.name = 'Non-Color'
            iw, ih = img.size
            s = min(cw / iw, ch / ih)
            nw, nh = max(1, int(iw * s)), max(1, int(ih * s))
            img.scale(nw, nh)
            px = np.empty(nw * nh * 4, np.float32)
            img.pixels.foreach_get(px)
            bpy.data.images.remove(img)
            px = px.reshape(nh, nw, 4)[::-1] * 255.0
            r, c = divmod(i, cols)
            x = gap + c * (cw + gap) + (cw - nw) // 2
            y = y0 + r * (ch + gap) + (ch - nh) // 2
            if x + nw > width:
                continue
            al = px[..., 3:4] / 255.0
            reg = sheet[y:y + nh, x:x + nw]
            sheet[y:y + nh, x:x + nw] = reg * (1 - al) + px[..., :3] * al
    out = np.concatenate([sheet, np.full((H, width, 1), 255, np.float32)], axis=2)
    write_png(path, out.clip(0, 255).astype(np.uint8))
    print('SHEET', path, width, H)
    return path


# ---------------------------------------------------------------- face / surface helpers
class Ell:
    """축 정렬 타원체. pt(yaw, pitch) 각도(도): yaw + 는 +X(캐릭터 왼쪽), pitch + 는 위. 앞 = -Y."""

    def __init__(self, c, r):
        self.c = Vector(c)
        self.r = Vector(r) if not isinstance(r, (int, float)) else Vector((r, r, r))

    def scale(self):
        return tuple(2 * v for v in self.r)

    def pt(self, yaw, pitch, out=0.0):
        y, p = yaw * D2R, pitch * D2R
        d = Vector((math.sin(y) * math.cos(p), -math.cos(y) * math.cos(p), math.sin(p)))
        q = self.c + Vector((d.x * self.r.x, d.y * self.r.y, d.z * self.r.z))
        n = Vector((d.x / self.r.x, d.y / self.r.y, d.z / self.r.z)).normalized()
        return q + n * out, n


def surf_mtx(p, n, spin=0.0):
    """로컬 Z = 법선, 로컬 Y = 대략 위쪽. spin(도) 은 법선 축 회전."""
    n = Vector(n).normalized()
    up = Vector((0, 0, 1)) if abs(n.z) < 0.95 else Vector((0, 1, 0))
    x = up.cross(n).normalized()
    y = n.cross(x).normalized()
    m = Matrix((x, y, n)).transposed().to_4x4()
    if spin:
        m = m @ Matrix.Rotation(spin * D2R, 4, 'Z')
    return Matrix.Translation(p) @ m


def on(b, ell, kind, m, yaw, pitch, scale, out=0.0, spin=0.0, **kw):
    p, n = ell.pt(yaw, pitch, out)
    b.add(kind, m, mtx=surf_mtx(p, n, spin), scale=scale, **kw)
    return p, n


def arc(b, ell, m, pts_deg, r, out=0.01, seg=8):
    """타원체 표면 위 각도 점들을 잇는 관(입, 눈썹, 줄무늬)."""
    pts = [ell.pt(yw, pt, out)[0] for yw, pt in pts_deg]
    for a, c in zip(pts[:-1], pts[1:]):
        b.tube(m, a, c, r, seg=seg)


def arc_pts(cy, cp, ry, rp, a0, a1, n=7):
    """각도공간 원호: 중심 (cy, cp), 반지름 (ry, rp), a0..a1 (도, 0 = 아래)."""
    out = []
    for i in range(n):
        a = (a0 + (a1 - a0) * i / (n - 1)) * D2R
        out.append((cy + ry * math.sin(a), cp - rp * math.cos(a)))
    return out


class Face:
    """눈·볼·입 붙이기. M: dict(eye, hi, blush, mouth, tongue)."""

    def __init__(self, b, ell, M):
        self.b, self.e, self.M = b, ell, M

    def eyes(self, yaw=24, pitch=0, w=0.15, h=0.2, style='oval', spin=0):
        b, e, M = self.b, self.e, self.M
        for s in (-1, 1):
            if style == 'oval':
                on(b, e, 'sphere', M['eye'], s * yaw, pitch, (w, h, 0.08), out=-0.005, spin=-s * spin, seg=20, rings=10)
                on(b, e, 'sphere', M['hi'], s * yaw - 5.5 * w / 0.15, pitch + 4.5 * h / 0.2,
                   (w * 0.42, w * 0.42, 0.03), out=0.035, seg=12, rings=6)
                on(b, e, 'sphere', M['hi'], s * yaw + 3.2 * w / 0.15, pitch - 4.5 * h / 0.2,
                   (w * 0.2, w * 0.2, 0.02), out=0.03, seg=8, rings=4)
            elif style == 'happy':  # ^ ^
                arc(b, e, M['eye'], arc_pts(s * yaw, pitch - 3, 7, 6, 100, 260), 0.028)
            elif style == 'hurt':  # > <
                k = -s  # 왼쪽 눈 '>' 오른쪽 눈 '<'
                tip = (s * yaw + k * 5, pitch)
                arc(b, e, M['eye'], [(s * yaw - k * 6, pitch + 7), tip, (s * yaw - k * 6, pitch - 7)], 0.03)
            elif style == 'dot':
                on(b, e, 'sphere', M['eye'], s * yaw, pitch, (w, w, 0.06), out=0, seg=12, rings=6)

    def blush(self, yaw=44, pitch=-16, w=0.16, h=0.09):
        for s in (-1, 1):
            on(self.b, self.e, 'sphere', self.M['blush'], s * yaw, pitch, (w, h, 0.03), out=0.0, seg=14, rings=6)

    def mouth(self, style='smile', yaw=0, pitch=-18, size=1.0, r=0.022, ell=None):
        b, M = self.b, self.M
        e = ell or self.e
        if style == 'smile':
            arc(b, e, M['mouth'], arc_pts(yaw, pitch + 4 * size, 9 * size, 6 * size, -70, 70), r)
        elif style == 'w':
            arc(b, e, M['mouth'], arc_pts(yaw - 4.5 * size, pitch + 3 * size, 4.5 * size, 4 * size, -90, 80), r)
            arc(b, e, M['mouth'], arc_pts(yaw + 4.5 * size, pitch + 3 * size, 4.5 * size, 4 * size, -80, 90), r)
        elif style == 'open':
            on(b, e, 'sphere', M['mouth'], yaw, pitch, (0.13 * size, 0.1 * size, 0.04), out=0.0, seg=14, rings=6)
            on(b, e, 'sphere', M['tongue'], yaw, pitch - 2.4 * size, (0.08 * size, 0.045 * size, 0.03),
               out=0.012, seg=12, rings=6)
        elif style == 'wavy':
            pts = [(yaw - 9 * size + i * 3 * size, pitch + (1.5 if i % 2 else -1.5) * size) for i in range(7)]
            arc(b, e, M['mouth'], pts, r)


def face_mats(prefix=''):
    return dict(eye=toon('Eye', INK, rough=0.25), hi=emissive('EyeHi', '#ffffff', 1.0),
                blush=toon('Blush', BLUSH, rough=0.6), mouth=toon('Mouth', '#3a2440', rough=0.5),
                tongue=toon('Tongue', '#ff7d8f', rough=0.5))


def sweep(b, m, pts, radii, seg=14, sub=5, caps=True, smooth=True):
    """점들을 부드럽게 잇는 굵기 변하는 관 하나(꼬리, 촉수). Catmull-Rom + 평행 이동 프레임."""
    import bmesh
    P = [Vector(p) for p in pts]
    R = list(radii) if not isinstance(radii, (int, float)) else [radii] * len(P)
    n = len(P)
    Q, RR = [], []
    for i in range(n - 1):
        p0, p1, p2, p3 = P[max(i - 1, 0)], P[i], P[i + 1], P[min(i + 2, n - 1)]
        for k in range(sub):
            t = k / sub; t2 = t * t; t3 = t2 * t
            Q.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
                            (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
            RR.append(R[i] + (R[i + 1] - R[i]) * t)
    Q.append(P[-1]); RR.append(R[-1])
    bm = b.bm
    mi = b._mi(m)
    T0 = (Q[1] - Q[0]).normalized()
    ref = Vector((0, 0, 1)) if abs(T0.z) < 0.9 else Vector((1, 0, 0))
    N = (ref - T0 * ref.dot(T0)).normalized()
    rings = []
    tans = []
    for j, p in enumerate(Q):
        if j == 0:
            T = (Q[1] - Q[0]).normalized()
        elif j == len(Q) - 1:
            T = (Q[-1] - Q[-2]).normalized()
        else:
            T = (Q[j + 1] - Q[j - 1]).normalized()
        N = (N - T * N.dot(T)).normalized()
        Bv = T.cross(N)
        rings.append([bm.verts.new(p + (N * math.cos(2 * PI * k / seg) + Bv * math.sin(2 * PI * k / seg)) * RR[j])
                      for k in range(seg)])
        tans.append((T, N, Bv))
    faces = []
    for j in range(len(rings) - 1):
        for k in range(seg):
            faces.append(bm.faces.new((rings[j][k], rings[j][(k + 1) % seg], rings[j + 1][(k + 1) % seg],
                                       rings[j + 1][k])))
    if caps:
        for end, sign in ((0, -1), (len(Q) - 1, 1)):
            T, N, Bv = tans[end]
            T = T * sign
            prev = rings[end]
            r = RR[end]
            for i in (1, 2, 3):
                a = i / 4 * PI / 2
                c = Q[end] + T * r * math.sin(a)
                ring = [bm.verts.new(c + (N * math.cos(2 * PI * k / seg) + Bv * math.sin(2 * PI * k / seg)) * r * math.cos(a))
                        for k in range(seg)]
                for k in range(seg):
                    faces.append(bm.faces.new((prev[k], prev[(k + 1) % seg], ring[(k + 1) % seg], ring[k])))
                prev = ring
            tip = bm.verts.new(Q[end] + T * r)
            for k in range(seg):
                faces.append(bm.faces.new((prev[k], prev[(k + 1) % seg], tip)))
    for f in faces:
        f.material_index = mi
        f.smooth = smooth
    bmesh.ops.recalc_face_normals(bm, faces=faces)
    return b


def poly(b, m, pts, depth=0.2, mtx=None, bevel=0.03, bevel_seg=2, smooth=False):
    """2D 다각형(x, z)을 두께 depth(Y 방향)로 밀어낸 판. 앞면 = -Y. mtx 로 배치."""
    import bmesh
    tmp = bmesh.new()
    front = [tmp.verts.new((x, -depth / 2, z)) for x, z in pts]
    back = [tmp.verts.new((x, depth / 2, z)) for x, z in pts]
    n = len(pts)
    tmp.faces.new(front)
    tmp.faces.new(list(reversed(back)))
    for i in range(n):
        j = (i + 1) % n
        tmp.faces.new((front[i], back[i], back[j], front[j]))
    bmesh.ops.recalc_face_normals(tmp, faces=tmp.faces)
    if bevel > 0:
        edges = [e for e in tmp.edges if len(e.link_faces) == 2 and e.calc_face_angle(0) > 0.6]
        bmesh.ops.bevel(tmp, geom=edges, offset=bevel, offset_type='OFFSET', segments=bevel_seg, profile=0.5,
                        affect='EDGES', clamp_overlap=True)
    bmesh.ops.triangulate(tmp, faces=[f for f in tmp.faces if len(f.verts) > 4])
    if mtx is not None:
        bmesh.ops.transform(tmp, matrix=mtx, verts=tmp.verts)
    mi = b._mi(m)
    for f in tmp.faces:
        f.material_index = mi
        f.smooth = smooth
    me = bpy.data.meshes.new('tmp')
    tmp.to_mesh(me)
    tmp.free()
    b.bm.from_mesh(me)
    bpy.data.meshes.remove(me)
    return b


def outline_persp(cam, px, res_w, objs=None):
    """원근 카메라: 물체까지 거리로 두께를 정해 화면에서 px 픽셀 정도."""
    bpy.context.view_layer.update()
    fov = cam.data.angle
    cpos = cam.matrix_world.translation
    for o in (objs or bpy.context.scene.objects):
        if o.type != 'MESH' or not o.get('want_outline', False):
            continue
        c = sum((o.matrix_world @ Vector(v) for v in o.bound_box), Vector()) / 8
        d = (c - cpos).length
        world = px * 2 * d * math.tan(fov / 2) / res_w
        sc = max(o.matrix_world.to_scale())
        outline(o, world / sc * o.get('outline_mul', 1.0))


def persp_cam(loc, target, lens=40):
    cd = bpy.data.cameras.new('Cam')
    cd.lens = lens
    cd.clip_start = 0.1
    cd.clip_end = 500
    cd.sensor_fit = 'HORIZONTAL'
    o = bpy.data.objects.new('Cam', cd)
    o.location = loc
    link(o)
    look_at(o, target)
    bpy.context.scene.camera = o
    return o


def sky_world(top, bottom, ambient='#dfe9ff', strength=0.75):
    """카메라에는 위아래 그라데이션 하늘, 조명은 단색 환경광."""
    s = bpy.context.scene
    w = s.world or bpy.data.worlds.new('World')
    s.world = w
    nt = w.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new('ShaderNodeOutputWorld')
    tc = nt.nodes.new('ShaderNodeTexCoord')
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    nt.links.new(tc.outputs['Window'], sep.inputs[0])
    nt.links.new(sep.outputs['Y'], ramp.inputs['Fac'])
    ramp.color_ramp.elements[0].position = 0.0
    ramp.color_ramp.elements[0].color = (*hexcol(bottom), 1)
    ramp.color_ramp.elements[1].position = 1.0
    ramp.color_ramp.elements[1].color = (*hexcol(top), 1)
    bg_cam = nt.nodes.new('ShaderNodeBackground')
    nt.links.new(ramp.outputs['Color'], bg_cam.inputs['Color'])
    bg_cam.inputs['Strength'].default_value = 1.0
    bg_amb = nt.nodes.new('ShaderNodeBackground')
    bg_amb.inputs['Color'].default_value = (*hexcol(ambient), 1)
    bg_amb.inputs['Strength'].default_value = strength
    lp = nt.nodes.new('ShaderNodeLightPath')
    mix = nt.nodes.new('ShaderNodeMixShader')
    nt.links.new(lp.outputs['Is Camera Ray'], mix.inputs['Fac'])
    nt.links.new(bg_amb.outputs[0], mix.inputs[1])
    nt.links.new(bg_cam.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], out.inputs[0])


def star_mesh(b, m, loc, size, rot=(PI / 2, 0, 0), depth=0.35, inner=0.48, bevel=0.0):
    b.add('star', m, loc=loc, scale=(size, size, size * depth), rot=rot, smooth=False, star_inner=inner)


def font():
    return lib.default_font()
