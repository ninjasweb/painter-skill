#!/usr/bin/env python3
"""Read a real person from a photo, for painting: pose landmarks and region masks.

Writes next to --out (default: next to the image):
  <name>.person.json  pose (33 MediaPipe landmarks, normalised 0..1 + visibility), bounding box of the person,
                      feet / head points, image size
  <name>.mask.png     RGBA masks: R = hair, G = skin (body + face), B = clothes and accessories, A = person
  <name>.masks.jpg    preview: the photo with the masks overlaid, and the skeleton

Models (downloaded once into tools/models/, Apache-2.0, Google MediaPipe):
  pose_landmarker_heavy.task, selfie_multiclass_256x256.tflite

Usage:  python tools/person.py photo.jpg [more.jpg ...] [--out dir]
"""
import argparse, json, os, sys, urllib.request
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
MODELS = {
    "pose": ("pose_landmarker_heavy.task", "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/latest/pose_landmarker_heavy.task"),
    "seg": ("selfie_multiclass_256x256.tflite", "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite"),
}
# selfie_multiclass categories: 0 background, 1 hair, 2 body-skin, 3 face-skin, 4 clothes, 5 others (accessories)
EDGES = [(11, 12), (11, 13), (13, 15), (12, 14), (14, 16), (11, 23), (12, 24), (23, 24), (23, 25), (25, 27), (24, 26), (26, 28),
         (27, 29), (29, 31), (28, 30), (30, 32), (0, 7), (0, 8)]


def model(key):
    name, url = MODELS[key]
    d = os.path.join(HERE, "models"); os.makedirs(d, exist_ok=True)
    p = os.path.join(d, name)
    if not os.path.exists(p):
        print("downloading", name, file=sys.stderr)
        req = urllib.request.Request(url, headers={"User-Agent": "painterly-video-skill/1.0"})
        with urllib.request.urlopen(req, timeout=120) as r, open(p + ".part", "wb") as f: f.write(r.read())
        os.replace(p + ".part", p)
    return p


def read(path, out_dir, horizon=None):
    import mediapipe as mp
    from mediapipe.tasks import python as mpt
    from mediapipe.tasks.python import vision
    im = Image.open(path).convert("RGB"); W, H = im.size
    mimg = mp.Image(image_format=mp.ImageFormat.SRGB, data=np.asarray(im))
    pose = vision.PoseLandmarker.create_from_options(vision.PoseLandmarkerOptions(
        base_options=mpt.BaseOptions(model_asset_path=model("pose")), output_segmentation_masks=True, num_poses=1))
    seg = vision.ImageSegmenter.create_from_options(vision.ImageSegmenterOptions(
        base_options=mpt.BaseOptions(model_asset_path=model("seg")), output_category_mask=True, output_confidence_masks=True))
    pr, sr = pose.detect(mimg), seg.segment(mimg)
    conf = [np.asarray(m.numpy_view(), dtype=np.float32).reshape(H, W) for m in sr.confidence_masks]   # each H x W, 0..1
    hair, skin, clothes = conf[1], np.maximum(conf[2], conf[3]), np.maximum(conf[4], conf[5])
    person = 1 - conf[0]
    if pr.segmentation_masks:                                   # the pose model's body mask is tighter at the feet
        person = np.maximum(person, np.asarray(pr.segmentation_masks[0].numpy_view(), dtype=np.float32).reshape(H, W))
    if pr.pose_landmarks:                                       # keep only the region connected to the body (rocks, other people out)
        from scipy import ndimage
        lab, nlab = ndimage.label(person > 0.5)
        hip = pr.pose_landmarks[0][23]; hy, hx = min(H - 1, max(0, int(hip.y * H))), min(W - 1, max(0, int(hip.x * W)))
        keep = lab[hy, hx] or (np.bincount(lab.ravel())[1:].argmax() + 1 if nlab else 0)
        body = ndimage.binary_dilation(lab == keep, iterations=max(2, W // 300))
        person = person * body; hair = hair * body; skin = skin * body; clothes = clothes * body
    rgba = np.stack([hair, skin, clothes, person], -1)
    name = os.path.splitext(os.path.basename(path))[0]
    os.makedirs(out_dir, exist_ok=True)
    Image.fromarray((np.clip(rgba, 0, 1) * 255).astype(np.uint8), "RGBA").save(os.path.join(out_dir, name + ".mask.png"))
    ys, xs = np.nonzero(person > 0.5)
    bbox = [float(xs.min() / W), float(ys.min() / H), float(xs.max() / W), float(ys.max() / H)] if len(xs) else None
    lms = [[round(l.x, 4), round(l.y, 4), round(l.z, 4), round(getattr(l, "visibility", 1.0) or 0, 3)] for l in pr.pose_landmarks[0]] if pr.pose_landmarks else None
    info = {"image": os.path.basename(path), "size": [W, H], "aspect": W / H, "bbox": bbox, "landmarks": lms,
            "hair_share": round(float((hair > 0.5).mean() / max((person > 0.5).mean(), 1e-6)), 3)}
    if lms:                                                     # ground point between the feet, top of the head
        feet = [lms[i] for i in (29, 30, 31, 32)]
        info["feet"] = [round(sum(f[0] for f in feet) / 4, 4), round(max(f[1] for f in feet), 4)]
        info["top"] = round(bbox[1], 4) if bbox else None
        # the photo's viewpoint: with a level camera the horizon crosses the middle of the frame, so the fraction of the
        # person's height at that line is the camera height relative to the person (1.0 = eye level of a standing adult
        # ~0.93; 0.5 = hip height; > 1 = from above). An estimate: check the cyan line in the .masks.jpg preview.
        hz = 0.5 if horizon is None else horizon                 # --horizon: where the real horizon is (sea line, vanishing point)
        info["horizon"] = hz; info["horizonSource"] = "given" if horizon is not None else "level-camera estimate"
        if bbox: info["eyeLine"] = round((info["feet"][1] - hz) / max(info["feet"][1] - bbox[1], 1e-6), 3)
    json.dump(info, open(os.path.join(out_dir, name + ".person.json"), "w"), indent=1)
    # preview
    pv = np.asarray(im, dtype=np.float32) / 255
    tint = np.zeros_like(pv); tint[..., 0] = hair; tint[..., 1] = skin; tint[..., 2] = clothes
    pv = np.clip(pv * 0.55 + tint * 0.45 * person[..., None], 0, 1)
    pim = Image.fromarray((pv * 255).astype(np.uint8)); d = ImageDraw.Draw(pim)
    hz = info.get("horizon", 0.5); d.line([(0, H * hz), (W, H * hz)], fill=(0, 220, 255), width=max(2, W // 400))   # horizon used for eyeLine
    if lms:
        for a, b in EDGES: d.line([(lms[a][0] * W, lms[a][1] * H), (lms[b][0] * W, lms[b][1] * H)], fill=(255, 255, 0), width=max(2, W // 300))
    pim.thumbnail((900, 900)); pim.save(os.path.join(out_dir, name + ".masks.jpg"), quality=88)
    return info


if __name__ == "__main__":
    ap = argparse.ArgumentParser(); ap.add_argument("images", nargs="+"); ap.add_argument("--out", default=None)
    ap.add_argument("--horizon", type=float, default=None, help="real horizon of the photo, 0 (top) … 1 (bottom); default: level-camera estimate 0.5")
    a = ap.parse_args()
    for p in a.images:
        info = read(p, a.out or os.path.dirname(os.path.abspath(p)), a.horizon)
        print(json.dumps({k: info[k] for k in ("image", "size", "bbox", "hair_share", "eyeLine") if k in info}))
