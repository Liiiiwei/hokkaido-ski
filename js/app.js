// 首頁內容、3D 總覽、飛覽與滑行遊戲
import * as THREE from "three";
import { OrbitControls } from "three/addons/OrbitControls.js";
import { buildWorld, DIFF, STEP } from "./world.js";
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
  line(r.pts, r.halfW * 2 + 12, DIFF[r.diff].color);
  line(r.pts, r.halfW * 2, "#ffffff");
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
  G.skier = createSkier(board);
  grp.add(G.skier.group);

  // 旗門：兩根桿子加上方橫幅，從中間穿過就算通過
  const gap = r.diff === 2 ? 85 : 110,
    poleG = new THREE.CylinderGeometry(0.11, 0.11, 3.8, 6),
    bannerG = new THREE.PlaneGeometry(GATE_W * 2, 0.9);
  G.gates = [];
  for (let s = 90, i = 0; s < r.L - 70; s += gap, i++) {
    const p = r.at(s),
      d = (i % 2 ? 1 : -1) * r.halfW * 0.36,
      col = i % 2 ? "#1f6feb" : "#e23b2e";
    const mats = [
      new THREE.MeshLambertMaterial({ color: col }),
      new THREE.MeshBasicMaterial({ color: col, side: THREE.DoubleSide }),
    ];
    let top = -1e9;
    for (const o of [-GATE_W, GATE_W]) {
      const x = p.x - p.tz * (d + o),
        z = p.z + p.tx * (d + o),
        y = world.heightAt(x, z);
      const pole = new THREE.Mesh(poleG, mats[0]);
      pole.position.set(x, y + 1.9, z);
      grp.add(pole);
      top = Math.max(top, y);
    }
    const banner = new THREE.Mesh(bannerG, mats[1]);
    banner.position.set(p.x - p.tz * d, top + 3.45, p.z + p.tx * d);
    banner.rotation.y = Math.atan2(p.tx, p.tz);
    grp.add(banner);
    G.gates.push({ s, d, mats, done: false, hit: false });
  }
  // 雪道邊界桿
  const edge = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.07, 0.07, 1.8, 4),
    new THREE.MeshBasicMaterial({ color: "#ff8a3c" }),
    Math.ceil(r.L / 24) * 2,
  );
  const m4 = new THREE.Matrix4();
  for (let s = 0, k = 0; s < r.L; s += 24)
    for (const side of [-1, 1]) {
      const p = r.at(s),
        x = p.x - p.tz * side * r.halfW,
        z = p.z + p.tx * side * r.halfW;
      edge.setMatrixAt(
        k++,
        m4.makeTranslation(x, world.heightAt(x, z) + 0.9, z),
      );
    }
  grp.add(edge);
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
  // 終點
  const e = r.at(r.L - 16),
    fin = new THREE.Mesh(
      new THREE.PlaneGeometry(r.halfW * 2, 2.2),
      new THREE.MeshBasicMaterial({ color: "#ff5a1f", side: THREE.DoubleSide }),
    );
  fin.position.set(e.x, world.heightAt(e.x, e.z) + 5.5, e.z);
  fin.rotation.y = Math.atan2(e.tx, e.tz);
  grp.add(fin);
  for (const side of [-1, 1]) {
    const x = e.x - e.tz * side * r.halfW,
      z = e.z + e.tx * side * r.halfW;
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.18, 6.6, 6),
      new THREE.MeshLambertMaterial({ color: "#22303f" }),
    );
    post.position.set(x, world.heightAt(x, z) + 3.3, z);
    grp.add(post);
  }
  // 雪花飛濺
  G.sprayN = 140;
  G.sprayI = 0;
  G.sprayP = new Float32Array(G.sprayN * 3).fill(-9999);
  G.sprayV = new Float32Array(G.sprayN * 4);
  const sg = new THREE.BufferGeometry();
  sg.setAttribute("position", new THREE.BufferAttribute(G.sprayP, 3));
  G.spray = new THREE.Points(
    sg,
    new THREE.PointsMaterial({ color: "#ffffff", size: 0.42, map: dotTexture(), transparent: true, opacity: 0.9, depthWrite: false }),
  );
  G.spray.frustumCulled = false;
  grp.add(G.spray);

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
    phase: cam === "ski" ? "ski" : cam === "result" ? "cheer" : "idle",
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
  const sin = P.grade / Math.hypot(1, P.grade);
  const drag = (input.tuck ? 0.0027 : 0.0045) * B.drag * G.v * G.v;
  let a = 9.81 * sin * Math.cos(G.ang) - drag;
  if (G.air) a *= 0.7; // 騰空時不吃雪面阻力，也不能煞車
  else {
    a -= 0.29 + Math.abs(G.ang) * 0.11 * G.v;
    if (input.brake) a -= 7.5;
    const over = Math.abs(G.d) - r.halfW;
    if (over > 0) a -= (2.5 + over * 0.7) * B.powder; // 衝出壓雪區，深雪拖慢
  }
  G.v = Math.max(input.brake && !G.air ? 0 : 2.5, G.v + a * dt);

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
    -r.halfW - 9,
    Math.min(r.halfW + 9, G.d + G.v * Math.sin(G.ang) * dt),
  );
  G.max = Math.max(G.max, G.v);

  for (const g of G.gates) {
    if (g.done || g.s > G.s) continue;
    g.done = true;
    if (g.s >= s0 - 30 && Math.abs(G.d - g.d) < GATE_W + 0.6) {
      G.hits++;
      g.hit = true;
      g.mats.forEach((m) => m.color.set("#2fd27a"));
      popup(`通過旗門 ${G.hits}/${G.gates.length}`);
      $("hGate").parentElement.classList.remove("pop");
      void $("hGate").offsetWidth;
      $("hGate").parentElement.classList.add("pop");
    } else g.mats.forEach((m) => m.color.set("#8d99a6"));
  }

  // 雪花飛濺
  const emit = !G.air && G.v > 4 && (Math.abs(G.ang) > 0.25 || input.brake) ? 3 : 0;
  const pos = skierPos(tA);
  for (let i = 0; i < emit; i++) {
    const k = G.sprayI++ % G.sprayN;
    G.sprayP.set(
      [
        pos.x + (Math.random() - 0.5),
        pos.y + 0.2,
        pos.z + (Math.random() - 0.5),
      ],
      k * 3,
    );
    const side = Math.sign(G.ang) || (Math.random() < 0.5 ? 1 : -1);
    G.sprayV.set(
      [
        (P.tz * side + (Math.random() - 0.5)) * 4,
        2 + Math.random() * 3,
        (-P.tx * side + (Math.random() - 0.5)) * 4,
        0.7,
      ],
      k * 4,
    );
  }
  for (let k = 0; k < G.sprayN; k++) {
    if (G.sprayV[k * 4 + 3] <= 0) continue;
    G.sprayV[k * 4 + 3] -= dt;
    G.sprayV[k * 4 + 1] -= 9 * dt;
    G.sprayP[k * 3] += G.sprayV[k * 4] * dt;
    G.sprayP[k * 3 + 1] += G.sprayV[k * 4 + 1] * dt;
    G.sprayP[k * 3 + 2] += G.sprayV[k * 4 + 2] * dt;
    if (G.sprayV[k * 4 + 3] <= 0) G.sprayP[k * 3 + 1] = -9999;
  }
  G.spray.geometry.attributes.position.needsUpdate = true;

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
function burst(n) {
  const pos = skierPos(tA);
  for (let i = 0; i < n; i++) {
    const k = G.sprayI++ % G.sprayN, a = Math.random() * 6.28;
    G.sprayP.set([pos.x, pos.y + 0.2, pos.z], k * 3);
    G.sprayV.set([Math.cos(a) * 4, 1.5 + Math.random() * 2.5, Math.sin(a) * 4, 0.6], k * 4);
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
  $("hTime").textContent = fmtTime(G.t);
  $("hGate").textContent = `${G.hits}/${G.gates.length}`;
  $("hTrick").textContent = G.score.toLocaleString();
}

function finish() {
  const r = G.run,
    id = `best:${key}:${r.id}`;
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
      G.v = 3;
      G.push = 1.4;
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
