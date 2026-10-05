// 首頁內容、3D 總覽、飛覽與滑行遊戲
import * as THREE from "three";
import { OrbitControls } from "three/addons/OrbitControls.js";
import { buildWorld, DIFF, STEP } from "./world.js";
import { createHazards } from "./hazards.js";
import { createSkier, BOARDS } from "./skier.js";
import { FACTS, COMPARE_ROWS } from "./facts.js";

const $ = (id) => document.getElementById(id);
const KEYS = ["teine", "kokusai"];
const lowPower = matchMedia("(pointer: coarse)").matches;
const fmtTime = (t) =>
  `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, "0")}`;
const diffTag = (d) => `<i class="d d${d}"></i>${DIFF[d].name}`;

/* ---------- 首頁 ---------- */
$("tickets").innerHTML = KEYS.map((k, i) => {
  const f = FACTS[k];
  return `<article class="ticket" style="--i:${i}">
    <div class="t-main">
      <p class="t-ja">${f.ja}</p>
      <h2>${f.name}</h2>
      <p class="t-tag">${f.tagline}</p>
      <ul>${f.stats.map((s) => `<li><span>${s[0]}</span><b>${s[1]}</b></li>`).join("")}</ul>
    </div>
    <div class="t-stub">
      <span>山頂</span><b>${f.peak}</b><span>公尺</span>
      <button class="solid" data-enter="${k}">進入雪場</button>
    </div>
  </article>`;
}).join("");

$("compare").innerHTML =
  `<thead><tr><th></th>${KEYS.map((k) => `<th>${FACTS[k].name}</th>`).join("")}</tr></thead><tbody>${COMPARE_ROWS.map(
    (r, i) =>
      `<tr><th>${r}</th>${KEYS.map((k) => `<td>${FACTS[k].compare[i]}</td>`).join("")}</tr>`,
  ).join("")}</tbody>`;

$("resorts").innerHTML = KEYS.map((k, i) => {
  const f = FACTS[k];
  return `<section class="band resort ${i % 2 ? "alt" : ""}">
    <h2><span>0${i + 2}</span>${f.name}<small>${f.ja}</small></h2>
    <div class="cols">
      <div>
        <ul class="points">${f.highlights.map((h) => `<li>${h}</li>`).join("")}</ul>
        <dl class="info">
          ${f.access.map((a) => `<dt>${a[0]}</dt><dd>${a[1]}</dd>`).join("")}
          <dt>營業時間</dt><dd>${f.hours}</dd>
          <dt>雪票</dt><dd>${f.ticket}</dd>
        </dl>
        <p class="links"><button class="solid" data-enter="${k}">進入 ${f.name} 3D 雪場</button><a href="${f.site}" target="_blank" rel="noopener">官方網站 ↗</a></p>
      </div>
      <div class="table-wrap">
        <table class="courses">
          <thead><tr><th>雪道</th><th>難度</th><th>長度</th><th>平均</th><th>最大</th></tr></thead>
          <tbody>${f.courses
            .map(
              (
                c,
                j,
              ) => `${c[0] && (!j || f.courses[j - 1][0] !== c[0]) ? `<tr class="zone"><td colspan="5">${c[0]}</td></tr>` : ""}
            <tr><td>${c[1]}<small>${c[2]}</small></td><td>${diffTag(c[3])}</td><td>${c[4].toLocaleString()} m</td><td>${c[5]}°</td><td>${c[6]}°</td></tr>`,
            )
            .join("")}</tbody>
        </table>
      </div>
    </div>
  </section>`;
}).join("");

const flakes = document.querySelector(".flakes");
// 近的雪花大、快、略糊；遠的小、慢、淡
for (let i = 0; i < 64; i++) {
  const s = document.createElement("i"), near = Math.random() ** 2;
  s.style.cssText = `left:${Math.random() * 100}%;--s:${(1.8 + near * 5.5).toFixed(1)}px;--o:${(0.35 + near * 0.55).toFixed(2)};--b:${near > 0.7 ? 1 : 0}px;--t:${(20 - near * 11 + Math.random() * 3).toFixed(1)}s;--d:${(-Math.random() * 22).toFixed(1)}s;--x:${(8 + Math.random() * 26).toFixed(0)}px;--w:${(2.4 + Math.random() * 3).toFixed(1)}s`;
  flakes.appendChild(s);
}

/* ---------- 3D ---------- */
let renderer,
  camera,
  controls,
  world,
  key,
  raf = 0,
  last = 0,
  clock = 0;
let mode = "explore"; // explore | fly | count | ski | result
let sel = null,
  hilite = null,
  labels = [],
  tween = null;
const worlds = {};
const input = { left: false, right: false, brake: false, tuck: false };
const G = {}; // 滑行狀態
const v3 = () => new THREE.Vector3();
const P = {},
  tA = v3(),
  tB = v3(),
  tC = v3();

function show(id, on) {
  $(id).hidden = !on;
}

function initGL() {
  if (renderer) return;
  renderer = new THREE.WebGLRenderer({
    canvas: $("gl"),
    antialias: !lowPower,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, lowPower ? 1.5 : 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  camera = new THREE.PerspectiveCamera(55, 1, 2, 40000);
  controls = new OrbitControls(camera, $("gl"));
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI * 0.47;
  controls.minDistance = 250;
  controls.maxDistance = 9000;
  controls.autoRotateSpeed = 0.35;
  controls.addEventListener("start", () => {
    controls.autoRotate = false;
    tween = null;
  });
  addEventListener("resize", resize);
  resize();
}

function resize() {
  if (!renderer) return;
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}

async function enter(k) {
  key = k;
  document.body.classList.add("in-app");
  show("app", true);
  show("error", false);
  show("loading", true);
  show("card", false);
  show("hud", false);
  show("result", false);
  $("tabs").innerHTML = KEYS.map(
    (x) =>
      `<button class="${x === k ? "on" : ""}" data-tab="${x}">${FACTS[x].name}</button>`,
  ).join("");
  try {
    initGL();
    if (!worlds[k]) {
      const res = await fetch(`data/${k}.json`);
      if (!res.ok) throw new Error(`資料讀取失敗（${res.status}）`);
      const data = await res.json();
      await new Promise((r) => setTimeout(r, 30)); // 先讓載入畫面出現
      worlds[k] = buildWorld(data, { lowPower });
    }
    if (key !== k) return;
    world = worlds[k];
    buildList();
    setMode("explore");
    select(null);
    frame(world.center, world.radius * 1.75, false);
    controls.autoRotate = true;
    show("loading", false);
    if (!raf) {
      last = performance.now();
      raf = requestAnimationFrame(loop);
    }
  } catch (e) {
    console.error(e);
    show("loading", false);
    $("errMsg").textContent = /webgl/i.test(e.message)
      ? "這個瀏覽器無法顯示 3D 畫面，請換一個瀏覽器再試。"
      : `${e.message || "發生未知錯誤"}，請檢查網路後重試。`;
    show("error", true);
  }
}

function leave() {
  cancelAnimationFrame(raf);
  raf = 0;
  clearGame();
  show("app", false);
  document.body.classList.remove("in-app");
}

// 把鏡頭擺到能看見整個目標的位置
function frame(target, dist, animate = true) {
  const to = v3()
    .copy(target)
    .addScaledVector(world.viewDir, dist)
    .add(v3().set(0, dist * 0.62, 0));
  if (!animate) {
    camera.position.copy(to);
    controls.target.copy(target);
    controls.update();
    return;
  }
  tween = {
    p0: camera.position.clone(),
    p1: to,
    t0: controls.target.clone(),
    t1: target.clone(),
    t: 0,
  };
}

function buildList() {
  $("runList").innerHTML = world.runs
    .map(
      (r, i) =>
        `<li><button data-run="${i}"><i class="d d${r.diff}"></i><span>${r.zh}</span><em>${(r.len / 1000).toFixed(1)} km</em></button></li>`,
    )
    .join("");
  $("labels").innerHTML = "";
  labels = world.runs.map((r, i) => {
    const el = document.createElement("button");
    el.className = `lbl d${r.diff}`;
    el.textContent = r.zh.split("＋")[0];
    el.dataset.run = i;
    $("labels").appendChild(el);
    const p = r.at(r.L * 0.32);
    return { el, pos: v3().set(p.x, world.heightAt(p.x, p.z) + 14, p.z) };
  });
}

function profilePath(run, w, h) {
  const lo = run.bot,
    hi = Math.max(...run.h),
    n = run.h.length;
  let d = `M0 ${h}`;
  for (let i = 0; i < n; i += Math.max(1, Math.floor(n / 150)))
    d += ` L${((i / (n - 1)) * w).toFixed(1)} ${(h - 4 - ((run.h[i] - lo) / (hi - lo || 1)) * (h - 8)).toFixed(1)}`;
  return `<path d="${d} L${w} ${h}Z"/>`;
}

function select(i) {
  if (hilite) {
    world.scene.remove(hilite);
    hilite.geometry.dispose();
    hilite = null;
  }
  sel = i == null ? null : world.runs[i];
  document
    .querySelectorAll("#runList button")
    .forEach((b) => b.classList.toggle("on", +b.dataset.run === i));
  labels.forEach((l, j) => l.el.classList.toggle("on", j === i));
  show("card", !!sel);
  if (!sel) return;
  hilite = world.ribbon(sel.pts, 20, 4, "#ffd23c", 0.92);
  world.scene.add(hilite);
  $("cZone").innerHTML = `${diffTag(sel.diff)}　${sel.zone}`;
  $("cName").textContent = sel.zh;
  $("cJa").textContent = sel.ja;
  $("cStats").innerHTML = [
    ["長度", `${sel.len.toLocaleString()} m`],
    ["落差", `${sel.drop} m`],
    ["平均坡度", `${sel.avg}°`],
    ["最大坡度", `${sel.max}°`],
    ["起點", `${sel.top} m`],
    ["終點", `${sel.bot} m`],
  ]
    .map((s) => `<div><dt>${s[0]}</dt><dd>${s[1]}</dd></div>`)
    .join("");
  $("cProfile").innerHTML = profilePath(sel, 300, 70);
  const m = sel.at(sel.L / 2);
  controls.autoRotate = false;
  frame(
    v3().set(m.x, world.heightAt(m.x, m.z), m.z),
    Math.max(650, sel.L * 0.55),
  );
}

const GATE_W = 6.5; // 旗門半寬（公尺）

/* ---------- 小地圖 ---------- */
// 以自己為中心、前進方向朝上，看得到前方約 300 公尺的彎道、旗門與跳台
const MINI_SPAN = 440;
function drawMini() {
  const cv = $("mini"), g = cv.getContext("2d"), r = G.run, size = cv.width, k = size / MINI_SPAN;
  const fly = mode === "fly";
  const p = r.at(G.s, {}), d = fly ? 0 : G.d;
  const px = p.x - p.tz * d, pz = p.z + p.tx * d;
  g.clearRect(0, 0, size, size);
  g.save();
  g.translate(size / 2, size * 0.68);
  g.rotate(-Math.atan2(p.tz, p.tx) - Math.PI / 2);
  g.scale(k, k);
  g.translate(-px, -pz);
  g.lineCap = g.lineJoin = "round";
  const line = (pts, w, c) => {
    g.beginPath();
    pts.forEach((q, i) => g[i ? "lineTo" : "moveTo"](q[0], q[1]));
    g.lineWidth = w;
    g.strokeStyle = c;
    g.stroke();
  };
  world.segs.forEach((sg) => line(sg.pts, 16, "rgba(255,255,255,.2)"));
  // 本雪道依各段實際寬度畫，只畫小地圖範圍內的部分
  const i0 = Math.max(0, Math.floor((G.s - 260) / STEP)),
    i1 = Math.min(r.n - 1, Math.ceil((G.s + 420) / STEP));
  for (const [extra, c] of [[12, DIFF[r.diff].color], [0, "#ffffff"]]) {
    g.strokeStyle = c;
    for (let i = i0; i < i1; i++) {
      g.beginPath();
      g.moveTo(r.pts[i][0], r.pts[i][1]);
      g.lineTo(r.pts[i + 1][0], r.pts[i + 1][1]);
      g.lineWidth = r.w[i] * 2 + extra;
      g.stroke();
    }
  }
  const dot = (x, z, rad, c) => {
    g.fillStyle = c;
    g.beginPath();
    g.arc(x, z, rad, 0, 7);
    g.fill();
  };
  const end = r.pts[r.n - 1];
  dot(end[0], end[1], 14, "#ff5a1f");
  if (!fly) {
    for (const kk of G.kickers) {
      const q = r.at(kk.s, {});
      dot(q.x, q.z, 7, "#ffb400");
    }
    for (const h of G.haz.list) {
      if (h.state === "idle" || h.state === "gone" || h.s < G.s) continue;
      const hx = h.p.x - h.p.tz * h.d, hz = h.p.z + h.p.tx * h.d;
      dot(hx, hz, 10, "#ffffff");
      dot(hx, hz, 7, "#e0263c");
    }
    for (const gt of G.gates) {
      const q = r.at(gt.s, {}), c = gt.hit ? "#2fd27a" : gt.done ? "#8d99a6" : gt.mats[1].color.getStyle();
      for (const o of [-GATE_W, GATE_W]) dot(q.x - q.tz * (gt.d + o), q.z + q.tx * (gt.d + o), 4.5, c);
    }
  }
  g.restore();
  // 自己
  g.save();
  g.translate(size / 2, size * 0.68);
  g.rotate(fly ? 0 : G.ang);
  g.beginPath();
  g.moveTo(0, -17); g.lineTo(11, 11); g.lineTo(0, 5); g.lineTo(-11, 11);
  g.closePath();
  g.lineWidth = 4;
  g.strokeStyle = "#fff";
  g.stroke();
  g.fillStyle = "#ff5a1f";
  g.fill();
  g.restore();
}

/* ---------- 雪板 ---------- */
let board = BOARDS[0];
try {
  board = BOARDS.find((b) => b.id === localStorage.getItem("board")) || board;
} catch {}
function renderGear() {
  $("gear").innerHTML = BOARDS.map(
    (b) => `<button data-board="${b.id}" class="${b === board ? "on" : ""}" style="--c:${b.color}"><i></i>${b.name}</button>`,
  ).join("");
  $("gearDesc").textContent = board.desc;
}
renderGear();

function setMode(m) {
  mode = m;
  $("app").dataset.mode = m;
  const explore = m === "explore";
  controls.enabled = explore;
  world.mapLayer.visible = explore;
  world.liftGroup.visible = m !== "count" && m !== "result"; // 特寫鏡頭不讓纜車支柱擋住
  if (hilite) {
    hilite.visible = explore || m === "fly";
    hilite.material.opacity = explore ? 0.92 : 0.3; // 飛覽時只留淡淡的路線提示
  }
  world.scene.fog.density = explore ? 0.00011 : 0.00042;
  show("hud", m !== "explore");
  show("result", m === "result");
  show("count", m === "count");
  if (explore) {
    camera.fov = 55;
    camera.up.set(0, 1, 0);
    camera.updateProjectionMatrix();
  }
}

/* ---------- 飛覽 ---------- */
function startFly() {
  clearGame();
  G.run = sel;
  G.s = 0;
  G.t = 0;
  G.flySpeed = Math.max(28, sel.L / 50);
  setupHud(sel, true);
  setMode("fly");
  G.snap = true;
}

/* ---------- 滑行 ---------- */
let dotTex;
function dotTexture() {
  if (dotTex) return dotTex;
  const c = document.createElement("canvas");
  c.width = c.height = 32;
  const g = c.getContext("2d"), grd = g.createRadialGradient(16, 16, 2, 16, 16, 16);
  grd.addColorStop(0, "#fff");
  grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 32, 32);
  return (dotTex = new THREE.CanvasTexture(c));
}

function clearGame() {
  if (G.group && world) world.scene.remove(G.group);
  G.group = null;
  showWarn(null);
  $("hud").classList.remove("hurt");
}

// 地面上的一點
function ground(x, z) {
  return { x, y: world.heightAt(x, z), z };
}
// 立在地面的桿子：往下多埋一截，斜坡上不會懸空
function post(f, h, rad, mat) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rad, rad, h + 3, 6), mat);
  m.position.set(f.x, f.y + (h - 3) / 2, f.z);
  return m;
}
// 橫幅：四個角接在兩根桿頂，地面一高一低也不會脫節
function spanBanner(a, b, top, h, mat) {
  const g = new THREE.BufferGeometry();
  g.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(
      [a.x, a.y + top, a.z, b.x, b.y + top, b.z, a.x, a.y + top - h, a.z, b.x, b.y + top - h, b.z],
      3,
    ),
  );
  g.setIndex([0, 2, 1, 1, 2, 3]);
  return new THREE.Mesh(g, mat);
}

function startSki() {
  clearGame();
  const r = sel,
    grp = new THREE.Group();
  G.run = r;
  G.s = 2;
  G.d = 0;
  G.v = 0;
  G.ang = 0;
  G.t = 0;
  G.max = 0;
  G.hits = 0;
  G.board = board;
  G.y = 0;
  G.vy = 0;
  G.air = false;
  G.onRamp = false;
  G.trick = null;
  G.score = 0;
  G.cd = 3.2;
  G.snap = true;
  G.pitch = 0;
  G.push = 0;
  G.hp = 100;
  G.hpShown = -1;
  G.failed = false;
  G.inv = 0;
  G.dodged = 0;
  G.skier = createSkier(board);
  grp.add(G.skier.group);

  // 旗門：兩根桿子加上方橫幅，從中間穿過就算通過
  const gap = r.diff === 2 ? 85 : 110;
  G.gates = [];
  for (let s = 90, i = 0; s < r.L - 70; s += gap, i++) {
    const p = r.at(s),
      d = (i % 2 ? 1 : -1) * Math.max(0, Math.min(r.wAt(s) * 0.36, r.wAt(s) - GATE_W - 1)),
      col = i % 2 ? "#1f6feb" : "#e23b2e";
    const mats = [
      new THREE.MeshLambertMaterial({ color: col }),
      new THREE.MeshBasicMaterial({ color: col, side: THREE.DoubleSide }),
    ];
    const feet = [-GATE_W, GATE_W].map((o) =>
      ground(p.x - p.tz * (d + o), p.z + p.tx * (d + o)),
    );
    for (const f of feet) grp.add(post(f, 4, 0.11, mats[0]));
    grp.add(spanBanner(feet[0], feet[1], 4, 0.95, mats[1]));
    G.gates.push({ s, d, mats, done: false, hit: false });
  }
  // 雪道邊界桿
  const edge = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.07, 0.07, 1.8, 4),
    new THREE.MeshBasicMaterial({ color: "#ff8a3c" }),
    Math.ceil(r.L / 12) * 2,
  );
  const m4 = new THREE.Matrix4();
  for (let s = 0, k = 0; s < r.L; s += 12)
    for (const side of [-1, 1]) {
      const p = r.at(s),
        w = r.wAt(s),
        x = p.x - p.tz * side * w,
        z = p.z + p.tx * side * w;
      edge.setMatrixAt(
        k++,
        m4.makeTranslation(x, world.heightAt(x, z) + 0.9, z),
      );
    }
  grp.add(edge);
  // 兩側邊線與地面箭頭：一眼看出雪道往哪裡走
  const LIFT = 0.3,
    lineV = [],
    arrowV = [];
  const put = (arr, q, f, w) => {
    const x = q.x + q.tx * f - q.tz * w,
      z = q.z + q.tz * f + q.tx * w;
    arr.push(x, world.surfaceAt(x, z) + LIFT, z);
  };
  for (let s = 0; s < r.L - 6; s += 6) {
    const a = r.at(s),
      b = r.at(s + 6);
    for (const side of [-1, 1]) {
      const wa = r.wAt(s),
        wb = r.wAt(s + 6);
      put(lineV, a, 0, side * (wa - 0.5)), put(lineV, a, 0, side * (wa + 0.5)), put(lineV, b, 0, side * (wb - 0.5));
      put(lineV, a, 0, side * (wa + 0.5)), put(lineV, b, 0, side * (wb + 0.5)), put(lineV, b, 0, side * (wb - 0.5));
    }
  }
  // 箭頭：左右兩臂各切成小段，順著地形起伏；尖端朝前
  const ARM = 3.2,
    N = 4;
  for (let s = 14; s < r.L - 24; s += 16) {
    const q = r.at(s);
    for (const side of [-1, 1])
      for (let i = 0; i < N; i++) {
        const w0 = (side * ARM * i) / N,
          w1 = (side * ARM * (i + 1)) / N,
          f0 = 1.6 - (2.1 * i) / N,
          f1 = 1.6 - (2.1 * (i + 1)) / N;
        put(arrowV, q, f0, w0), put(arrowV, q, f1, w1), put(arrowV, q, f0 - 1.1, w0);
        put(arrowV, q, f1, w1), put(arrowV, q, f1 - 1.1, w1), put(arrowV, q, f0 - 1.1, w0);
      }
  }
  for (const [arr, color, opacity] of [[lineV, "#ff8a3c", 0.75], [arrowV, "#ff5a1f", 0.62]]) {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(arr, 3));
    grp.add(
      new THREE.Mesh(
        g,
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }),
      ),
    );
  }
  // 跳台：排在旗門之間
  G.kickers = [];
  const KL = 7, KW = 7.5, KH = 1.5;
  const wedge = new THREE.BufferGeometry();
  const A = [-KW / 2, 0, -KL], B2 = [KW / 2, 0, -KL], C = [-KW / 2, 0, 0], D = [KW / 2, 0, 0], E = [-KW / 2, KH, 0], F = [KW / 2, KH, 0];
  wedge.setAttribute("position", new THREE.Float32BufferAttribute([A, E, B2, B2, E, F, C, D, E, D, F, E, A, C, E, B2, F, D].flat(), 3));
  wedge.computeVertexNormals();
  const wedgeMat = new THREE.MeshStandardMaterial({ color: "#f4f9ff", roughness: 0.9, side: THREE.DoubleSide });
  const lipMat = new THREE.MeshBasicMaterial({ color: "#ff5a1f" });
  for (let s = 90 + gap * 1.5; s < r.L - 120; s += gap * 2) {
    const p = r.at(s), y = world.heightAt(p.x, p.z), ya = world.heightAt(p.x + p.tx * 3, p.z + p.tz * 3);
    const k = new THREE.Mesh(wedge, wedgeMat);
    k.position.set(p.x, y - 0.25, p.z);
    k.rotation.set(Math.atan2(y - ya, 3), Math.atan2(p.tx, p.tz), 0, "YXZ");
    const lip = new THREE.Mesh(new THREE.BoxGeometry(KW, 0.12, 0.3), lipMat);
    lip.position.set(0, KH, -0.1);
    k.add(lip);
    grp.add(k);
    G.kickers.push({ s, d: 0, len: KL, w: KW, h: KH });
  }
  // 隨機關卡：雪球、狼、雪怪
  G.haz = createHazards(world, r, G.kickers, G.gates, grp);
  // 終點
  const e = r.at(r.L - 16),
    ends = [-1, 1].map((side) =>
      ground(e.x - e.tz * side * r.wAt(r.L - 16), e.z + e.tx * side * r.wAt(r.L - 16)),
    ),
    postMat = new THREE.MeshLambertMaterial({ color: "#22303f" });
  for (const f of ends) grp.add(post(f, 6.8, 0.18, postMat));
  grp.add(
    spanBanner(ends[0], ends[1], 6.8, 2.2, new THREE.MeshBasicMaterial({ color: "#ff5a1f", side: THREE.DoubleSide })),
  );
  // 雪霧：每顆粒子有自己的大小與壽命，會擴散、變淡
  const SN = (G.sprayN = lowPower ? 360 : 800);
  G.sprayI = 0;
  G.sprayAcc = 0;
  G.sprayP = new Float32Array(SN * 3).fill(-9999);
  G.sprayV = new Float32Array(SN * 3);
  G.sprayL = new Float32Array(SN * 2); // 剩餘壽命、總壽命
  G.sprayF = new Float32Array(SN);
  G.sprayS = new Float32Array(SN);
  const sg = new THREE.BufferGeometry();
  sg.setAttribute("position", new THREE.BufferAttribute(G.sprayP, 3));
  sg.setAttribute("aFade", new THREE.BufferAttribute(G.sprayF, 1));
  sg.setAttribute("aSize", new THREE.BufferAttribute(G.sprayS, 1));
  G.spray = new THREE.Points(
    sg,
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uScale: { value: renderer.domElement.height * 0.9 } },
      vertexShader: `attribute float aFade; attribute float aSize; uniform float uScale; varying float vF;
        void main(){ vF = aFade; vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * (1.0 + (1.0 - aFade) * 1.8) * uScale / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying float vF;
        void main(){ float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard;
          float core = smoothstep(0.5, 0.0, d);
          vec3 col = mix(vec3(0.84, 0.9, 0.97), vec3(1.0), core);
          gl_FragColor = vec4(col, core * core * vF * 0.6); }`,
    }),
  );
  G.spray.frustumCulled = false;
  grp.add(G.spray);

  // 滑行痕跡：雙板兩條、單板一條，轉彎或煞車時刮得比較寬
  const TN = (G.trackN = lowPower ? 320 : 700);
  G.trackI = 0;
  G.trackLast = null;
  G.trackP = new Float32Array(TN * 36);
  const tg = new THREE.BufferGeometry();
  tg.setAttribute("position", new THREE.BufferAttribute(G.trackP, 3));
  G.track = new THREE.Mesh(
    tg,
    new THREE.MeshBasicMaterial({ color: "#8ea4c0", transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
  );
  G.track.frustumCulled = false;
  grp.add(G.track);

  G.group = grp;
  world.scene.add(grp);
  setupHud(r, false);
  setMode("count");
  placeSkier(0, "count");
}

function setupHud(r, fly) {
  $("hName").innerHTML = `${diffTag(r.diff)}　${r.zh}${fly ? "｜飛覽" : ""}`;
  $("hProfile").innerHTML = profilePath(r, 300, 40);
  $("hud").classList.toggle("fly", fly);
  $("hGate").textContent = "0";
  $("hUnit").textContent = fly ? "° 坡度" : "km/h";
  $("hTime").textContent = fly ? "" : "0:00.0";
}

function skierPos(out) {
  G.run.at(G.s, P);
  out.set(P.x - P.tz * G.d, 0, P.z + P.tx * G.d);
  out.y = world.heightAt(out.x, out.z);
  return out;
}

// cam：count 起跑前繞到正面、ski 跟在後方、result 終點歡呼
function placeSkier(dt, cam = "ski") {
  const pos = skierPos(tA),
    c = Math.cos(G.ang),
    s = Math.sin(G.ang);
  const hx = P.tx * c - P.tz * s,
    hz = P.tz * c + P.tx * s; // 實際行進方向
  const ahead = world.heightAt(pos.x + hx * 3, pos.z + hz * 3);
  const k = G.snap ? 1 : 1 - Math.exp(-dt * 10);
  G.pitch += (Math.atan2(pos.y - ahead, 3) - G.pitch) * k;
  const sk = G.skier.group;
  sk.position.copy(pos);
  sk.rotation.set(G.pitch, Math.atan2(hx, hz), 0, "YXZ");
  G.skier.update(dt, {
    phase: cam === "ski" ? "ski" : cam === "result" && !G.failed ? "cheer" : "idle",
    steer: (input.right ? 1 : 0) - (input.left ? 1 : 0),
    ang: G.ang,
    v: G.v,
    brake: input.brake,
    tuck: input.tuck,
    push: G.push,
    y: G.y,
    air: G.air,
    trick: G.trick,
  });

  // 鏡頭跟在路線方向後方，轉彎時畫面才不會亂晃
  const bx = P.tx * 0.75 + hx * 0.25,
    bz = P.tz * 0.75 + hz * 0.25;
  let fov = 58;
  if (cam === "ski") {
    tB.set(pos.x - bx * 13, 0, pos.z - bz * 13);
    tB.y = Math.max(pos.y + 5.2, world.heightAt(tB.x, tB.z) + 3.2);
    tC.set(
      pos.x + bx * 14,
      world.heightAt(pos.x + bx * 14, pos.z + bz * 14) + 1.6,
      pos.z + bz * 14,
    );
    camera.up.set(-P.tz * G.ang * 0.09, 1, P.tx * G.ang * 0.09); // 轉彎時畫面微微傾斜
    follow(tB, tC, dt, 5);
    fov += Math.min(22, G.v * 0.7);
  } else {
    const front = cam === "result";
    let u = front ? 1 : Math.min(1, Math.max(0, (G.cd - 0.5) / 2.7));
    u = u * u * (3 - 2 * u);
    const phi = front ? Math.PI + Math.sin(clock * 0.5) * 0.5 : Math.PI * 0.86 * u;
    const dist = front ? 7 : 13 - 7 * u,
      cp = Math.cos(phi),
      sp = Math.sin(phi);
    tB.set(pos.x + (-bx * cp - bz * sp) * dist, 0, pos.z + (bx * sp - bz * cp) * dist);
    tB.y = Math.max(pos.y + 5.2 - 3 * u, world.heightAt(tB.x, tB.z) + 1.4);
    tC.set(pos.x + bx * 14 * (1 - u), pos.y + 1.6, pos.z + bz * 14 * (1 - u));
    if (front) {
      // 把人物讓到成績面板旁邊
      const vx = pos.x - tB.x, vz = pos.z - tB.z, l = Math.hypot(vx, vz) || 1;
      if (camera.aspect > 1) { tC.x += (-vz / l) * 2.2; tC.z += (vx / l) * 2.2; }
      else tC.y -= 1.3;
    }
    camera.up.set(0, 1, 0);
    follow(tB, tC, dt, 6);
    fov = 52;
  }
  if (Math.abs(fov - camera.fov) > 0.05) {
    camera.fov += (fov - camera.fov) * (1 - Math.exp(-dt * 5));
    camera.updateProjectionMatrix();
  }
}

const look = v3();
function follow(pos, target, dt, rate) {
  const k = G.snap ? 1 : 1 - Math.exp(-dt * rate);
  camera.position.lerp(pos, k);
  look.lerp(target, k);
  camera.lookAt(look);
  G.snap = false;
}

function stepSki(dt) {
  const r = G.run;
  G.t += dt;
  G.push = Math.max(0, G.push - dt);
  const B = G.board;
  const steer = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  G.ang += (steer * 0.82 - G.ang) * Math.min(1, dt * (G.air ? 1.1 : 3.4 * B.turn));
  r.at(G.s, P);
  const sin = Math.max(0.1, P.grade / Math.hypot(1, P.grade)); // 平緩段也保有基本下滑力
  const drag = (input.tuck ? 0.0027 : 0.0045) * B.drag * G.v * G.v;
  let a = 9.81 * sin * Math.cos(G.ang) - drag;
  if (G.air) a *= 0.7; // 騰空時不吃雪面阻力，也不能煞車
  else {
    a -= 0.29 + Math.abs(G.ang) * 0.11 * G.v;
    if (input.brake) a -= 7.5;
    else if (G.push > 0) a += 3; // 起步撐杖推進
    const over = Math.abs(G.d) - r.wAt(G.s);
    if (over > 0) a -= (1.6 + over * 0.4) * B.powder; // 衝出壓雪區，深雪拖慢
  }
  G.v = Math.max(input.brake && !G.air ? 0 : 4.5, G.v + a * dt);

  // 跳台與騰空
  if (G.air) {
    G.vy -= 15 * dt;
    G.y += G.vy * dt;
    if (G.trick) {
      G.trick.p += dt / 0.62;
      if (G.trick.p >= 1) {
        const pts = Math.round((G.trick.type === "spin" ? 300 : 500) * B.trick);
        G.score += pts;
        popup(`${G.trick.name} +${pts}`);
        G.trick = null;
      }
    }
    if (G.y <= 0) {
      G.y = 0;
      G.air = false;
      burst(14);
      if (G.trick) {
        G.trick = null;
        G.v *= 0.45;
        popup("落地失誤");
      }
    }
  } else {
    let ramp = 0;
    for (const k of G.kickers) {
      const u = (G.s - (k.s - k.len)) / k.len;
      if (u > 0 && u < 1 && Math.abs(G.d - k.d) < k.w / 2) ramp = k.h * u;
    }
    if (ramp > 0) {
      G.y = ramp;
      G.onRamp = true;
    } else if (G.onRamp) {
      G.onRamp = false;
      G.air = true;
      G.vy = Math.min(10.5, 3.5 + G.v * 0.26) * B.jump;
    } else G.y = 0;
  }
  const s0 = G.s;
  G.s += G.v * Math.cos(G.ang) * dt;
  G.d = Math.max(
    -r.wAt(G.s) - 9,
    Math.min(r.wAt(G.s) + 9, G.d + G.v * Math.sin(G.ang) * dt),
  );
  G.max = Math.max(G.max, G.v);

  for (const g of G.gates) {
    if (g.done || g.s > G.s) continue;
    g.done = true;
    if (g.s >= s0 - 30 && Math.abs(G.d - g.d) < GATE_W + 0.6) {
      G.hits++;
      G.hp = Math.min(100, G.hp + 5);
      g.hit = true;
      g.mats.forEach((m) => m.color.set("#2fd27a"));
      popup(`通過旗門 ${G.hits}/${G.gates.length}`);
      $("hGate").parentElement.classList.remove("pop");
      void $("hGate").offsetWidth;
      $("hGate").parentElement.classList.add("pop");
    } else g.mats.forEach((m) => m.color.set("#8d99a6"));
  }

  // 隨機關卡：預警與碰撞
  G.inv = Math.max(0, G.inv - dt);
  const danger = G.haz.update(dt, G.s, G.d, G.y, clock);
  showWarn(danger.warn);
  if (danger.hit && G.inv <= 0) {
    const h = danger.hit;
    G.hp = Math.max(0, G.hp - h.dmg);
    G.inv = 1.6;
    G.v *= 0.35;
    burst(16);
    popup(`撞到${h.name} −${h.dmg}`);
    $("hud").classList.remove("hurt");
    void $("hud").offsetWidth;
    $("hud").classList.add("hurt");
    if (G.hp <= 0) {
      G.skier.group.visible = true;
      h.mesh.visible = h.sign.visible = false; // 結算鏡頭會繞到正面，別讓牠擋住人物
      showWarn(null);
      return finish(true);
    }
  }
  G.skier.group.visible = G.inv <= 0 || Math.floor(G.inv * 12) % 2 === 0; // 受傷後短暫無敵，人物閃爍

  // 雪霧與痕跡
  const pos = skierPos(tA),
    ca = Math.cos(G.ang),
    sa = Math.sin(G.ang),
    hx = P.tx * ca - P.tz * sa,
    hz = P.tz * ca + P.tx * sa, // 行進方向
    nx = -hz,
    nz = hx, // 行進方向的右側
    grounded = !G.air && G.y === 0;
  const edge = Math.min(1, Math.abs(G.ang) / 0.7) * Math.min(1.3, G.v / 13),
    stop = input.brake ? Math.min(1.5, G.v / 7) : 0,
    deep = Math.abs(G.d) > r.wAt(G.s) ? Math.min(1, G.v / 10) : 0;
  if (grounded && G.v > 2) {
    const out = -(Math.sign(G.ang) || 1); // 雪往彎道外側噴
    G.sprayAcc += (edge * 240 + stop * 300 + deep * 120 + (G.v > 9 ? 22 : 0)) * dt * (lowPower ? 0.5 : 1);
    while (G.sprayAcc >= 1) {
      G.sprayAcc--;
      const along = (Math.random() - 0.6) * 1.5,
        power = edge + stop * 0.8 + deep * 0.5,
        side = stop > edge || deep > edge ? (Math.random() < 0.5 ? 1 : -1) : out,
        lat = (1.2 + Math.random() * 4.2) * (0.25 + power) * side,
        fwd = G.v * (stop ? 0.55 : 0.28) * (0.6 + Math.random() * 0.7);
      snow(
        pos.x + hx * along + nx * side * 0.25,
        pos.y + 0.08,
        pos.z + hz * along + nz * side * 0.25,
        hx * fwd + nx * lat + (Math.random() - 0.5) * 1.2,
        (0.5 + Math.random() * 3.6) * (0.2 + power),
        hz * fwd + nz * lat + (Math.random() - 0.5) * 1.2,
        0.45 + Math.random() * 0.7,
        0.14 + Math.random() * 0.28 * (0.5 + power),
      );
    }
  }
  const airDrag = Math.exp(-2.4 * dt);
  for (let k = 0; k < G.sprayN; k++) {
    if (G.sprayL[k * 2] <= 0) continue;
    const life = (G.sprayL[k * 2] -= dt);
    if (life <= 0) {
      G.sprayP[k * 3 + 1] = -9999;
      G.sprayF[k] = 0;
      continue;
    }
    G.sprayV[k * 3] *= airDrag;
    G.sprayV[k * 3 + 2] *= airDrag;
    G.sprayV[k * 3 + 1] -= 7.5 * dt;
    G.sprayP[k * 3] += G.sprayV[k * 3] * dt;
    G.sprayP[k * 3 + 1] += G.sprayV[k * 3 + 1] * dt;
    G.sprayP[k * 3 + 2] += G.sprayV[k * 3 + 2] * dt;
    G.sprayF[k] = Math.min(1, (life / G.sprayL[k * 2 + 1]) * 1.6);
  }
  const sa3 = G.spray.geometry.attributes;
  sa3.position.needsUpdate = sa3.aFade.needsUpdate = sa3.aSize.needsUpdate = true;

  if (!grounded) G.trackLast = null;
  else {
    const skid = Math.min(1, Math.abs(G.ang) * 0.9 + (input.brake ? 0.8 : 0)),
      ski = G.board.kind === "ski",
      wid = (ski ? 0.12 : 0.3) + skid * (ski ? 0.2 : 0.55),
      cur = [];
    for (const off of ski ? [-0.2, 0.2] : [0, 0])
      for (const e of [-0.5, 0.5]) {
        const x = pos.x + nx * (off + e * wid),
          z = pos.z + nz * (off + e * wid);
        cur.push(x, world.surfaceAt(x, z) + 0.06, z);
      }
    const L = G.trackLast,
      moved = L ? Math.hypot(cur[0] - L[0], cur[2] - L[2]) : 0;
    if (!L || moved > 4) G.trackLast = cur;
    else if (moved > 0.45) {
      const o = (G.trackI++ % G.trackN) * 36;
      for (let lane = 0; lane < 2; lane++) {
        const a = lane * 6,
          q = [0, 3, 6, 3, 9, 6]; // 兩個三角形：前一格左右、這一格左右
        for (let v = 0; v < 6; v++) {
          const src = q[v] < 6 ? L : cur,
            b = a + (q[v] % 6);
          G.trackP.set([src[b], src[b + 1], src[b + 2]], o + lane * 18 + v * 3);
        }
      }
      G.track.geometry.attributes.position.needsUpdate = true;
      G.trackLast = cur;
    }
  }

  placeSkier(dt, "ski");
  if (G.s >= r.L - 4) finish();
}

// 空白鍵：在地面是跳，騰空時再按一次做特技
function pressJump() {
  if (mode !== "ski") return;
  if (!G.air) {
    G.air = true;
    G.onRamp = false;
    G.vy = 6.4 * G.board.jump;
    burst(8);
  } else if (!G.trick) {
    const dir = input.left ? 1 : -1;
    G.trick = input.tuck
      ? { type: "front", name: "前空翻", p: 0 }
      : input.brake
        ? { type: "back", name: "後空翻", p: 0 }
        : { type: "spin", name: "360 轉體", dir, p: 0 };
    G.vy = Math.max(G.vy, 0) + 3.4; // 再推一把，讓動作轉得完
  }
}

function popup(text) {
  const el = $("pop");
  el.textContent = text;
  el.classList.remove("show");
  void el.offsetWidth;
  el.classList.add("show");
}

// 起跳與落地的一圈雪花
// 畫面上方的預警：是什麼、從哪邊來、還有多遠
let warnKey = "";
function showWarn(h) {
  const el = $("warn");
  if (!h) {
    if (warnKey) (el.hidden = true), (warnKey = "");
    return;
  }
  const dist = Math.max(0, Math.round((h.s - G.s) / 10) * 10),
    from = h.side < 0 ? "左" : "右",
    text = h.type === "ball" ? `雪球從${from}邊滾過來` : h.type === "wolf" ? `狼從${from}邊衝出來，往${h.side < 0 ? "右" : "左"}閃` : "前方有雪怪，繞開牠",
    k = `${h.type}${h.s}${dist}`;
  if (k === warnKey) return;
  warnKey = k;
  el.hidden = false;
  el.innerHTML = `<b>注意</b>${text}<em>${dist} m</em>`;
}

// 丟出一顆雪霧粒子
function snow(x, y, z, vx, vy, vz, life, size) {
  const k = G.sprayI++ % G.sprayN;
  G.sprayP.set([x, y, z], k * 3);
  G.sprayV.set([vx, vy, vz], k * 3);
  G.sprayL[k * 2] = G.sprayL[k * 2 + 1] = life;
  G.sprayF[k] = 1;
  G.sprayS[k] = size;
}

// 起跳、落地時向四周炸開的一圈雪
function burst(n) {
  const pos = skierPos(tA);
  for (let i = 0; i < n * 3; i++) {
    const a = Math.random() * 6.28,
      sp = 1.5 + Math.random() * 4.5;
    snow(pos.x + Math.cos(a) * 0.4, pos.y + 0.1, pos.z + Math.sin(a) * 0.4, Math.cos(a) * sp, 0.6 + Math.random() * 3, Math.sin(a) * sp, 0.4 + Math.random() * 0.6, 0.2 + Math.random() * 0.35);
  }
}

function updateHud() {
  const r = G.run,
    f = Math.min(1, G.s / r.L);
  $("hLeft").textContent = Math.max(0, Math.round(r.L - G.s)).toLocaleString();
  $("hAlt").textContent = Math.round(
    r.h[Math.min(r.n - 1, Math.round(G.s / STEP))],
  ).toLocaleString();
  $("hDot").style.left = `${f * 100}%`;
  drawMini();
  if (mode === "fly") {
    $("hSpeed").textContent = Math.round(Math.atan(r.at(G.s, P).grade) * 57.3);
    return;
  }
  $("hSpeed").textContent = Math.round(G.v * 3.6);
  if (G.hp !== G.hpShown) {
    G.hpShown = G.hp;
    $("hHp").style.width = `${G.hp}%`;
    $("hHp").style.background = G.hp > 60 ? "#2fd27a" : G.hp > 30 ? "#ffb400" : "#e0263c";
    $("hHpNum").textContent = G.hp;
  }
  $("hTime").textContent = fmtTime(G.t);
  $("hGate").textContent = `${G.hits}/${G.gates.length}`;
  $("hTrick").textContent = G.score.toLocaleString();
}

function finish(failed = false) {
  const r = G.run,
    id = `best:${key}:${r.id}`;
  $("rEyebrow").textContent = failed ? "體力耗盡" : "抵達終點";
  if (failed) {
    $("rName").innerHTML = `${diffTag(r.diff)}　${r.zh}`;
    $("rTime").textContent = "未完成";
    $("rBest").textContent = `滑了 ${Math.round(G.s).toLocaleString()} m，離終點還有 ${Math.max(0, Math.round(r.L - G.s)).toLocaleString()} m`;
    $("rStats").innerHTML = [
      ["最高時速", `${Math.round(G.max * 3.6)} km/h`],
      ["滑行時間", fmtTime(G.t)],
      ["旗門", `${G.hits}/${G.gates.length}`],
      ["特技分", G.score.toLocaleString()],
    ]
      .map((s) => `<div><dt>${s[0]}</dt><dd>${s[1]}</dd></div>`)
      .join("");
    G.v = 0;
    G.ang = 0;
    G.failed = true;
    return setMode("result");
  }
  G.failed = false;
  let best = null;
  try {
    best = parseFloat(localStorage.getItem(id));
  } catch {}
  const record = !(best > 0) || G.t < best;
  if (record)
    try {
      localStorage.setItem(id, G.t.toFixed(2));
    } catch {}
  $("rName").innerHTML = `${diffTag(r.diff)}　${r.zh}`;
  $("rTime").textContent = fmtTime(G.t);
  $("rBest").textContent = record
    ? best > 0
      ? `刷新紀錄，先前最佳 ${fmtTime(best)}`
      : "第一次完成這條雪道"
    : `個人最佳 ${fmtTime(best)}`;
  $("rStats").innerHTML = [
    ["最高時速", `${Math.round(G.max * 3.6)} km/h`],
    ["平均時速", `${Math.round((r.L / G.t) * 3.6)} km/h`],
    ["旗門", `${G.hits}/${G.gates.length}`],
    ["特技分", G.score.toLocaleString()],
    ["剩餘體力", `${G.hp}`],
  ]
    .map((s) => `<div><dt>${s[0]}</dt><dd>${s[1]}</dd></div>`)
    .join("");
  G.v = 0;
  G.ang = 0;
  setMode("result");
}

function backToExplore() {
  clearGame();
  setMode("explore");
  if (sel) select(world.runs.indexOf(sel));
  else frame(world.center, world.radius * 1.75);
}

/* ---------- 主迴圈 ---------- */
function loop(now) {
  raf = requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  clock += dt;
  if (mode === "explore") {
    if (tween) {
      tween.t = Math.min(1, tween.t + dt / 1.1);
      const e = 1 - Math.pow(1 - tween.t, 3);
      camera.position.lerpVectors(tween.p0, tween.p1, e);
      controls.target.lerpVectors(tween.t0, tween.t1, e);
      if (tween.t >= 1) tween = null;
    }
    controls.update();
    // 鏡頭不鑽進地形
    const floor = world.heightAt(camera.position.x, camera.position.z) + 25;
    if (camera.position.y < floor) camera.position.y = floor;
    const w = innerWidth,
      h = innerHeight;
    for (const l of labels) {
      tA.copy(l.pos).project(camera);
      const vis = tA.z < 1 && Math.abs(tA.x) < 1.05 && Math.abs(tA.y) < 1.05;
      l.el.style.display = vis ? "" : "none";
      if (vis)
        l.el.style.transform = `translate(-50%,-100%) translate(${((tA.x + 1) / 2) * w}px,${((1 - tA.y) / 2) * h}px)`;
    }
  } else if (mode === "fly") {
    G.s += G.flySpeed * dt;
    const r = G.run;
    r.at(G.s, P);
    tB.set(P.x - P.tx * 42, 0, P.z - P.tz * 42);
    tB.y = Math.max(
      world.heightAt(P.x, P.z) + 24,
      world.heightAt(tB.x, tB.z) + 12,
    );
    const q = r.at(Math.min(r.L, G.s + 70), {});
    tC.set(q.x, world.heightAt(q.x, q.z) + 2, q.z);
    follow(tB, tC, dt, 2.2);
    updateHud();
    if (G.s >= r.L) backToExplore();
  } else if (mode === "count") {
    G.cd -= dt;
    $("count").textContent = G.cd > 0.2 ? Math.ceil(G.cd - 0.2) : "出發";
    placeSkier(dt, "count");
    updateHud();
    if (G.cd <= -0.5) {
      G.v = 6;
      G.push = 1.6;
      G.t = 0;
      setMode("ski");
    }
  } else if (mode === "ski") {
    stepSki(dt);
    if (mode === "ski") updateHud();
  } else if (mode === "result" && G.group) {
    placeSkier(dt, "result");
  }
  world.update(clock, camera);
  renderer.render(world.scene, camera);
}

/* ---------- 操作 ---------- */
document.addEventListener("click", (e) => {
  const t = e.target.closest("button");
  if (!t) return;
  if (t.dataset.enter) enter(t.dataset.enter);
  else if (t.dataset.tab && t.dataset.tab !== key) {
    clearGame();
    enter(t.dataset.tab);
  } else if (t.dataset.run && mode === "explore") select(+t.dataset.run);
});
$("btnBack").onclick = leave;
$("btnErrBack").onclick = leave;
$("btnRetry").onclick = () => enter(key);
$("cardClose").onclick = () => {
  select(null);
  frame(world.center, world.radius * 1.75);
};
$("btnFly").onclick = startFly;
$("btnSki").onclick = startSki;
$("btnAgain").onclick = startSki;
$("btnOther").onclick = backToExplore;
$("btnQuit").onclick = backToExplore;

const keyMap = {
  ArrowLeft: "left",
  a: "left",
  A: "left",
  ArrowRight: "right",
  d: "right",
  D: "right",
  ArrowDown: "brake",
  s: "brake",
  S: "brake",
  ArrowUp: "tuck",
  w: "tuck",
  W: "tuck",
};
const onKey = (down) => (e) => {
  if (
    e.key === "Escape" &&
    down &&
    $("app").hidden === false &&
    mode !== "explore"
  )
    return backToExplore();
  if (e.key === " " && (mode === "ski" || mode === "count")) {
    e.preventDefault();
    if (down && !e.repeat) pressJump();
    return;
  }
  const k = keyMap[e.key];
  if (!k || (mode !== "ski" && mode !== "count")) return;
  input[k] = down;
  e.preventDefault();
};
addEventListener("keydown", onKey(true));
addEventListener("keyup", onKey(false));
addEventListener("blur", () =>
  Object.keys(input).forEach((k) => (input[k] = false)),
);
for (const [id, k] of [
  ["tL", "left"],
  ["tR", "right"],
  ["tB", "brake"],
]) {
  const el = $(id),
    set = (v) => (e) => {
      e.preventDefault();
      input[k] = v;
      el.classList.toggle("down", v);
    };
  el.addEventListener("pointerdown", set(true));
  for (const ev of ["pointerup", "pointercancel", "pointerleave"])
    el.addEventListener(ev, set(false));
  el.addEventListener("contextmenu", (e) => e.preventDefault());
}
$("tJ").addEventListener("pointerdown", (e) => {
  e.preventDefault();
  pressJump();
});
$("gear").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  board = BOARDS.find((x) => x.id === b.dataset.board);
  try {
    localStorage.setItem("board", board.id);
  } catch {}
  renderGear();
});

// 除錯用：網址加上 #debug 才會掛出狀態
if (location.hash === "#debug") window.__ski = { G, input, world: () => world };
