#!/usr/bin/env python3
"""readability_sheet.py — a contact sheet of every hostile, projectile and
capsule a readability capture recorded, at true size and magnified
(SPRINT T-107: tells, bullets and capsules at phone framing, DPR 2).

    python3 -I tools/simlab/framing/readability_sheet.py <sidecar.json> [<sidecar.json> ...] --out sheet.png [--json sizes.json]

Each sidecar is written by tools/playtest/phone-readability-capture.mjs
beside its screenshots: CSS-px screen boxes projected through the live
camera. For each sidecar (one framing, e.g. the phone frame and ?view=far)
the sheet shows one row per category (hostiles — telegraphing ones first —
projectiles, capsules), each crop at the capture's own device pixels and
again at 3x nearest-neighbour, labelled with what it is and its on-screen
height in CSS px. The JSON reports the median on-screen size per category
and framing: a measurable proxy for legibility, not a verdict on it — that
is the operator's call at true size on the device. Dev-only (Pillow).

--min-aspect r drops items whose projected box is narrower than r x its
height: the capture lists everything inside the screen rectangle, including
bodies on the NEXT face seen edge-on through a corner (2-3 px wide boxes,
nothing drawn there). Square-ish boxes are face-on. --min-size-frac f also drops capsules and
projectiles whose box is under f x the face-on size this frame draws on the
actor plane (the capture's boxes are 0.8 and 0.3 tiles; px per tile from the
sidecar's lens snapshot): bodies on facets deep in the scene project as
2-3 px squares there. Dropped counts are reported, never hidden. Items behind
anatomy are not detected — judge the crops.
"""
import math
import argparse
import json
import statistics

from PIL import Image, ImageDraw


WORLD_BOX = {'bullets': 0.3, 'capsules': 0.8}      # tools/playtest/phone-readability-capture.mjs boxes
ACTOR_DEPTH = 1.15                                   # CONFIG.framing.actorDepth


def px_per_tile(side, shot):
    f = shot.get('framing') or {}
    fov, depth = f.get('fovDeg'), f.get('cameraDepth')
    if not fov or not depth:
        return None
    return side['viewport']['vh'] / (2 * (depth - ACTOR_DEPTH) * math.tan(math.radians(fov) / 2))


def crops_for(side, min_aspect=0.0, dropped=None, min_size_frac=0.0):
    out = {'hostiles': [], 'bullets': [], 'capsules': []}
    dpr = side['viewport']['dpr']
    for shot in side['shots']:
        img = Image.open(shot['file']).convert('RGB')
        W, H = img.size
        for cat in out:
            items = shot.get(cat, [])
            if cat == 'hostiles':
                items = sorted(items, key=lambda h: (not h.get('telegraph'), h['kind']))
            ppt = px_per_tile(side, shot)
            floor = min_size_frac * WORLD_BOX[cat] * ppt if (min_size_frac > 0 and ppt and cat in WORLD_BOX) else 0
            kept = []
            for it in items:
                x0, y0, x1, y1 = it['box']
                if (min_aspect > 0 and (x1 - x0) < min_aspect * max(1e-6, y1 - y0)) or (y1 - y0) < floor:
                    if dropped is not None:
                        dropped[cat] = dropped.get(cat, 0) + 1
                    continue
                kept.append(it)
            for it in kept[:10]:
                x0, y0, x1, y1 = it['box']
                pad = 6
                bx = [max(0, int((x0 - pad) * dpr)), max(0, int((y0 - pad) * dpr)),
                      min(W, int((x1 + pad) * dpr)), min(H, int((y1 + pad) * dpr))]
                if bx[2] - bx[0] < 4 or bx[3] - bx[1] < 4:
                    continue
                label = it.get('kind') or it.get('type') or it.get('letter') or cat
                if cat == 'hostiles':
                    label = f"{it['kind']}:{it['state']}{' TELL' if it.get('telegraph') else ''}"
                elif cat == 'bullets':
                    label = f"{it.get('type', '?')}{' hostile' if it.get('hostile') else ''}"
                out[cat].append({'img': img.crop(bx), 'label': label, 'cssH': round(y1 - y0, 1),
                                 'cssW': round(x1 - x0, 1), 'mark': shot['mark']})
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('sidecars', nargs='+')
    ap.add_argument('--out', required=True)
    ap.add_argument('--json')
    ap.add_argument('--min-aspect', type=float, default=0.0)
    ap.add_argument('--min-size-frac', type=float, default=0.0)
    a = ap.parse_args()
    blocks, sizes = [], {}
    for path in a.sidecars:
        side = json.load(open(path))
        name = f"{side['viewport']['vw']}x{side['viewport']['vh']} dpr{side['viewport']['dpr']}" \
               f"{' touch' if side['viewport']['touch'] else ''}{' ?' + side['query'] if side['query'] else ''}"
        dropped = {}
        c = crops_for(side, a.min_aspect, dropped, a.min_size_frac)
        sizes[name] = {cat: {'n': len(v), 'medianCssH': statistics.median([x['cssH'] for x in v]) if v else None,
                             'dropped': dropped.get(cat, 0)}
                       for cat, v in c.items()}
        blocks.append((name, c))
    rows = []
    for name, c in blocks:
        for cat, items in c.items():
            if not items:
                continue
            cells = []
            for it in items[:12]:
                im = it['img']
                big = im.resize((im.width * 3, im.height * 3), Image.NEAREST)
                cell = Image.new('RGB', (im.width + big.width + 12, max(im.height, big.height) + 30), (24, 24, 28))
                cell.paste(im, (4, 26))
                cell.paste(big, (im.width + 8, 26))
                d = ImageDraw.Draw(cell)
                d.text((4, 4), f"{it['label']} {it['cssH']}px t{it['mark']}", fill=(235, 235, 235))
                cells.append(cell)
            rw = sum(x.width for x in cells) + 8 * len(cells)
            rh = max(x.height for x in cells) + 24
            row = Image.new('RGB', (rw, rh), (14, 14, 18))
            ImageDraw.Draw(row).text((6, 4), f'{name} — {cat}', fill=(255, 210, 120))
            x = 0
            for cell in cells:
                row.paste(cell, (x, 22))
                x += cell.width + 8
            rows.append(row)
    if not rows:
        raise SystemExit('nothing to draw')
    W = max(r.width for r in rows)
    sheet = Image.new('RGB', (W, sum(r.height for r in rows)), (10, 10, 12))
    y = 0
    for r in rows:
        sheet.paste(r, (0, y))
        y += r.height
    sheet.save(a.out)
    print(json.dumps(sizes, indent=1))
    if a.json:
        json.dump({'tool': 'tools/simlab/framing/readability_sheet.py', 'minAspect': a.min_aspect,
                   'minSizeFrac': a.min_size_frac, 'sizes': sizes},
                  open(a.json, 'w'), indent=1)


if __name__ == '__main__':
    main()
