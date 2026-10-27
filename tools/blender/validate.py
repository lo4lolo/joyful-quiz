# -*- coding: utf-8 -*-
"""GLB 검사: 노드, 재질, 삼각형 수, glTF 공간(+Y 위, +Z 앞) 경계상자, 파일 크기.
Blender 없이도 일반 파이썬으로 실행 가능: python validate.py [파일...]"""
import json, struct, os, sys, math

HERE = os.path.dirname(os.path.abspath(__file__))
MODELS = os.path.abspath(os.path.join(HERE, '..', '..', 'public', 'assets', 'models'))


def read_glb(path):
    with open(path, 'rb') as f:
        data = f.read()
    magic, ver, length = struct.unpack_from('<4sII', data, 0)
    assert magic == b'glTF', 'not glb'
    clen, ctype = struct.unpack_from('<II', data, 12)
    return json.loads(data[20:20 + clen].decode('utf-8'))


def qmat(t, r, s):
    x, y, z, w = r
    R = [[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
         [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
         [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]]
    M = [[R[i][j] * s[j] for j in range(3)] + [t[i]] for i in range(3)] + [[0, 0, 0, 1]]
    return M


def mul(A, B):
    return [[sum(A[i][k] * B[k][j] for k in range(4)) for j in range(4)] for i in range(4)]


def apply(M, p):
    return [sum(M[i][k] * p[k] for k in range(3)) + M[i][3] for i in range(3)]


def info(path):
    g = read_glb(path)
    nodes, meshes, acc = g.get('nodes', []), g.get('meshes', []), g.get('accessors', [])
    mats = [m.get('name') for m in g.get('materials', [])]
    tris = 0
    lo, hi = [1e9] * 3, [-1e9] * 3
    lines = []
    colors = False

    def walk(i, P, depth):
        nonlocal tris, colors
        n = nodes[i]
        L = n.get('matrix')
        if L:
            L = [[L[c * 4 + r] for c in range(4)] for r in range(4)]
        else:
            L = qmat(n.get('translation', [0, 0, 0]), n.get('rotation', [0, 0, 0, 1]), n.get('scale', [1, 1, 1]))
        W = mul(P, L)
        t = [round(W[k][3], 3) for k in range(3)]
        mt = 0
        if 'mesh' in n:
            for pr in meshes[n['mesh']]['primitives']:
                a = acc[pr['attributes']['POSITION']]
                mt += (acc[pr['indices']]['count'] if 'indices' in pr else a['count']) // 3
                colors = colors or 'COLOR_0' in pr['attributes']
                mn, mx = a['min'], a['max']
                for cx in (mn[0], mx[0]):
                    for cy in (mn[1], mx[1]):
                        for cz in (mn[2], mx[2]):
                            p = apply(W, [cx, cy, cz])
                            for k in range(3):
                                lo[k] = min(lo[k], p[k]); hi[k] = max(hi[k], p[k])
        tris += mt
        lines.append('  ' * depth + f"- {n.get('name')} t={t}" + (f" tris={mt}" if mt else ''))
        for c in n.get('children', []):
            walk(c, W, depth + 1)

    I = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]]
    for r in g['scenes'][g.get('scene', 0)]['nodes']:
        walk(r, I, 1)
    return dict(size=os.path.getsize(path), tris=tris, mats=mats, lines=lines,
                lo=[round(v, 3) for v in lo], hi=[round(v, 3) for v in hi], colors=colors)


def main(files=None):
    files = files or sorted(f for f in os.listdir(MODELS) if f.endswith('.glb'))
    total = 0
    for f in files:
        d = info(os.path.join(MODELS, f))
        total += d['size']
        print(f"=== {f}  {d['size'] / 1024:.1f} KB  tris={d['tris']}  vcol={d['colors']}")
        print(f"  materials: {d['mats']}")
        print(f"  bbox glTF min={d['lo']} max={d['hi']}")
        print('\n'.join(d['lines']))
    print(f"TOTAL {total / 1024:.1f} KB")


if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if a.endswith('.glb')]
    main(args or None)
