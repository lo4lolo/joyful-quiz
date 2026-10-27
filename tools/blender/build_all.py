# -*- coding: utf-8 -*-
"""모든 GLB 모델을 다시 만든다.
실행 (PowerShell, 48_즐거운 퀴즈 폴더에서):
  & "<blender.exe>" -b --python-exit-code 1 --python tools\\blender\\build_all.py
  (특정 모델만: ... --python tools\\blender\\build_all.py -- kart chest)
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import importlib, lib, assets
importlib.reload(lib); importlib.reload(assets)
from lib import reset, export_glb

JOBS = [
    ('kart.glb', assets.build_kart),
    ('driver.glb', assets.build_driver),
    ('itembox.glb', assets.build_itembox),
    ('gate.glb', assets.build_gate),
    ('finish.glb', assets.build_finish),
    ('banana.glb', assets.build_banana),
    ('cone.glb', assets.build_cone),
    ('tree_round.glb', assets.build_tree_round),
    ('tree_pine.glb', assets.build_tree_pine),
    ('rock.glb', assets.build_rock),
    ('cloud.glb', assets.build_cloud),
    ('chest.glb', assets.build_chest),
]

only = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
for fname, fn in JOBS:
    if only and fname[:-4] not in only:
        continue
    reset()
    fn()
    export_glb(fname)

import validate
validate.main([j[0] for j in JOBS if not only or j[0][:-4] in only])
