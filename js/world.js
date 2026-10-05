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

export function buildWorld(data, { lowPower = false } = {}) {
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

  scene.add(new THREE.HemisphereLight("#e4efff", "#b4c4d6", 1.75));
  const sun = new THREE.DirectionalLight("#fff0d8", 2.3);
  sun.position.set(-0.55, 0.5, 0.67);
  scene.add(sun);

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
      h: r.pts.map((p) => heightAt(p[0], p[1])),
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
  scene.add(
    new THREE.Mesh(
      tg,
      new THREE.MeshStandardMaterial({
        map: tex,
        roughness: 0.92,
        metalness: 0,
      }),
    ),
  );

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

  // 樹
  const cone = new THREE.ConeGeometry(3.4, 11, 6, 3);
  cone.translate(0, 6.5, 0);
  const cc = [],
    green = new THREE.Color("#1c4636"),
    white = new THREE.Color("#eef4f7");
  for (let i = 0; i < cone.attributes.position.count; i++) {
    const y = cone.attributes.position.getY(i);
    c.copy(y > 7.5 ? white : green);
    cc.push(c.r, c.g, c.b);
  }
  cone.setAttribute("color", new THREE.Float32BufferAttribute(cc, 3));
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
  const trees = new THREE.InstancedMesh(
    cone,
    new THREE.MeshLambertMaterial({ vertexColors: true }),
    spots.length / 2,
  );
  const m4 = new THREE.Matrix4(),
    qt = new THREE.Quaternion(),
    sc = new THREE.Vector3(),
    tp = new THREE.Vector3(),
    up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < spots.length / 2; i++) {
    const s = 0.7 + Math.random() * 1.1;
    tp.set(
      spots[i * 2],
      heightAt(spots[i * 2], spots[i * 2 + 1]) - 1,
      spots[i * 2 + 1],
    );
    qt.setFromAxisAngle(up, Math.random() * 6.28);
    m4.compose(tp, qt, sc.set(s, s * (0.9 + Math.random() * 0.5), s));
    trees.setMatrixAt(i, m4);
  }
  scene.add(trees);

  // 纜車
  const cabins = [];
  const liftGroup = new THREE.Group();
  const towerGeo = new THREE.CylinderGeometry(0.5, 0.7, 12, 6);
  const towerMat = new THREE.MeshLambertMaterial({ color: "#56626e" });
  data.lifts.forEach((l) => {
    const [a, b] = l.pts,
      len = Math.hypot(b[0] - a[0], b[1] - a[1]),
      n = Math.max(2, Math.round(len / 90));
    const path = [];
    for (let i = 0; i <= n; i++) {
      const x = a[0] + ((b[0] - a[0]) * i) / n,
        z = a[1] + ((b[1] - a[1]) * i) / n,
        y = heightAt(x, z);
      path.push(new THREE.Vector3(x, y + 12, z));
      const t = new THREE.Mesh(towerGeo, towerMat);
      t.position.set(x, y + 6, z);
      liftGroup.add(t);
    }
    liftGroup.add(
      new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(path),
        new THREE.LineBasicMaterial({ color: "#2b3540" }),
      ),
    );
    const gondola = l.type === "gondola";
    const geo = gondola
      ? new THREE.BoxGeometry(3, 3, 3.6)
      : new THREE.BoxGeometry(2.6, 1.2, 1);
    const mat = new THREE.MeshLambertMaterial({
      color: gondola ? "#ff5a1f" : "#f2c230",
    });
    const count = Math.max(2, Math.round(len / (gondola ? 130 : 170)));
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(geo, mat);
      liftGroup.add(mesh);
      cabins.push({
        mesh,
        path,
        phase: i / count,
        speed: (gondola ? 5 : 3) / len,
        dir: i % 2 ? 1 : -1,
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
    for (const cb of cabins) {
      let f = (cb.phase + t * cb.speed * cb.dir) % 1;
      if (f < 0) f += 1;
      const u = f * (cb.path.length - 1),
        i = Math.min(cb.path.length - 2, u | 0);
      cb.mesh.position.copy(tmp.lerpVectors(cb.path[i], cb.path[i + 1], u - i));
      cb.mesh.position.y -= 3;
    }
  }

  return {
    scene,
    runs,
    heightAt,
    ribbon,
    mapLayer,
    liftGroup,
    center,
    radius,
    viewDir,
    update,
  };
}
