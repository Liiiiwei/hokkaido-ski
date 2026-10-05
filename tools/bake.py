"""把開放街圖雪道＋地形高程圖磚烘焙成網頁用的 JSON。
用法：python3 tools/bake.py   （需先有 tools/raw/osm.json）
"""
import base64, io, json, math, os, urllib.request
import numpy as np
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "tools", "raw")
OUT = os.path.join(ROOT, "data")
Z = 13
CELL = 12.0  # 網格解析度（公尺）

# 可滑路線：由開放街圖的路段編號串接而成（上游到下游）
RESORTS = {
    "teine": dict(bbox=(43.064, 141.181, 43.110, 141.224), runs=[
        dict(id="natural", zh="自然雪道＋彩虹雪道", ja="ナチュラル → レインボー", zone="高地區 → 奧林匹亞區", ways=[918333012, 224463729, 506729423, 506729417, 506729410, 506729414]),
        dict(id="cruise", zh="市景巡航", ja="シティビュークルーズ", zone="高地區", ways=[506729388]),
        dict(id="panorama", zh="市景全景", ja="シティビューパノラマ", zone="高地區", ways=[506729391]),
        dict(id="womens-gs", zh="女子大迴轉", ja="女子大回転", zone="高地區", ways=[506729390, 506729397]),
        dict(id="kitakabe", zh="北壁", ja="北かべ", zone="高地區", ways=[918333011]),
        dict(id="paradise", zh="天堂雪道", ja="パラダイス", zone="高地區", ways=[506729399]),
        dict(id="sunshine", zh="白樺陽光", ja="白樺サンシャイン", zone="奧林匹亞區", ways=[506729439]),
        dict(id="suntrap", zh="白樺暖陽", ja="白樺サントラップ", zone="奧林匹亞區", ways=[506729436]),
        dict(id="sunrise", zh="白樺日出", ja="白樺サンライズ", zone="奧林匹亞區", ways=[506729434]),
        dict(id="sundance", zh="白樺日舞", ja="白樺サンダンス", zone="奧林匹亞區", ways=[506729432]),
        dict(id="ocean-stream", zh="聖火台海流", ja="聖火台オーシャンストリーム", zone="奧林匹亞區", ways=[506729429]),
        dict(id="ocean-cruise", zh="聖火台海洋巡航", ja="聖火台オーシャンクルーズ", zone="奧林匹亞區", ways=[506729428]),
        dict(id="ocean-dive", zh="聖火台海洋俯衝", ja="聖火台オーシャンダイブ", zone="奧林匹亞區", ways=[506729426]),
    ]),
    "kokusai": dict(bbox=(43.060, 141.046, 43.087, 141.094), runs=[
        dict(id="rinkan", zh="林間雪道＋童話雪道", ja="林間コース → メルヘンコース", zone="山頂 → 山麓", ways=[1084139722, 506713318, 506713322, 1084139724]),
        dict(id="marchen", zh="童話雪道", ja="メルヘンコース", zone="中腹 → 山麓", ways=[506713322, 1084139724]),
        dict(id="family", zh="家庭雪道", ja="ファミリーコース", zone="中腹 → 山麓", ways=[1084139729, 1084139724]),
        dict(id="echo", zh="回聲雪道", ja="エコーコース", zone="山頂 → 中腹", diff=2, ways=[1084139730, 506713309, 1084139736]),
        dict(id="woody", zh="木林雪道＋家庭雪道", ja="ウッディーコース → ファミリーコース", zone="山頂 → 山麓", ways=[1084139730, 506713314, 1084139729, 1084139724]),
        dict(id="swing", zh="搖擺雪道", ja="スウィングコース", zone="中腹 → 山麓", ways=[506713311, 1084139724]),
        dict(id="downhill", zh="滑降雪道", ja="ダウンヒルコース", zone="山頂 → 山麓", ways=[506713307]),
    ]),
}
STEP = 6.0  # 路線重新取樣間距（公尺）
RANK = dict(novice=0, easy=0, intermediate=1, advanced=2, expert=2)


def tile_xy(lat, lon):
    n = 2 ** Z
    x = (lon + 180) / 360 * n
    y = (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n
    return x, y


def get_tile(x, y):
    p = os.path.join(RAW, f"t_{Z}_{x}_{y}.png")
    if not os.path.exists(p):
        url = f"https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{Z}/{x}/{y}.png"
        urllib.request.urlretrieve(url, p)
    a = np.asarray(Image.open(p).convert("RGB")).astype(np.float64)
    return a[..., 0] * 256 + a[..., 1] + a[..., 2] / 256 - 32768


def blur(a, n=2):
    for _ in range(n):
        p = np.pad(a, 1, mode="edge")
        a = (p[:-2, 1:-1] + p[2:, 1:-1] + p[1:-1, :-2] + p[1:-1, 2:] + 4 * a) / 8
    return a


def bake(key, cfg):
    s, w, n, e = cfg["bbox"]
    lat0, lon0 = (s + n) / 2, (w + e) / 2
    kx = math.cos(math.radians(lat0)) * 111320
    kz = 110574
    width, depth = (e - w) * kx, (n - s) * kz
    gw, gh = int(width / CELL) + 1, int(depth / CELL) + 1

    x0, y0 = tile_xy(n, w)
    x1, y1 = tile_xy(s, e)
    tx0, ty0, tx1, ty1 = int(x0), int(y0), int(x1), int(y1)
    mosaic = np.vstack([np.hstack([get_tile(tx, ty) for tx in range(tx0, tx1 + 1)]) for ty in range(ty0, ty1 + 1)])

    def sample(lat, lon):
        x, y = tile_xy(lat, lon)
        px, py = (x - tx0) * 256 - 0.5, (y - ty0) * 256 - 0.5
        ix, iy = np.floor(px).astype(int), np.floor(py).astype(int)
        fx, fy = px - ix, py - iy
        ix = np.clip(ix, 0, mosaic.shape[1] - 2); iy = np.clip(iy, 0, mosaic.shape[0] - 2)
        return (mosaic[iy, ix] * (1 - fx) * (1 - fy) + mosaic[iy, ix + 1] * fx * (1 - fy)
                + mosaic[iy + 1, ix] * (1 - fx) * fy + mosaic[iy + 1, ix + 1] * fx * fy)

    xs = (np.arange(gw) * CELL - width / 2)
    zs = (np.arange(gh) * CELL - depth / 2)
    lon_g = lon0 + xs / kx
    lat_g = lat0 - zs / kz
    tile_x = (lon_g + 180) / 360 * 2 ** Z
    tile_y = (1 - np.arcsinh(np.tan(np.radians(lat_g))) / math.pi) / 2 * 2 ** Z
    PX, PY = np.meshgrid((tile_x - tx0) * 256 - 0.5, (tile_y - ty0) * 256 - 0.5)
    ix, iy = np.floor(PX).astype(int), np.floor(PY).astype(int)
    fx, fy = PX - ix, PY - iy
    H = (mosaic[iy, ix] * (1 - fx) * (1 - fy) + mosaic[iy, ix + 1] * fx * (1 - fy)
         + mosaic[iy + 1, ix] * (1 - fx) * fy + mosaic[iy + 1, ix + 1] * fx * fy)
    H = blur(H, 3)

    def local(lat, lon):
        return ((lon - lon0) * kx, -(lat - lat0) * kz)

    def hget(x, z):
        gx = min(max((x + width / 2) / CELL, 0), gw - 1.001); gz = min(max((z + depth / 2) / CELL, 0), gh - 1.001)
        i, j = int(gx), int(gz); a, b = gx - i, gz - j
        return H[j, i] * (1 - a) * (1 - b) + H[j, i + 1] * a * (1 - b) + H[j + 1, i] * (1 - a) * b + H[j + 1, i + 1] * a * b

    osm = json.load(open(os.path.join(RAW, "osm.json")))
    pistes, lifts = [], []
    for el in osm["elements"]:
        t, g = el.get("tags", {}), el.get("geometry")
        # 頭尾相接的是雪道範圍輪廓，不是中心線，略過
        if el["type"] != "way" or not g or (g[0] == g[-1]):
            continue
        if not all(s <= p["lat"] <= n and w <= p["lon"] <= e for p in g):
            continue
        pts = [local(p["lat"], p["lon"]) for p in g]
        ln = sum(math.dist(pts[i], pts[i + 1]) for i in range(len(pts) - 1))
        if t.get("piste:type") in ("downhill", "mogul", "connection", "yes"):
            if hget(*pts[0]) < hget(*pts[-1]):
                pts.reverse()
            pistes.append(dict(id=el["id"], ja=t.get("name"), en=t.get("name:en"), diff=t.get("piste:difficulty") or "easy",
                               kind=t["piste:type"], len=round(ln), top=round(hget(*pts[0])), bot=round(hget(*pts[-1])),
                               pts=[[round(x, 1), round(z, 1)] for x, z in pts]))
        elif t.get("aerialway") in ("gondola", "chair_lift", "magic_carpet", "cable_car"):
            if hget(*pts[0]) > hget(*pts[-1]):
                pts.reverse()
            lifts.append(dict(id=el["id"], ja=t.get("name"), en=t.get("name:en"), type=t["aerialway"], len=round(ln),
                              bot=round(hget(*pts[0])), top=round(hget(*pts[-1])),
                              pts=[[round(x, 1), round(z, 1)] for x, z in (pts[0], pts[-1])]))

    byid = {p["id"]: p for p in pistes}
    runs = []
    for spec in cfg["runs"]:
        pts, diff = [], 0
        for wid in spec["ways"]:
            w_ = [tuple(q_) for q_ in byid[wid]["pts"]]
            if byid[wid]["len"] > 120:
                diff = max(diff, RANK[byid[wid]["diff"]])
            if pts:
                k = min(range(len(w_)), key=lambda i: math.dist(w_[i], pts[-1]))
                w_ = w_[k + 1:] if math.dist(w_[k], pts[-1]) < 3 else w_[k:]
            pts += w_
        for _ in range(3):  # Chaikin 平滑
            sm = [pts[0]]
            for a, b in zip(pts, pts[1:]):
                sm += [(a[0] * .75 + b[0] * .25, a[1] * .75 + b[1] * .25), (a[0] * .25 + b[0] * .75, a[1] * .25 + b[1] * .75)]
            pts = sm + [pts[-1]]
        cum = [0]
        for a, b in zip(pts, pts[1:]):
            cum.append(cum[-1] + math.dist(a, b))
        nres = int(cum[-1] / STEP)
        rs, j = [], 0
        for i in range(nres + 1):
            d_ = i * STEP
            while j < len(cum) - 2 and cum[j + 1] < d_:
                j += 1
            t_ = (d_ - cum[j]) / max(cum[j + 1] - cum[j], 1e-6)
            rs.append((pts[j][0] + (pts[j + 1][0] - pts[j][0]) * t_, pts[j][1] + (pts[j + 1][1] - pts[j][1]) * t_))
        hs = np.array([hget(*q_) for q_ in rs])
        k_ = 6
        hsm = np.convolve(np.pad(hs, k_, mode="edge"), np.ones(2 * k_ + 1) / (2 * k_ + 1), mode="valid")
        grade = np.clip(-np.gradient(hsm, STEP), 0.05, 0.75)
        drop = float(hs[0] - hs.min())
        length = nres * STEP
        runs.append(dict(id=spec["id"], zh=spec["zh"], ja=spec["ja"], zone=spec["zone"], diff=spec.get("diff", diff),  # 官方難度與開放街圖不同時以官方為準
                        
                         len=round(math.hypot(length, drop)), top=round(float(hs[0])), bot=round(float(hs.min())), drop=round(drop),
                         avg=round(math.degrees(math.atan2(drop, length)), 1),
                         max=round(math.degrees(math.atan(float(np.clip(-np.gradient(hsm, STEP), 0, 2).max()))), 1),
                         pts=[[round(x, 1), round(z, 1)] for x, z in rs], g=[round(float(v), 3) for v in grade]))
        r = runs[-1]
        print("RUN", r["id"], r["zh"], "diff", r["diff"], "len", r["len"], r["top"], "->", r["bot"], "avg", r["avg"], "max", r["max"])
    for p in pistes:
        p["diff"] = RANK[p["diff"]]

    q = np.clip(np.round((H - H.min()) * 10), 0, 65535).astype("<u2")
    data = dict(key=key, lat0=lat0, lon0=lon0, width=round(width, 1), depth=round(depth, 1), gw=gw, gh=gh, cell=CELL,
                hmin=round(float(H.min()), 1), hmax=round(float(H.max()), 1),
                heights=base64.b64encode(q.tobytes()).decode(),
                segs=[dict(diff=p["diff"], pts=p["pts"]) for p in pistes], runs=runs, lifts=lifts)
    os.makedirs(OUT, exist_ok=True)
    json.dump(data, open(os.path.join(OUT, f"{key}.json"), "w"), ensure_ascii=False)

    # 除錯圖：確認雪道位置與串接
    sc = 3
    img = Image.fromarray(np.uint8((H - H.min()) / (H.max() - H.min()) * 200 + 40)).resize((gw * sc, gh * sc)).convert("RGB")
    d = ImageDraw.Draw(img)
    col = {0: (60, 220, 90), 1: (240, 60, 60), 2: (20, 20, 20)}
    P = lambda p: ((p[0] + width / 2) / CELL * sc, (p[1] + depth / 2) / CELL * sc)
    for i, p in enumerate(pistes):
        d.line([P(q_) for q_ in p["pts"]], fill=col.get(p["diff"], (0, 0, 255)), width=3)
        d.text(P(p["pts"][0]), str(i), fill=(255, 255, 0))
    for l in lifts:
        d.line([P(q_) for q_ in l["pts"]], fill=(0, 160, 255), width=2)
    img.save(os.path.join(RAW, f"debug_{key}.png"))
    print(f"== {key} grid {gw}x{gh} elev {H.min():.0f}-{H.max():.0f}")
    for i, r in enumerate(runs):
        d.line([P(q_) for q_ in r["pts"]], fill=(255, 220, 0), width=1)


if __name__ == "__main__":
    for k, c in RESORTS.items():
        bake(k, c)
