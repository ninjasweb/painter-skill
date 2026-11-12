"""Study a painting (or one of our own renders) the way a painter squints at it.

Outputs a study sheet PNG: original | grayscale | 3-value notan | 5-value | chroma map | focal map + palette strip,
and prints metrics as JSON (value masses, key, chroma, temperature split, focal point, edge density).

usage: study.py <image> [more images...] --out <dir>
"""
import json, os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from sklearn.cluster import KMeans


def srgb_to_linear(c):
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def oklab(rgb):
    l = srgb_to_linear(rgb)
    m = l @ np.array([[0.4122214708, 0.2119034982, 0.0883024619],
                      [0.5363325363, 0.6806995451, 0.2817188376],
                      [0.0514459929, 0.1073969566, 0.6299787005]])
    m = np.cbrt(m)
    return m @ np.array([[0.2104542553, 1.9779984951, 0.0259040371],
                         [0.7936177850, -2.4285922050, 0.7827717662],
                         [-0.0040720468, 0.4505937099, -0.8086757660]])


def study(path, outdir):
    im = Image.open(path).convert("RGB")
    W = 480
    im = im.resize((W, round(im.height * W / im.width)), Image.LANCZOS)
    H = im.height
    rgb = np.asarray(im, dtype=np.float64) / 255
    lab = oklab(rgb.reshape(-1, 3)).reshape(H, W, 3)
    L = lab[..., 0]
    C = np.hypot(lab[..., 1], lab[..., 2])
    hue = np.arctan2(lab[..., 2], lab[..., 1])

    # squint: blur before massing values
    Lb = np.asarray(Image.fromarray((L * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(6)), dtype=np.float64) / 255
    km = KMeans(3, n_init=4, random_state=0).fit(Lb.reshape(-1, 1))
    order = np.argsort(km.cluster_centers_[:, 0])
    rank = np.zeros(3, int); rank[order] = [0, 1, 2]
    notan = rank[km.labels_].reshape(H, W)
    masses = [float((notan == i).mean()) for i in range(3)]
    centers = [float(km.cluster_centers_[o, 0]) for o in order]
    five = np.clip((Lb - Lb.min()) / (np.ptp(Lb) + 1e-9) * 5, 0, 4.999).astype(int)

    # palette: k-means in OKLab on a subsample
    pts = lab.reshape(-1, 3)
    sub = pts[np.random.RandomState(0).choice(len(pts), 6000, replace=False)]
    pk = KMeans(8, n_init=4, random_state=0).fit(sub)
    lbl = pk.predict(pts)
    share = np.bincount(lbl, minlength=8) / len(lbl)
    pal_rgb = np.array([rgb.reshape(-1, 3)[lbl == i].mean(0) if (lbl == i).any() else [0, 0, 0] for i in range(8)])
    idx = np.argsort(pk.cluster_centers_[:, 0])
    palette = [{"hex": "#%02x%02x%02x" % tuple((pal_rgb[i] * 255).round().astype(int)), "share": round(float(share[i]), 3),
                "L": round(float(pk.cluster_centers_[i, 0]), 2), "C": round(float(np.hypot(*pk.cluster_centers_[i, 1:])), 3)} for i in idx]

    # focal map: local value contrast * chroma boost, heavily blurred -> where the eye lands
    gy, gx = np.gradient(Lb)
    edge = np.hypot(gx, gy)
    foc = edge * (1 + 4 * C)
    focb = np.asarray(Image.fromarray(np.clip(foc / foc.max() * 255, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(22)), dtype=np.float64)
    fy, fx = np.unravel_index(focb.argmax(), focb.shape)

    # value by horizontal band (top/mid/bottom thirds), temperature of lights vs darks
    thirds = [float(L[int(H * a):int(H * b)].mean()) for a, b in ((0, 1 / 3), (1 / 3, 2 / 3), (2 / 3, 1))]
    warm = np.cos(hue - np.deg2rad(60))  # +1 = orange/yellow, -1 = blue/violet
    light, dark = L > np.percentile(L, 75), L < np.percentile(L, 25)
    wt = lambda m: float((warm[m] * C[m]).sum() / (C[m].sum() + 1e-9))
    fine = np.hypot(*np.gradient(L))
    metrics = {
        "file": os.path.basename(path),
        "value_masses_dark_mid_light": [round(m, 2) for m in masses],
        "value_centers": [round(c, 2) for c in centers],
        "key_mean_L": round(float(L.mean()), 2),
        "value_range_p2_p98": [round(float(np.percentile(L, 2)), 2), round(float(np.percentile(L, 98)), 2)],
        "L_top_mid_bottom": [round(t, 2) for t in thirds],
        "chroma_mean": round(float(C.mean()), 3), "chroma_p95": round(float(np.percentile(C, 95)), 3),
        "high_chroma_area(>0.12)": round(float((C > 0.12).mean()), 3),
        "warmth_lights": round(wt(light), 2), "warmth_darks": round(wt(dark), 2),
        "focal_xy": [round(fx / W, 2), round(fy / H, 2)],
        "edge_density": round(float(fine.mean()), 4),
        "edge_density_focal_vs_rest": round(float(fine[max(0, fy - 60):fy + 60, max(0, fx - 60):fx + 60].mean() / (fine.mean() + 1e-9)), 2),
        "palette": palette,
    }

    g = lambda a: Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8)).convert("RGB")
    tiles = [im, g(L), g(np.array(centers)[notan] if True else notan / 2), g(five / 4), g(C / 0.25), g(focb / focb.max())]
    d = ImageDraw.Draw(tiles[0])
    for k in (1, 2):
        d.line([(W * k / 3, 0), (W * k / 3, H)], fill=(255, 255, 255), width=1)
        d.line([(0, H * k / 3), (W, H * k / 3)], fill=(255, 255, 255), width=1)
    d.ellipse([fx - 9, fy - 9, fx + 9, fy + 9], outline=(255, 40, 40), width=3)
    sheet = Image.new("RGB", (W * 3, H * 2 + 46), (30, 30, 30))
    for i, t in enumerate(tiles):
        sheet.paste(t, ((i % 3) * W, (i // 3) * H))
    d = ImageDraw.Draw(sheet); x = 0
    for p in palette:
        w = max(2, round(p["share"] * W * 3))
        d.rectangle([x, H * 2 + 4, x + w, H * 2 + 46], fill=p["hex"]); x += w
    os.makedirs(outdir, exist_ok=True)
    out = os.path.join(outdir, os.path.splitext(os.path.basename(path))[0] + "_study.jpg")
    sheet.save(out, quality=88)
    metrics["sheet"] = out
    return metrics


if __name__ == "__main__":
    args = sys.argv[1:]
    outdir = "study"
    if "--out" in args:
        i = args.index("--out"); outdir = args[i + 1]; del args[i:i + 2]
    res = [study(p, outdir) for p in args]
    json.dump(res, open(os.path.join(outdir, "_metrics.json"), "w"), indent=1)
    for m in res:
        print(json.dumps({k: v for k, v in m.items() if k not in ("palette", "sheet")}))
        print("   palette:", " ".join(f"{p['hex']}({p['share']:.2f})" for p in m["palette"]))
