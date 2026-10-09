// 首頁內容、3D 總覽、飛覽與滑行遊戲
import * as THREE from "three";
import { OrbitControls } from "three/addons/OrbitControls.js";
// 改了任何一個 js 或 css 檔，就把這裡與 index.html 的 ?v= 一起換新。
// 不換的話瀏覽器會拿新的 app.js 配快取裡舊的模組，整頁載不起來
import { buildWorld, DIFF, STEP } from "./world.js?v=20261010k";
import { createHazards } from "./hazards.js?v=20261010k";
import { createSkier, BOARDS } from "./skier.js?v=20261010k";
import { FACTS, COMPARE_ROWS } from "./facts.js?v=20261010k";
import {
  POINTS,
  comboMult,
  parTime,
  finalScore,
  rating,
  grade,
} from "./score.js?v=20261010k";
import {
  initAudio,
  updateAudio,
  quietAudio,
  suspendAudio,
  setMuted,
  setVolume,
  isMuted,
  sfx,
} from "./audio.js?v=20261010k";

const $ = (id) => document.getElementById(id);
const KEYS = ["teine", "kokusai"];
const lowPower = matchMedia("(pointer: coarse)").matches;
const fmtTime = (t) =>
  `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, "0")}`;
const diffTag = (d) => `<i class="d d${d}"></i>${DIFF[d].name}`;
const buzz = (ms) => opt.buzz && navigator.vibrate?.(ms); // 手機震動回饋
// 系統開了「減少動態效果」：鏡頭晃動縮到三成、不做頓幀
const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
const TRICK_T = 0.62, // 一個特技要轉多久（秒）
  TRICK_KICK = 3.4, // 做特技時往上再推的速度
  GRAVITY = 15,
  JUMP_BUFFER = 0.12; // 落地前這麼久以內按跳，落地瞬間照樣起跳（秒）
const store = {
  get(k) {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, v);
      return true;
    } catch {
      return false;
    }
  },
};

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
  const s = document.createElement("i"),
    near = Math.random() ** 2;
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
let paused = false;
const STEP_T = 1 / 120; // 物理固定步長，掉幀時手感不變
const R = { s: 0, d: 0, y: 0, ang: 0 }; // 畫面用的狀態：兩個物理步之間內插
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
  renderer.setPixelRatio(opt.quality === 1 ? PR_MIN : PR_MAX);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = !lowPower;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
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
  // 雪霧粒子的大小是照畫面高度算的，畫面變了要跟著改
  if (G.spray)
    G.spray.material.uniforms.uScale.value = renderer.domElement.height * 0.9;
}
// 依實際幀率自動調解析度：滑行時掉到 45 幀以下就降一級，穩定夠快再升回來
const PR_MAX = Math.min(devicePixelRatio, lowPower ? 1.5 : 2),
  PR_MIN = Math.min(1, PR_MAX);
const tune = { t: 0, n: 0, good: 0, ups: 0 };
function tuneQuality(raw) {
  if (opt.quality) return; // 手動指定畫質就不自動調
  if (raw > 0.25) return; // 切走分頁回來的那一幀不算
  tune.t += raw;
  tune.n++;
  if (tune.t < 1.5) return;
  const fps = tune.n / tune.t,
    pr = renderer.getPixelRatio();
  tune.t = tune.n = 0;
  let next = pr;
  if (fps < 45 && pr > PR_MIN) {
    next = Math.max(PR_MIN, pr - 0.25);
    tune.good = 0;
  } else if (fps > 57 && pr < PR_MAX && tune.ups < 2) {
    // 連續六秒都夠快才升，而且一局最多升兩次，免得來回跳
    if (++tune.good >= 4) {
      next = Math.min(PR_MAX, pr + 0.25);
      tune.good = 0;
      tune.ups++;
    }
  } else tune.good = 0;
  if (next !== pr) {
    renderer.setPixelRatio(next);
    resize();
  }
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
  setPaused(false);
  quietAudio();
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

// 每條雪道的個人紀錄：最快時間、最高分與當時的評級
function readBest(run) {
  const time = parseFloat(store.get(`best:${key}:${run.id}`)) || 0,
    [score, g] = (store.get(`score:${key}:${run.id}`) || "").split("|");
  return { time, score: parseInt(score) || 0, grade: g || "" };
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
  const b = readBest(sel);
  $("cBest").hidden = !(b.score > 0 || b.time > 0);
  $("cBest").innerHTML =
    `個人最佳${b.grade ? `<b class="g${b.grade}">${b.grade}</b>` : ""}` +
    `${b.score > 0 ? `<span>${b.score.toLocaleString()} 分</span>` : ""}` +
    `${b.time > 0 ? `<span>${fmtTime(b.time)}</span>` : ""}`;
  loadBoard(sel, "cBoard");
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
const MINI_SPAN = 440,
  miniP = {},
  miniQ = {};
let miniTick = 0;
function drawMini() {
  // 小地圖很小，每三幀重畫一次就夠，省下每幀幾百次畫線
  if (miniTick++ % 3) return;
  const cv = $("mini"),
    g = cv.getContext("2d"),
    r = G.run,
    size = cv.width,
    k = size / MINI_SPAN;
  const fly = mode === "fly";
  const p = r.at(G.s, miniP),
    d = fly ? 0 : G.d;
  const px = p.x - p.tz * d,
    pz = p.z + p.tx * d;
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
  for (const [extra, c] of [
    [12, DIFF[r.diff].color],
    [0, "#ffffff"],
  ]) {
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
      const q = r.at(kk.s, miniQ);
      dot(q.x, q.z, 7, "#ffb400");
    }
    for (const h of G.haz.list) {
      if (h.state === "idle" || h.state === "gone" || h.s < G.s) continue;
      const hx = h.p.x - h.p.tz * h.d,
        hz = h.p.z + h.p.tx * h.d;
      dot(hx, hz, 10, "#ffffff");
      dot(hx, hz, 7, "#e0263c");
    }
    for (const gt of G.gates) {
      const q = r.at(gt.s, miniQ),
        c = gt.hit
          ? "#2fd27a"
          : gt.done
            ? "#8d99a6"
            : gt.mats[1].color.getStyle();
      for (const o of [-GATE_W, GATE_W])
        dot(q.x - q.tz * (gt.d + o), q.z + q.tx * (gt.d + o), 4.5, c);
    }
  }
  g.restore();
  // 自己
  g.save();
  g.translate(size / 2, size * 0.68);
  g.rotate(fly ? 0 : G.ang);
  g.beginPath();
  g.moveTo(0, -17);
  g.lineTo(11, 11);
  g.lineTo(0, 5);
  g.lineTo(-11, 11);
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
    (b) =>
      `<button data-board="${b.id}" class="${b === board ? "on" : ""}" style="--c:${b.color}"><i></i>${b.name}</button>`,
  ).join("");
  $("gearDesc").textContent = board.desc;
}
renderGear();

function setMode(m) {
  mode = m;
  $("app").dataset.mode = m;
  setPaused(false);
  touchAir(false);
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
  show("cdGoals", m === "count");
  if (m !== "ski") {
    quietAudio();
    $("speedfx").style.opacity = 0;
  }
  if (explore) {
    camera.fov = 55;
    camera.up.set(0, 1, 0);
    camera.updateProjectionMatrix();
  }
}

// 暫停：只有倒數與滑行中可以停
function setPaused(on) {
  if (on === paused || (on && mode !== "ski" && mode !== "count")) return;
  paused = on;
  show("pause", on);
  if (on) renderGoals("pGoals");
  suspendAudio(on);
  if (on) releaseInput();
}

/* ---------- 設定：存在這台裝置上，暫停頁與雪場頂部都進得來 ---------- */
const OPTS = [
  ["vol", "音量", ["關", "小", "中", "大"]],
  ["buzz", "震動", ["關", "開"]],
  ["shake", "鏡頭晃動", ["關", "低", "標準"]],
  ["swap", "轉彎鍵位置", ["左手", "右手"]],
  ["quality", "畫質", ["自動", "省電", "高"]],
];
const VOLS = [0, 0.25, 0.55, 0.9],
  SHAKE = [0, 0.5, 1];
const opt = { vol: 2, buzz: 1, shake: 2, swap: 0, quality: 0 };
try {
  const saved = JSON.parse(store.get("opt") || "{}");
  for (const [k, , list] of OPTS)
    if (Number.isInteger(saved[k]) && saved[k] >= 0 && saved[k] < list.length)
      opt[k] = saved[k];
} catch {}
if (isMuted()) opt.vol = 0; // 沿用先前按過的靜音
function applyOpts() {
  setMuted(!opt.vol);
  if (opt.vol) setVolume(VOLS[opt.vol]);
  $("hud").classList.toggle("swap", !!opt.swap);
  const pr = [0, PR_MIN, PR_MAX][opt.quality];
  if (renderer && pr && pr !== renderer.getPixelRatio()) {
    renderer.setPixelRatio(pr);
    resize();
  }
  $("optList").innerHTML = OPTS.filter(
    ([k]) => lowPower || (k !== "buzz" && k !== "swap"), // 桌機沒有震動與觸控鍵
  )
    .map(
      ([k, name, list]) =>
        `<div class="opt"><span>${name}</span><div class="seg">${list
          .map(
            (t, i) =>
              `<button type="button" data-opt="${k}" data-v="${i}" aria-pressed="${opt[k] === i}">${t}</button>`,
          )
          .join("")}</div></div>`,
    )
    .join("");
}
function setOpt(k, v) {
  opt[k] = v;
  store.set("opt", JSON.stringify(opt));
  applyOpts();
  if (k === "vol" && v) {
    initAudio();
    sfx.ui();
  }
  if (k === "buzz" && v) buzz(30);
}

/* ---------- 飛覽 ---------- */
function startFly() {
  clearGame();
  G.run = sel;
  G.s = 0;
  G.t = 0;
  G.shake = 0;
  G.flySpeed = Math.max(28, sel.L / 50);
  setupHud(sel, true);
  setMode("fly");
  G.snap = true;
}

/* ---------- 滑行 ---------- */
function clearGame() {
  if (G.group && world) {
    world.scene.remove(G.group);
    // 每次開滑都會新建旗門、邊線、人物、危險物與粒子；不釋放的話連玩幾局顯示記憶體只增不減。
    // 共用的幾何與材質被釋放也沒關係，下次用到會自動重新上傳
    G.group.traverse((o) => {
      o.geometry?.dispose();
      for (const m of [o.material].flat()) m?.dispose();
    });
  }
  G.group = null;
  G.spray = G.track = null;
  showWarn(null);
  $("hud").classList.remove("hurt");
  $("tip").className = "";
}

// 地面上的一點
function ground(x, z) {
  return { x, y: world.heightAt(x, z), z };
}
// 立在地面的桿子：往下多埋一截，斜坡上不會懸空；桿頂加一顆圓頭
const capGeo = new THREE.SphereGeometry(1, 10, 8);
function post(f, h, rad, mat) {
  const m = new THREE.Mesh(
    new THREE.CylinderGeometry(rad, rad * 1.25, h + 3, 8),
    mat,
  );
  m.position.set(f.x, f.y + (h - 3) / 2, f.z);
  m.castShadow = true;
  const cap = new THREE.Mesh(capGeo, mat);
  cap.scale.setScalar(rad * 1.5);
  cap.position.y = (h + 3) / 2;
  m.add(cap);
  return m;
}
// 橫幅：四個角接在兩根桿頂，地面一高一低也不會脫節。
// 從「a 在左、b 在右」那一側看是正面，圖樣橫向重複 rep 次
function spanBanner(a, b, top, h, mat, rep = 1) {
  const g = new THREE.BufferGeometry();
  g.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(
      [
        a.x,
        a.y + top,
        a.z,
        b.x,
        b.y + top,
        b.z,
        a.x,
        a.y + top - h,
        a.z,
        b.x,
        b.y + top - h,
        b.z,
      ],
      3,
    ),
  );
  g.setAttribute(
    "uv",
    new THREE.Float32BufferAttribute([0, 1, rep, 1, 0, 0, rep, 0], 2),
  );
  g.setIndex([0, 2, 1, 1, 2, 3]);
  const m = new THREE.Mesh(g, mat);
  m.castShadow = true;
  return m;
}
// 有字的橫幅正反面各掛一張，從哪一側看字都不會反
function signBanner(grp, a, b, top, h, tex, rep) {
  const mat = new THREE.MeshBasicMaterial({ map: tex });
  grp.add(
    spanBanner(a, b, top, h, mat, rep),
    spanBanner(b, a, top, h, mat, rep),
  );
}

// 旗幟與標示用的圖樣，畫一次之後共用
const texCache = {};
function signTexture(kind) {
  if (texCache[kind]) return texCache[kind];
  const cv = document.createElement("canvas"),
    g = cv.getContext("2d");
  if (kind === "gate") {
    // 白底加一排朝下的箭頭，再由旗門的顏色染色
    cv.width = 512;
    cv.height = 64;
    g.fillStyle = "#fff";
    g.fillRect(0, 0, 512, 64);
    g.fillStyle = "#b4b4b4";
    g.fillRect(0, 0, 512, 6);
    g.fillRect(0, 58, 512, 6);
    for (let x = 0; x < 512; x += 64) {
      g.beginPath();
      [
        [12, 16],
        [32, 50],
        [52, 16],
        [42, 16],
        [32, 33],
        [22, 16],
      ].forEach(([px, py], i) => g[i ? "lineTo" : "moveTo"](x + px, py));
      g.fill();
    }
  } else if (kind === "checker") {
    cv.width = cv.height = 64;
    g.fillStyle = "#fff";
    g.fillRect(0, 0, 64, 64);
    g.fillStyle = "#15181c";
    g.fillRect(0, 0, 32, 32);
    g.fillRect(32, 32, 32, 32);
  } else {
    // 起點與終點：左邊一塊格紋，右邊是字
    const finish = kind === "finish";
    cv.width = 512;
    cv.height = 128;
    g.fillStyle = finish ? "#ff5a1f" : "#1f6feb";
    g.fillRect(0, 0, 512, 128);
    for (let i = 0; i < 4; i++)
      for (let j = 0; j < 4; j++) {
        g.fillStyle = (i + j) % 2 ? "#15181c" : "#fff";
        g.fillRect(i * 32, j * 32, 32, 32);
      }
    g.fillStyle = "#fff";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.font = '900 74px "Noto Sans TC", "PingFang TC", sans-serif';
    g.fillText(finish ? "終點 FINISH" : "出發 START", 320, 68, 360);
  }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  if (kind === "checker") t.magFilter = THREE.NearestFilter;
  else t.anisotropy = 8;
  return (texCache[kind] = t);
}

// 新手教學：一次只教一件事，真的做到了才換下一句。
// 三件都做過，或已經陪了三局，就不再出現
const TUTOR = [
  {
    text: lowPower
      ? "按 ◀ ▶ 轉彎，穿過前面的旗門"
      : "按 ← → 轉彎，穿過前面的旗門",
    done: () => G.hits > 0,
  },
  {
    text: lowPower ? "按「跳」起跳" : "按空白鍵起跳",
    done: () => G.jumped,
  },
  {
    text: lowPower ? "騰空時按任一顆鍵做特技" : "騰空時再按一次空白鍵做特技",
    done: () => G.stat.flips + G.stat.spins > 0,
  },
];
const tutor = { step: 0, runs: 0 };
{
  const [step, runs] = (store.get("tut") || "").split("|").map(Number);
  // 舊版看過提示的人不用重學
  tutor.step = store.get("tips") ? TUTOR.length : step || 0;
  tutor.runs = runs || 0;
}
const saveTutor = () => store.set("tut", `${tutor.step}|${tutor.runs}`);
function stepTutor() {
  const el = $("tip");
  if (G.t < G.tutAt) return;
  if (tutor.step >= TUTOR.length) {
    el.className = "";
    G.tut = false;
  } else if (TUTOR[tutor.step].done()) {
    el.textContent = "✓ 做到了";
    el.className = "hold ok";
    G.tutAt = G.t + 1.1;
    tutor.step++;
    saveTutor();
  } else if (G.tutShown !== tutor.step) {
    G.tutShown = tutor.step;
    el.textContent = TUTOR[tutor.step].text;
    el.className = "hold";
  }
}

/* ---------- 每局目標：三個小挑戰，只記完成數，不影響分數與排行榜 ---------- */
const GOAL_POOL = [
  {
    id: "gate6",
    text: "連續通過 6 個旗門",
    need: 6,
    get: () => G.stat.gateBest,
  },
  { id: "flip2", text: "做 2 次空翻", need: 2, get: () => G.stat.flips },
  { id: "spin2", text: "做 2 次 360 轉體", need: 2, get: () => G.stat.spins },
  { id: "combo10", text: "連段達到 10", need: 10, get: () => G.bestCombo },
  { id: "near2", text: "驚險閃過 2 次", need: 2, get: () => G.stat.near },
  { id: "carve3", text: "節奏刻滑 3 次", need: 3, get: () => G.stat.carves },
  { id: "hp80", text: "體力 80 以上完賽", end: () => G.hp >= 80 },
  { id: "clean", text: "全程不撞到東西", end: () => G.stat.crashes === 0 },
  {
    id: "gates",
    text: "最多只漏 1 個旗門",
    end: () => G.gates.length - G.hits <= 1,
  },
];
const goalTotal = () => parseInt(store.get("goals")) || 0;
let goalKeep = null; // 同一條雪道重來時，還沒完成的目標留著再挑戰
function pickGoals(run, gates) {
  if (goalKeep?.run === run && goalKeep.list.some((g) => !g.done))
    return goalKeep.list;
  const pool = GOAL_POOL.filter((g) => g.id !== "gate6" || gates >= 6),
    list = [];
  while (list.length < 3)
    list.push({
      ...pool.splice(Math.floor(Math.random() * pool.length), 1)[0],
      done: false,
    });
  goalKeep = { run, list };
  return list;
}
function checkGoals(atEnd) {
  for (const g of G.goals) {
    if (g.done || !(g.end ? atEnd && g.end() : g.get() >= g.need)) continue;
    g.done = true;
    store.set("goals", String(goalTotal() + 1));
    if (!atEnd) popup(`目標達成　${g.text}`);
  }
}
function renderGoals(id) {
  $(id).innerHTML = G.goals
    .map(
      (g) =>
        `<li${g.done ? ' class="done"' : ""}>${g.text}${
          g.done || g.end ? "" : `<b>${Math.min(g.need, g.get())}/${g.need}</b>`
        }</li>`,
    )
    .join("");
}

// 分段時間：記下自己最快那次每個旗門的通過時間，之後每過一門就比一次
const splitKey = (run) => `splits:${key}:${run.id}`;
function readSplits(run) {
  const [t, list] = (store.get(splitKey(run)) || "").split("|"),
    time = parseFloat(t);
  return time > 0 && list ? { time, at: list.split(",").map(Number) } : null;
}
function showSplit(diff) {
  const el = $("hSplit");
  el.textContent = `${diff < 0 ? "−" : "+"}${Math.abs(diff).toFixed(2)}`;
  el.className = diff < 0 ? "fast" : "slow";
  replay(el, "show");
}

function startSki(quick = false) {
  clearGame();
  initAudio();
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
  G.pts = { gate: 0, trick: 0, dodge: 0 };
  G.combo = 0;
  G.comboShown = -1;
  G.bestCombo = 0;
  G.par = parTime(r.L, +r.avg || 10);
  // 重來的人已經看過起點了，倒數只留一拍
  G.cd = quick ? 1.2 : 3.2;
  G.cdShown = "";
  G.stat = {
    gateRun: 0,
    gateBest: 0,
    flips: 0,
    spins: 0,
    near: 0,
    carves: 0,
    crashes: 0,
  };
  G.splits = [];
  G.ref = readSplits(r);
  $("hSplit").classList.remove("show");
  G.snap = true;
  G.pitch = 0;
  G.push = 0;
  G.carveDir = 0;
  G.carveT = 0;
  G.carving = false;
  G.edge = null;
  G.chain = 0;
  G.boost = 0;
  G.hp = 100;
  G.hpShown = -1;
  G.failed = false;
  G.inv = 0;
  G.dodged = 0;
  G.acc = 0;
  G.freeze = 0;
  G.jumpBuf = 0;
  G.shake = 0;
  G.impact = 0;
  G.dip = 0;
  G.dipV = 0;
  G.warned = null;
  G.res = null;
  $("sGain").textContent = "";
  $("sGain").classList.remove("show");
  scoreShown = 0;
  G.jumped = false;
  G.tutAt = 0;
  G.tutShown = -1;
  G.tut = tutor.step < TUTOR.length && tutor.runs < 3;
  if (G.tut) {
    tutor.runs++;
    saveTutor();
  }
  G.skier = createSkier(board, { blob: lowPower });
  grp.add(G.skier.group);

  // 旗門：兩根桿子加上方橫幅，從中間穿過就算通過
  const gap = r.diff === 2 ? 85 : 110;
  G.gates = [];
  for (let s = 90, i = 0; s < r.L - 70; s += gap, i++) {
    const p = r.at(s),
      d =
        (i % 2 ? 1 : -1) *
        Math.max(0, Math.min(r.wAt(s) * 0.36, r.wAt(s) - GATE_W - 1)),
      col = i % 2 ? "#1f6feb" : "#e23b2e";
    const mats = [
      new THREE.MeshLambertMaterial({ color: col }),
      new THREE.MeshBasicMaterial({
        color: col,
        map: signTexture("gate"),
        side: THREE.DoubleSide,
      }),
    ];
    const feet = [-GATE_W, GATE_W].map((o) =>
      ground(p.x - p.tz * (d + o), p.z + p.tx * (d + o)),
    );
    for (const f of feet) grp.add(post(f, 4, 0.13, mats[0]));
    grp.add(spanBanner(feet[0], feet[1], 4, 0.95, mats[1], 2));
    G.gates.push({ s, d, mats, done: false, hit: false });
  }
  G.goals = pickGoals(r, G.gates.length);
  renderGoals("cdGoals");
  // 雪道邊界桿：橘色桿身，頂端色帶左紅右綠，餘光就分得出哪一側
  const edgeN = Math.ceil(r.L / 12) * 2,
    edge = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.055, 0.07, 2.1, 6),
      new THREE.MeshLambertMaterial({ color: "#ff8a3c" }),
      edgeN,
    ),
    band = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.095, 0.095, 0.34, 8),
      new THREE.MeshLambertMaterial(),
      edgeN,
    );
  const m4 = new THREE.Matrix4(),
    bandCol = [new THREE.Color("#e23b2e"), new THREE.Color("#2fa35a")];
  for (let s = 0, k = 0; s < r.L; s += 12)
    for (const side of [-1, 1]) {
      const p = r.at(s),
        w = r.wAt(s),
        x = p.x - p.tz * side * w,
        z = p.z + p.tx * side * w,
        y = world.heightAt(x, z);
      edge.setMatrixAt(k, m4.makeTranslation(x, y + 0.85, z));
      band.setMatrixAt(k, m4.makeTranslation(x, y + 1.72, z));
      band.setColorAt(k++, bandCol[side < 0 ? 0 : 1]);
    }
  grp.add(edge, band);
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
      (put(lineV, a, 0, side * (wa - 0.5)),
        put(lineV, a, 0, side * (wa + 0.5)),
        put(lineV, b, 0, side * (wb - 0.5)));
      (put(lineV, a, 0, side * (wa + 0.5)),
        put(lineV, b, 0, side * (wb + 0.5)),
        put(lineV, b, 0, side * (wb - 0.5)));
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
        (put(arrowV, q, f0, w0),
          put(arrowV, q, f1, w1),
          put(arrowV, q, f0 - 1.1, w0));
        (put(arrowV, q, f1, w1),
          put(arrowV, q, f1 - 1.1, w1),
          put(arrowV, q, f0 - 1.1, w0));
      }
  }
  for (const [arr, color, opacity] of [
    [lineV, "#ff8a3c", 0.75],
    [arrowV, "#ff5a1f", 0.62],
  ]) {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(arr, 3));
    grp.add(
      new THREE.Mesh(
        g,
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity,
          side: THREE.DoubleSide,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -4,
          polygonOffsetUnits: -4,
        }),
      ),
    );
  }
  // 跳台：排在旗門之間
  G.kickers = [];
  const KL = 7,
    KW = 7.5,
    KH = 1.5;
  const wedge = new THREE.BufferGeometry();
  const A = [-KW / 2, 0, -KL],
    B2 = [KW / 2, 0, -KL],
    C = [-KW / 2, 0, 0],
    D = [KW / 2, 0, 0],
    E = [-KW / 2, KH, 0],
    F = [KW / 2, KH, 0];
  wedge.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(
      [A, E, B2, B2, E, F, C, D, E, D, F, E, A, C, E, B2, F, D].flat(),
      3,
    ),
  );
  wedge.computeVertexNormals();
  const wedgeMat = new THREE.MeshStandardMaterial({
    color: "#f4f9ff",
    roughness: 0.9,
    side: THREE.DoubleSide,
  });
  const lipMat = new THREE.MeshBasicMaterial({
    color: "#ff5a1f",
    side: THREE.DoubleSide,
  });
  const poleMat = new THREE.MeshLambertMaterial({ color: "#22303f" });
  // 起跳線、角旗：遠遠就看得出跳台的位置與寬度
  const guideGeo = new THREE.BoxGeometry(0.24, 0.04, Math.hypot(KL, KH)),
    guideMat = new THREE.MeshBasicMaterial({ color: "#1f6feb" }),
    flagPoleGeo = new THREE.CylinderGeometry(0.045, 0.045, KH + 1.7, 6),
    flagGeo = new THREE.BufferGeometry();
  flagGeo.setAttribute(
    "position",
    new THREE.Float32BufferAttribute([0, 0, 0, 0, -0.55, 0, 0, -0.27, -0.9], 3),
  );
  for (let s = 90 + gap * 1.5; s < r.L - 120; s += gap * 2) {
    const p = r.at(s),
      y = world.heightAt(p.x, p.z),
      ya = world.heightAt(p.x + p.tx * 3, p.z + p.tz * 3);
    const k = new THREE.Mesh(wedge, wedgeMat);
    k.position.set(p.x, y - 0.25, p.z);
    k.rotation.set(Math.atan2(y - ya, 3), Math.atan2(p.tx, p.tz), 0, "YXZ");
    k.receiveShadow = true;
    const lip = new THREE.Mesh(new THREE.BoxGeometry(KW, 0.12, 0.3), lipMat);
    lip.position.set(0, KH, -0.1);
    k.add(lip);
    for (const side of [-1, 1]) {
      const guide = new THREE.Mesh(guideGeo, guideMat);
      guide.position.set(side * (KW / 2 - 0.5), KH / 2 + 0.04, -KL / 2);
      guide.rotation.x = -Math.atan2(KH, KL);
      const pole = new THREE.Mesh(flagPoleGeo, poleMat);
      pole.position.set(side * (KW / 2 + 0.3), (KH + 1.7) / 2, -0.1);
      pole.castShadow = true;
      const flag = new THREE.Mesh(flagGeo, lipMat);
      flag.position.set(side * (KW / 2 + 0.3), KH + 1.7, -0.1);
      k.add(guide, pole, flag);
    }
    grp.add(k);
    G.kickers.push({ s, d: 0, len: KL, w: KW, h: KH });
  }
  // 隨機關卡：雪球、狼、雪怪
  G.haz = createHazards(world, r, G.kickers, G.gates, grp, { puff });
  // 終點：格紋拱門加地上一道終點線
  const fs = r.L - 16,
    e = r.at(fs),
    fw = r.wAt(fs),
    ends = [-1, 1].map((side) =>
      ground(e.x - e.tz * side * fw, e.z + e.tx * side * fw),
    );
  for (const f of ends) grp.add(post(f, 6.8, 0.2, poleMat));
  signBanner(
    grp,
    ends[0],
    ends[1],
    6.8,
    2.2,
    signTexture("finish"),
    Math.max(1, Math.round((fw * 2) / 8.8)),
  );
  const lineP = [],
    lineUV = [],
    cols = Math.ceil(fw);
  for (let i = 0; i < cols; i++) {
    const w0 = -fw + (2 * fw * i) / cols,
      w1 = -fw + (2 * fw * (i + 1)) / cols,
      u0 = (w0 + fw) / 2.4,
      u1 = (w1 + fw) / 2.4;
    (put(lineP, e, -1.2, w0), put(lineP, e, 1.2, w0), put(lineP, e, -1.2, w1));
    (put(lineP, e, 1.2, w0), put(lineP, e, 1.2, w1), put(lineP, e, -1.2, w1));
    lineUV.push(u0, 0, u0, 1, u1, 0, u0, 1, u1, 1, u1, 0);
  }
  const lineG = new THREE.BufferGeometry();
  lineG.setAttribute("position", new THREE.Float32BufferAttribute(lineP, 3));
  lineG.setAttribute("uv", new THREE.Float32BufferAttribute(lineUV, 2));
  grp.add(
    new THREE.Mesh(
      lineG,
      new THREE.MeshBasicMaterial({
        map: signTexture("checker"),
        transparent: true,
        opacity: 0.85,
        side: THREE.DoubleSide,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -4,
        polygonOffsetUnits: -4,
      }),
    ),
  );
  // 起點拱門
  const st = r.at(9),
    sw = Math.min(r.wAt(9), 8),
    starts = [-1, 1].map((side) =>
      ground(st.x - st.tz * side * sw, st.z + st.tx * side * sw),
    );
  for (const f of starts) grp.add(post(f, 5.4, 0.18, poleMat));
  signBanner(
    grp,
    starts[0],
    starts[1],
    5.4,
    1.35,
    signTexture("start"),
    Math.max(1, Math.round((sw * 2) / 5.4)),
  );
  // 壓雪面
  grp.add(world.piste(r));
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
    new THREE.MeshBasicMaterial({
      color: "#8ea4c0",
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    }),
  );
  G.track.frustumCulled = false;
  grp.add(G.track);

  G.group = grp;
  world.scene.add(grp);
  setupHud(r, false);
  setMode("count");
  syncR();
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

// 畫面狀態直接對齊物理狀態（倒數、結算時不需要內插）
function syncR() {
  R.s = G.ps = G.s;
  R.d = G.pd = G.d;
  R.y = G.py = G.y;
  R.ang = G.pang = G.ang;
}

function skierPos(out) {
  G.run.at(R.s, P);
  out.set(P.x - P.tz * R.d, 0, P.z + P.tx * R.d);
  out.y = world.heightAt(out.x, out.z);
  return out;
}

// cam：count 起跑前繞到正面、ski 跟在後方、result 終點歡呼
function placeSkier(dt, cam = "ski") {
  const pos = skierPos(tA),
    c = Math.cos(R.ang),
    s = Math.sin(R.ang);
  const hx = P.tx * c - P.tz * s,
    hz = P.tz * c + P.tx * s; // 實際行進方向
  const ahead = world.heightAt(pos.x + hx * 3, pos.z + hz * 3);
  const k = G.snap ? 1 : 1 - Math.exp(-dt * 10);
  G.pitch += (Math.atan2(pos.y - ahead, 3) - G.pitch) * k;
  const sk = G.skier.group;
  sk.position.copy(pos);
  sk.rotation.set(G.pitch, Math.atan2(hx, hz), 0, "YXZ");
  G.skier.update(dt, {
    phase:
      cam === "ski"
        ? "ski"
        : cam !== "result"
          ? "idle"
          : G.failed
            ? "sad"
            : "cheer",
    ready: cam === "count" && G.cd < 1.3,
    steer: (input.right ? 1 : 0) - (input.left ? 1 : 0),
    ang: R.ang,
    v: G.v,
    brake: input.brake,
    tuck: input.tuck,
    carve: G.carving,
    push: G.push,
    y: R.y,
    air: G.air,
    trick: G.trick,
    impact: G.impact,
  });
  G.impact = 0;

  // 鏡頭跟在路線方向後方，轉彎時畫面才不會亂晃
  const bx = P.tx * 0.75 + hx * 0.25,
    bz = P.tz * 0.75 + hz * 0.25;
  let fov = 58;
  if (cam === "ski") {
    // 越快拉得越遠、蹲低時貼近雪面；落地時鏡頭跟著往下沉一下
    const back = 12.5 + Math.min(2.5, G.v * 0.07) - (input.tuck ? 1.2 : 0),
      up = 5.2 - (input.tuck ? 0.8 : 0) + R.y * 0.4 + G.dip;
    tB.set(pos.x - bx * back, 0, pos.z - bz * back);
    tB.y = Math.max(pos.y + up, world.heightAt(tB.x, tB.z) + 3.2);
    tC.set(
      pos.x + bx * 14,
      world.heightAt(pos.x + bx * 14, pos.z + bz * 14) + 1.6 + R.y * 0.3,
      pos.z + bz * 14,
    );
    camera.up.set(-P.tz * R.ang * 0.09, 1, P.tx * R.ang * 0.09); // 轉彎時畫面微微傾斜
    follow(tB, tC, dt, 5);
    fov += Math.min(24, G.v * 0.7) + (input.tuck ? 3 : 0);
  } else {
    const front = cam === "result";
    let u = front ? 1 : Math.min(1, Math.max(0, (G.cd - 0.5) / 2.7));
    u = u * u * (3 - 2 * u);
    const phi = front
      ? Math.PI + Math.sin(clock * 0.5) * 0.5
      : Math.PI * 0.86 * u;
    const dist = front ? 7 : 13 - 7 * u,
      cp = Math.cos(phi),
      sp = Math.sin(phi);
    tB.set(
      pos.x + (-bx * cp - bz * sp) * dist,
      0,
      pos.z + (bx * sp - bz * cp) * dist,
    );
    tB.y = Math.max(pos.y + 5.2 - 3 * u, world.heightAt(tB.x, tB.z) + 1.4);
    tC.set(pos.x + bx * 14 * (1 - u), pos.y + 1.6, pos.z + bz * 14 * (1 - u));
    if (front) {
      // 把人物讓到成績面板旁邊
      const vx = pos.x - tB.x,
        vz = pos.z - tB.z,
        l = Math.hypot(vx, vz) || 1;
      if (camera.aspect > 1) {
        tC.x += (-vz / l) * 2.2;
        tC.z += (vx / l) * 2.2;
      } else tC.y -= 1.3;
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

const look = v3(),
  camBase = v3(); // 不含震動的鏡頭位置
function follow(pos, target, dt, rate) {
  const k = G.snap ? 1 : 1 - Math.exp(-dt * rate);
  camBase.lerp(pos, k);
  look.lerp(target, k);
  camera.position.copy(camBase);
  // G.shake 是 0～1 的「衝擊量」，實際晃動取平方：小衝擊幾乎不晃，大衝擊才明顯
  const amp = G.shake * G.shake * (calm ? 0.3 : 1) * SHAKE[opt.shake];
  if (amp > 0.0004) {
    camera.position.x += wobble(71, 0) * amp * 0.5;
    camera.position.y += wobble(93, 1) * amp * 0.5;
    camera.position.z += wobble(57, 2) * amp * 0.3;
  }
  camera.lookAt(look);
  if (amp > 0.0004) camera.rotateZ(wobble(83, 3) * amp * 0.04);
  G.snap = false;
}
// 兩個不成倍數的正弦相加，晃起來不會像單一頻率那樣規律
const wobble = (f, o) =>
  Math.sin(clock * f + o) * 0.65 + Math.sin(clock * f * 1.73 + o * 2.1) * 0.35;
const jolt = (t) => (G.shake = Math.min(1, (G.shake || 0) + t));

let scoreShown = 0; // 畫面上正在滾動的分數
// 得分：先乘上目前的連段倍率，再把連段往上加一
const KIND = { gate: "旗門", trick: "特技", dodge: "閃避" };
// 每次得分只在連段列上換一行字：加了多少、為什麼。新的一筆直接頂掉舊的，不往畫面中間疊
function gain(pts, label) {
  const el = $("sGain");
  el.innerHTML = `<b>+${pts.toLocaleString()}</b>${label}`;
  replay(el, "show");
  replay($("glow"), "hit");
}
function award(kind, base, label) {
  const mult = comboMult(G.combo),
    pts = Math.round(base * mult);
  gain(pts, label || KIND[kind]);
  G.pts[kind] += pts;
  G.score += pts;
  G.combo++;
  G.bestCombo = Math.max(G.bestCombo, G.combo);
  // 旗門自己有跟著連段升調的音；其他得分補一聲同樣會升調的短音
  if (kind !== "gate") sfx.chain(G.combo);
  // 中央大字只留給倍率升級
  if (G.combo % 4 === 0 && G.combo <= 12)
    popup(`連段倍率 ×${comboMult(G.combo)}`);
  bump("hScore");
  checkGoals(false);
}
function breakCombo() {
  if (G.combo >= 2) bump("hCombo", "drop");
  G.combo = 0;
}
// 重播一個元素上的動畫
function replay(el, cls) {
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}
// 讓 HUD 上的數字跳一下
function bump(id, cls = "pop") {
  const el = $(id).parentElement;
  el.classList.remove("pop", "drop");
  replay(el, cls);
}

// 物理與判定：固定步長，一幀可能跑零到數次
function simulate(dt) {
  const r = G.run;
  G.t += dt;
  G.push = Math.max(0, G.push - dt);
  const B = G.board;
  const steer = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  G.ang +=
    (steer * 0.82 - G.ang) * Math.min(1, dt * (G.air ? 1.1 : 3.4 * B.turn));
  r.at(G.s, P);
  const sin = Math.max(0.1, P.grade / Math.hypot(1, P.grade)); // 平緩段也保有基本下滑力
  const drag = (input.tuck ? 0.0022 : 0.0045) * B.drag * G.v * G.v;
  // 刻滑：夠快、在壓雪區內、穩穩按住同一邊。亂點方向或太慢都只算搓雪
  const canCarve =
    !G.air && !input.brake && G.v > 8.3 && Math.abs(G.d) <= r.wAt(G.s);
  if (G.edge && (G.edge.gap += dt) > 0.45) ((G.edge = null), (G.chain = 0));
  if (!canCarve || steer !== G.carveDir) {
    // 放掉這一刃：壓得夠久就記下來，等著接下一刃
    if (G.carveT >= 0.5) G.edge = { dir: G.carveDir, gap: 0 };
    else if (G.carveDir) ((G.edge = null), (G.chain = 0));
    G.carveDir = canCarve ? steer : 0;
    G.carveT = 0;
    if (!canCarve) ((G.edge = null), (G.chain = 0));
    else if (G.edge && steer === -G.edge.dir) {
      // 換刃：板子回彈推一把，連續換得有節奏另外給分
      G.edge = null;
      G.carveT = 0.26; // 接得上的換刃不退回搓雪
      G.boost = 0.25;
      G.chain++;
      sfx.edge(G.chain);
      buzz(6);
      burst(5);
      if (G.chain % 3 === 0) {
        G.stat.carves++;
        award("trick", POINTS.carve, "節奏刻滑");
      }
    }
  } else if (steer) G.carveT += dt;
  G.carving = G.carveT > 0.25;
  G.boost = Math.max(0, G.boost - dt);
  let a = 9.81 * sin * Math.cos(G.ang) - drag;
  if (G.air)
    a *= 0.7; // 騰空時不吃雪面阻力，也不能煞車
  else {
    a -= 0.29 + Math.abs(G.ang) * 0.11 * G.v * (G.carving ? 0.2 : 1);
    if (G.boost > 0) a += 3.2 * B.turn;
    if (input.brake) a -= 5.5;
    else if (G.push > 0) a += 3; // 起步撐杖推進
    const over = Math.abs(G.d) - r.wAt(G.s);
    if (over > 0) a -= (1.6 + over * 0.4) * B.powder; // 衝出壓雪區，深雪拖慢
  }
  G.v = Math.max(input.brake && !G.air ? 0 : 4.5, G.v + a * dt);

  // 跳台與騰空
  if (G.jumpBuf > 0) G.jumpBuf -= dt;
  if (G.air) {
    G.vy -= GRAVITY * dt;
    G.y += G.vy * dt;
    if (G.trick) {
      G.trick.p += dt / TRICK_T;
      if (G.trick.p >= 1) {
        G.stat[G.trick.type === "spin" ? "spins" : "flips"]++;
        award(
          "trick",
          (G.trick.type === "spin" ? POINTS.spin : POINTS.flip) * B.trick,
          G.trick.name,
        );
        sfx.trick();
        G.trick = null;
      }
    }
    if (G.y <= 0) {
      const impact = -G.vy;
      G.y = 0;
      G.air = false;
      G.impact = impact;
      G.dipV -= impact * 0.22;
      jolt(Math.min(0.6, impact * 0.06));
      if (impact > 8 && !calm) G.freeze = 0.03; // 重落地頓一下，更有重量
      burst(8 + impact);
      sfx.land(impact);
      buzz(impact > 7 ? 25 : 10);
      if (G.trick) {
        G.trick = null;
        G.v *= 0.45;
        G.skier.hit();
        breakCombo();
        sfx.miss();
        popup("落地失誤");
      } else if (G.jumpBuf > 0) jump(); // 落地前預按的那一下
      G.jumpBuf = 0;
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
      sfx.jump();
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
    const ref = G.ref?.at[G.splits.length];
    G.splits.push(G.t);
    if (ref > 0) showSplit(G.t - ref);
    if (g.s >= s0 - 30 && Math.abs(G.d - g.d) < GATE_W + 0.6) {
      G.hits++;
      G.stat.gateBest = Math.max(G.stat.gateBest, ++G.stat.gateRun);
      G.hp = Math.min(100, G.hp + 5);
      g.hit = true;
      g.mats.forEach((m) => m.color.set("#2fd27a"));
      sfx.gate(G.combo);
      award("gate", POINTS.gate);
      bump("hGate");
      buzz(8);
    } else {
      g.mats.forEach((m) => m.color.set("#8d99a6"));
      G.stat.gateRun = 0;
      if (G.combo >= 2) popup("漏掉旗門，連段中斷");
      breakCombo();
      sfx.miss();
    }
  }

  // 隨機關卡：預警、閃避與碰撞
  G.inv = Math.max(0, G.inv - dt);
  const danger = G.haz.update(dt, G.s, G.d, G.y, clock);
  showWarn(danger.warn);
  if (danger.pass) {
    G.dodged++;
    const { h, kind } = danger.pass;
    if (kind === "leap") award("dodge", POINTS.leap, `飛越${h.name}`);
    else if (kind === "near") {
      G.stat.near++;
      award("dodge", POINTS.near, "驚險閃過");
    }
    if (kind !== "clear") {
      sfx.near();
      // 擦身而過的那一瞬間頓一下、晃一下
      if (!calm) G.freeze = 0.045;
      jolt(0.35);
      buzz(15);
    }
  }
  if (danger.hit && G.inv <= 0) {
    const h = danger.hit;
    G.hp = Math.max(0, G.hp - h.dmg);
    G.inv = 1.6;
    G.stat.crashes++;
    G.v *= 0.35;
    G.freeze = calm ? 0 : 0.09; // 撞擊瞬間定格
    jolt(0.9);
    G.skier.hit();
    breakCombo();
    burst(16);
    sfx.hit();
    buzz(120);
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
  if (G.s >= r.L - 4) finish();
}

// 畫面：依內插後的狀態擺人物、鏡頭、雪霧、痕跡與持續音
const trailA = new Float32Array(12),
  trailB = new Float32Array(12),
  TRAIL_TRI = [0, 3, 6, 3, 9, 6]; // 兩個三角形：前一格左右、這一格左右
function present(dt, alpha) {
  const r = G.run;
  R.s = G.ps + (G.s - G.ps) * alpha;
  R.d = G.pd + (G.d - G.pd) * alpha;
  R.y = G.py + (G.y - G.py) * alpha;
  R.ang = G.pang + (G.ang - G.pang) * alpha;
  G.skier.group.visible = G.inv <= 0 || Math.floor(G.inv * 12) % 2 === 0; // 受傷後短暫無敵，人物閃爍
  G.dipV += (-G.dip * 90 - G.dipV * 12) * dt;
  G.dip += G.dipV * dt;

  // 雪霧與痕跡
  const pos = skierPos(tA),
    ca = Math.cos(R.ang),
    sa = Math.sin(R.ang),
    hx = P.tx * ca - P.tz * sa,
    hz = P.tz * ca + P.tx * sa, // 行進方向
    nx = -hz,
    nz = hx, // 行進方向的右側
    grounded = !G.air && R.y === 0;
  const edge =
      Math.min(1, Math.abs(R.ang) / 0.7) *
      Math.min(1.3, G.v / 13) *
      (G.carving ? 0.4 : 1), // 刻滑不搓雪，雪霧少很多
    stop = input.brake ? Math.min(1.5, G.v / 7) : 0,
    deep = Math.abs(R.d) > r.wAt(R.s) ? Math.min(1, G.v / 10) : 0;
  if (grounded && G.v > 2) {
    const out = -(Math.sign(R.ang) || 1); // 雪往彎道外側噴
    G.sprayAcc +=
      (edge * 240 + stop * 300 + deep * 120 + (G.v > 9 ? 22 : 0)) *
      dt *
      (lowPower ? 0.5 : 1);
    while (G.sprayAcc >= 1) {
      G.sprayAcc--;
      const along = (Math.random() - 0.6) * 1.5,
        power = edge + stop * 0.8 + deep * 0.5,
        side =
          stop > edge || deep > edge ? (Math.random() < 0.5 ? 1 : -1) : out,
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
  sa3.position.needsUpdate =
    sa3.aFade.needsUpdate =
    sa3.aSize.needsUpdate =
      true;

  if (!grounded) G.trackLast = null;
  else {
    const skid = G.carving
        ? 0
        : Math.min(1, Math.abs(R.ang) * 0.9 + (input.brake ? 0.8 : 0)),
      ski = G.board.kind === "ski",
      wid = (ski ? 0.12 : 0.3) + skid * (ski ? 0.2 : 0.55),
      L = G.trackLast,
      cur = L === trailA ? trailB : trailA; // 兩塊緩衝輪流用，不每幀配置新陣列
    let ci = 0;
    for (let lane = 0; lane < 2; lane++) {
      const off = ski ? (lane ? 0.2 : -0.2) : 0;
      for (let side = 0; side < 2; side++) {
        const e = side ? 0.5 : -0.5,
          x = pos.x + nx * (off + e * wid),
          z = pos.z + nz * (off + e * wid);
        cur[ci++] = x;
        cur[ci++] = world.surfaceAt(x, z) + 0.06;
        cur[ci++] = z;
      }
    }
    const moved = L ? Math.hypot(cur[0] - L[0], cur[2] - L[2]) : 0;
    if (!L || moved > 4) G.trackLast = cur;
    else if (moved > 0.45) {
      const o = (G.trackI++ % G.trackN) * 36;
      for (let lane = 0; lane < 2; lane++) {
        const a = lane * 6;
        for (let v = 0; v < 6; v++) {
          const src = TRAIL_TRI[v] < 6 ? L : cur,
            b = a + (TRAIL_TRI[v] % 6),
            to = o + lane * 18 + v * 3;
          G.trackP[to] = src[b];
          G.trackP[to + 1] = src[b + 1];
          G.trackP[to + 2] = src[b + 2];
        }
      }
      G.track.geometry.attributes.position.needsUpdate = true;
      G.trackLast = cur;
    }
  }

  placeSkier(dt, "ski");
  updateAudio(
    G.v,
    grounded ? edge + stop * 0.8 + deep * 0.4 + (G.carving ? 0.35 : 0) : 0,
    G.air,
    G.carving,
  );
  touchAir(G.air && !G.trick);
  // 速度線：高速時從畫面邊緣往中心收
  const fx = $("speedfx"),
    rush = Math.min(1, Math.max(0, (G.v - 17) / 12));
  fx.style.opacity = rush * 0.6;
  if (rush > 0)
    fx.style.transform = `rotate(${Math.floor(clock * 24) * 37}deg) scale(${1.15 - rush * 0.15})`;

  if (G.tut) stepTutor();
}

// 空白鍵：在地面是跳，騰空時再按一次做特技
function jump() {
  G.jumped = true;
  G.air = true;
  G.onRamp = false;
  G.vy = 6.4 * G.board.jump;
  burst(8);
  sfx.jump();
}
function pressJump() {
  if (mode !== "ski" || paused) return;
  if (!G.air) return jump();
  const done = doTrick(
    input.tuck ? "tuck" : input.brake ? "brake" : input.left ? "left" : "right",
  );
  // 來不及做特技的高度：這一下記成「落地後馬上再跳」
  if (!done && !G.trick) G.jumpBuf = JUMP_BUFFER;
}
// 現在開始做特技，落地前轉不轉得完
function trickFits() {
  const vy = Math.max(G.vy, 0) + TRICK_KICK,
    t = (vy + Math.sqrt(vy * vy + 2 * GRAVITY * G.y)) / GRAVITY;
  return t > TRICK_T + 0.03;
}
// 騰空時做特技。鍵盤是按住方向再按跳；手機是騰空後直接點對應的按鈕
function doTrick(k) {
  if (mode !== "ski" || paused || !G.air || G.trick) return false;
  // 已經快落地、注定轉不完的那一下不開始，免得白白吃一次落地失誤
  if (!trickFits()) return false;
  G.trick =
    k === "tuck"
      ? { type: "front", name: "前空翻", p: 0 }
      : k === "brake"
        ? { type: "back", name: "後空翻", p: 0 }
        : { type: "spin", name: "360 轉體", dir: k === "left" ? 1 : -1, p: 0 };
  G.vy = Math.max(G.vy, 0) + TRICK_KICK; // 再推一把，讓動作轉得完
  sfx.jump();
  buzz(10);
  return true;
}
// 手機按鈕在騰空時換成特技鍵
const AIR_LABEL = { tL: "↺", tR: "↻", tT: "前翻", tB: "後翻", tJ: "轉體" },
  GROUND_LABEL = {};
let airUI = false;
function touchAir(on) {
  if (on === airUI) return;
  airUI = on;
  $("hud").classList.toggle("air", on);
  for (const id in AIR_LABEL) {
    GROUND_LABEL[id] ??= $(id).textContent;
    $(id).textContent = on ? AIR_LABEL[id] : GROUND_LABEL[id];
  }
}

function popup(text) {
  const el = $("pop");
  el.textContent = text;
  el.classList.remove("show");
  void el.offsetWidth;
  el.classList.add("show");
}

// 畫面上方的預警：是什麼、從哪邊來、還有多遠
let warnKey = "";
function showWarn(h) {
  const el = $("warn");
  if (!h) {
    if (warnKey) ((el.hidden = true), (warnKey = ""));
    return;
  }
  if (h !== G.warned) {
    G.warned = h;
    sfx.warn();
  }
  const dist = Math.max(0, Math.round((h.s - G.s) / 10) * 10),
    from = h.side < 0 ? "左" : "右",
    text =
      h.type === "ball"
        ? `雪球從${from}邊滾過來，閃開或跳過去`
        : h.type === "wolf"
          ? `狼從${from}邊衝出來，往${h.side < 0 ? "右" : "左"}閃或跳過去`
          : "前方有雪怪，繞開或跳過去",
    k = `${h.type}${h.s}${dist}`;
  if (k === warnKey) return;
  warnKey = k;
  el.hidden = false;
  el.innerHTML = `<b>注意</b>${text}<em>${dist} m</em>`;
}

// 丟出一顆雪霧粒子
function snow(x, y, z, vx, vy, vz, life, size) {
  const k = G.sprayI++ % G.sprayN,
    i = k * 3,
    p = G.sprayP,
    v = G.sprayV;
  p[i] = x;
  p[i + 1] = y;
  p[i + 2] = z;
  v[i] = vx;
  v[i + 1] = vy;
  v[i + 2] = vz;
  G.sprayL[k * 2] = G.sprayL[k * 2 + 1] = life;
  G.sprayF[k] = 1;
  G.sprayS[k] = size;
}

// 在指定位置揚起一團雪：雪球滾動、狼奔跑、雪怪破雪而出
function puff(x, y, z, n, power) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * 6.28,
      sp = (0.3 + Math.random() * 0.7) * power;
    snow(
      x + Math.cos(a) * 0.6,
      y,
      z + Math.sin(a) * 0.6,
      Math.cos(a) * sp,
      0.6 + Math.random() * power,
      Math.sin(a) * sp,
      0.5 + Math.random() * 0.6,
      0.3 + Math.random() * 0.5,
    );
  }
}

// 起跳、落地時向四周炸開的一圈雪
function burst(n) {
  const pos = skierPos(tA);
  for (let i = 0; i < n * 3; i++) {
    const a = Math.random() * 6.28,
      sp = 1.5 + Math.random() * 4.5;
    snow(
      pos.x + Math.cos(a) * 0.4,
      pos.y + 0.1,
      pos.z + Math.sin(a) * 0.4,
      Math.cos(a) * sp,
      0.6 + Math.random() * 3,
      Math.sin(a) * sp,
      0.4 + Math.random() * 0.6,
      0.2 + Math.random() * 0.35,
    );
  }
}

function updateHud() {
  const r = G.run,
    f = Math.min(1, G.s / r.L);
  $("hLeft").textContent = Math.max(0, Math.round(r.L - G.s)).toLocaleString();
  $("hDot").style.left = `${f * 100}%`;
  drawMini();
  if (mode === "fly") {
    $("hSpeed").textContent = Math.round(Math.atan(r.at(G.s, P).grade) * 57.3);
    return;
  }
  $("hSpeed").textContent = Math.round(G.v * 3.6);
  if (G.hp !== G.hpShown) {
    G.hpShown = G.hp;
    // 體力全滿時不用一直盯著，條子淡掉；一掉血就回來
    $("hud").classList.toggle("hpfull", G.hp >= 100);
    $("hHp").style.width = `${G.hp}%`;
    $("hHp").style.background =
      G.hp > 60 ? "#2fd27a" : G.hp > 30 ? "#ffb400" : "#e0263c";
    $("hHpNum").textContent = G.hp;
  }
  $("hTime").textContent = fmtTime(G.t);
  $("hGate").textContent = `${G.hits}/${G.gates.length}`;
  // 分數用滾的追上去，加分的感覺留在數字上
  if (scoreShown !== G.score) {
    const gap = G.score - scoreShown;
    scoreShown = Math.abs(gap) < 2 ? G.score : scoreShown + gap * 0.3;
    $("hScore").textContent = Math.round(scoreShown).toLocaleString();
  }
  if (G.combo !== G.comboShown) {
    const el = $("hCombo");
    if (G.combo > G.comboShown && G.comboShown >= 0) bump("hCombo");
    G.comboShown = G.combo;
    el.textContent = `×${comboMult(G.combo)}`;
    // 連段條：十二段集滿就是最高倍率。熱度同時給連段列和畫面邊緣的光暈用
    $("hChain").style.width = `${(Math.min(12, G.combo) / 12) * 100}%`;
    $("hud").dataset.heat =
      G.combo >= 12 ? 3 : G.combo >= 8 ? 2 : G.combo >= 4 ? 1 : 0;
  }
}

function finish(failed = false) {
  const r = G.run,
    old = readBest(r),
    fin = finalScore({
      points: G.score,
      time: G.t,
      par: G.par,
      hp: G.hp,
      failed,
    }),
    rate = rating({
      hits: G.hits,
      gates: G.gates.length,
      time: G.t,
      par: G.par,
      hp: G.hp,
      style: G.pts.trick + G.pts.dodge,
      kickers: G.kickers.length,
    }),
    gr = failed ? "" : grade(rate),
    plus = (n) => `+${n.toLocaleString()}`,
    gates = `旗門 ${G.hits}/${G.gates.length}`;
  G.failed = failed;
  G.v = 0;
  G.ang = 0;
  checkGoals(!failed);
  renderGoals("rGoals");
  $("rGoalSum").textContent = `累計完成 ${goalTotal()} 個目標`;
  $("result").classList.remove("record");
  $("confetti").innerHTML = "";
  let record = false;
  $("rEyebrow").textContent = failed ? "體力耗盡" : "抵達終點";
  $("rName").innerHTML = `${diffTag(r.diff)}　${r.zh}`;
  $("rTime").textContent = failed ? "未完成" : fmtTime(G.t);
  $("rGrade").textContent = gr;
  $("rGrade").className = `grade g${gr}`;
  $("rGrade").hidden = failed;
  $("rScore").textContent = "0";
  $("rCombo").textContent = G.bestCombo;
  let note;
  if (failed)
    note = `滑了 ${Math.round(G.s).toLocaleString()} m，離終點還有 ${Math.max(0, Math.round(r.L - G.s)).toLocaleString()} m`;
  else {
    const newTime = !(old.time > 0) || G.t < old.time,
      newScore = fin.total > old.score;
    if (newTime) store.set(`best:${key}:${r.id}`, G.t.toFixed(2));
    if (newScore) store.set(`score:${key}:${r.id}`, `${fin.total}|${gr}`);
    if (!G.ref || G.t < G.ref.time)
      store.set(
        splitKey(r),
        `${G.t.toFixed(2)}|${G.splits.map((t) => t.toFixed(2)).join(",")}`,
      );
    record = old.time > 0 && (newTime || newScore);
    note = !(old.time > 0)
      ? "第一次完成這條雪道"
      : newTime && newScore
        ? "分數與時間都刷新紀錄"
        : newScore
          ? `刷新最高分，先前 ${old.score.toLocaleString()} 分`
          : newTime
            ? `刷新最快時間，先前 ${fmtTime(old.time)}`
            : `個人最佳 ${old.score.toLocaleString()} 分・${fmtTime(old.time)}`;
  }
  if (!failed) note += `　｜　評級達成 ${Math.round(rate * 100)}%`;
  $("rBest").textContent = note;
  // 前幾列是會加進總分的項目，結算時一列一列亮起來、加上去
  const parts = failed
      ? [G.pts.gate, G.pts.trick, G.pts.dodge]
      : [fin.timeBonus, G.pts.gate, G.pts.trick, G.pts.dodge, fin.hpBonus],
    rows = failed
      ? [
          [gates, plus(G.pts.gate)],
          ["特技", plus(G.pts.trick)],
          ["閃避", plus(G.pts.dodge)],
          ["最高時速", `${Math.round(G.max * 3.6)} km/h`],
          ["滑行時間", fmtTime(G.t)],
          ["閃過危險", `${G.dodged} 次`],
        ]
      : [
          ["時間", plus(fin.timeBonus)],
          [gates, plus(G.pts.gate)],
          ["特技", plus(G.pts.trick)],
          ["閃避", plus(G.pts.dodge)],
          ["剩餘體力", plus(fin.hpBonus)],
          ["最高時速", `${Math.round(G.max * 3.6)} km/h`],
        ];
  $("rStats").innerHTML = rows
    .map(
      (s, i) =>
        `<div${i < parts.length ? ' class="add"' : ""}><dt>${s[0]}</dt><dd>${s[1]}</dd></div>`,
    )
    .join("");
  $("rSave").hidden = true;
  $("rSaveMsg").hidden = true;
  $("rWho").value = store.get("name") || "";
  loadBoard(r);
  G.res = {
    total: fin.total,
    grade: gr,
    record,
    parts,
    time: failed ? 0 : G.t,
    t: 0,
    shown: -1,
    tick: 0,
    done: false,
  };
  setMode("result");
  if (failed) {
    sfx.fail();
    G.skier.fall();
  } else sfx.finish();
}

// 破紀錄：紀錄那一行亮起來，結算頁上方灑一陣彩帶
const CONFETTI = ["#ffd23c", "#ff6b3d", "#2fd27a", "#1f6feb", "#ffffff"];
function celebrate() {
  $("result").classList.add("record");
  sfx.record();
  buzz(40);
  if (calm) return;
  let html = "";
  for (let i = 0; i < 28; i++)
    html += `<i style="left:${(Math.random() * 100).toFixed(1)}%;background:${CONFETTI[i % CONFETTI.length]};animation-delay:${(Math.random() * 0.5).toFixed(2)}s;--drift:${Math.round(Math.random() * 120 - 60)}px;--spin:${Math.round(Math.random() * 900 - 450)}deg"></i>`;
  $("confetti").innerHTML = html;
}

// 結算：總分跳數字，跳完才蓋上評級
function stepResult(dt) {
  const res = G.res;
  if (!res || res.done) return;
  res.t += dt;
  const x = Math.max(0, res.t - 0.5) / 0.42,
    i = Math.min(res.parts.length, Math.floor(x)),
    rows = $("rStats").children;
  let val = 0;
  for (let k = 0; k < i; k++) val += res.parts[k];
  if (i < res.parts.length)
    val += Math.round(res.parts[i] * (1 - (1 - (x - i)) ** 3));
  for (let k = 0; k <= i && k < res.parts.length; k++)
    rows[k].classList.add("in");
  if (val !== res.shown) {
    res.shown = val;
    $("rScore").textContent = val.toLocaleString();
    if ((res.tick -= dt) <= 0) {
      res.tick = 0.05;
      sfx.tick();
    }
  }
  if (i >= res.parts.length) {
    res.done = true;
    $("rScore").textContent = res.total.toLocaleString();
    $("rGrade").classList.add("show");
    if (res.grade) sfx.grade(res.grade === "S");
    $("rSave").hidden = false;
    if (res.record) celebrate();
  }
}

/* ---------- 排行榜：每條雪道各一份，所有人共用 ---------- */
// 共用排行榜的接口（Google 試算表上的網頁應用程式，程式在 backend/）。
// 留空就退回只存在這台裝置的瀏覽器裡
const BOARD_API =
  "https://script.google.com/macros/s/AKfycbzEUvRW4Wm31iOML5gbqcFMLtdCaCg39SXg7EumldmplSR0ThlbfLMXK2pP5DWOScQi/exec";
const boardKey = (run) => `board:${key}:${run.id}`;
function readLocalBoard(run) {
  try {
    const list = JSON.parse(store.get(boardKey(run)) || "[]");
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}
function boardNote(ol, text, retry) {
  const li = document.createElement("li");
  li.className = "empty";
  li.textContent = text;
  if (retry) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "link";
    btn.textContent = "重試";
    btn.onclick = retry;
    li.append(" ", btn);
  }
  ol.textContent = "";
  ol.append(li);
}
// 列出前五名；自己剛記的那筆不在前五也補在最後一列
function showBoard(ol, list, mine) {
  if (!list.length) return boardNote(ol, "還沒有人留下紀錄，當第一個");
  ol.textContent = "";
  const at = mine ? list.findIndex((e) => e.at === mine) : -1,
    show = list.slice(0, 5).map((e, i) => [i, e]);
  if (at >= 5) show.push([at, list[at]]);
  for (const [i, e] of show) {
    const li = document.createElement("li");
    if (i === at) li.className = "me";
    for (const [cls, text] of [
      ["rank", i + 1],
      ["who", e.n],
      ["g", e.g || "–"],
      ["pts", Number(e.s).toLocaleString()],
      ["time", e.t ? fmtTime(e.t) : "未完成"],
    ]) {
      const span = document.createElement("span");
      span.className = cls;
      span.textContent = text;
      li.append(span);
    }
    ol.append(li);
  }
}
// 每次讀取或寫入都領一個號碼：回來時號碼不是最新的，代表畫面已經換成別趟，直接丟掉。
// 雪道卡片（cBoard）和結算畫面（rBoard）各領各的
const boardTicket = { cBoard: 0, rBoard: 0 };
// 讀過的榜先留著：再看同一條雪道時先顯示舊的，背景再更新
const boardCache = new Map();
async function loadBoard(run, id = "rBoard") {
  const ol = $(id),
    ticket = ++boardTicket[id],
    name = `${key}:${run.id}`;
  if (!BOARD_API) return showBoard(ol, readLocalBoard(run));
  const had = boardCache.get(name);
  if (had) showBoard(ol, had);
  else boardNote(ol, "讀取排行榜…");
  try {
    const res = await fetch(`${BOARD_API}?run=${encodeURIComponent(name)}`),
      d = await res.json();
    if (!d.ok) throw new Error(d.error);
    boardCache.set(name, d.list);
    if (ticket === boardTicket[id]) showBoard(ol, d.list);
  } catch {
    if (ticket === boardTicket[id] && !had)
      boardNote(ol, "排行榜暫時讀不到。", () => loadBoard(run, id));
  }
}
async function saveScore(e) {
  e.preventDefault();
  const res = G.res,
    run = G.run,
    msg = $("rSaveMsg"),
    btn = $("btnSave"),
    name = $("rWho").value.trim().slice(0, 12);
  if (!res || !res.done || res.saved || res.saving) return;
  const say = (text, bad) => {
    msg.textContent = text;
    msg.classList.toggle("bad", !!bad);
    msg.hidden = false;
  };
  if (!name) {
    say("先輸入名字再記錄", true);
    return $("rWho").focus();
  }
  const entry = {
    n: name,
    s: res.total,
    g: res.grade,
    t: res.time,
    at: Date.now(),
  };
  const done = (list, at, rank) => {
    store.set("name", name);
    res.saved = true;
    $("rSave").hidden = true;
    say(`已記錄，排第 ${rank} 名`);
    showBoard($("rBoard"), list, at);
    sfx.ui();
  };
  if (!BOARD_API) {
    const list = [...readLocalBoard(run), entry]
      .sort((a, b) => b.s - a.s)
      .slice(0, 20);
    if (!store.set(boardKey(run), JSON.stringify(list)))
      return say("這個瀏覽器不允許儲存，紀錄沒有留下", true);
    const rank = list.indexOf(entry) + 1;
    if (!rank) {
      res.saved = true;
      $("rSave").hidden = true;
      return say("已記錄，這次沒有擠進前 20 名");
    }
    return done(list, entry.at, rank);
  }
  const ticket = ++boardTicket.rBoard;
  res.saving = true;
  btn.disabled = $("rWho").disabled = true;
  btn.textContent = "記錄中…";
  msg.hidden = true;
  try {
    // 用純文字送出，瀏覽器才不會先發一次預檢請求（試算表的接口不回應預檢）
    const r = await fetch(BOARD_API, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({
          run: `${key}:${run.id}`,
          name,
          score: entry.s,
          grade: entry.g,
          time: entry.t,
        }),
      }),
      d = await r.json();
    if (!d.ok) throw new Error(d.error);
    boardCache.set(`${key}:${run.id}`, d.list);
    if (ticket === boardTicket.rBoard && G.res === res)
      done(d.list, d.at, d.rank);
  } catch {
    if (G.res === res) say("沒有記錄成功，檢查網路後再按一次", true);
  } finally {
    res.saving = false;
    btn.disabled = $("rWho").disabled = false;
    btn.textContent = "記錄分數";
  }
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
  const raw = (now - last) / 1000,
    dt = Math.min(0.05, raw);
  last = now;
  if (paused) return renderer.render(world.scene, camera);
  if (mode === "ski") tuneQuality(raw);
  clock += dt;
  G.shake = Math.max(0, (G.shake || 0) - dt * 1.7);
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
    const label = G.cd > 0.2 ? String(Math.ceil(G.cd - 0.2)) : "出發";
    if (label !== G.cdShown) {
      const el = $("count");
      G.cdShown = el.textContent = label;
      el.classList.remove("tick");
      void el.offsetWidth;
      el.classList.add("tick");
      if (label === "出發") sfx.go();
      else sfx.count();
    }
    syncR();
    placeSkier(dt, "count");
    updateHud();
    if (G.cd <= -0.5) {
      G.v = 6;
      G.push = 1.6;
      G.t = 0;
      setMode("ski");
    }
  } else if (mode === "ski") {
    if (G.freeze > 0) G.freeze -= dt;
    else {
      G.acc += dt;
      while (G.acc >= STEP_T && mode === "ski") {
        G.ps = G.s;
        G.pd = G.d;
        G.py = G.y;
        G.pang = G.ang;
        simulate(STEP_T);
        G.acc -= STEP_T;
      }
    }
    if (mode === "ski") {
      present(G.freeze > 0 ? 0 : dt, G.acc / STEP_T);
      updateHud();
    }
  } else if (mode === "result" && G.group) {
    syncR();
    placeSkier(dt, "result");
    stepResult(dt);
  }
  world.aimSun(
    mode === "explore"
      ? controls.target
      : G.group
        ? G.skier.group.position
        : look,
  );
  world.update(clock, camera);
  debugCam?.(camera); // 除錯時可以把鏡頭搬去看模型近照
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
$("btnSki").onclick = () => startSki();
$("btnAgain").onclick = () => startSki(true);
// 飛覽與結算跳分都能點一下跳過，急著再滑的人不用等
document.addEventListener("pointerdown", (e) => {
  if (e.target.closest("button, input, a")) return;
  if (mode === "fly") backToExplore();
  else if (mode === "result" && G.res && !G.res.done) G.res.t = 1e3;
});
$("btnOther").onclick = backToExplore;
$("rSave").addEventListener("submit", saveScore);
$("btnQuit").onclick = backToExplore;
$("btnPause").onclick = () => setPaused(true);
$("btnResume").onclick = () => setPaused(false);
$("btnRestart").onclick = () => startSki(true);
$("btnPauseQuit").onclick = backToExplore;
$("btnOpts").onclick = $("btnPauseOpts").onclick = () => show("settings", true);
$("btnOptsDone").onclick = () => show("settings", false);
$("optList").addEventListener("click", (e) => {
  const b = e.target.closest("[data-opt]");
  if (b) setOpt(b.dataset.opt, +b.dataset.v);
});
applyOpts();
document.addEventListener("visibilitychange", () => {
  if (document.hidden) setPaused(true);
});

// 用實體按鍵位置判斷：開著中文輸入法時 e.key 不是英文字母，WASD 會失效
const keyMap = {
  ArrowLeft: "left",
  KeyA: "left",
  ArrowRight: "right",
  KeyD: "right",
  ArrowDown: "brake",
  KeyS: "brake",
  ArrowUp: "tuck",
  KeyW: "tuck",
};
const releaseInput = () =>
  Object.keys(input).forEach((k) => (input[k] = false));
const onKey = (down) => (e) => {
  if (e.target instanceof HTMLInputElement) return; // 正在輸入名字，別當成快捷鍵
  const playing = mode === "ski" || mode === "count";
  if (down && !e.repeat && !$("app").hidden) {
    const k = e.code;
    if (k === "Escape") {
      if (playing) return setPaused(!paused);
      if (mode !== "explore") return backToExplore();
    }
    if (k === "KeyP" && playing) return setPaused(!paused);
    if (k === "KeyR" && (playing || mode === "result")) return startSki(true);
    if (k === "KeyM") return setOpt("vol", opt.vol ? 0 : 2);
  }
  if (paused) return;
  if (e.code === "Space" && playing) {
    e.preventDefault();
    if (down && !e.repeat) pressJump();
    return;
  }
  const k = keyMap[e.code];
  if (!k || !playing) return;
  input[k] = down;
  e.preventDefault();
};
addEventListener("keydown", onKey(true));
addEventListener("keyup", onKey(false));
addEventListener("blur", releaseInput);
for (const [id, k] of [
  ["tL", "left"],
  ["tR", "right"],
  ["tB", "brake"],
  ["tT", "tuck"],
]) {
  const el = $(id),
    steer = k === "left" || k === "right";
  let held = null; // 這根手指目前按著哪個方向
  const press = (to) => {
    if (held === to) return;
    if (held) {
      input[held] = false;
      $(held === "left" ? "tL" : held === "right" ? "tR" : id).classList.remove(
        "down",
      );
    }
    held = to;
    if (to) {
      input[to] = true;
      $(to === "left" ? "tL" : to === "right" ? "tR" : id).classList.add(
        "down",
      );
    }
  };
  el.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    if (doTrick(k)) return; // 騰空時這一下是特技，不當成轉向
    // 手指滑出按鈕也不放開；左右兩顆之間可以直接滑過去換邊
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      /* 抓不到指標就維持原本的行為 */
    }
    press(k);
  });
  el.addEventListener("pointermove", (e) => {
    if (!held || !steer) return;
    const a = $("tL").getBoundingClientRect(),
      b = $("tR").getBoundingClientRect();
    press(e.clientX < (a.right + b.left) / 2 ? "left" : "right");
  });
  for (const ev of ["pointerup", "pointercancel", "lostpointercapture"])
    el.addEventListener(ev, () => press(null));
  el.addEventListener("contextmenu", (e) => e.preventDefault());
}
{
  const el = $("tJ"),
    up = () => el.classList.remove("down");
  el.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    el.classList.add("down");
    pressJump();
  });
  for (const ev of ["pointerup", "pointercancel", "pointerleave"])
    el.addEventListener(ev, up);
}
$("gear").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  board = BOARDS.find((x) => x.id === b.dataset.board);
  try {
    localStorage.setItem("board", board.id);
  } catch {}
  renderGear();
});

let debugCam = null;
// 除錯用：網址加上 #debug 才會掛出狀態
if (location.hash === "#debug")
  window.__ski = {
    G,
    input,
    world: () => world,
    gl: () => renderer,
    cam: (fn) => (debugCam = fn),
  };
