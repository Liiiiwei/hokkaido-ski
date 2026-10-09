// 由烘焙好的雪場資料建立 3D 場景：地形、雪道、樹、纜車、落雪
import * as THREE from "three";

export const STEP = 6; // 路線取樣間距（公尺），需與 tools/bake.py 一致
export const DIFF = [
  { name: "初級", color: "#2fa35a" },
  { name: "中級", color: "#e23b2e" },
  { name: "上級", color: "#15181c" },
];
const HALF_W = [22, 20, 17]; // 各難度雪道半寬

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

function resample(pts, step) {
  const out = [pts[0]];
  let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1],
      [bx, bz] = pts[i];
    const len = Math.hypot(bx - ax, bz - az);
    let d = step - carry;
    while (d <= len) {
      out.push([ax + ((bx - ax) * d) / len, az + ((bz - az) * d) / len]);
      d += step;
    }
    carry = (carry + len) % step;
  }
  out.push(pts[pts.length - 1]);
  return out;
}

// 三點估算彎道半徑（公尺）
function bendRadius(p, i, k = 3) {
  if (i < k || i > p.length - 1 - k - 1) return 1e6; // 頭尾點距不完整，不估
  const a = p[Math.max(0, i - k)],
    b = p[i],
    c = p[Math.min(p.length - 1, i + k)];
  const h1 = Math.atan2(b[1] - a[1], b[0] - a[0]),
    h2 = Math.atan2(c[1] - b[1], c[0] - b[0]);
  let dh = Math.abs(h2 - h1);
  if (dh > Math.PI) dh = 2 * Math.PI - dh;
  const len =
    (Math.hypot(b[0] - a[0], b[1] - a[1]) +
      Math.hypot(c[0] - b[0], c[1] - b[1])) /
    2;
  return dh > 1e-4 ? len / dh : 1e6;
}

// 把太急的彎修圓：髮夾彎的半徑比雪道還窄時，兩側邊線會折疊交叉
function easeBends(r) {
  if (r.eased) return;
  r.eased = true;
  const MIN_R = 34;
  let p = r.pts.map((q) => [q[0], q[1]]);
  const n = p.length;
  let touched = false;
  for (let it = 0; it < 400; it++) {
    const hot = new Uint8Array(n);
    let any = false;
    for (let i = 2; i < n - 2; i++)
      if (bendRadius(p, i) < MIN_R) {
        any = true;
        for (let j = Math.max(1, i - 4); j <= Math.min(n - 2, i + 4); j++)
          hot[j] = 1;
      }
    if (!any) break;
    touched = true;
    const q = p.map((v) => [v[0], v[1]]);
    for (let i = 1; i < n - 1; i++)
      if (hot[i]) {
        q[i][0] = p[i][0] * 0.5 + (p[i - 1][0] + p[i + 1][0]) * 0.25;
        q[i][1] = p[i][1] * 0.5 + (p[i - 1][1] + p[i + 1][1]) * 0.25;
      }
    p = q;
  }
  if (!touched) return;
  // 修圓後點距不再均勻，重新等距取樣，坡度依比例對應回去
  const out = resample(p, STEP),
    g = out.map(
      (_, i) =>
        r.g[
          Math.min(r.g.length - 1, Math.round((i / (out.length - 1)) * (n - 1)))
        ],
    );
  r.pts = out;
  r.g = g;
}

// 各點可用的半寬：彎道內側與路線彼此靠近的地方自動收窄
function widths(pts, halfW) {
  const n = pts.length,
    w = new Float32Array(n).fill(halfW),
    skip = Math.ceil(110 / STEP);
  for (let i = 0; i < n; i++) {
    w[i] = Math.min(w[i], bendRadius(pts, i) * 0.75);
    for (let j = i + skip; j < n; j++) {
      const d =
        Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]) / 2 - 2;
      if (d < halfW) {
        w[i] = Math.min(w[i], d);
        w[j] = Math.min(w[j], d);
      }
    }
  }
  // 往前後擴散最小值再平均，寬度變化才不會突然
  const m = new Float32Array(n),
    o = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let v = halfW;
    for (let j = Math.max(0, i - 14); j <= Math.min(n - 1, i + 14); j++)
      v = Math.min(v, w[j]);
    m[i] = Math.max(7, v);
  }
  for (let i = 0; i < n; i++) {
    let v = 0,
      c = 0;
    for (let j = Math.max(0, i - 12); j <= Math.min(n - 1, i + 12); j++)
      ((v += m[j]), c++);
    o[i] = v / c;
  }
  return o;
}

// 把多個零件併成一個帶頂點色的幾何，一個模型只要畫一次。
// parts：[幾何, 顏色或 (x, y, z) => 顏色]
function mergeColored(parts) {
  const pos = [],
    col = [],
    nor = [],
    c = new THREE.Color();
  for (const [geo, color] of parts) {
    const g = geo.index ? geo.toNonIndexed() : geo,
      p = g.attributes.position,
      n = g.attributes.normal;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i),
        y = p.getY(i),
        z = p.getZ(i);
      pos.push(x, y, z);
      // 沿用零件原本的法線：圓錐、圓柱的曲面才會是平滑的，不會一片一片
      nor.push(n.getX(i), n.getY(i), n.getZ(i));
      c.set(typeof color === "function" ? color(x, y, z) : color);
      col.push(c.r, c.g, c.b);
    }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  out.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  return out;
}
// 沒有底的圓錐，一個側面只用一個三角形。
// 內建的圓錐在尖端會多出一倍面積為零的三角形，樹有上萬棵，省下來很可觀
function coneGeo(r, h, seg) {
  const pos = [],
    nor = [],
    k = Math.hypot(r, h),
    ny = r / k,
    nr = h / k;
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI * 2,
      a1 = ((i + 1) / seg) * Math.PI * 2,
      am = (a0 + a1) / 2;
    pos.push(0, h / 2, 0);
    nor.push(Math.sin(am) * nr, ny, Math.cos(am) * nr);
    for (const a of [a0, a1]) {
      pos.push(Math.sin(a) * r, -h / 2, Math.cos(a) * r);
      nor.push(Math.sin(a) * nr, ny, Math.cos(a) * nr);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  return g;
}
const boxAt = (w, h, d, x, y, z) =>
  new THREE.BoxGeometry(w, h, d).translate(x, y, z);

// 壓雪車留下的紋路：順著雪道的細溝，加上淡淡的橫向履帶痕
let groomTex;
function groomTexture() {
  if (groomTex) return groomTex;
  const cv = document.createElement("canvas"),
    S = (cv.width = cv.height = 512),
    g = cv.getContext("2d");
  g.fillStyle = "#f6f9fc";
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 2600; i++) {
    g.fillStyle =
      Math.random() < 0.5 ? "rgba(255,255,255,.5)" : "rgba(170,190,214,.16)";
    g.fillRect(
      Math.random() * S,
      Math.random() * S,
      1 + Math.random() * 3,
      2 + Math.random() * 10,
    );
  }
  const lanes = 32,
    w = S / lanes;
  for (let i = 0; i < lanes; i++) {
    g.fillStyle = "rgba(128,156,192,.26)";
    g.fillRect(i * w, 0, 2.5, S);
    g.fillStyle = "rgba(255,255,255,.6)";
    g.fillRect(i * w + 3, 0, 2, S);
  }
  for (let j = 0; j < 8; j++) {
    g.fillStyle = "rgba(140,165,198,.07)";
    g.fillRect(0, (j * S) / 8, S, 5);
  }
  groomTex = new THREE.CanvasTexture(cv);
  groomTex.wrapS = groomTex.wrapT = THREE.RepeatWrapping;
  groomTex.colorSpace = THREE.SRGBColorSpace;
  groomTex.anisotropy = 8;
  return groomTex;
}

export function buildWorld(data, { lowPower = false } = {}) {
  data.runs.forEach(easeBends);
  const { gw, gh, cell } = data;
  const spanX = (gw - 1) * cell,
    spanZ = (gh - 1) * cell;
  const x0 = -data.width / 2,
    z0 = -data.depth / 2;

  // 高程解碼
  const bin = Uint8Array.from(atob(data.heights), (c) => c.charCodeAt(0));
  const u16 = new Uint16Array(bin.buffer);
  const H = new Float32Array(gw * gh);
  for (let i = 0; i < H.length; i++) H[i] = data.hmin + u16[i] / 10;

  function heightAt(x, z) {
    const gx = clamp((x - x0) / cell, 0, gw - 1.001),
      gz = clamp((z - z0) / cell, 0, gh - 1.001);
    const i = gx | 0,
      j = gz | 0,
      a = gx - i,
      b = gz - j,
      k = j * gw + i;
    return (
      H[k] * (1 - a) * (1 - b) +
      H[k + 1] * a * (1 - b) +
      H[k + gw] * (1 - a) * b +
      H[k + gw + 1] * a * b
    );
  }

  // 與地形三角網格完全一致的表面高度（貼地的線條、箭頭用這個才不會被雪面吃掉）
  function surfaceAt(x, z) {
    const gx = clamp((x - x0) / cell, 0, gw - 1.001),
      gz = clamp((z - z0) / cell, 0, gh - 1.001);
    const i = gx | 0,
      j = gz | 0,
      a = gx - i,
      b = gz - j,
      k = j * gw + i;
    return a + b <= 1
      ? H[k] + (H[k + 1] - H[k]) * a + (H[k + gw] - H[k]) * b
      : H[k + gw + 1] +
          (H[k + gw] - H[k + gw + 1]) * (1 - a) +
          (H[k + 1] - H[k + gw + 1]) * (1 - b);
  }

  const scene = new THREE.Scene();
  const horizon = new THREE.Color("#dbe7f1");
  scene.fog = new THREE.FogExp2(horizon, 0.00011);

  // 天空
  const skyGeo = new THREE.SphereGeometry(16000, 24, 12);
  const skyCol = [];
  const top = new THREE.Color("#2a68b4"),
    c = new THREE.Color();
  for (let i = 0; i < skyGeo.attributes.position.count; i++) {
    const t = clamp(skyGeo.attributes.position.getY(i) / 16000, 0, 1);
    c.copy(horizon).lerp(top, Math.pow(t, 0.38));
    skyCol.push(c.r, c.g, c.b);
  }
  skyGeo.setAttribute("color", new THREE.Float32BufferAttribute(skyCol, 3));
  const sky = new THREE.Mesh(
    skyGeo,
    new THREE.MeshBasicMaterial({
      vertexColors: true,
      side: THREE.BackSide,
      fog: false,
      depthWrite: false,
    }),
  );
  scene.add(sky);

  // 太陽：一圈柔和的光暈，掛在光源方向的遠處
  const glowCv = document.createElement("canvas");
  glowCv.width = glowCv.height = 256;
  const gg = glowCv.getContext("2d"),
    grd = gg.createRadialGradient(128, 128, 0, 128, 128, 128);
  grd.addColorStop(0, "rgba(255,252,240,1)");
  grd.addColorStop(0.08, "rgba(255,246,220,.95)");
  grd.addColorStop(0.25, "rgba(255,236,200,.32)");
  grd.addColorStop(1, "rgba(255,236,200,0)");
  gg.fillStyle = grd;
  gg.fillRect(0, 0, 256, 256);
  const sunGlow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(glowCv),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    }),
  );
  sunGlow.scale.setScalar(6400);
  scene.add(sunGlow);

  scene.add(new THREE.HemisphereLight("#e4efff", "#b4c4d6", 1.75));
  const sun = new THREE.DirectionalLight("#fff0d8", 2.3);
  const sunDir = new THREE.Vector3(-0.55, 0.5, 0.67).normalize();
  sun.position.copy(sunDir);
  scene.add(sun, sun.target);
  // 影子只算滑雪者周圍一小塊，跟著人走
  if (!lowPower) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = sc.bottom = -60;
    sc.right = sc.top = 60;
    sc.near = 1;
    sc.far = 520;
    sc.updateProjectionMatrix();
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.04;
  }
  const aimSun = (p) => {
    sun.target.position.copy(p);
    sun.position.copy(p).addScaledVector(sunDir, 260);
  };

  // 路線
  const runs = data.runs.map((r) => {
    const n = r.pts.length;
    const tan = r.pts.map((_, i) => {
      const a = r.pts[Math.max(0, i - 1)],
        b = r.pts[Math.min(n - 1, i + 1)];
      const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      return [(b[0] - a[0]) / l, (b[1] - a[1]) / l];
    });
    const run = {
      ...r,
      n,
      L: (n - 1) * STEP,
      halfW: HALF_W[r.diff],
      w: widths(r.pts, HALF_W[r.diff]),
      h: r.pts.map((p) => heightAt(p[0], p[1])),
    };
    // 沿路線距離 s 的可用半寬
    run.wAt = (s) => {
      const f = clamp(s / STEP, 0, n - 1.0001),
        i = f | 0;
      return run.w[i] + (run.w[i + 1] - run.w[i]) * (f - i);
    };
    // 沿路線距離 s 取位置與切線
    run.at = (s, out = {}) => {
      const f = clamp(s / STEP, 0, n - 1.0001),
        i = f | 0,
        t = f - i;
      out.x = r.pts[i][0] + (r.pts[i + 1][0] - r.pts[i][0]) * t;
      out.z = r.pts[i][1] + (r.pts[i + 1][1] - r.pts[i][1]) * t;
      let tx = tan[i][0] + (tan[i + 1][0] - tan[i][0]) * t,
        tz = tan[i][1] + (tan[i + 1][1] - tan[i][1]) * t;
      const l = Math.hypot(tx, tz) || 1;
      out.tx = tx / l;
      out.tz = tz / l;
      out.grade = r.g[i];
      return out;
    };
    return run;
  });

  // 地表貼圖：雪面＋壓雪雪道
  const texScale = (lowPower ? 1024 : 2048) / Math.max(spanX, spanZ);
  const cv = document.createElement("canvas");
  cv.width = Math.round(spanX * texScale);
  cv.height = Math.round(spanZ * texScale);
  const ctx = cv.getContext("2d");
  ctx.fillStyle = "#d9e3ec";
  ctx.fillRect(0, 0, cv.width, cv.height);
  for (let i = 0; i < 9000; i++) {
    ctx.fillStyle =
      Math.random() < 0.5 ? "rgba(255,255,255,.35)" : "rgba(150,172,194,.22)";
    const s = 2 + Math.random() * 10;
    ctx.beginPath();
    ctx.arc(Math.random() * cv.width, Math.random() * cv.height, s, 0, 7);
    ctx.fill();
  }
  const trace = (g, pts, k, ox, oz) => {
    g.beginPath();
    pts.forEach((p, i) =>
      g[i ? "lineTo" : "moveTo"]((p[0] - ox) * k, (p[1] - oz) * k),
    );
    g.stroke();
  };
  ctx.lineCap = ctx.lineJoin = "round";
  ctx.strokeStyle = "#ffffff";
  ctx.shadowColor = "#ffffff";
  ctx.shadowBlur = 10 * texScale;
  ctx.lineWidth = 46 * texScale;
  const allLines = [...data.segs.map((s) => s.pts), ...runs.map((r) => r.pts)];
  allLines.forEach((p) => trace(ctx, p, texScale, x0, z0));
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;

  // 雪道遮罩：樹不要種在雪道上
  const mScale = 1024 / Math.max(spanX, spanZ);
  const mc = document.createElement("canvas");
  mc.width = Math.round(spanX * mScale);
  mc.height = Math.round(spanZ * mScale);
  const mx = mc.getContext("2d", { willReadFrequently: true });
  mx.fillStyle = "#000";
  mx.fillRect(0, 0, mc.width, mc.height);
  mx.strokeStyle = "#fff";
  mx.lineCap = mx.lineJoin = "round";
  mx.lineWidth = 58 * mScale;
  allLines.forEach((p) => trace(mx, p, mScale, x0, z0));
  const mask = mx.getImageData(0, 0, mc.width, mc.height).data;
  const onPiste = (x, z) => {
    const px = ((x - x0) * mScale) | 0,
      pz = ((z - z0) * mScale) | 0;
    if (px < 0 || pz < 0 || px >= mc.width || pz >= mc.height) return true;
    return mask[(pz * mc.width + px) * 4] > 100;
  };

  // 地形網格
  const pos = new Float32Array(gw * gh * 3),
    uv = new Float32Array(gw * gh * 2);
  for (let j = 0; j < gh; j++)
    for (let i = 0; i < gw; i++) {
      const k = j * gw + i;
      pos[k * 3] = x0 + i * cell;
      pos[k * 3 + 1] = H[k];
      pos[k * 3 + 2] = z0 + j * cell;
      uv[k * 2] = i / (gw - 1);
      uv[k * 2 + 1] = 1 - j / (gh - 1);
    }
  const idx = new Uint32Array((gw - 1) * (gh - 1) * 6);
  let q = 0;
  for (let j = 0; j < gh - 1; j++)
    for (let i = 0; i < gw - 1; i++) {
      const a = j * gw + i,
        b = a + 1,
        d = a + gw,
        e = d + 1;
      idx[q++] = a;
      idx[q++] = d;
      idx[q++] = b;
      idx[q++] = b;
      idx[q++] = d;
      idx[q++] = e;
    }
  const tg = new THREE.BufferGeometry();
  tg.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  tg.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  tg.setIndex(new THREE.BufferAttribute(idx, 1));
  tg.computeVertexNormals();
  const terrain = new THREE.Mesh(
    tg,
    new THREE.MeshStandardMaterial({
      map: tex,
      roughness: 0.92,
      metalness: 0,
    }),
  );
  terrain.receiveShadow = !lowPower;
  scene.add(terrain);

  // 貼地色帶
  function ribbon(pts, width, lift, color, opacity = 1) {
    const p = resample(pts, 8),
      n = p.length;
    const v = new Float32Array(n * 6),
      ix = [];
    for (let i = 0; i < n; i++) {
      const a = p[Math.max(0, i - 1)],
        b = p[Math.min(n - 1, i + 1)];
      const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const nx = ((-(b[1] - a[1]) / l) * width) / 2,
        nz = (((b[0] - a[0]) / l) * width) / 2;
      const lx = p[i][0] - nx,
        lz = p[i][1] - nz,
        rx = p[i][0] + nx,
        rz = p[i][1] + nz;
      const y =
        Math.max(
          heightAt(lx, lz),
          heightAt(rx, rz),
          heightAt(p[i][0], p[i][1]),
        ) + lift;
      v.set([lx, y, lz, rx, y, rz], i * 6);
      if (i) ix.push(i * 2 - 2, i * 2 - 1, i * 2, i * 2 - 1, i * 2 + 1, i * 2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(v, 3));
    g.setIndex(ix);
    return new THREE.Mesh(
      g,
      new THREE.MeshBasicMaterial({
        color,
        side: THREE.DoubleSide,
        transparent: opacity < 1,
        opacity,
        fog: false,
      }),
    );
  }
  const mapLayer = new THREE.Group(); // 只在總覽模式顯示
  data.segs.forEach((s) =>
    mapLayer.add(ribbon(s.pts, 9, 2.5, DIFF[s.diff].color)),
  );
  scene.add(mapLayer);

  // 滑行時鋪在雪道上的壓雪面：貼著地形起伏，兩側淡出到自然雪面
  function piste(run) {
    const COLS = 16,
      ROW = 3,
      rows = Math.floor(run.L / ROW) + 1,
      pos = new Float32Array(rows * (COLS + 1) * 3),
      uv = new Float32Array(rows * (COLS + 1) * 2),
      col = new Float32Array(rows * (COLS + 1) * 4),
      ix = [],
      q = {};
    for (let j = 0; j < rows; j++) {
      const sj = Math.min(run.L, j * ROW),
        half = run.wAt(sj) + 1.5,
        ends = Math.min(1, sj / 12, (run.L - sj) / 12); // 頭尾也淡出
      run.at(sj, q);
      for (let i = 0; i <= COLS; i++) {
        const k = j * (COLS + 1) + i,
          d = ((i / COLS) * 2 - 1) * half,
          x = q.x - q.tz * d,
          z = q.z + q.tx * d;
        pos.set([x, surfaceAt(x, z) + 0.1, z], k * 3);
        uv.set([d / 9, sj / 9], k * 2);
        col.set(
          [1, 1, 1, clamp((half - Math.abs(d)) / 4.5, 0, 1) * ends * 0.94],
          k * 4,
        );
        if (j && i) {
          const a = k - COLS - 2,
            b = k - COLS - 1;
          ix.push(a, k - 1, b, b, k - 1, k);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    g.setAttribute("color", new THREE.BufferAttribute(col, 4));
    g.setIndex(ix);
    g.computeVertexNormals();
    const m = new THREE.Mesh(
      g,
      new THREE.MeshStandardMaterial({
        map: groomTexture(),
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        roughness: 0.82,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      }),
    );
    m.receiveShadow = !lowPower;
    m.renderOrder = -1; // 痕跡、邊線、箭頭都畫在它上面
    return m;
  }

  // 樹：四層針葉樹為主，混一些落葉後的白樺。
  // 每一層是一圈綠色枝葉，上面再蓋一頂比枝葉略寬的雪帽，雪線是清楚的一道邊，不是糊掉的漸層
  const green = new THREE.Color("#2b4f40"),
    deep = new THREE.Color("#1a362b"),
    white = new THREE.Color("#f6f9fc"),
    frost = new THREE.Color("#dbe6f0");
  const SEG = 9;
  const tier = (r, h, base, turn) => {
    const skirt = coneGeo(r, h, SEG);
    skirt.rotateY(turn);
    skirt.translate(0, base + h / 2, 0);
    // 雪帽從這一層下緣往上一點開始，只露出一圈深色枝葉，底緣比枝葉寬一點，像積雪壓出來的簷
    const capH = h * 0.95,
      capBase = base + h * 0.15,
      cap = coneGeo(r * 0.9, capH, SEG);
    cap.rotateY(turn + 0.35);
    cap.translate(0, capBase + capH / 2, 0);
    return [
      [skirt, (x, y) => (y - base < h * 0.5 ? deep : green)],
      [cap, (x, y) => (y - capBase < capH * 0.5 ? frost : white)],
    ];
  };
  const conifer = mergeColored([
    [
      new THREE.CylinderGeometry(0.38, 0.55, 3, 6, 1, true).translate(
        0,
        1.5,
        0,
      ),
      "#5c4535",
    ],
    ...tier(3.9, 4.6, 1.6, 0),
    ...tier(3.1, 4.2, 4.3, 0.5),
    ...tier(2.3, 3.8, 6.8, 1.1),
    ...tier(1.5, 3.4, 9.0, 1.7),
  ]);
  const twig = (len, y, yaw, tilt) => {
    const geo = new THREE.CylinderGeometry(0.035, 0.09, len, 4, 1, true);
    geo.translate(0, len / 2, 0);
    geo.rotateZ(tilt);
    geo.rotateY(yaw);
    geo.translate(0, y, 0);
    return [geo, "#8d8479"];
  };
  const birch = mergeColored([
    // 白色樹幹上一段一段的深色橫紋
    [
      new THREE.CylinderGeometry(0.16, 0.3, 10, 6, 10, true).translate(0, 5, 0),
      (x, y) => (Math.round(y) % 3 === 1 && y < 9 ? "#5b5650" : "#ece8df"),
    ],
    twig(3.4, 5.2, 0.3, 0.8),
    twig(3.0, 6.3, 2.5, -0.75),
    twig(2.6, 7.2, 4.4, 0.7),
    twig(2.2, 8.1, 1.4, -0.6),
    twig(2.0, 9.2, 5.5, 0.35),
    twig(1.6, 9.6, 3.2, -0.3),
  ]);
  const spots = [];
  const tryPlace = (x, z) => {
    if (
      x < x0 + 5 ||
      z < z0 + 5 ||
      x > x0 + spanX - 5 ||
      z > z0 + spanZ - 5 ||
      onPiste(x, z)
    )
      return;
    spots.push(x, z);
  };
  runs.forEach((r) => {
    for (let i = 0; i < r.n; i += 2)
      for (const side of [-1, 1])
        for (let k = 0; k < 2; k++) {
          const p = r.at(i * STEP),
            d = side * (r.halfW + 8 + Math.random() * 70);
          tryPlace(
            p.x - p.tz * d + (Math.random() - 0.5) * 10,
            p.z + p.tx * d + (Math.random() - 0.5) * 10,
          );
        }
  });
  const scatter = lowPower ? 9000 : 26000;
  for (let i = 0; i < scatter; i++)
    tryPlace(x0 + Math.random() * spanX, z0 + Math.random() * spanZ);
  const total = spots.length / 2,
    isBirch = Array.from({ length: total }, () => Math.random() < 0.13),
    nBirch = isBirch.filter(Boolean).length,
    treeMat = new THREE.MeshLambertMaterial({ vertexColors: true }),
    conifers = new THREE.InstancedMesh(conifer, treeMat, total - nBirch),
    birches = new THREE.InstancedMesh(birch, treeMat, nBirch);
  const m4 = new THREE.Matrix4(),
    qt = new THREE.Quaternion(),
    sc = new THREE.Vector3(),
    tp = new THREE.Vector3(),
    up = new THREE.Vector3(0, 1, 0),
    tint = new THREE.Color();
  for (let i = 0, ci = 0, bi = 0; i < total; i++) {
    const s = 0.7 + Math.random() * 1.1;
    tp.set(
      spots[i * 2],
      heightAt(spots[i * 2], spots[i * 2 + 1]) - 1,
      spots[i * 2 + 1],
    );
    qt.setFromAxisAngle(up, Math.random() * 6.28);
    m4.compose(tp, qt, sc.set(s, s * (0.9 + Math.random() * 0.5), s));
    if (isBirch[i]) birches.setMatrixAt(bi++, m4);
    else {
      // 每棵樹深淺略有不同，整片樹林才不會像複製貼上
      conifers.setColorAt(ci, tint.setScalar(0.8 + Math.random() * 0.28));
      conifers.setMatrixAt(ci++, m4);
    }
  }
  scene.add(conifers, birches);

  // 纜車：支柱帶橫臂，上下行各一條纜線，車廂與吊椅沿纜線方向擺
  const cabins = [];
  const liftGroup = new THREE.Group();
  const ARM = 2.3, // 纜線離支柱中心的距離
    liftMat = new THREE.MeshLambertMaterial({ vertexColors: true }),
    cableMat = new THREE.LineBasicMaterial({ color: "#2b3540" });
  const towerGeo = mergeColored([
    [
      new THREE.CylinderGeometry(0.42, 0.68, 12, 6).translate(0, 6, 0),
      "#5b6773",
    ],
    [boxAt(ARM * 2 + 1, 0.4, 0.55, 0, 12, 0), "#48535e"],
    [boxAt(ARM * 2 + 1.1, 0.14, 0.7, 0, 12.27, 0), "#eef4f7"], // 橫臂上的積雪
    [boxAt(0.3, 0.5, 2, -ARM, 11.75, 0), "#2b3540"],
    [boxAt(0.3, 0.5, 2, ARM, 11.75, 0), "#2b3540"],
    [boxAt(1.5, 0.5, 1.5, 0, 0.25, 0), "#8b959f"],
  ]);
  const gondolaGeo = mergeColored([
    [boxAt(3, 2.7, 3.6, 0, 0, 0), "#ff5a1f"],
    [boxAt(3.06, 1.05, 3.1, 0, 0.35, 0), "#22364b"], // 兩側車窗
    [boxAt(2.5, 1.05, 3.66, 0, 0.35, 0), "#22364b"], // 前後車窗
    [boxAt(3.2, 0.24, 3.8, 0, 1.45, 0), "#f4f8fc"],
    [boxAt(3.04, 0.2, 3.64, 0, -1.2, 0), "#b83c10"],
    [boxAt(0.2, 1.9, 0.2, 0, 2.5, 0), "#56626e"],
    [boxAt(0.5, 0.22, 1, 0, 3.4, 0), "#2b3540"],
  ]);
  const chairGeo = mergeColored([
    [boxAt(2.7, 0.16, 0.75, 0, 0, 0), "#f2c230"],
    [boxAt(2.7, 0.85, 0.14, 0, 0.48, -0.36), "#f2c230"],
    [boxAt(0.1, 0.6, 0.1, -1.3, 0.3, 0.1), "#56626e"],
    [boxAt(0.1, 0.6, 0.1, 1.3, 0.3, 0.1), "#56626e"],
    [boxAt(2.7, 0.08, 0.08, 0, 0.62, 0.42), "#56626e"], // 安全桿
    [boxAt(2.4, 0.08, 0.08, 0, -0.62, 0.5), "#56626e"], // 腳踏桿
    [boxAt(0.08, 0.62, 0.08, 0, -0.31, 0.5), "#56626e"],
    [boxAt(0.12, 2.4, 0.12, 0, 1.3, -0.3), "#56626e"],
    [boxAt(0.4, 0.18, 0.8, 0, 2.5, -0.3), "#2b3540"],
  ]);
  const stationGeo = mergeColored([
    [boxAt(8, 4.2, 10, 0, 2.1, 0), "#3a4a5c"],
    [boxAt(8.1, 1.3, 7, 0, 2.6, 0), "#9fc6e6"], // 側窗
    [boxAt(8.8, 0.5, 11, 0, 4.45, 0), "#ff5a1f"],
    [boxAt(9, 0.3, 11.2, 0, 4.85, 0), "#f4f8fc"], // 屋頂積雪
  ]);
  // 站房不能蓋在雪道上：離任何一條雪道太近就往外推開
  const CLEAR = 20;
  const offPiste = (x, z) => {
    for (let pass = 0; pass < 3; pass++) {
      let best = null,
        bd = CLEAR;
      for (const r of runs)
        for (const q of r.pts) {
          const d = Math.hypot(x - q[0], z - q[1]);
          if (d < bd) ((bd = d), (best = q));
        }
      if (!best) break;
      const ux = bd > 0.01 ? (x - best[0]) / bd : 1,
        uz = bd > 0.01 ? (z - best[1]) / bd : 0;
      x = best[0] + ux * (CLEAR + 1);
      z = best[1] + uz * (CLEAR + 1);
    }
    return [x, z];
  };
  data.lifts.forEach((l) => {
    const [a, b] = l.pts,
      len = Math.hypot(b[0] - a[0], b[1] - a[1]),
      n = Math.max(2, Math.round(len / 90)),
      dx = (b[0] - a[0]) / len,
      dz = (b[1] - a[1]) / len,
      yaw = Math.atan2(dx, dz),
      gondola = l.type === "gondola",
      lines = { [-1]: [], 1: [] };
    for (let i = 0; i <= n; i++) {
      let x = a[0] + ((b[0] - a[0]) * i) / n,
        z = a[1] + ((b[1] - a[1]) * i) / n;
      if (i === 0 || i === n) [x, z] = offPiste(x, z);
      const y = heightAt(x, z);
      const t = new THREE.Mesh(
        i === 0 || i === n ? stationGeo : towerGeo,
        liftMat,
      );
      t.position.set(x, y - 0.3, z);
      t.rotation.y = yaw;
      liftGroup.add(t);
      for (const side of [-1, 1])
        lines[side].push(
          new THREE.Vector3(
            x - dz * ARM * side,
            y + (i === 0 || i === n ? 5.4 : 11.5),
            z + dx * ARM * side,
          ),
        ); // 兩端降進站房
    }
    for (const side of [-1, 1])
      liftGroup.add(
        new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(lines[side]),
          cableMat,
        ),
      );
    const count = Math.max(2, Math.round(len / (gondola ? 130 : 170)));
    for (let i = 0; i < count; i++) {
      const dir = i % 2 ? 1 : -1, // 一邊上山、一邊下山
        mesh = new THREE.Mesh(gondola ? gondolaGeo : chairGeo, liftMat);
      mesh.rotation.y = yaw + (dir > 0 ? 0 : Math.PI);
      liftGroup.add(mesh);
      cabins.push({
        mesh,
        path: lines[dir],
        phase: i / count,
        speed: (gondola ? 5 : 3) / len,
        dir,
        hang: gondola ? 3.5 : 2.6,
      });
    }
  });
  scene.add(liftGroup);

  // 落雪
  const BOX = 130,
    flakes = lowPower ? 1500 : 3500;
  const sp = new Float32Array(flakes * 3);
  for (let i = 0; i < sp.length; i++) sp[i] = Math.random() * BOX;
  const sg = new THREE.BufferGeometry();
  sg.setAttribute("position", new THREE.BufferAttribute(sp, 3));
  const snowMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uT: { value: 0 },
      uCam: { value: new THREE.Vector3() },
      uBox: { value: BOX },
    },
    vertexShader: `uniform float uT; uniform vec3 uCam; uniform float uBox;
      void main(){ vec3 p = position;
        p.y -= uT * (5.0 + fract(position.x * 7.31) * 5.0);
        p.x += uT * 2.5 + sin(uT * 0.7 + position.z) * 1.5;
        p = mod(p - uCam, uBox) - uBox * 0.5 + uCam;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = (90.0 + fract(position.z * 3.7) * 110.0) / -mv.z;
        gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `void main(){ float d = length(gl_PointCoord - 0.5); if(d > 0.5) discard; gl_FragColor = vec4(1.0, 1.0, 1.0, smoothstep(0.5, 0.1, d) * 0.85); }`,
  });
  const snow = new THREE.Points(sg, snowMat);
  snow.frustumCulled = false;
  scene.add(snow);

  // 取景基準：從山麓往山頂看
  const box = { x1: 1e9, x2: -1e9, z1: 1e9, z2: -1e9 };
  let hi = runs[0],
    lo = runs[0];
  runs.forEach((r) => {
    r.pts.forEach((p) => {
      box.x1 = Math.min(box.x1, p[0]);
      box.x2 = Math.max(box.x2, p[0]);
      box.z1 = Math.min(box.z1, p[1]);
      box.z2 = Math.max(box.z2, p[1]);
    });
    if (r.top > hi.top) hi = r;
    if (r.bot < lo.bot) lo = r;
  });
  const cx = (box.x1 + box.x2) / 2,
    cz = (box.z1 + box.z2) / 2;
  const center = new THREE.Vector3(cx, heightAt(cx, cz), cz);
  const radius = Math.hypot(box.x2 - box.x1, box.z2 - box.z1) / 2;
  const tpP = hi.pts[0],
    btP = lo.pts[lo.n - 1];
  const viewDir = new THREE.Vector3(
    btP[0] - tpP[0],
    0,
    btP[1] - tpP[1],
  ).normalize();

  const tmp = new THREE.Vector3();
  function update(t, camera) {
    snowMat.uniforms.uT.value = t;
    snowMat.uniforms.uCam.value.copy(camera.position);
    sky.position.copy(camera.position);
    sunGlow.position.copy(camera.position).addScaledVector(sunDir, 14000);
    for (const cb of cabins) {
      let f = (cb.phase + t * cb.speed * cb.dir) % 1;
      if (f < 0) f += 1;
      const u = f * (cb.path.length - 1),
        i = Math.min(cb.path.length - 2, u | 0);
      cb.mesh.position.copy(tmp.lerpVectors(cb.path[i], cb.path[i + 1], u - i));
      cb.mesh.position.y -= cb.hang;
    }
  }

  return {
    scene,
    runs,
    heightAt,
    surfaceAt,
    ribbon,
    piste,
    mapLayer,
    liftGroup,
    segs: data.segs,
    center,
    radius,
    viewDir,
    aimSun,
    update,
  };
}
