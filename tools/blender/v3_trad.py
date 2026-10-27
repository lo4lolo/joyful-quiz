# -*- coding: utf-8 -*-
"""v0.3 전통놀이 그림 (public/assets/trad/ + modes/tug|mugunghwa|yut).

v0.2 스티커 그림과 같은 방식(잉크 테두리 #1B2A4A, 키·채움·림 조명, 직교 카메라 자동 맞춤, PNG 다시 쓰기).
오방색(청 적 황 백 흑)을 앱 색으로 부드럽게 바꿔 씀. 무섭거나 싸우는 느낌 없이 밝고 귀엽게.

PowerShell, 48_즐거운 퀴즈 폴더에서:
  $b = "C:\\Users\\경남교육청\\blender-portable\\Blender Foundation\\Blender 5.2\\blender.exe"
  & $b -b --python-exit-code 1 --python tools\\blender\\v3_trad.py -- trad              # 전부 + 검사 + 모음 시트
  & $b -b --python-exit-code 1 --python tools\\blender\\v3_trad.py -- trad team_haechi rope   # 일부 id 만
  & $b -b --python-exit-code 1 --python tools\\blender\\v3_trad.py -- verify            # 검사 + docs/screenshots/v3-trad-sheet.png
  (build_v2.py 에서도 같음: build_v2.py -- trad [ids] / build_v2.py -- trad verify)
"""
import sys, os, json, math, random, time, importlib
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy, bmesh
import numpy as np
from mathutils import Vector, Matrix, Euler
import lib, v2lib, assets
from lib import Builder, empty, set_color, rename_materials, reset, hexcol, link
from v2lib import (Ell, Face, on, arc, arc_pts, surf_mtx, toon, emissive, face_mats, mark, sweep, poly, star_mesh,
                   studio2, sky_world, ortho_cam, fit_ortho, frame_sprite, set_outline_px, eval_points, render_png,
                   finalize_png, out_dir, png_info, contact_sheet, persp_cam, outline_persp, read_png_rgba, write_png,
                   SHOTS, INK, BLUE, LEMON, CORAL, MINT, GRAPE, BLUSH, PI, D2R)
import v2_chars
from v2_chars import ell_add, patch, axis_mtx, HEAD
from v2_icons import T, R, S

H = PI / 2
TRAD = out_dir('trad')

# 오방색 (앱 색으로 부드럽게)
CHEONG = '#3D8BFF'   # 청
JEOK = '#FF6F61'     # 적
HWANG = '#FFC83D'    # 황
BAEK = '#FFFFFF'     # 백
HEUK = '#3A4673'     # 흑 -> 잉크보다 조금 밝은 남색 (잉크 테두리와 구분)
HANJI = '#F7EEDB'    # 한지
OBANG = [CHEONG, JEOK, HWANG, BAEK, HEUK]

TEAMS = [
    # id, 이름, 팀 색 (UI 칩·글자 배경으로 쓰기 좋은 색)
    ('cheongryong', '청룡', '#3D8BFF'),
    ('baekho', '백호', '#8FA3C4'),
    ('jujak', '주작', '#FF6F61'),
    ('hyeonmu', '현무', '#3A4673'),
    ('bonghwang', '봉황', '#FFC83D'),
    ('haechi', '해치', '#2ED3A0'),
]
MAL = [('blue', '#3D8BFF'), ('red', '#FF6F61'), ('yellow', '#FFC83D'), ('green', '#2CCB7F'), ('white', '#FFFFFF'),
       ('black', '#3A4160')]


def tint(c, k):
    v = [int(c[i:i + 2], 16) for i in (1, 3, 5)]
    return '#%02X%02X%02X' % tuple(int(round(x + (255 - x) * k)) for x in v)


def shade(c, k):
    v = [int(c[i:i + 2], 16) for i in (1, 3, 5)]
    return '#%02X%02X%02X' % tuple(int(round(x * (1 - k))) for x in v)


class Part:
    """루트 empty + 잉크 테두리 메시(B) + 무늬 메시(D). 로컬 좌표로 만들고 루트로 옮김."""

    def __init__(self, name, mul=1.0):
        self.name = name
        self.root = empty(name)
        self.B = Builder(name + '_b')
        self.D = Builder(name + '_d')
        self.mul = mul

    def done(self, M=None):
        if len(self.B.bm.verts):
            mark(self.B.build(parent=self.root), self.mul)
        else:
            self.B.bm.free()
        if len(self.D.bm.verts):
            self.D.build(parent=self.root)
        else:
            self.D.bm.free()
        if M is not None:
            self.root.matrix_world = M
        return self.root


def smooth_closed(pts, sub=4):
    """닫힌 Catmull-Rom 으로 다각형을 부드럽게."""
    P = [Vector((x, z)) for x, z in pts]
    n = len(P)
    out = []
    for i in range(n):
        p0, p1, p2, p3 = P[i - 1], P[i], P[(i + 1) % n], P[(i + 2) % n]
        for k in range(sub):
            t = k / sub; t2 = t * t; t3 = t2 * t
            q = 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
            out.append((q.x, q.y))
    return out


# ====================================================================== parts
def mugung_flower(B, D, mtx, s=1.0, petal='#EE9ED8', heart='#B8327A', stamen=True, seg=20):
    """무궁화: 꽃잎 5장(살짝 오목), 붉은 단심, 하얀 꽃술 + 노란 꽃가루. 로컬 +Z 를 바라봄."""
    pm = toon('mg_petal_' + petal, petal, rough=0.5)
    hm = toon('mg_heart_' + heart, heart, rough=0.5)
    vein = toon('mg_vein_' + petal, shade(petal, 0.12), rough=0.5)
    for k in range(5):
        a = 2 * PI * k / 5 + H
        B.add('sphere', pm, mtx=mtx @ R(0, 0, a) @ T(0.42 * s, 0, 0.06 * s) @ R(0, -0.28, 0),
              scale=(0.82 * s, 0.7 * s, 0.14 * s), seg=seg, rings=max(8, seg // 2))
        # 단심: 꽃잎 밑동의 붉은 무늬 (꽃잎마다 하나, 부드럽게)
        D.add('sphere', hm, mtx=mtx @ R(0, 0, a) @ T(0.2 * s, 0, 0.1 * s) @ R(0, -0.28, 0),
              scale=(0.36 * s, 0.24 * s, 0.06 * s), seg=14, rings=7)
        if seg >= 16:
            for dv in (-0.28, 0.0, 0.28):
                D.add('sphere', vein, mtx=mtx @ R(0, 0, a + dv) @ T(0.54 * s, 0, 0.15 * s) @ R(0, -0.3, 0),
                      scale=(0.3 * s, 0.02 * s, 0.03 * s), seg=8, rings=4)
    if stamen:
        B.add('cyl', toon('mg_stamen', '#FFF6DC', rough=0.5), mtx=mtx @ T(0, 0, 0.34 * s),
              scale=(0.09 * s, 0.09 * s, 0.56 * s), seg=10)
        B.add('sphere', toon('mg_pollen', '#FFD84D', rough=0.4, emit='#FFD84D', es=0.2), mtx=mtx @ T(0, 0, 0.62 * s),
              scale=(0.22 * s, 0.22 * s, 0.2 * s), seg=12, rings=6)


def leaf(B, m, mtx, ln=0.8, w=0.42):
    B.add('sphere', m, mtx=mtx @ T(0, 0, ln / 2), scale=(w, 0.08, ln), seg=16, rings=8)


def badge(P, col, r=1.0, th=0.24, y=0.3):
    """둥근 스티커 배지 (앞 = -Y). 팀 색 테두리 + 연한 안쪽 + 흰 선 + 단청 점."""
    B, D = P.B, P.D
    face = T(0, y, 0) @ R(H, 0, 0)
    B.add('cyl', toon('bd_ring', col, rough=0.45), mtx=face, scale=(2 * r, 2 * r, th), seg=72, bevel=0.06, bevel_seg=3)
    D.add('cyl', toon('bd_in', tint(col, 0.72), rough=0.65), mtx=face @ T(0, 0, th / 2), scale=(1.6 * r, 1.6 * r, 0.03), seg=72)
    D.add('torus', toon('bd_line', '#FFFFFF', rough=0.5), mtx=face @ T(0, 0, th / 2 + 0.01), R=0.8 * r, r=0.028, seg=72, rings=6)
    dot_a = toon('bd_dot_a', '#FFFFFF', rough=0.5)
    dot_b = toon('bd_dot_b', HWANG if col not in (HWANG, '#FFC83D') else '#FFFFFF', rough=0.5)
    for k in range(16):
        a = 2 * PI * k / 16
        D.add('sphere', dot_a if k % 2 == 0 else dot_b, mtx=face @ T(0.9 * r * math.cos(a), 0.9 * r * math.sin(a), th / 2),
              scale=(0.075, 0.075, 0.05) if k % 2 == 0 else (0.05, 0.05, 0.04), seg=10, rings=5)


def body_bust(B, D, fur, c=(0, -0.14, -0.64), r=(0.5, 0.4, 0.36), belly=None):
    e = Ell(c, r)
    ell_add(B, fur, e, seg=32, rings=16)
    if belly:
        patch(D, belly, e, shift=(0, -0.07, 0.02), k=(0.66, 0.9, 0.8))
    return e


# ---------------------------------------------------------------- 6 team creatures (bust)
def cr_cheongryong(P):
    B, D = P.B, P.D
    F = face_mats()
    fur = toon('cr_fur', '#62AAFF'); light = toon('cr_light', '#A9D2FF'); belly = toon('cr_belly', '#FFF1C2')
    horn = toon('cr_horn', '#FFE14D', rough=0.3, emit='#FFC21A', es=0.3)
    mane = toon('cr_mane', '#2ED3A0')
    pearl = toon('cr_pearl', '#FFF3C8', rough=0.12, emit='#FFE680', es=0.45)
    body_bust(B, D, fur, belly=belly)
    h = Ell((0, -0.28, 0.12), (0.6, 0.52, 0.5))
    # 갈기 (머리 뒤 민트 뭉치)
    for (x, y, z, s) in ((0, -0.05, 0.55, 0.34), (-0.28, -0.02, 0.48, 0.3), (0.28, -0.02, 0.48, 0.3),
                         (-0.48, 0.0, 0.25, 0.28), (0.48, 0.0, 0.25, 0.28)):
        B.add('sphere', mane, loc=(x, y, z), scale=s, seg=16, rings=8)
    ell_add(B, fur, h)
    mz = Ell(h.c + Vector((0, -0.4, -0.16)), (0.36, 0.24, 0.22))
    ell_add(B, light, mz, seg=28, rings=14)
    for s in (-1, 1):
        on(D, mz, 'sphere', F['mouth'], s * 15, 34, (0.05, 0.035, 0.02), out=0.0, seg=8, rings=4)
        # 사슴뿔 같은 작은 뿔
        base = h.c + Vector((s * 0.24, 0.06, 0.4))
        ax = Vector((s * 0.35, 0.1, 1)).normalized()
        B.add('cone', horn, mtx=axis_mtx(base + ax * 0.16, ax), scale=(0.16, 0.16, 0.42), r2=0.05, seg=12)
        B.add('sphere', horn, loc=base + ax * 0.38, scale=0.07, seg=10, rings=5)
        br = Vector((s * 1.0, 0.0, 0.55)).normalized()
        B.add('cone', horn, mtx=axis_mtx(base + ax * 0.2 + br * 0.08, br), scale=(0.09, 0.09, 0.2), r2=0.03, seg=10)
        # 귀 지느러미
        fa = Vector((s * 1.0, 0.25, 0.45)).normalized()
        B.add('cone', light, mtx=axis_mtx(h.c + Vector((s * 0.52, 0.02, 0.1)) + fa * 0.1, fa, (0, 1, 0)),
              scale=(0.22, 0.08, 0.3), r2=0.02, seg=12)
        # 수염 (노랑, 동글게 말림)
        p0 = mz.c + Vector((s * 0.33, -0.08, 0.0))
        sweep(B, horn, [p0, p0 + Vector((s * 0.13, -0.02, -0.05)), p0 + Vector((s * 0.23, 0.0, 0.0)),
                        p0 + Vector((s * 0.24, 0.02, 0.09))], [0.024, 0.02, 0.016, 0.012], seg=8, sub=4)
    f = Face(D, h, F)
    f.eyes(26, 12, w=0.14, h=0.19)
    f.blush(50, -6, w=0.15, h=0.08)
    f.mouth('smile', pitch=-6, size=2.0, ell=mz, r=0.022)
    # 여의주 + 두 손
    B.add('sphere', pearl, loc=(0, -0.66, -0.62), scale=0.36, seg=24, rings=12)
    D.add('sphere', emissive('cr_pearl_hi', '#FFFFFF', 1.0), loc=(-0.07, -0.83, -0.53), scale=(0.09, 0.04, 0.07), seg=10, rings=5)
    for s in (-1, 1):
        B.add('sphere', fur, loc=(s * 0.2, -0.68, -0.72), scale=(0.2, 0.18, 0.17), seg=14, rings=7)


def cr_baekho(P):
    B, D = P.B, P.D
    F = face_mats()
    fur = toon('bh_fur', '#FAFBFF'); stripe = toon('bh_stripe', '#3C4560'); inner = toon('bh_inner', '#C9D6F0')
    nose = toon('bh_nose', '#FF8FA0')
    bb = body_bust(B, D, fur)
    for s in (-1, 1):
        for pt in (30, 10):
            on(D, bb, 'sphere', stripe, s * 60, pt, (0.18, 0.05, 0.025), out=0.0, spin=s * 10, seg=10, rings=6)
        B.add('sphere', fur, loc=(s * 0.28, -0.6, -0.68), scale=(0.3, 0.26, 0.2), seg=16, rings=8)  # 앞발
        for k in (-1, 0, 1):
            D.add('sphere', stripe, loc=(s * 0.28 + k * 0.07, -0.73, -0.66), scale=(0.025, 0.02, 0.06), seg=6, rings=4)
    h = Ell((0, -0.28, 0.1), (0.64, 0.56, 0.54))
    ell_add(B, fur, h)
    for s in (-1, 1):
        p = h.c + Vector((s * 0.44, 0.03, 0.38))
        B.add('sphere', fur, loc=p, scale=(0.3, 0.2, 0.3), seg=20, rings=10)
        D.add('sphere', inner, loc=p + Vector((0, -0.07, 0)), scale=(0.17, 0.08, 0.17), seg=14, rings=8)
    for yw, pt, ln in ((-12, 50, 0.2), (0, 56, 0.24), (12, 50, 0.2)):
        on(D, h, 'sphere', stripe, yw, pt, (0.06, ln, 0.025), out=0.0, seg=10, rings=6)
    for s in (-1, 1):
        for pt in (12, -4):
            on(D, h, 'sphere', stripe, s * 66, pt, (0.2, 0.05, 0.025), out=0.0, spin=s * 8, seg=10, rings=6)
    mz = Ell(h.c + Vector((0, -0.44, -0.16)), (0.25, 0.16, 0.15))
    ell_add(B, fur, mz, seg=24, rings=12)
    f = Face(D, h, F)
    f.eyes(24, 5, w=0.14, h=0.19)
    f.blush(48, -12)
    on(D, mz, 'sphere', nose, 0, 38, (0.13, 0.08, 0.08), out=0.0, seg=14, rings=8)
    f.mouth('w', pitch=-18, size=1.6, ell=mz, r=0.02)


def cr_jujak(P):
    B, D = P.B, P.D
    F = face_mats()
    fur = toon('jj_fur', '#FF7A6B'); breast = toon('jj_breast', '#FFD6BE'); beak = toon('jj_beak', '#FFC83D')
    fl1 = toon('jj_flame1', '#FFA53D', rough=0.4, emit='#FF9A2E', es=0.15)
    fl2 = toon('jj_flame2', '#FFE14D', rough=0.4, emit='#FFD84D', es=0.2)
    tip = toon('jj_tip', '#FFB34D')
    bb = body_bust(B, D, fur, c=(0, -0.12, -0.66), r=(0.5, 0.42, 0.34), belly=breast)
    # 볏 (일렁이는 불꽃 깃털 3개, 안쪽 노랑)
    fl1 = toon('jj_flame_o', '#FF8A3D', rough=0.4, emit='#FF7A2E', es=0.12)
    flames = [([(0, -0.24, 0.5), (0.06, -0.26, 0.74), (-0.05, -0.26, 0.94), (0.07, -0.24, 1.12)], [0.2, 0.17, 0.1, 0.02])]
    for s_ in (-1, 1):
        flames.append(([(s_ * 0.2, -0.22, 0.46), (s_ * 0.36, -0.22, 0.64), (s_ * 0.36, -0.22, 0.8), (s_ * 0.47, -0.2, 0.9)],
                       [0.15, 0.12, 0.07, 0.015]))
    for pts, rad in flames:
        sweep(B, fl1, pts, rad, seg=14, sub=5)
        pin = [Vector(p_) + Vector((0, -0.1, -0.02)) for p_ in pts[:-1]]
        sweep(D, fl2, pin, [r_ * 0.55 for r_ in rad[:-1]], seg=12, sub=5)
    h = Ell((0, -0.26, 0.04), (0.6, 0.55, 0.58))
    ell_add(B, fur, h)
    for s in (-1, 1):  # 들어 올린 작은 날개
        wm = Matrix.Translation((s * 0.62, -0.25, -0.5)) @ Euler((0, s * -0.7, 0)).to_matrix().to_4x4()
        B.add('sphere', fur, mtx=wm @ T(0, 0, 0.14), scale=(0.24, 0.2, 0.52), seg=16, rings=8)
        D.add('sphere', tip, mtx=wm @ T(0, -0.07, 0.3), scale=(0.16, 0.08, 0.2), seg=12, rings=6)
    p, n = h.pt(0, -14, 0.04)
    B.add('sphere', beak, mtx=axis_mtx(p, n, (0, 0, 1)), scale=(0.24, 0.14, 0.18), seg=14, rings=8)
    f = Face(D, h, F)
    f.eyes(24, 6, w=0.14, h=0.19)
    f.blush(46, -12, w=0.16, h=0.09)


def cr_hyeonmu(P):
    """현무: 등딱지 지붕 아래 거북이 + 목도리처럼 감은 아기 뱀 친구."""
    B, D = P.B, P.D
    F = face_mats()
    shell = toon('hm_shell', '#5C86C4'); hexm = toon('hm_hex', '#93B3E6'); rim = toon('hm_rim', '#F6DA8E')
    skin = toon('hm_skin', '#8EDB8A'); belly = toon('hm_belly', '#F3E7B0')
    snake = toon('hm_snake', '#FFD95E'); spot = toon('hm_spot', '#FF9F5A')
    sh = Ell((0, 0.02, -0.12), (0.86, 0.5, 0.68))
    ell_add(B, shell, sh, seg=40, rings=20)
    for yw, pt, sz in ((0, 62, 0.3), (-34, 40, 0.28), (34, 40, 0.28), (-62, 18, 0.26), (62, 18, 0.26), (-72, -12, 0.22),
                       (72, -12, 0.22)):
        on(D, sh, 'sphere', hexm, yw, pt, (sz, sz * 0.9, 0.04), out=0.0, seg=6, rings=3, smooth=False)
    ell_add(B, belly, Ell((0, -0.4, -0.66), (0.4, 0.22, 0.28)), seg=24, rings=12)
    for s in (-1, 1):  # 앞발
        B.add('sphere', skin, loc=(s * 0.42, -0.5, -0.74), scale=(0.26, 0.24, 0.18), rot=(0, 0, s * 0.3), seg=16, rings=8)
    h = Ell((0, -0.46, -0.02), (0.44, 0.4, 0.4))
    B.tube(skin, (0, -0.22, -0.45), (0, -0.42, -0.22), 0.19, seg=16)
    ell_add(B, skin, h)
    f = Face(D, h, F)
    f.eyes(26, 8, w=0.13, h=0.18)
    f.blush(50, -12, w=0.15, h=0.08)
    f.mouth('smile', pitch=-20, size=1.0)
    # 목도리처럼 감은 아기 뱀
    nc = Vector((0, -0.34, -0.42))
    B.add('torus', snake, loc=nc, scale=(1, 0.75, 1), rot=(0.25, 0, 0), R=0.24, r=0.075, seg=36, rings=12)
    for k in range(6):
        a = PI * 1.15 + k * 0.42
        D.add('sphere', spot, loc=nc + Vector((0.24 * math.cos(a), 0.18 * math.sin(a) - 0.06, -0.06 * math.sin(a))),
              scale=(0.06, 0.04, 0.045), seg=8, rings=4)
    sweep(B, snake, [nc + Vector((-0.2, -0.12, -0.02)), nc + Vector((-0.3, -0.24, -0.14)), nc + Vector((-0.26, -0.3, -0.26))],
          [0.07, 0.055, 0.03], seg=10, sub=4)
    sk = Ell(nc + Vector((0.3, -0.26, 0.06)), (0.15, 0.14, 0.12))
    B.tube(snake, nc + Vector((0.2, -0.12, 0.0)), sk.c + Vector((-0.02, 0.04, -0.02)), 0.07, seg=12)
    ell_add(B, snake, sk, seg=20, rings=10)
    for s in (-1, 1):
        on(D, sk, 'sphere', F['eye'], s * 30, 12, (0.04, 0.055, 0.03), out=0.0, seg=10, rings=5)
        on(D, sk, 'sphere', F['blush'], s * 52, -14, (0.055, 0.03, 0.02), out=0.0, seg=8, rings=4)
    arc(D, sk, F['mouth'], arc_pts(0, -14, 14, 10, -70, 70), 0.011)


def cr_bonghwang(P):
    B, D = P.B, P.D
    F = face_mats()
    fur = toon('bw_fur', '#FFD34D'); breast = toon('bw_breast', '#FFF3C4'); beak = toon('bw_beak', '#FF9B3D')
    stalk = toon('bw_stalk', '#FFB83D')
    plume = [toon('bw_p0', CHEONG), toon('bw_p1', JEOK), toon('bw_p2', '#2ED3A0'), toon('bw_p3', '#FFFFFF'),
             toon('bw_p4', GRAPE)]
    eye = toon('bw_eye', '#FFC93C')
    body_bust(B, D, fur, c=(0, -0.12, -0.66), r=(0.5, 0.42, 0.34), belly=breast)
    # 오색 깃털 부채 (머리 위, 깃털마다 노란 눈무늬)
    plume = [toon('bw_p0', '#FFFFFF'), toon('bw_p1', CHEONG), toon('bw_p2', JEOK), toon('bw_p3', '#2ED3A0'), toon('bw_p4', '#FFFFFF')]
    dot = toon('bw_dot', HEUK)
    for i, ang in enumerate((-58, -30, 0, 30, 58)):
        a = ang * D2R
        base = Vector((0, -0.08, 0.4))
        ax = Vector((math.sin(a), 0.1, math.cos(a))).normalized()
        ln = 0.62 if i == 2 else (0.56 if abs(ang) < 40 else 0.48)
        B.add('sphere', plume[i], mtx=axis_mtx(base + ax * ln * 0.62, ax), scale=(0.25, 0.1, ln), seg=18, rings=10)
        ec = base + ax * ln * 0.86 + Vector((0, -0.05, 0))
        D.add('sphere', eye, mtx=axis_mtx(ec, ax), scale=(0.13, 0.05, 0.16), seg=12, rings=6)
        D.add('sphere', dot, mtx=axis_mtx(ec + Vector((0, -0.02, 0)), ax), scale=(0.06, 0.04, 0.075), seg=10, rings=5)
    h = Ell((0, -0.25, 0.02), (0.6, 0.55, 0.58))
    ell_add(B, fur, h)
    for s in (-1, 1):
        wm = Matrix.Translation((s * 0.62, -0.25, -0.5)) @ Euler((0, s * -0.7, 0)).to_matrix().to_4x4()
        B.add('sphere', fur, mtx=wm @ T(0, 0, 0.14), scale=(0.24, 0.2, 0.52), seg=16, rings=8)
        D.add('sphere', toon('bw_wtip', JEOK), mtx=wm @ T(0, -0.07, 0.32), scale=(0.15, 0.08, 0.16), seg=12, rings=6)
    p, n = h.pt(0, -14, 0.04)
    B.add('sphere', beak, mtx=axis_mtx(p, n, (0, 0, 1)), scale=(0.24, 0.14, 0.18), seg=14, rings=8)
    f = Face(D, h, F)
    f.eyes(24, 6, w=0.14, h=0.19)
    for s in (-1, 1):  # 속눈썹
        arc(D, h, F['eye'], [(s * 33, 14), (s * 39, 18)], 0.016)
    f.blush(46, -12, w=0.16, h=0.09)


def cr_haechi(P):
    B, D = P.B, P.D
    F = face_mats()
    fur = toon('hc_fur', '#A6EFD8'); mane = toon('hc_mane', '#2FBF9B'); muz = toon('hc_muz', '#FFF6DE')
    horn = toon('hc_horn', '#FFE14D', rough=0.3, emit='#FFC21A', es=0.3)
    nose = toon('hc_nose', '#3D4259'); collar = toon('hc_collar', JEOK)
    bell = toon('hc_bell', '#FFC93C', rough=0.25, metal=0.4)
    body_bust(B, D, fur, belly=muz)
    h = Ell((0, -0.3, 0.1), (0.56, 0.5, 0.5))
    # 곱슬 갈기 (머리 뒤 둥글게)
    for k in range(14):
        a = 2 * PI * k / 14
        B.add('sphere', mane, loc=(0.66 * math.cos(a), -0.08, 0.1 + 0.62 * math.sin(a)), scale=0.36, seg=16, rings=8)
    ell_add(B, fur, h)
    for s in (-1, 1):
        B.add('sphere', fur, loc=h.c + Vector((s * 0.46, 0.05, 0.36)), scale=(0.24, 0.16, 0.22), seg=14, rings=7)
        arc(D, h, mane, arc_pts(s * 25, 25, 8, 4, 115, 245), 0.03)  # 눈썹
    p, n = h.pt(0, 58, -0.02)
    B.add('cone', horn, mtx=axis_mtx(p + n * 0.12, n), scale=(0.15, 0.15, 0.3), r2=0.04, seg=12)
    B.add('sphere', horn, loc=p + n * 0.28, scale=0.07, seg=10, rings=5)
    mz = Ell(h.c + Vector((0, -0.4, -0.17)), (0.27, 0.17, 0.16))
    ell_add(B, muz, mz, seg=24, rings=12)
    on(D, mz, 'sphere', nose, 0, 38, (0.14, 0.08, 0.08), out=0.0, seg=14, rings=8)
    f = Face(D, h, F)
    f.eyes(25, 6, w=0.14, h=0.19)
    f.blush(50, -10, w=0.15, h=0.08)
    f.mouth('w', pitch=-18, size=1.6, ell=mz, r=0.02)
    B.add('torus', collar, loc=(0, -0.16, -0.36), scale=(1, 0.8, 0.8), R=0.4, r=0.07, seg=36, rings=8)
    B.add('sphere', bell, loc=(0, -0.52, -0.48), scale=0.24, seg=18, rings=9)
    D.add('cube', toon('hc_slit', '#B07A1A'), loc=(0, -0.62, -0.53), scale=(0.12, 0.04, 0.03))


CREATURES = {'cheongryong': cr_cheongryong, 'baekho': cr_baekho, 'jujak': cr_jujak, 'hyeonmu': cr_hyeonmu,
             'bonghwang': cr_bonghwang, 'haechi': cr_haechi}


def build_team(tid):
    col = dict((t[0], t[2]) for t in TEAMS)[tid]
    P = Part('Team_' + tid)
    badge(P, col)
    CREATURES[tid](P)
    return P.done()


# ---------------------------------------------------------------- 도깨비 술래
def music_note(B, m, p, s=1.0, tilt=0.2):
    M = T(*p) @ R(0, tilt, 0)
    B.add('sphere', m, mtx=M @ R(0, 0.5, 0), scale=(0.26 * s, 0.12 * s, 0.19 * s), seg=14, rings=7)
    B.add('cyl', m, mtx=M @ T(0.1 * s, 0, 0.24 * s), scale=(0.05 * s, 0.05 * s, 0.5 * s), seg=8)
    B.add('sphere', m, mtx=M @ T(0.18 * s, 0, 0.42 * s) @ R(0, 0.9, 0), scale=(0.08 * s, 0.06 * s, 0.22 * s), seg=10, rings=5)


def build_dokkaebi(pose, M=None):
    """귀여운 꼬마 도깨비 (작은 뿔 하나, 색동 소매, 배자 조끼, 줄무늬 바지, 무궁화 꽃 방망이)."""
    P = Part('Dokkaebi_' + pose)
    B, D = P.B, P.D
    F = face_mats()
    skin = toon('dk_skin', '#FFBE8F'); hair = toon('dk_hair', '#3A3F6B')
    horn = toon('dk_horn', '#FFE14D', rough=0.3, emit='#FFC21A', es=0.25)
    vest = toon('dk_vest', CHEONG); trim = toon('dk_trim', JEOK); shorts = toon('dk_shorts', HWANG)
    stripe = toon('dk_stripe', '#C27C3E'); sleeve = toon('dk_sleeve', '#FFFFFF'); shoe = toon('dk_shoe', '#FFFFFF')
    stem = toon('dk_stem', '#5DBB5A')
    saek = [toon('dk_s0', JEOK), toon('dk_s1', HWANG), toon('dk_s2', '#2ED3A0'), toon('dk_s3', CHEONG)]
    h = Ell((0, 0, 1.22), (0.66, 0.6, 0.58))
    body = Ell((0, 0.04, 0.52), (0.4, 0.36, 0.42))
    ell_add(B, skin, h)
    ell_add(B, vest, body, seg=32, rings=16)
    B.add('sphere', shorts, loc=body.c, scale=tuple(v * 1.05 for v in body.scale()), seg=32, rings=16,
          cut=((0, 0, 0.4), (0, 0, -1), True))
    sh = Ell(body.c, tuple(v * 1.05 for v in body.r))
    for yw in (-150, -110, -70, -30, 10, 50, 90, 130, 170):
        on(D, sh, 'sphere', stripe, yw, -22, (0.06, 0.18, 0.03), out=0.0, spin=12, seg=8, rings=4)
    B.add('torus', trim, loc=(0, 0.02, 0.88), scale=(1, 0.9, 1), R=0.22, r=0.06, seg=24, rings=8)
    for s in (-1, 1):  # 고름
        D.add('sphere', trim, loc=(s * 0.06, -0.37, 0.66), scale=(0.1, 0.05, 0.08), seg=10, rings=5)
    D.add('sphere', trim, loc=(0.04, -0.38, 0.56), scale=(0.05, 0.04, 0.16), rot=(0, 0.2, 0), seg=8, rings=4)
    for s in (-1, 1):
        B.add('sphere', shoe, loc=(s * 0.19, -0.13, 0.09), scale=(0.3, 0.38, 0.2), seg=20, rings=10)
        D.add('sphere', saek[3], loc=(s * 0.19, -0.3, 0.13), scale=(0.12, 0.06, 0.06), seg=8, rings=4)
    # 귀 (뾰족하지만 작게)
    for s in (-1, 1):
        ax = Vector((s * 1.0, 0.1, 0.35)).normalized()
        B.add('cone', skin, mtx=axis_mtx(h.c + Vector((s * 0.58, 0.04, 0.02)) + ax * 0.06, ax, (0, 1, 0)),
              scale=(0.22, 0.12, 0.24), r2=0.04, seg=12)
    # 곱슬머리 (뒤통수를 덮는 머리 + 이마 위 곱슬) + 뿔 하나
    cap = Ell(h.c + Vector((0, 0.07, 0.07)), (h.r.x * 1.02, h.r.y * 0.98, h.r.z * 0.98))
    B.add('sphere', hair, loc=cap.c, scale=cap.scale(), seg=40, rings=20, cut=(tuple(cap.c + Vector((0, -0.05, 0))), (0, 1, 1.2), True))
    for yw in range(-150, 181, 30):
        pt = 40 if abs(yw) < 100 else 8
        p, n = cap.pt(yw, pt, -0.06)
        B.add('sphere', hair, loc=p, scale=0.3, seg=14, rings=7)
    for yw, pt in ((-34, 44), (-12, 50), (12, 50), (34, 44), (-52, 30), (52, 30)):
        p, n = h.pt(yw, pt, -0.04)
        B.add('sphere', hair, loc=p, scale=0.3, seg=14, rings=7)
    p, n = h.pt(0, 62, 0.02)
    B.add('cone', horn, mtx=axis_mtx(p + n * 0.18, n), scale=(0.26, 0.26, 0.44), r2=0.06, seg=14)
    B.add('sphere', horn, loc=p + n * 0.4, scale=0.1, seg=10, rings=5)
    # 귀 뒤 무궁화
    p, n = h.pt(-62, 28, 0.04)
    mugung_flower(B, D, surf_mtx(p, n), s=0.22, seg=14)
    f = Face(D, h, F)
    if pose == 'look':
        f.eyes(24, 4, w=0.17, h=0.235)
        for s in (-1, 1):
            arc(D, h, F['eye'], arc_pts(s * 24, 26, 7, 4, 115, 245), 0.02)
        f.mouth('open', pitch=-20, size=0.75)
    else:
        f.eyes(24, 2, style='happy')
        f.mouth('open', pitch=-20, size=0.7)
    f.blush(46, -14, w=0.17, h=0.09)

    def arm(s, end, finger=None):
        sh_ = Vector((s * 0.3, -0.02, 0.7))
        end = Vector(end)
        d = (end - sh_).normalized()
        B.tube(sleeve, sh_, end - d * 0.12, 0.11, seg=14, caps=False)
        B.add('sphere', sleeve, loc=sh_, scale=0.22, seg=14, rings=7)
        for k, m in enumerate(saek):  # 색동 소매 끝
            c = end - d * (0.16 + 0.07 * k)
            B.add('cyl', m, mtx=axis_mtx(c, d), scale=(0.25, 0.25, 0.07), seg=16)
        B.add('sphere', skin, loc=end, scale=0.24, seg=16, rings=8)
        if finger:
            fd = Vector(finger).normalized()
            B.tube(skin, end, end + fd * 0.2, 0.045, seg=10)

    if pose == 'look':
        arm(1, (0.52, -0.5, 0.98), finger=(0.35, -1.0, 0.25))           # 장난스럽게 가리키기
        arm(-1, (-0.6, -0.22, 0.86))                                     # 꽃 방망이
        base = Vector((-0.6, -0.22, 0.74))
        top = Vector((-0.76, -0.3, 1.72))
        B.tube(stem, base, top, 0.045, seg=10)
        mugung_flower(B, D, Matrix.Translation(top) @ R(H - 0.45, 0, 0.35), s=0.36, seg=16)
    else:
        arm(1, (0.25, -0.62, 1.2))
        arm(-1, (-0.25, -0.62, 1.2))
        base = Vector((0.3, 0.3, 0.3))
        top = Vector((0.52, 0.5, 0.86))
        B.tube(stem, base, top, 0.04, seg=10)
        mugung_flower(B, D, Matrix.Translation(top) @ R(-H - 0.3, 0, 0.5), s=0.3, seg=16)
    return P.done(M)


def build_tree(M=None, flowers=True, s=1.0):
    """둥근 나무 (무궁화가 핀 덤불 같은 꼭대기)."""
    P = Part('Tree', 0.9)
    B, D = P.B, P.D
    bark = toon('tr_bark', '#A46A43', rough=0.7)
    greens = [toon('tr_l0', '#74CF66', rough=0.6), toon('tr_l1', '#8FDC74', rough=0.6), toon('tr_l2', '#5FBF62', rough=0.6)]
    sweep(B, bark, [(0, 0, -0.05), (0.02, 0, 0.8), (-0.05, 0.02, 1.6), (0.0, 0.0, 2.2)], [0.36, 0.28, 0.24, 0.2], seg=16, sub=4)
    sweep(B, bark, [(0.0, 0, 1.3), (0.4, 0, 1.75), (0.6, 0.0, 2.05)], [0.13, 0.1, 0.08], seg=10, sub=3)
    for x, y in ((-0.34, -0.05), (0.32, 0.0), (0.0, 0.3)):  # 뿌리
        B.add('sphere', bark, loc=(x, y, 0.05), scale=(0.36, 0.3, 0.24), seg=12, rings=6)
    blobs = [((0, 0.05, 2.6), 1.05, 0), ((-0.75, 0.15, 2.25), 0.75, 1), ((0.78, 0.1, 2.3), 0.78, 2),
             ((-0.35, -0.15, 3.25), 0.72, 1), ((0.42, -0.1, 3.2), 0.7, 0), ((0.0, 0.2, 3.55), 0.55, 2)]
    for c, r, mi in blobs:
        B.add('sphere', greens[mi], loc=c, scale=r * 2, seg=28, rings=14)
    if flowers:
        rnd = random.Random(4)
        spots = []
        for c, r, mi in blobs:
            for k in range(3):
                yaw = rnd.uniform(-75, 75); pit = rnd.uniform(-20, 55)
                e = Ell(c, r)
                p, n = e.pt(yaw, pit, 0.0)
                # 다른 덩어리 속에 묻히면 건너뜀
                if any((p - Vector(c2)).length < r2 * 0.98 for c2, r2, _ in blobs if c2 != c):
                    continue
                spots.append((p, n))
        for p, n in spots[:14]:
            mugung_flower(B, D, surf_mtx(p, n, rnd.uniform(0, 70)), s=0.2, stamen=False, seg=12)
    return P.done(M)


def sulae_scene(pose):
    build_tree(T(-1.25, 0.25, 0))
    if pose == 'back':
        build_dokkaebi('back', T(0.1, -0.2, 0) @ R(0, 0, -112 * D2R))
        P = Part('Notes', 0.8)
        for (p, m, s, t) in (((-0.55, -0.4, 2.35), CHEONG, 0.8, 0.25), ((0.2, -0.45, 2.6), JEOK, 0.95, -0.15),
                             ((0.85, -0.4, 2.2), HWANG, 0.75, 0.2)):
            music_note(P.B, toon('note_' + m, m, rough=0.4), p, s, t)
        P.done()
    else:
        build_dokkaebi('look', T(0.25, -0.35, 0) @ R(0, 0, 12 * D2R))
        P = Part('Spark', 0.8)
        for (x, y, z, s) in ((1.25, -0.6, 2.05, 0.26), (1.45, -0.6, 1.6, 0.16)):
            star_mesh(P.B, emissive('Sparkle', '#FFE45C', 1.6), (x, y, z), s, rot=(H, 0, 0.3), depth=0.3, inner=0.45)
        P.done()


# ---------------------------------------------------------------- 줄 / 리본
def twisted_rope(B, mats, x0, x1, axis_fn, r_off, r_strand, pitch, nstrand=3, ppt=10, seg=10, caps=True):
    L = x1 - x0
    n = int(L / pitch * ppt) + 1
    for k in range(nstrand):
        pts = []
        for i in range(n):
            x = x0 + L * i / (n - 1)
            a = 2 * PI * x / pitch + 2 * PI * k / nstrand
            c = Vector(axis_fn(x))
            pts.append(c + Vector((0, math.cos(a) * r_off, math.sin(a) * r_off)))
        sweep(B, mats[k % len(mats)], pts, r_strand, seg=seg, sub=2, caps=caps)


def straw_mats():
    return [toon('straw0', '#EBCB8B', rough=0.75), toon('straw1', '#DDB46C', rough=0.75), toon('straw2', '#F3DBA6', rough=0.75)]


def ribbon_tail(B, m, mtx, ln=0.62, w=0.18):
    pts = [(-w / 2, 0), (w / 2, 0), (w / 2 * 1.1, -ln), (0, -ln + 0.12), (-w / 2 * 1.1, -ln)]
    poly(B, m, pts, depth=0.035, mtx=mtx, bevel=0.012, bevel_seg=1)


def build_finish_rope():
    P = Part('FinishRope')
    B, D = P.B, P.D
    half = 5.6
    zc = lambda x: 0.32 - 0.12 * (1 - (x / half) ** 2)
    twisted_rope(B, [toon('fr_w', '#FFFFFF', rough=0.6), toon('fr_r', JEOK, rough=0.55)], -half, half,
                 lambda x: (x, 0, zc(x)), 0.06, 0.075, 0.5, nstrand=2, ppt=10)
    cols = [CHEONG, JEOK, HWANG, BAEK, HEUK]
    xs = [-4.6 + 1.15 * i for i in range(9)]
    for i, x in enumerate(xs):
        col = cols[i % 5]
        m = toon('rb_' + col, col, rough=0.5)
        z = zc(x)
        B.add('sphere', m, loc=(x, -0.02, z), scale=(0.2, 0.2, 0.2), seg=14, rings=7)
        for s in (-1, 1):
            B.add('sphere', m, mtx=T(x + s * 0.13, -0.02, z) @ R(0, s * 0.25, 0), scale=(0.24, 0.1, 0.15), seg=12, rings=6)
            ribbon_tail(B, m, T(x + s * 0.04, -0.03, z - 0.04) @ R(0, s * -0.22, 0) @ R(0, 0, s * 0.25), ln=0.62 + 0.04 * (i % 2))
    for s in (-1, 1):  # 끝 매듭 + 술
        x = s * (half + 0.05)
        B.add('sphere', toon('fr_knot', JEOK, rough=0.55), loc=(x, 0, zc(x)), scale=0.26, seg=14, rings=7)
        B.add('cone', toon('fr_tassel', HWANG, rough=0.6), loc=(x, 0, zc(x) - 0.3), scale=(0.26, 0.26, 0.42), r2=0.06, seg=14)
    return P.done()


def build_tug_rope():
    P = Part('TugRope')
    twisted_rope(P.B, straw_mats(), -6.0, 6.0, lambda x: (x, 0, 0), 0.15, 0.17, 1.0, nstrand=3, ppt=12, seg=12)
    return P.done()


def build_rope_center(M=None):
    P = Part('RopeCenter')
    B, D = P.B, P.D
    blue = toon('rc_blue', CHEONG, rough=0.45); red = toon('rc_red', JEOK, rough=0.45)
    knot = toon('rc_knot', HWANG, rough=0.4)
    for s, m in ((-1, blue), (1, red)):
        # 리본 고리 (납작한 고리)
        B.add('torus', m, mtx=T(s * 0.42, 0, 0.12) @ R(H, 0, s * 0.0) @ R(0, 0, s * 0.35) @ S(1.25, 0.8, 1), R=0.3, r=0.11,
              seg=32, rings=10)
        D.add('sphere', toon('rc_in_' + str(s), shade(CHEONG if s < 0 else JEOK, 0.18), rough=0.5),
              mtx=T(s * 0.42, 0.04, 0.12) @ R(H, 0, 0) @ R(0, 0, s * 0.35), scale=(0.62, 0.36, 0.05), seg=16, rings=8)
        ribbon_tail(B, m, T(s * 0.08, 0.02, -0.08) @ R(0, -s * 0.35, 0), ln=0.75, w=0.26)
    B.add('sphere', knot, loc=(0, -0.05, 0.05), scale=(0.34, 0.26, 0.38), seg=18, rings=9)
    D.add('cube', toon('rc_knot_l', '#FFE27A'), loc=(0, -0.18, 0.05), scale=(0.24, 0.02, 0.05))
    return P.done(M)


# ---------------------------------------------------------------- 줄다리기 친구들
TUG_LEFT = ('cat', 'bear', 'frog')
TUG_RIGHT = ('bunny', 'dog', 'panda')


def headband(root, cid, col):
    hd = Ell((0, 0, 1.12), (0.76, 0.6, 0.5)) if cid == 'frog' else HEAD
    P = Part('Band_' + cid, 0.8)
    m = toon('band_' + col, col, rough=0.5)
    dz = 0.16 if cid != 'frog' else 0.05
    k = math.sqrt(max(0.05, 1 - (dz / hd.r.z) ** 2))
    P.B.add('torus', m, mtx=T(hd.c.x, hd.c.y - 0.01, hd.c.z + dz) @ R(-0.12, 0, 0) @ S(hd.r.x * k * 1.0, hd.r.y * k * 1.02, 1),
            R=1.0, r=0.062, seg=40, rings=8)
    back = Vector((0, hd.c.y + hd.r.y * k + 0.02, hd.c.z + dz + 0.04))
    for s in (-1, 1):
        P.B.add('sphere', m, mtx=T(*(back + Vector((s * 0.1, 0.02, 0)))) @ R(0, s * 0.5, 0), scale=(0.18, 0.08, 0.12), seg=12, rings=6)
        ribbon_tail(P.B, m, T(*(back + Vector((s * 0.05, 0.06, -0.02)))) @ R(0, s * 0.5, 0) @ R(-0.5, 0, 0), ln=0.36, w=0.12)
    P.done()
    P.root.parent = root
    return P.root


def puller(cid, side, x, y=0.0, lean=0.3, s=1.0, band=None, ang=55):
    """side=+1: 오른쪽(+X)으로 당김(왼팀), -1: 왼쪽(-X)으로 당김(오른팀). 줄은 손 높이에서 X 방향."""
    rz = side * ang * D2R
    # 로컬 좌표에서 줄 방향 = R_z(-rz) * (side, 0, 0)
    d = Vector((side * math.cos(rz), -side * math.sin(rz), 0))
    c = Vector((side * 0.09, -0.49, 0.62))
    front = c + d * 0.16
    back = c - d * 0.16
    if side > 0:
        arms = (tuple(back), tuple(front))   # (오른팔 s=-1, 왼팔 s=+1)
    else:
        arms = (tuple(front), tuple(back))
    v2_chars.POSE['arms'] = arms
    try:
        root = v2_chars.build_char(cid)
    finally:
        v2_chars.POSE['arms'] = None
    if band:
        headband(root, cid, band)
    M = T(x, y, 0) @ R(0, -side * lean, 0) @ R(0, 0, rz) @ S(s)
    root.matrix_world = M
    bpy.context.view_layer.update()
    return root, M @ c


def dust(P, p, s=1.0):
    m = toon('dust', '#FFFFFF', rough=0.9, emit='#FFFFFF', es=0.15)
    for (dx, dz, r) in ((0, 0, 0.2), (-0.2, 0.05, 0.15), (0.17, 0.08, 0.13), (-0.08, 0.2, 0.12)):
        P.B.add('sphere', m, loc=(p[0] + dx * s, p[1], p[2] + dz * s), scale=r * 2 * s, seg=12, rings=6)


def tug_team(side, cids, band, gap=1.2, x0=0.0, s=1.0, lean=0.3, rope_to=None, rope_from=None, puffs=True, ang=55):
    """같은 자세 3명. 반환 (줄 y, z). 줄은 rope_from..rope_to (x)."""
    hand = None
    for i, cid in enumerate(cids):
        x = x0 - side * i * gap * s
        root, hw = puller(cid, side, x, 0.0, lean, s, band, ang)
        if hand is None:
            hand = hw
        if puffs and i == len(cids) - 1:
            P = Part('Dust', 0.7)
            dust(P, (x - side * 0.5 * s, -0.25 * s, 0.12 * s), 0.9 * s)
            P.done()
    return hand


def rope_segment(x_end, x_far, y, z, s=1.0):
    """x_end: 매듭 있는 끝(뒤쪽), x_far: 화면 밖으로 이어지는 쪽."""
    P = Part('RopeSeg')
    a, b = min(x_end, x_far), max(x_end, x_far)
    twisted_rope(P.B, straw_mats(), a, b, lambda x: (x, y, z), 0.075 * s, 0.085 * s, 0.5 * s, nstrand=3, ppt=10, seg=10)
    P.B.add('sphere', toon('straw0', '#EBCB8B'), loc=(x_end, y, z), scale=0.36 * s, seg=16, rings=8)
    return P.done()


def tug_scene(side):
    cids = TUG_LEFT if side > 0 else TUG_RIGHT
    band = CHEONG if side > 0 else JEOK
    hand = tug_team(side, cids, band, gap=1.25, x0=0.0)
    chars = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    xb = -side * (2 * 1.25 + 0.8)
    rope_segment(xb, side * 4.5, hand.y, hand.z)
    return chars


# ---------------------------------------------------------------- 윷 / 윷판 / 말
YUT_L, YUT_R = 2.4, 0.33


def build_yut(kind='front', M=None):
    """윷가락: 반원기둥. 평평한 면(-Y)에 X 표시(front 3개, backdo 1개 빨강), 둥근 등(+Y)에 단청 띠."""
    P = Part('Yut_' + kind)
    B, D = P.B, P.D
    back = toon('yut_back', '#D9A066', rough=0.55)
    flat = toon('yut_flat', '#F6DCAB', rough=0.6)
    xm = toon('yut_x', '#5A3A2A', rough=0.5) if kind != 'backdo' else toon('yut_xr', JEOK, rough=0.45)
    cut_y = -0.07
    B.add('cyl', back, scale=(2 * YUT_R, 2 * YUT_R, YUT_L), seg=40, bevel=0.07, bevel_seg=3,
          cut=((0, cut_y, 0), (0, 1, 0), True))
    wf = 2 * math.sqrt(YUT_R ** 2 - cut_y ** 2) * 0.93
    D.add('cube', flat, loc=(0, cut_y - 0.006, 0), scale=(wf, 0.012, YUT_L - 0.14), bevel=0.005, bevel_seg=1)
    for zc, m in ((YUT_L / 2 - 0.26, JEOK), (YUT_L / 2 - 0.36, CHEONG), (-(YUT_L / 2 - 0.26), JEOK), (-(YUT_L / 2 - 0.36), CHEONG)):
        D.add('cyl', toon('yut_band_' + m, m, rough=0.5), loc=(0, 0, zc), scale=(2 * YUT_R + 0.012, 2 * YUT_R + 0.012, 0.06),
              seg=40, cut=((0, cut_y + 0.01, 0), (0, 1, 0), True))
    if kind == 'backdo':
        marks = [0.0]
        sz = 0.36
    else:
        marks = [-0.62, 0.0, 0.62]
        sz = 0.3
    for zc in marks:
        for a in (0.78, -0.78):
            D.add('cube', xm, mtx=T(0, cut_y - 0.014, zc) @ R(0, a, 0), scale=(sz, 0.014, 0.065), bevel=0.01, bevel_seg=1)
    if kind == 'back':
        P.done(M if M is not None else R(0, 0, PI))
    else:
        P.done(M)
    return P.root


# 윷판 정거장 29개: 0=오른쪽 아래 모서리(출발/참먹이)에서 반시계(위로) 0..19,
# 20,21 = 오른쪽 위(5) -> 가운데, 22 = 가운데, 23,24 = 가운데 -> 왼쪽 아래(15),
# 25,26 = 왼쪽 위(10) -> 가운데, 27,28 = 가운데 -> 오른쪽 아래(0)
def board_stations(G=1.0):
    st = []
    side = [1.0, 0.6, 0.2, -0.2, -0.6]
    for v in side:                       # 0..4 오른쪽 변 (아래 -> 위)
        st.append((G, -v * G))
    for v in side:                       # 5..9 위 변 (오른쪽 -> 왼쪽)
        st.append((v * G, G))
    for v in side:                       # 10..14 왼쪽 변 (위 -> 아래)
        st.append((-G, v * G))
    for v in side:                       # 15..19 아래 변 (왼쪽 -> 오른쪽)
        st.append((-v * G, -G))
    for t in (2 / 3, 1 / 3):             # 20,21
        st.append((t * G, t * G))
    st.append((0.0, 0.0))                # 22
    for t in (1 / 3, 2 / 3):             # 23,24
        st.append((-t * G, -t * G))
    for t in (2 / 3, 1 / 3):             # 25,26
        st.append((-t * G, t * G))
    for t in (1 / 3, 2 / 3):             # 27,28
        st.append((t * G, -t * G))
    return st


BIG = {0, 5, 10, 15, 22}


def build_board(M=None, G=1.0, paper_img=None):
    P = Part('Board', 0.8)
    B, D = P.B, P.D
    paper = toon('bd_paper', HANJI, rough=0.85)
    if paper_img and os.path.exists(paper_img):
        paper = paper_mat('bd_paper_tex', paper_img, 1.3)
    hw = 1.34 * G
    B.add('cube', paper, loc=(0, 0, -0.04 * G), scale=(2 * hw, 2 * hw, 0.08 * G), bevel=0.12 * G, bevel_seg=4)
    line = toon('bd_lines', '#7A8099', rough=0.6)
    z = 0.002 * G
    # 단청 테두리: 바깥/안쪽 선 + 마름모 무늬
    for r_ in (1.27, 1.15):
        for s in (-1, 1):
            D.add('cube', line, loc=(0, s * r_ * G, z), scale=(2 * r_ * G + 0.022 * G, 0.022 * G, 0.01 * G))
            D.add('cube', line, loc=(s * r_ * G, 0, z), scale=(0.022 * G, 2 * r_ * G + 0.022 * G, 0.01 * G))
    dcols = [toon('bd_d' + c, c, rough=0.5) for c in (CHEONG, JEOK, HWANG, '#2ED3A0')]
    n = 16
    for k in range(n):
        t = -1.21 + 2.42 * (k + 0.5) / n
        for j, (x, y) in enumerate(((t, 1.21), (1.21, -t), (-t, -1.21), (-1.21, t))):
            D.add('cube', dcols[(k + j) % 4], loc=(x * G, y * G, z), rot=(0, 0, PI / 4), scale=(0.075 * G, 0.075 * G, 0.012 * G))
    st = board_stations(G)
    lw = 0.032 * G
    for s in (-1, 1):
        D.add('cube', line, loc=(0, s * G, z), scale=(2 * G, lw, 0.012 * G))
        D.add('cube', line, loc=(s * G, 0, z), scale=(lw, 2 * G, 0.012 * G))
    for a in (PI / 4, -PI / 4):
        D.add('cube', line, loc=(0, 0, z), rot=(0, 0, a), scale=(2 * math.sqrt(2) * G, lw, 0.012 * G))
    stone = toon('bd_stone', '#B9C4DA', rough=0.4)
    corner_cols = {0: JEOK, 5: CHEONG, 10: '#2ED3A0', 15: HWANG}
    for i, (x, y) in enumerate(st):
        if i in BIG:
            m = toon('bd_big_%d' % i, corner_cols.get(i, '#FFFFFF'), rough=0.4)
            B.add('sphere', m, loc=(x, y, 0.0), scale=(0.27 * G, 0.27 * G, 0.12 * G), seg=28, rings=10)
            if i == 22:
                D.add('torus', toon('bd_ring', HWANG, rough=0.4), loc=(x, y, 0.035 * G), R=0.09 * G, r=0.02 * G, seg=28, rings=6)
            else:
                D.add('sphere', emissive('bd_hi', '#FFFFFF', 1.0), loc=(x - 0.05 * G, y + 0.05 * G, 0.055 * G),
                      scale=(0.06 * G, 0.06 * G, 0.012 * G), seg=10, rings=4)
        else:
            B.add('sphere', stone, loc=(x, y, 0.0), scale=(0.17 * G, 0.17 * G, 0.08 * G), seg=22, rings=8)
    return P.done(M)


def paper_mat(name, img_path, scale=1.0):
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = toon(name, HANJI, rough=0.85)
    nt = m.node_tree
    p = nt.nodes['Principled BSDF']
    img = bpy.data.images.load(img_path, check_existing=True)
    tex = nt.nodes.new('ShaderNodeTexImage')
    tex.image = img
    tex.extension = 'REPEAT'
    tc = nt.nodes.new('ShaderNodeTexCoord')
    mp = nt.nodes.new('ShaderNodeMapping')
    mp.inputs['Scale'].default_value = (scale, scale, scale)
    nt.links.new(tc.outputs['Object'], mp.inputs['Vector'])
    nt.links.new(mp.outputs['Vector'], tex.inputs['Vector'])
    nt.links.new(tex.outputs['Color'], p.inputs['Base Color'])
    return m


HORSE = [(-0.30, -0.03), (-0.35, 0.05), (-0.31, 0.13), (-0.16, 0.21), (-0.10, 0.27), (-0.09, 0.35), (-0.04, 0.37),
         (-0.01, 0.31), (0.06, 0.28), (0.15, 0.16), (0.21, -0.04), (0.24, -0.26), (-0.05, -0.26), (-0.06, -0.12),
         (-0.17, -0.08)]


def build_mal(col, M=None):
    """말: 두툼한 둥근 말판 + 위에 귀여운 말머리 돋을새김."""
    P = Part('Mal')
    B, D = P.B, P.D
    body = toon('mal_body_' + col, col, rough=0.35)
    light = col.upper() in ('#FFFFFF',)
    dark = col.upper() in ('#3A4160',)
    relief_c = '#B4C4E2' if light else ('#8F9AC0' if dark else tint(col, 0.32))
    ring_c = HWANG if light else '#FFFFFF'
    r, th = 0.5, 0.3
    B.add('cyl', body, loc=(0, 0, th / 2), scale=(2 * r, 2 * r, th), seg=56, bevel=0.1, bevel_seg=4)
    D.add('torus', toon('mal_ring_' + col, ring_c, rough=0.4), loc=(0, 0, th + 0.002), R=0.37, r=0.022, seg=48, rings=6)
    D.add('torus', toon('mal_band_' + col, shade(col, 0.12) if not light else '#DCE3F0', rough=0.4), loc=(0, 0, th * 0.5),
          R=r + 0.004, r=0.035, seg=56, rings=6)
    R2 = Part('MalRelief', 0.6)
    rel = toon('mal_relief_' + col, relief_c, rough=0.35)
    pts = smooth_closed(HORSE, 4)
    K = 1.08
    pts = [(x * K, z * K) for x, z in pts]
    poly(R2.B, rel, pts, depth=0.09, mtx=T(0.02, -0.02, th + 0.04) @ R(-H, 0, 0), bevel=0.025, bevel_seg=2, smooth=True)
    eye = toon('mal_eye', INK, rough=0.3)
    R2.D.add('sphere', eye, loc=(-0.13 * K + 0.02, 0.13 * K - 0.02, th + 0.09), scale=(0.065, 0.065, 0.03), seg=10, rings=5)
    R2.D.add('sphere', emissive('mal_eyehi', '#FFFFFF', 1.0), loc=(-0.13 * K + 0.007, 0.13 * K - 0.007, th + 0.105),
             scale=(0.022, 0.022, 0.01), seg=6, rings=3)
    R2.D.add('sphere', toon('mal_blush', BLUSH, rough=0.6), loc=(-0.24 * K + 0.02, 0.01, th + 0.09), scale=(0.07, 0.045, 0.02),
             seg=10, rings=5)
    R2.D.add('sphere', eye, loc=(-0.31 * K + 0.02, 0.06 * K - 0.02, th + 0.09), scale=(0.03, 0.025, 0.02), seg=8, rings=4)
    mane = toon('mal_mane_' + col, '#9DB0D3' if light else ('#C3CBE6' if dark else shade(col, 0.15)), rough=0.45)
    for (x, y, r_) in ((-0.05, 0.29, 0.06), (0.04, 0.26, 0.06), (0.1, 0.17, 0.06), (0.15, 0.06, 0.055), (0.18, -0.06, 0.05)):
        R2.B.add('sphere', mane, loc=(x * K + 0.03, y * K - 0.02, th + 0.075), scale=(2 * r_, 2 * r_, 0.08), seg=12, rings=6)
    R2.done()
    R2.root.parent = P.root
    return P.done(M)


# ====================================================================== 배경
def roof(B, D, cx, cy, W, Dp, ridge, eave, over=1.6, overx=1.4, lift=0.75, tile=None, ridge_m=None, sheet=None):
    """한옥 기와지붕 (처마 끝이 살짝 들림). 앞면에만 기와골."""
    bm = B.bm
    mi = B._mi(sheet)
    nu, nv = 56, 26
    hx = W / 2 + overx
    hy = Dp / 2 + over
    drop = ridge - eave

    def P_(u, v):
        au, av = abs(u), abs(v)
        x = cx + u * hx * (1 + 0.04 * av)
        y = cy + v * hy + math.copysign(0.55 * au ** 5 * av, v)
        z = ridge - drop * av ** 0.72 + lift * au ** 5 * av ** 1.5
        return Vector((x, y, z))

    top = [[bm.verts.new(P_(-1 + 2 * i / nu, -1 + 2 * j / nv)) for i in range(nu + 1)] for j in range(nv + 1)]
    th = 0.32
    bot = [[bm.verts.new(top[j][i].co - Vector((0, 0, th))) for i in range(nu + 1)] for j in range(nv + 1)]
    faces = []
    for j in range(nv):
        for i in range(nu):
            faces.append(bm.faces.new((top[j][i], top[j][i + 1], top[j + 1][i + 1], top[j + 1][i])))
            faces.append(bm.faces.new((bot[j][i], bot[j + 1][i], bot[j + 1][i + 1], bot[j][i + 1])))
    for j in range(nv):
        for i in (0, nu):
            faces.append(bm.faces.new((top[j][i], top[j + 1][i], bot[j + 1][i], bot[j][i])))
    for i in range(nu):
        for j in (0, nv):
            faces.append(bm.faces.new((top[j][i], bot[j][i], bot[j][i + 1], top[j][i + 1])))
    for f in faces:
        f.material_index = mi
        f.smooth = True
    bmesh.ops.recalc_face_normals(bm, faces=faces)
    # 기와골 (앞면)
    ncol = int(W * 2.4)
    for k in range(ncol + 1):
        u = -0.97 + 1.94 * k / ncol
        pts = [P_(u, -1 + 0.98 * t / 9) + Vector((0, 0, 0.09)) for t in range(10)]
        pts[0] = pts[0] + Vector((0, -0.04, 0))
        sweep(B, tile, pts, 0.1, seg=8, sub=3)
    # 용마루
    rp = [Vector((cx + t * (hx - 0.4), cy, ridge + 0.12 + 0.55 * abs(t) ** 6)) for t in [-1 + 2 * q / 16 for q in range(17)]]
    sweep(B, ridge_m, rp, 0.26, seg=12, sub=3)
    sweep(D, toon('hk_mortar', '#F4F1EA', rough=0.8), [p - Vector((0, 0.22, 0.2)) for p in rp[1:-1]], 0.07, seg=8, sub=3)
    return P_


def build_hanok(cx, cy, W=13.0, Dp=4.6, base_h=0.75, col_h=2.9):
    P = Part('Hanok', 0.8)
    B, D = P.B, P.D
    stone = toon('hk_stone', '#D8D1C2', rough=0.85)
    wood = toon('hk_wood', '#C9874E', rough=0.6)
    beam = toon('hk_beam', '#3FA99A', rough=0.55)
    wall = toon('hk_wall', '#FBF5E6', rough=0.8)
    lat = toon('hk_lat', '#A86B3C', rough=0.6)
    floor = toon('hk_floor', '#E2AE73', rough=0.6)
    B.add('cube', stone, loc=(cx, cy, base_h / 2), scale=(W + 1.4, Dp + 1.6, base_h), bevel=0.06, bevel_seg=2)
    for k in range(2):
        B.add('cube', stone, loc=(cx, cy - (Dp + 1.6) / 2 - 0.3 - 0.0 * k, base_h * (0.5 - 0.25 * k) / 1.0 * 1.0 - 0.0),
              scale=(2.6 + 0.6 * k, 0.6 + 0.6 * k, base_h * (1 - 0.5 * k)), bevel=0.05, bevel_seg=1)
    for k in range(6):  # 기단 돌 줄눈
        D.add('cube', toon('hk_joint', '#C3BBA9'), loc=(cx - (W + 1.4) / 2 + (W + 1.4) * (k + 0.5) / 6, cy - (Dp + 1.6) / 2 - 0.005, base_h / 2),
              scale=(0.04, 0.01, base_h * 0.8))
    yf = cy - Dp / 2
    z0 = base_h
    B.add('cube', floor, loc=(cx, yf + 0.3, z0 + 0.12), scale=(W, 1.2, 0.24), bevel=0.04, bevel_seg=1)  # 툇마루
    xs = [cx - W / 2 + W * i / 5 for i in range(6)]
    for x in xs:
        B.add('cyl', wood, loc=(x, yf - 0.05, z0 + col_h / 2), scale=(0.36, 0.36, col_h), seg=16)
        B.add('cyl', stone, loc=(x, yf - 0.05, z0 + 0.06), scale=(0.56, 0.56, 0.12), seg=16, bevel=0.03, bevel_seg=1)
    # 벽·창호 (기둥 사이)
    for i in range(5):
        x0, x1 = xs[i] + 0.2, xs[i + 1] - 0.2
        wpx = x1 - x0
        xc = (x0 + x1) / 2
        yw = yf + 0.85
        zb = z0 + 0.24
        zt = z0 + col_h
        B.add('cube', wall, loc=(xc, yw, (zb + zt) / 2), scale=(wpx + 0.4, 0.12, zt - zb))
        if i in (1, 2, 3):  # 문살 문 두 짝
            for dd in (-1, 1):
                dx = xc + dd * wpx / 4
                dwd = wpx / 2 - 0.08
                dz0, dz1 = zb + 0.15, zt - 0.35
                D.add('cube', lat, loc=(dx, yw - 0.08, (dz0 + dz1) / 2), scale=(dwd, 0.04, dz1 - dz0 + 0.06))
                D.add('cube', toon('hk_paper', '#FFFBF0', rough=0.9), loc=(dx, yw - 0.105, (dz0 + dz1) / 2),
                      scale=(dwd - 0.12, 0.02, dz1 - dz0 - 0.08))
                for q in range(1, 4):
                    D.add('cube', lat, loc=(dx - dwd / 2 + dwd * q / 4, yw - 0.12, (dz0 + dz1) / 2), scale=(0.035, 0.02, dz1 - dz0 - 0.06))
                for q in range(1, 6):
                    D.add('cube', lat, loc=(dx, yw - 0.12, dz0 + (dz1 - dz0) * q / 6), scale=(dwd - 0.1, 0.02, 0.035))
        else:  # 창 하나
            D.add('cube', lat, loc=(xc, yw - 0.08, zb + (zt - zb) * 0.55), scale=(wpx * 0.5, 0.04, (zt - zb) * 0.4))
            D.add('cube', toon('hk_paper', '#FFFBF0', rough=0.9), loc=(xc, yw - 0.105, zb + (zt - zb) * 0.55),
                  scale=(wpx * 0.5 - 0.1, 0.02, (zt - zb) * 0.4 - 0.1))
            for q in range(1, 3):
                D.add('cube', lat, loc=(xc - wpx * 0.25 + wpx * 0.5 * q / 3, yw - 0.12, zb + (zt - zb) * 0.55),
                      scale=(0.035, 0.02, (zt - zb) * 0.4 - 0.06))
    for s in (-1, 1):
        B.add('cube', wall, loc=(cx + s * W / 2, cy + 0.2, z0 + col_h / 2), scale=(0.2, Dp - 0.2, col_h))
    # 단청 들보
    zb_ = z0 + col_h + 0.18
    B.add('cube', beam, loc=(cx, yf - 0.05, zb_), scale=(W + 0.7, 0.4, 0.36), bevel=0.04, bevel_seg=1)
    B.add('cube', toon('hk_beam2', '#2E8C80', rough=0.55), loc=(cx, yf + 0.05, zb_ + 0.34), scale=(W + 1.1, 0.42, 0.3),
          bevel=0.04, bevel_seg=1)
    dancheong = [toon('dc_r', JEOK), toon('dc_y', HWANG), toon('dc_b', CHEONG), toon('dc_w', '#FFFFFF')]
    for i in range(5):
        xa, xb = xs[i], xs[i + 1]
        for t, mi in ((0.18, 0), (0.82, 0)):
            x = xa + (xb - xa) * t
            D.add('cyl', dancheong[1], mtx=T(x, yf - 0.26, zb_) @ R(H, 0, 0), scale=(0.28, 0.28, 0.02), seg=20)
            D.add('cyl', dancheong[0], mtx=T(x, yf - 0.27, zb_) @ R(H, 0, 0), scale=(0.16, 0.16, 0.02), seg=16)
        xm = (xa + xb) / 2
        D.add('cube', dancheong[3], loc=(xm, yf - 0.26, zb_), scale=((xb - xa) * 0.34, 0.02, 0.2))
        D.add('cube', dancheong[2], loc=(xm, yf - 0.27, zb_), scale=((xb - xa) * 0.3, 0.02, 0.12))
        for x in (xa, xb):
            for k, m in enumerate((dancheong[3], dancheong[0])):
                D.add('cube', m, loc=(x + (0.3 + 0.08 * k) * (1 if x == xa else -1), yf - 0.26, zb_), scale=(0.05, 0.02, 0.3))
    # 서까래
    zr = zb_ + 0.5
    n = int(W / 0.38)
    for i in range(n + 1):
        x = cx - W / 2 - 0.3 + (W + 0.6) * i / n
        B.add('cyl', toon('hk_rafter', '#3FA99A', rough=0.55), mtx=T(x, yf - 0.55, zr + 0.05) @ R(H + 0.2, 0, 0),
              scale=(0.16, 0.16, 1.3), seg=10)
        D.add('cyl', dancheong[1 if i % 2 else 0], mtx=T(x, yf - 1.2, zr + 0.19) @ R(H + 0.2, 0, 0), scale=(0.165, 0.165, 0.03), seg=10)
    ridge = zr + 2.6
    roof(B, D, cx, cy, W, Dp, ridge, zr + 0.25, over=1.65, overx=1.5, lift=0.8,
         tile=toon('hk_tile', '#5C6784', rough=0.6), ridge_m=toon('hk_ridge', '#4B5675', rough=0.6),
         sheet=toon('hk_roof', '#76819C', rough=0.7))
    # 박공 (양 끝 세모벽)
    for s in (-1, 1):
        x = cx + s * (W / 2 + 0.25)
        pts = [(-(Dp / 2 + 0.3), zb_ + 0.2), (Dp / 2 + 0.3, zb_ + 0.2), (0.0, ridge - 0.25)]
        poly(B, wall, pts, depth=0.16, mtx=T(x, cy, 0) @ R(0, 0, H), bevel=0.02)
    return P.done()


def onggi(B, m, lid, x, y, s=1.0, z0=0.3):
    import v2_modes
    prof = [(0.0, 0.0), (0.42, 0.0), (0.62, 0.25), (0.75, 0.6), (0.7, 0.95), (0.5, 1.15), (0.42, 1.22), (0.44, 1.3), (0.0, 1.3)]
    v2_modes.lathe(B, m, [(r * s, z * s) for r, z in prof], seg=36, mtx=T(x, y, z0))
    B.add('sphere', lid, loc=(x, y, z0 + 1.3 * s), scale=(0.95 * s, 0.95 * s, 0.32 * s), seg=24, rings=10,
          cut=((x, y, z0 + 1.3 * s), (0, 0, 1), True))
    B.add('sphere', lid, loc=(x, y, z0 + 1.45 * s), scale=0.16 * s, seg=10, rings=5)


def build_jangdok(x0, y0):
    P = Part('Jangdok', 0.8)
    B = P.B
    stone = toon('jd_stone', '#CFC7B5', rough=0.85)
    B.add('cube', stone, loc=(x0, y0, 0.15), scale=(4.6, 3.0, 0.3), bevel=0.08, bevel_seg=2)
    jar = toon('jd_jar', '#8E5136', rough=0.25)
    lid = toon('jd_lid', '#7A452E', rough=0.3)
    for (dx, dy, s) in ((-1.4, 0.6, 1.0), (0.0, 0.7, 1.2), (1.4, 0.55, 0.95), (-0.7, -0.6, 0.75), (0.75, -0.6, 0.8)):
        onggi(B, jar, lid, x0 + dx, y0 + dy, s)
    return P.done()


def build_wall(x0, y0, x1, y1, h=1.7):
    """담장: 흙벽 + 기와 지붕 띠 (x0,y0)->(x1,y1)."""
    P = Part('Wall', 0.8)
    B, D = P.B, P.D
    a = Vector((x0, y0, 0)); b = Vector((x1, y1, 0))
    d = (b - a); L = d.length; d.normalize()
    ang = math.atan2(d.y, d.x)
    mid = (a + b) / 2
    Mx = T(mid.x, mid.y, 0) @ R(0, 0, ang)
    B.add('cube', toon('wl_body', '#EBDDC2', rough=0.85), mtx=Mx @ T(0, 0, h / 2), scale=(L, 0.5, h))
    rnd = random.Random(int(L * 10))
    sm = toon('wl_stone', '#D4C3A2', rough=0.85)
    for i in range(int(L * 2.2)):
        D.add('sphere', sm, mtx=Mx @ T(-L / 2 + rnd.uniform(0.2, L - 0.2), -0.26, rnd.uniform(0.25, h - 0.3)),
              scale=(rnd.uniform(0.3, 0.5), 0.06, rnd.uniform(0.18, 0.3)), seg=10, rings=5)
    B.add('cube', toon('wl_cap', '#6B7592', rough=0.6), mtx=Mx @ T(0, 0, h + 0.14) @ R(0, 0, 0), scale=(L + 0.3, 1.0, 0.18),
          bevel=0.06, bevel_seg=1)
    B.add('cube', toon('wl_cap', '#6B7592', rough=0.6), mtx=Mx @ T(0, 0, h + 0.32), scale=(L + 0.1, 0.4, 0.26), bevel=0.08, bevel_seg=2)
    return P.done()


def build_big_tree(x, y, s=1.0):
    P = Part('BigTree', 0.8)
    B = P.B
    bark = toon('bt_bark', '#8E5B3A', rough=0.75)
    sweep(B, bark, [(0, 0, -0.1), (0.1, 0, 1.5), (-0.2, 0.1, 3.2), (0.0, 0.0, 4.6)], [0.85, 0.65, 0.55, 0.42], seg=18, sub=4)
    sweep(B, bark, [(0, 0, 2.6), (-1.2, 0.1, 3.6), (-2.0, 0.0, 4.4)], [0.32, 0.24, 0.18], seg=12, sub=3)
    sweep(B, bark, [(0, 0, 3.0), (1.1, -0.1, 4.0), (1.6, 0.0, 4.9)], [0.3, 0.22, 0.16], seg=12, sub=3)
    for (dx, dy) in ((-0.8, -0.1), (0.8, 0.0), (0.0, -0.7)):
        B.add('sphere', bark, loc=(dx, dy, 0.1), scale=(1.0, 0.8, 0.5), seg=14, rings=7)
    greens = [toon('bt_l0', '#6CCB63', rough=0.6), toon('bt_l1', '#86D96E', rough=0.6), toon('bt_l2', '#58B95C', rough=0.6)]
    for (c, r, mi) in (((0, 0.2, 5.6), 2.5, 0), ((-2.2, 0.3, 4.9), 1.8, 2), ((2.1, 0.0, 5.0), 1.9, 1), ((-1.0, -0.6, 6.8), 1.7, 1),
                       ((1.2, -0.4, 6.9), 1.6, 0), ((0.1, 0.3, 7.6), 1.4, 2), ((-3.0, 0.6, 6.2), 1.3, 0), ((3.1, 0.6, 6.4), 1.3, 2)):
        B.add('sphere', greens[mi], loc=c, scale=2 * r, seg=28, rings=14)
    return P.done(T(x, y, 0) @ S(s))


def bush(x, y, s=1.0, flowers=True, seed=1):
    P = Part('Bush', 0.8)
    rnd = random.Random(seed)
    g = toon('bu_g', '#62C463', rough=0.6)
    blobs = [((0, 0, 0.6), 0.75), ((-0.65, 0.1, 0.45), 0.55), ((0.65, 0.05, 0.45), 0.55)]
    for c, r in blobs:
        P.B.add('sphere', g, loc=c, scale=2 * r, seg=20, rings=10)
    if flowers:
        for c, r in blobs:
            for k in range(2):
                e = Ell(c, r)
                p, n = e.pt(rnd.uniform(-50, 50), rnd.uniform(-10, 50), 0)
                mugung_flower(P.B, P.D, surf_mtx(p, n, rnd.uniform(0, 70)), s=0.17, stamen=False, seg=10)
    return P.done(T(x, y, 0) @ S(s))


def hills():
    P = Part('Hills', 0.5)
    for (x, y, sx, sz, c) in ((-26, 48, 22, 9, '#A7D7B8'), (4, 55, 30, 12, '#BCE3CB'), (30, 46, 22, 8, '#9FD1B2'),
                              (-6, 44, 16, 6, '#B2DDC0')):
        P.B.add('sphere', toon('hill_' + c, c, rough=0.9), loc=(x, y, -1), scale=(2 * sx, 8, 2 * sz), seg=40, rings=16)
    return P.done()


def scene_madang(W_=1920, H_=1080):
    import v2_modes
    studio2(W_, H_, samples=64, transparent=False, key=2.2, rim=2.2, fill=0.7)
    sky_world('#78C2FF', '#E8F7FF', '#eef4ff', 0.75)
    g = Part('Ground', 0.5)
    g.B.add('cube', toon('gr_grass', '#A3D97C', rough=0.9), loc=(0, 10, -0.2), scale=(120, 80, 0.4))
    g.B.add('cyl', toon('gr_sand', '#E8CB96', rough=0.95), loc=(0, -1.0, 0.0), scale=(34, 22, 0.06), seg=96)
    # 디딤돌
    for (x, y) in ((-0.6, 1.9), (0.5, 0.9), (-0.3, -0.2)):
        g.B.add('cyl', toon('gr_step', '#C9CDD8', rough=0.8), loc=(x, y + 1.0, 0.04), scale=(1.1, 0.8, 0.1), seg=24, bevel=0.03)
    g.done()
    build_hanok(-1.0, 8.4)
    build_wall(-12.0, 10.5, -6.0, 10.5)
    build_wall(4.4, 11.2, 13.0, 11.2)
    build_wall(-12.0, -2.0, -12.0, 10.5)
    build_jangdok(-8.4, 3.2)
    build_big_tree(8.6, 3.4, 1.0)
    for (x, y, s, sd) in ((-10.6, 6.6, 1.0, 1), (5.4, 9.6, 0.9, 2), (11.4, 7.6, 1.0, 3), (-5.8, 9.9, 0.8, 4)):
        bush(x, y, s, True, sd)
    hl = hills()
    for x, y, z, s in ((-16, 40, 13, 1.6), (9, 44, 16, 1.8), (24, 38, 11, 1.2)):
        c = assets.build_cloud()
        v2_modes.place(c, (x, y, z), 0, s)
        v2_modes.mark_tree(c, 0.5)
        for o in c.children:
            o.visible_shadow = False
    for o in hl.children:
        o.visible_shadow = False
    cam = persp_cam((0.0, -15.5, 4.3), (0.0, 3.0, 3.0), lens=29)
    outline_persp(cam, 3.6, W_)
    return cam


# ====================================================================== 한지 텍스처 (numpy)
def make_hanji(path, n=512, seed=11):
    rng = np.random.default_rng(seed)
    fy = np.fft.fftfreq(n)[:, None]; fx = np.fft.fftfreq(n)[None, :]
    f = np.sqrt(fx ** 2 + fy ** 2); f[0, 0] = 1

    def fnoise(p):
        F = np.fft.fft2(rng.standard_normal((n, n))) / f ** p
        F[0, 0] = 0
        r = np.real(np.fft.ifft2(F))
        return (r - r.mean()) / r.std()

    cloud = 0.65 * fnoise(1.3) + 0.35 * fnoise(0.7)
    fib = np.zeros((n, n), np.float32)
    for k in range(420):
        x, y = rng.uniform(0, n, 2)
        a = rng.uniform(0, 2 * PI)
        L = rng.uniform(14, 60)
        curv = rng.uniform(-0.04, 0.04)
        val = rng.choice([1.0, 1.0, -0.6]) * rng.uniform(0.5, 1.0)
        steps = int(L * 2)
        for t in range(steps):
            a += curv * 0.5
            x += math.cos(a) * 0.5; y += math.sin(a) * 0.5
            xi, yi = int(x) % n, int(y) % n
            fib[yi, xi] += val
            fib[yi, (xi + 1) % n] += val * 0.35
    # 살짝 번지게 (주기적)
    F = np.fft.fft2(fib)
    fib = np.real(np.fft.ifft2(F * np.exp(-(f ** 2) * 14)))
    fib = fib / (np.abs(fib).max() + 1e-6)
    base = np.array([248, 242, 228], np.float32)
    lum = cloud * 2.2 + fib * 7.0
    img = base[None, None, :] + lum[..., None] * np.array([1.0, 1.0, 1.05])[None, None, :]
    img = np.clip(img, 0, 255).astype(np.uint8)
    rgba = np.concatenate([img, np.full((n, n, 1), 255, np.uint8)], axis=2)
    tmp = path + '.png'
    write_png(tmp, rgba)
    png_to_jpeg(tmp, path, 88)
    os.remove(tmp)
    return path


def png_to_jpeg(src, dst, quality=85):
    s = bpy.context.scene
    img = bpy.data.images.load(src, check_existing=False)
    st = s.render.image_settings
    old = (st.file_format, st.color_mode, st.quality)
    st.file_format = 'JPEG'; st.color_mode = 'RGB'; st.quality = quality
    try:
        s.view_settings.view_transform = 'Standard'
    except Exception:
        pass
    img.save_render(dst, scene=s)
    bpy.data.images.remove(img)
    st.file_format = old[0]
    return os.path.getsize(dst)


# ====================================================================== 게임 상자 표지
def cover_tug():
    import v2_modes as vm
    vm.stage('#FF6F91', '#FFE6EE', ambient='#fff0f4')
    vm.sunburst((0, 4.5, 2.3), r=13, color='#FF9DB5', strength=1.0)
    vm.island('#93DD78', r=8.2)
    g = Part('Line', 0.6)
    g.B.add('cube', toon('mid_line', '#FFFFFF', rough=0.6), loc=(0, 0.0, 0.03), scale=(0.16, 5.5, 0.04))
    g.done()
    s = 0.95
    hl = tug_team(1, ('cat', 'bear'), CHEONG, gap=1.25, x0=-1.25, s=s, lean=0.3, puffs=True, ang=48)
    hr = tug_team(-1, ('dog', 'panda'), JEOK, gap=1.25, x0=1.25, s=s, lean=0.3, puffs=True, ang=48)
    z = (hl.z + hr.z) / 2
    y = (hl.y + hr.y) / 2
    P = Part('Rope')
    twisted_rope(P.B, straw_mats(), -4.4, 4.4, lambda x: (x, y, z), 0.075, 0.085, 0.5, nstrand=3, ppt=10, seg=10)
    for xe in (-4.4, 4.4):
        P.B.add('sphere', toon('straw0', '#EBCB8B'), loc=(xe, y, z), scale=0.34, seg=16, rings=8)
    P.done()
    build_rope_center(T(0, y - 0.05, z + 0.02) @ S(0.62))
    vm.sparkles([(-0.4, -0.5, 2.6, 0.26), (0.6, -0.5, 2.9, 0.2), (2.3, -0.5, 2.6, 0.16)])
    for x, yy, sc, leaf in ((-5.6, 3.0, 0.6, '#7FDC63'), (5.4, 3.4, 0.6, '#FF9FC4'), (-3.6, 5.6, 0.5, '#66D6A0')):
        vm.tree((x, yy, 0), sc, leaf)
    vm.clouds([(-8, 16, 5.0, 0.8), (8, 17, 6.0, 0.9)])
    cam = persp_cam((0.0, -8.6, 3.2), (0.0, 0.3, 1.0), lens=36)
    vm.finish_scene('tug', cam)


def cover_mugunghwa():
    import v2_modes as vm
    vm.stage('#C77DE0', '#FBEAFF', ambient='#f6eeff')
    vm.sunburst((0, 6.0, 2.6), r=14, color='#DDA4EE', strength=1.0)
    vm.island('#F2DDB2', r=8.4, side='#D8BC8A')
    gr = Part('Grass', 0.6)
    gr.B.add('cyl', toon('cv_grass', '#9BDB78', rough=0.8), loc=(0, 4.2, 0.0), scale=(15, 6, 0.1), seg=64)
    gr.done()
    build_tree(T(-2.9, 2.9, 0) @ R(0, 0, 0.2) @ S(1.3))
    build_dokkaebi('back', T(-1.45, 2.0, 0) @ R(0, 0, -112 * D2R) @ S(1.3))
    Pn = Part('Notes', 0.8)
    for (p, m, sc, t) in (((-1.5, 1.3, 3.3), CHEONG, 0.75, 0.25), ((-0.7, 1.3, 3.0), JEOK, 0.85, -0.15),
                          ((-0.1, 1.3, 3.5), HWANG, 0.7, 0.2)):
        music_note(Pn.B, toon('note_' + m, m, rough=0.4), p, sc, t)
    Pn.done()

    def sneak(cid, loc, rz, arms, lean=0.22, s=0.9):
        v2_chars.POSE['arms'] = arms
        try:
            r = v2_chars.build_char(cid)
        finally:
            v2_chars.POSE['arms'] = None
        r.matrix_world = T(*loc) @ R(0, 0, rz) @ R(lean, 0, 0) @ R(0, 0.12, 0) @ S(s)
        return r
    # 술래 쪽(왼쪽 뒤)을 보며 살금살금: 한 팔은 앞, 한 팔은 뒤
    sneak('bunny', (0.9, -0.4, 0), -32 * D2R, ((-0.62, 0.15, 0.8), (0.42, -0.5, 1.0)))
    sneak('fox', (2.7, 0.9, 0), -38 * D2R, ((-0.12, -0.52, 1.05), (0.62, 0.12, 0.82)), lean=0.18)
    sneak('chick', (2.3, -1.7, 0), -28 * D2R, None, lean=0.16, s=0.72)
    for (x, y, sd) in ((4.6, 2.8, 5), (-4.8, 0.2, 6)):
        bush(x, y, 0.9, True, sd)
    P = Part('Petals', 0.6)
    rnd = random.Random(9)
    for k in range(7):
        x, y = rnd.uniform(-4, 4), rnd.uniform(-3, 1.5)
        mugung_flower(P.B, P.D, T(x, y, 0.06) @ R(0, 0, rnd.uniform(0, 6)), s=0.18, stamen=False, seg=10)
    P.done()
    cam = persp_cam((2.0, -8.8, 3.6), (0.0, 0.6, 1.3), lens=36)
    vm.finish_scene('mugunghwa', cam)


def cover_yut():
    import v2_modes as vm
    vm.stage('#2E9E8F', '#E2F6EF', ambient='#eefaf6')
    vm.sunburst((0, 6.0, 2.6), r=14, color='#5FC2B2', strength=1.0)
    vm.island('#93DD78', r=8.2)
    mat_ = Part('Mat', 0.6)
    straw = toon('mt_straw', '#E8C98C', rough=0.85)
    mat_.B.add('cyl', straw, loc=(0, 0.4, 0.05), scale=(7.6, 6.4, 0.1), seg=64, bevel=0.04)
    for r_ in (1.2, 2.0, 2.8, 3.5):
        mat_.D.add('torus', toon('mt_line', '#D2AE6C'), loc=(0, 0.4, 0.1), scale=(1, 6.4 / 7.6, 1), R=r_, r=0.035, seg=64, rings=4)
    mat_.done()
    G = 1.0
    sc = 1.45
    Mb = T(0, 0.6, 0.18) @ R(0, 0, 0.0) @ S(sc)
    build_board(Mb, G, paper_img=os.path.join(TRAD, 'hanji.jpg'))
    st = board_stations(G)
    for (idx, col) in ((0, '#3D8BFF'), (22, '#FF6F61'), (7, '#FFC83D'), (12, '#2CCB7F')):
        x, y = st[idx]
        p = Mb @ Vector((x, y, 0.06))
        build_mal(col, T(p.x, p.y, p.z) @ R(0, 0, -0.3) @ S(0.75))
    for (loc, rot, kind) in ((((-1.4, -0.6, 2.7)), (0.4, 0.5, 0.2), 'front'), (((-0.3, -0.9, 3.4)), (-0.3, -0.6, 1.2), 'back'),
                             (((0.9, -0.7, 2.9)), (0.2, 0.9, -0.5), 'front'), (((1.9, -0.4, 2.3)), (0.6, -0.4, 0.4), 'back')):
        build_yut(kind, T(*loc) @ R(*rot) @ (R(0, 0, PI) if kind == 'back' else Matrix.Identity(4)) @ S(0.62))
    tr = Part('Trails', 0.5)
    tm = emissive('trail', '#FFFFFF', 1.0)
    for (a, b) in (((-2.2, -0.4, 1.6), (-1.6, -0.55, 2.3)), ((2.5, -0.3, 1.5), (2.1, -0.38, 2.0)), ((-0.4, -0.8, 2.6), (-0.32, -0.88, 3.0))):
        tr.D.tube(tm, a, b, 0.03, seg=6)
    tr.done()
    vm.sparkles([(-2.3, -0.6, 3.3, 0.26), (2.4, -0.5, 3.2, 0.22), (0.4, -0.6, 4.0, 0.18)])
    vm.char('tiger', (-3.6, -1.0, 0), 0.5, 0.95, arms=('up', 'up'))
    vm.char('koala', (3.7, -0.8, 0), -0.5, 0.95, arms=('wave', 'up'))
    cam = persp_cam((0.0, -8.6, 5.4), (0.0, 0.2, 1.3), lens=36)
    vm.finish_scene('yut', cam)


# ====================================================================== 렌더 목록
def sprite(path, w, h, build, cam_dir, pad=0.06, px=4, samples=48):
    reset()
    studio2(w, h, samples=samples)
    build()
    frame_sprite(cam_dir, w, h, pad=pad, px=px)
    render_png(path)
    return finalize_png(path)


def shared_set(items, w, h, cam_dir, pad=0.06, px=5, target=(0, 0, 0.9)):
    """여러 장을 같은 카메라로 (바꿔 끼워도 위치·크기 그대로). items: [(path, build_fn)]."""
    local = []
    for path, fn in items:
        reset()
        fn()
        cam = ortho_cam(cam_dir, target)
        bpy.context.view_layer.update()
        inv = cam.matrix_world.inverted()
        local += [inv @ p for p in eval_points()]
    xs = [p.x for p in local]; ys = [p.y for p in local]
    cx, cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
    bw, bh = max(xs) - min(xs), max(ys) - min(ys)
    a = w / h
    sc = max(bw / (1 - 2 * pad), bh / (1 - 2 * pad) * a) if a >= 1 else max(bw / (1 - 2 * pad) / a, bh / (1 - 2 * pad))
    out = []
    for path, fn in items:
        reset()
        studio2(w, h, samples=48)
        fn()
        cam = ortho_cam(cam_dir, target)
        bpy.context.view_layer.update()
        cam.location = cam.matrix_world @ Vector((cx, cy, 0))
        cam.data.ortho_scale = sc
        bpy.context.view_layer.update()
        set_outline_px([o for o in bpy.context.scene.objects if o.type == 'MESH'], px, sc, max(w, h))
        render_png(path)
        out.append(finalize_png(path))
    return out


def P_(name):
    return os.path.join(TRAD, name)


def r_team(tid):
    def go():
        reset()
        studio2(256, 256, samples=48)
        build_team(tid)
        cam = ortho_cam((0, -1, 0.1), (0, 0, 0.12))
        cam.data.ortho_scale = 2.62
        bpy.context.view_layer.update()
        set_outline_px([o for o in bpy.context.scene.objects if o.type == 'MESH'], 4, 2.62, 256)
        p = P_('team_%s.png' % tid)
        render_png(p)
        print('TEAM', tid, finalize_png(p))
    return go


def r_sulae():
    shared_set([(P_('sulae_back.png'), lambda: sulae_scene('back')), (P_('sulae_look.png'), lambda: sulae_scene('look'))],
               768, 768, (0.25, -1.0, 0.22), pad=0.05, px=6, target=(0, 0, 1.4))
    print('SULAE done')


def r_mugunghwa():
    def b():
        mugung_flower_icon()
    print('MUGUNGHWA', sprite(P_('mugunghwa.png'), 256, 256, b, (0, -1, 0.3), pad=0.06, px=4))


def mugung_flower_icon():
    P = Part('Flower')
    lf = toon('mg_leaf', '#5DC463', rough=0.6)
    M0 = R(H - 0.55, 0, 0)
    for a in (-2.3, 2.5):
        leaf(P.B, lf, M0 @ T(0, 0, -0.12) @ R(0, 0, a) @ R(-H + 0.15, 0, 0), ln=0.95, w=0.5)
    P.D.add('cube', toon('mg_vein', '#3FA54C'), mtx=M0 @ T(0, 0, -0.06) @ R(0, 0, -2.3) @ R(-H + 0.15, 0, 0) @ T(0, -0.045, 0.5),
            scale=(0.025, 0.01, 0.8))
    mugung_flower(P.B, P.D, M0, s=1.0, seg=28)
    return P.done()


def r_finish_rope():
    print('FINISH_ROPE', sprite(P_('finish_rope.png'), 1024, 128, build_finish_rope, (0, -1, 0.15), pad=0.03, px=4))


def r_rope():
    reset()
    studio2(1600, 160, samples=48)
    build_tug_rope()
    cam = ortho_cam((0, -1, 0.15), (0, 0, 0))
    cam.data.ortho_scale = 10.0
    bpy.context.view_layer.update()
    set_outline_px([o for o in bpy.context.scene.objects if o.type == 'MESH'], 4, 10.0, 1600)
    p = P_('rope.png')
    render_png(p)
    print('ROPE', finalize_png(p))


def r_rope_center():
    print('ROPE_CENTER', sprite(P_('rope_center.png'), 256, 256, build_rope_center, (0, -1, 0.12), pad=0.06, px=4))


def r_tug(side):
    name = 'tug_left.png' if side > 0 else 'tug_right.png'

    def go():
        reset()
        studio2(768, 512, samples=48)
        chars = tug_scene(side)
        d = (0.42 * side, -1.0, 0.28)
        cam = ortho_cam(d, (0, 0, 0.9))
        objs = [o for o in bpy.context.scene.objects if o.type == 'MESH' and not o.name.startswith('RopeSeg')]
        sc = fit_ortho(cam, 768, 512, 0.07, objs=objs)
        # 줄이 화면 가장자리까지 이어지도록, 캐릭터 무리를 반대쪽으로 조금 밀어 둠
        bpy.context.view_layer.update()
        cam.location = cam.matrix_world @ Vector((side * sc * 0.035, 0, 0))
        bpy.context.view_layer.update()
        set_outline_px([o for o in bpy.context.scene.objects if o.type == 'MESH'], 5, sc, 768)
        p = P_(name)
        render_png(p)
        print('TUG', name, finalize_png(p))
    return go


def r_yut():
    shared_set([(P_('yut_front.png'), lambda: build_yut('front')), (P_('yut_back.png'), lambda: build_yut('back')),
                (P_('yut_backdo.png'), lambda: build_yut('backdo'))], 256, 512, (0.3, -1.0, 0.15), pad=0.06, px=4,
               target=(0, 0, 0))
    print('YUT done')


def r_board():
    reset()
    studio2(1024, 1024, samples=48, key=1.5, rim=0.6, fill=0.45, ws=0.55)
    hp = P_('hanji.jpg')
    build_board(None, 1.0, paper_img=hp if os.path.exists(hp) else None)
    cam = ortho_cam((0, -0.0001, 1.0), (0, 0, 0))
    sc = fit_ortho(cam, 1024, 1024, 0.02)
    objs = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    set_outline_px(objs, 4, sc, 1024)
    sc = fit_ortho(cam, 1024, 1024, 0.02)
    set_outline_px(objs, 4, sc, 1024)
    p = P_('yut_board.png')
    render_png(p)
    print('BOARD', finalize_png(p, q=4))  # 한지 결 때문에 용량이 커서 색 단계를 64로
    from bpy_extras.object_utils import world_to_camera_view
    s = bpy.context.scene
    st = []
    for i, (x, y) in enumerate(board_stations(1.0)):
        v = world_to_camera_view(s, cam, Vector((x, y, 0.06)))
        st.append(dict(id=i, x=round(v.x, 4), y=round(1 - v.y, 4), big=i in BIG))
    with open(P_('board_stations.tmp.json'), 'w', encoding='utf-8') as f:
        json.dump(st, f)


def r_mal(cname):
    col = dict(MAL)[cname]
    return lambda: print('MAL', cname, sprite(P_('mal_%s.png' % cname), 256, 256, lambda: build_mal(col), (0, -0.75, 1.0),
                                               pad=0.07, px=4))


def r_bg():
    reset()
    scene_madang(1920, 1080)
    s = bpy.context.scene
    tmp = P_('bg_madang.tmp.png')
    s.render.film_transparent = False
    lib.render_to(tmp, 'PNG')
    q = 85
    while True:
        n = png_to_jpeg(tmp, P_('bg_madang.jpg'), q)
        if n < 340_000 or q <= 60:
            break
        q -= 5
    os.remove(tmp)
    print('BG madang', n, 'q', q)


def r_hanji():
    reset()
    studio2(64, 64)
    make_hanji(P_('hanji.jpg'))
    print('HANJI', os.path.getsize(P_('hanji.jpg')))


def r_cover(fn, mid):
    def go():
        reset()
        random.seed(1)
        fn()
    return go


JOBS = [
    *[('team_' + t[0], r_team(t[0])) for t in TEAMS],
    ('sulae', r_sulae),
    ('mugunghwa', r_mugunghwa),
    ('finish_rope', r_finish_rope),
    ('rope', r_rope),
    ('rope_center', r_rope_center),
    ('tug_left', r_tug(1)),
    ('tug_right', r_tug(-1)),
    ('yut', r_yut),
    ('hanji', r_hanji),
    ('yut_board', r_board),
    *[('mal_' + c, r_mal(c)) for c, _ in MAL],
    ('bg_madang', r_bg),
    ('cover_tug', r_cover(cover_tug, 'tug')),
    ('cover_mugunghwa', r_cover(cover_mugunghwa, 'mugunghwa')),
    ('cover_yut', r_cover(cover_yut, 'yut')),
]

# 검사표: (상대 경로, 폭, 높이, 투명?, 최대 바이트)
FILES = [
    *[('trad/team_%s.png' % t[0], 256, 256, True, 90_000) for t in TEAMS],
    ('trad/sulae_back.png', 768, 768, True, 260_000),
    ('trad/sulae_look.png', 768, 768, True, 260_000),
    ('trad/mugunghwa.png', 256, 256, True, 70_000),
    ('trad/finish_rope.png', 1024, 128, True, 140_000),
    ('trad/rope.png', 1600, 160, True, 260_000),
    ('trad/rope_center.png', 256, 256, True, 60_000),
    ('trad/tug_left.png', 768, 512, True, 260_000),
    ('trad/tug_right.png', 768, 512, True, 260_000),
    ('trad/yut_front.png', 256, 512, True, 80_000),
    ('trad/yut_back.png', 256, 512, True, 80_000),
    ('trad/yut_backdo.png', 256, 512, True, 80_000),
    ('trad/yut_board.png', 1024, 1024, True, 700_000),
    *[('trad/mal_%s.png' % c, 256, 256, True, 60_000) for c, _ in MAL],
    ('trad/bg_madang.jpg', 1920, 1080, False, 350_000),
    ('trad/hanji.jpg', 512, 512, False, 120_000),
    ('modes/tug.png', 800, 500, True, 400_000),
    ('modes/mugunghwa.png', 800, 500, True, 400_000),
    ('modes/yut.png', 800, 500, True, 400_000),
]


def img_size(path):
    if path.endswith('.png'):
        i = png_info(path)
        return i['w'], i['h'], i['rgba'] and i['depth'] == 8
    img = bpy.data.images.load(path, check_existing=False)
    w, h = img.size
    bpy.data.images.remove(img)
    return w, h, False


def verify():
    ok = True
    total = 0
    for rel, w, h, alpha, lim in FILES:
        p = os.path.join(v2lib.ASSETS, rel)
        if not os.path.exists(p):
            print('VERIFY MISSING', rel); ok = False; continue
        iw, ih, rgba = img_size(p)
        n = os.path.getsize(p)
        total += n
        bad = []
        if (iw, ih) != (w, h):
            bad.append('size %dx%d' % (iw, ih))
        if alpha and not rgba:
            bad.append('not RGBA8')
        if n > lim:
            bad.append('big')
        print('VERIFY', rel, iw, ih, 'RGBA8' if rgba else 'RGB', n, 'OK' if not bad else 'WARN ' + ', '.join(bad))
        if bad and bad != ['big']:
            ok = False
    jp = os.path.join(TRAD, 'trad.json')
    print('VERIFY json', os.path.exists(jp))
    print('VERIFY total %.1f KB ok=%s' % (total / 1024, ok))
    return ok


def write_json():
    st_tmp = P_('board_stations.tmp.json')
    stations = None
    if os.path.exists(st_tmp):
        with open(st_tmp, encoding='utf-8') as f:
            stations = json.load(f)
    jp = os.path.join(TRAD, 'trad.json')
    old = {}
    if os.path.exists(jp):
        try:
            with open(jp, encoding='utf-8') as f:
                old = json.load(f)
        except Exception:
            old = {}
    if stations is None:
        stations = old.get('board', {}).get('stations')
    data = {
        'teams': [dict(id=i, name=n, color=c, file='team_%s.png' % i) for i, n, c in TEAMS],
        'mal': [dict(id=c, color=v, file='mal_%s.png' % c) for c, v in MAL],
        'files': [os.path.basename(r) for r, *_ in FILES if r.startswith('trad/')] + ['trad.json'],
        'modes': ['tug', 'mugunghwa', 'yut'],
        'board': {
            'file': 'yut_board.png', 'size': 1024,
            'note': '정거장 29개. x, y 는 그림 폭·높이 대비 0~1 (왼쪽 위 기준). 0 = 오른쪽 아래 모서리(출발), 반시계로 0..19 바깥 길; '
                    '20,21 = 5(오른쪽 위)->가운데, 22 = 가운데, 23,24 = 가운데->15(왼쪽 아래); '
                    '25,26 = 10(왼쪽 위)->가운데, 27,28 = 가운데->0(출발). big = 모서리·가운데(큰 돌).',
            'stations': stations,
        },
        'sulae': {'back': 'sulae_back.png', 'look': 'sulae_look.png', 'note': '두 장은 같은 카메라라 바꿔 끼워도 위치·크기가 같음'},
        'yut': {'front': 'yut_front.png', 'back': 'yut_back.png', 'backdo': 'yut_backdo.png',
                'note': 'front = 평평한 면(X 3개), back = 둥근 등, backdo = 빨간 X 하나인 백도 윷. 세 장 같은 카메라'},
        'rope': {'file': 'rope.png', 'tile': True, 'note': '가로로 이어 붙일 수 있음 (1600px 안에 꼬임 10번)'},
    }
    with open(jp, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    if os.path.exists(st_tmp):
        os.remove(st_tmp)
    print('JSON', jp)


def sheet(path=None):
    A = v2lib.ASSETS
    t = lambda n: os.path.join(TRAD, n)
    rows = [
        ('teams', [t('team_%s.png' % x[0]) for x in TEAMS], 240, 240, 6),
        ('sulae', [t('sulae_back.png'), t('sulae_look.png'), t('mugunghwa.png')], 500, 500, 3),
        ('finish', [t('finish_rope.png')], 1560, 195, 1),
        ('rope', [t('rope.png')], 1568, 157, 1),
        ('tug', [t('tug_left.png'), t('tug_right.png'), t('rope_center.png')], 500, 333, 3),
        ('yut', [t('yut_front.png'), t('yut_back.png'), t('yut_backdo.png')] + [t('mal_%s.png' % c) for c, _ in MAL],
         150, 300, 9),
        ('board', [t('yut_board.png'), t('hanji.jpg')], 760, 760, 2),
        ('bg', [t('bg_madang.jpg')], 1568, 882, 1),
        ('covers', [os.path.join(A, 'modes', m + '.png') for m in ('tug', 'mugunghwa', 'yut')], 500, 312, 3),
    ]
    os.makedirs(SHOTS, exist_ok=True)
    contact_sheet(rows, path or os.path.join(SHOTS, 'v3-trad-sheet.png'), width=1600)


def main(args):
    cmd = args[0] if args else 'trad'
    rest = args[1:]
    if cmd == 'trad' and rest and rest[0] in ('verify', 'sheet'):
        cmd, rest = rest[0], rest[1:]
    t0 = time.time()
    if cmd == 'trad':
        alias = {'sulae_back': 'sulae', 'sulae_look': 'sulae', 'yut_front': 'yut', 'yut_back': 'yut', 'yut_backdo': 'yut',
                 'tug': 'cover_tug', 'mugunghwa_cover': 'cover_mugunghwa'}
        want = {alias.get(r, r) for r in rest}
        todo = [j for j, _ in JOBS if not rest or j in want]
        for name, fn in JOBS:
            if name in todo:
                t1 = time.time()
                fn()
                print('JOB %s %.1fs' % (name, time.time() - t1))
        write_json()
        if not rest:
            verify()
            sheet()
    elif cmd == 'verify':
        write_json() if not os.path.exists(os.path.join(TRAD, 'trad.json')) else None
        verify()
        sheet()
    elif cmd == 'sheet':
        sheet()
    else:
        raise SystemExit('unknown command ' + cmd)
    print('DONE %.1fs' % (time.time() - t0))


if __name__ == '__main__':
    a = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    main(a)
