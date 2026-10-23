#!/usr/bin/env python3
"""rig_crops.py — RIG cut out of posed captures at true size and 4x, with a
luminance read of how he stands out from what is behind him (SPRINT T-107:
"RIG is hard to find on the Crown face at phone size").

    python3 -I tools/simlab/framing/rig_crops.py --boxes boxes.json --dir <captures dir>
        --pattern '{tag}{w}x{h}-c{k}-{label}.jpg' --tag branch- --out sheet.png [--json stats.json]

The boxes come from tools/simlab/framing/rig-boxes.mjs (RIG's painted
silhouette box projected through the same camera the capture used). Per frame:
the crop (RIG's box grown by one box height each side), and Rec.709 luma
statistics: inside RIG's box, and in the surrounding ring (the grown crop
minus the box). `contrast` = |mean(box) - mean(ring)| / std(ring): how many
background standard deviations RIG sits from his surroundings — a proxy for
"easy to find", not a verdict (the operator judges at true size on the phone).
Dev-only (Pillow + NumPy).
"""
import argparse
import json

import numpy as np
from PIL import Image, ImageDraw


def luma(a):
    return 0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--boxes', required=True)
    ap.add_argument('--dir', required=True)
    ap.add_argument('--pattern', default='{tag}{w}x{h}-c{k}-{label}.jpg')
    ap.add_argument('--tag', default='')
    ap.add_argument('--out', required=True)
    ap.add_argument('--json')
    a = ap.parse_args()
    B = json.load(open(a.boxes))
    w, h = B['viewport']
    cells, stats = [], []
    for b in B['boxes']:
        path = f"{a.dir}/" + a.pattern.format(tag=a.tag, w=w, h=h, k=b['k'], label=b['label'])
        try:
            img = Image.open(path).convert('RGB')
        except FileNotFoundError:
            continue
        sx = img.width / w
        x0, y0, x1, y1 = [v * sx for v in b['box']]
        bh = y1 - y0
        g = [max(0, int(x0 - bh)), max(0, int(y0 - bh)), min(img.width, int(x1 + bh)), min(img.height, int(y1 + bh))]
        crop = img.crop(g)
        arr = luma(np.asarray(crop).astype(float))
        mask = np.zeros(arr.shape, bool)
        mask[int(y0) - g[1]:int(y1) - g[1], int(x0) - g[0]:int(x1) - g[0]] = True
        inside, ring = arr[mask], arr[~mask]
        st = {'k': b['k'], 'label': b['label'], 'file': path.split('/')[-1],
              'rigBoxCss': [round(v, 1) for v in b['box']],
              'lumaRig': round(float(inside.mean()), 1) if inside.size else None,
              'lumaRing': round(float(ring.mean()), 1), 'ringStd': round(float(ring.std()), 1),
              'contrast': round(abs(float(inside.mean()) - float(ring.mean())) / max(1.0, float(ring.std())), 2) if inside.size else None}
        stats.append(st)
        big = crop.resize((crop.width * 4, crop.height * 4), Image.NEAREST)
        cell = Image.new('RGB', (crop.width + big.width + 16, max(crop.height, big.height) + 34), (20, 20, 24))
        cell.paste(crop, (4, 30))
        cell.paste(big, (crop.width + 12, 30))
        ImageDraw.Draw(cell).text((4, 4), f"c{b['k']} {b['label']}  rig L {st['lumaRig']} vs ring {st['lumaRing']} (sd {st['ringStd']})  contrast {st['contrast']}",
                                  fill=(240, 230, 200))
        cells.append(cell)
    if not cells:
        raise SystemExit('no captures matched')
    W = max(c.width for c in cells)
    sheet = Image.new('RGB', (W, sum(c.height for c in cells)), (8, 8, 10))
    y = 0
    for c in cells:
        sheet.paste(c, (0, y))
        y += c.height
    sheet.save(a.out)
    print(json.dumps(stats, indent=1))
    if a.json:
        json.dump({'tool': 'tools/simlab/framing/rig_crops.py', 'viewport': [w, h], 'stats': stats}, open(a.json, 'w'), indent=1)


if __name__ == '__main__':
    main()
