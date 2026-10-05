// 隨機關卡：雪球、狼、雪怪。每一個都會先預警、看得到來向，注意到就閃得掉
import * as THREE from "three";

export const HAZARDS = {
  ball: { name: "雪球", dmg: 20, r: 2.0, jump: false },
  wolf: { name: "狼", dmg: 25, r: 1.8, jump: true }, // 跳得過去
  yeti: { name: "雪怪", dmg: 35, r: 2.3, jump: false },
};
const WARN_AT = 150, // 進入這個距離開始預警、現身
  GO_AT = 90; // 進入這個距離才開始動

const lam = (color) =>
  new THREE.MeshLambertMaterial({ color, flatShading: true });
const box = (w, h, d, mat, x, y, z) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
};

function makeBall() {
  const g = new THREE.Group(),
    core = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.5, 1),
      lam("#c3d3e8"),
    );
  core.position.y = 1.5;
  g.add(core);
  g.userData.core = core;
  return g;
}

function makeWolf() {
  const g = new THREE.Group(),
    fur = lam("#69727f"),
    pale = lam("#c9d1da"),
    dark = lam("#2a3038"),
    eye = new THREE.MeshBasicMaterial({ color: "#ffd23c" });
  const body = new THREE.Group();
  body.add(box(0.55, 0.6, 1.4, fur, 0, 0.85, 0));
  body.add(box(0.5, 0.5, 0.55, fur, 0, 1.15, 0.85));
  body.add(box(0.26, 0.24, 0.36, pale, 0, 1.05, 1.24));
  body.add(box(0.12, 0.1, 0.08, dark, 0, 1.12, 1.44));
  for (const x of [-0.17, 0.17]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.26, 4), fur);
    ear.position.set(x, 1.5, 0.8);
    body.add(ear);
    body.add(box(0.07, 0.07, 0.04, eye, x * 0.85, 1.22, 1.13));
  }
  const tail = box(0.16, 0.16, 0.7, fur, 0, 1.0, -0.95);
  tail.rotation.x = 0.6;
  body.add(tail);
  g.add(body);
  const legs = [];
  for (const [x, z] of [
    [-0.2, 0.5],
    [0.2, 0.5],
    [-0.2, -0.5],
    [0.2, -0.5],
  ]) {
    const hip = new THREE.Group();
    hip.position.set(x, 0.62, z);
    hip.add(box(0.15, 0.62, 0.15, fur, 0, -0.31, 0));
    g.add(hip);
    legs.push(hip);
  }
  g.scale.setScalar(1.9);
  g.userData = { body, legs, tail };
  return g;
}

function makeYeti() {
  const g = new THREE.Group(),
    fur = lam("#9db4d6"),
    skin = lam("#3d5a8a"),
    dark = lam("#1b2634");
  const ball = (r, mat, x, y, z, sx = 1, sy = 1, sz = 1) => {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), mat);
    m.position.set(x, y, z);
    m.scale.set(sx, sy, sz);
    return m;
  };
  const body = new THREE.Group();
  body.add(ball(1.15, fur, 0, 1.55, 0, 1, 1.2, 0.9));
  body.add(ball(0.72, fur, 0, 3.0, 0.05));
  body.add(ball(0.5, skin, 0, 2.95, 0.42, 1, 0.9, 0.5));
  for (const x of [-0.2, 0.2]) {
    body.add(ball(0.08, dark, x, 3.05, 0.68));
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.42, 5), skin);
    horn.position.set(x * 2.3, 3.62, 0);
    horn.rotation.z = -x * 1.6;
    body.add(horn);
  }
  body.add(box(0.36, 0.1, 0.06, dark, 0, 2.74, 0.66));
  const arms = [];
  for (const side of [-1, 1]) {
    const sh = new THREE.Group();
    sh.position.set(side * 1.05, 2.3, 0);
    const arm = new THREE.Mesh(
      new THREE.CylinderGeometry(0.26, 0.32, 1.5, 6),
      fur,
    );
    arm.position.y = 0.7;
    sh.add(arm);
    sh.add(ball(0.36, skin, 0, 1.5, 0));
    sh.rotation.z = -side * 0.7;
    body.add(sh);
    arms.push(sh);
    const leg = new THREE.Mesh(
      new THREE.CylinderGeometry(0.36, 0.42, 0.8, 6),
      fur,
    );
    leg.position.set(side * 0.5, 0.4, 0);
    g.add(leg);
  }
  g.add(body);
  g.userData = { body, arms };
  return g;
}

// 飄在頭頂的紅色警示標，隔著坡頂也看得到位置
const signMat = new THREE.MeshBasicMaterial({ color: "#e0263c", fog: false }),
  beamMat = new THREE.MeshBasicMaterial({ color: "#e0263c", transparent: true, opacity: 0.35, fog: false, depthWrite: false });
function makeSign() {
  const g = new THREE.Group(),
    gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.85), signMat),
    beam = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 3.2, 5), beamMat);
  gem.scale.y = 1.4;
  beam.position.y = -2.6;
  g.add(gem, beam);
  g.userData.gem = gem;
  return g;
}

// 地上的紅色危險帶：標出雪球、狼會經過的範圍
function dangerStrip(world, p, d0, d1, group) {
  const v = [],
    put = (f, w) => {
      const x = p.x + p.tx * f - p.tz * w,
        z = p.z + p.tz * f + p.tx * w;
      v.push(x, world.surfaceAt(x, z) + 0.34, z);
    };
  const a = Math.min(d0, d1),
    b = Math.max(d0, d1),
    n = Math.max(1, Math.round((b - a) / 2));
  for (let i = 0; i < n; i++) {
    const w0 = a + ((b - a) * i) / n,
      w1 = a + ((b - a) * (i + 1)) / n;
    (put(-2.4, w0), put(2.4, w0), put(-2.4, w1));
    (put(2.4, w0), put(2.4, w1), put(-2.4, w1));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(v, 3));
  const m = new THREE.Mesh(
    g,
    new THREE.MeshBasicMaterial({
      color: "#e0263c",
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -6,
      polygonOffsetUnits: -6,
    }),
  );
  m.visible = false;
  group.add(m);
  return m;
}

export function createHazards(world, run, kickers, gates, group) {
  const list = [];
  const types = ["ball", "wolf", "yeti"];
  for (
    let s = 170 + Math.random() * 60;
    s < run.L - 110;
    s += 150 + Math.random() * 90
  ) {
    // 避開跳台前後與太窄的路段
    const busy = (v) =>
      run.wAt(v) < 11 ||
      kickers.some((k) => v > k.s - 28 && v < k.s + 50) ||
      gates.some((g) => Math.abs(v - g.s) < 24);
    while (s < run.L - 110 && busy(s)) s += 12;
    if (s >= run.L - 110) break;
    const type = types[(Math.random() * types.length) | 0],
      side = Math.random() < 0.5 ? -1 : 1, // 從哪一側來：-1 左、1 右
      w = run.wAt(s),
      p = run.at(s, {}),
      h = {
        type,
        ...HAZARDS[type],
        s,
        side,
        w,
        p,
        state: "idle",
        t: 0,
        hit: false,
      };
    if (type === "ball") {
      h.d = side * (w + 5);
      h.to = -side * (w + 9);
      h.speed = 6;
      h.mesh = makeBall();
      h.mark = dangerStrip(world, p, h.d, h.to, group);
    } else if (type === "wolf") {
      h.d = side * (w + 6);
      h.to = -side * w * 0.12; // 只衝到中線附近，另一側是安全的
      h.speed = 9;
      h.mesh = makeWolf();
      h.mark = dangerStrip(world, p, h.d, h.to - side * 1.5, group);
    } else {
      h.d = (Math.random() - 0.5) * w * 0.7;
      h.speed = 2.2; // 會慢慢朝玩家靠過來
      h.mesh = makeYeti();
    }
    h.mesh.visible = false;
    group.add(h.mesh);
    h.sign = makeSign();
    h.sign.visible = false;
    group.add(h.sign);
    list.push(h);
  }

  const place = (h) => {
    const x = h.p.x - h.p.tz * h.d,
      z = h.p.z + h.p.tx * h.d;
    h.mesh.position.set(x, world.heightAt(x, z), z);
    h.sign.position.set(x, h.mesh.position.y + (h.type === "yeti" ? 9 : 7.5) + Math.sin(h.t * 4) * 0.3, z);
    h.sign.userData.gem.rotation.y = h.t * 2.5;
  };
  // 面向：dir = 1 朝玩家右側、-1 朝左側、0 朝上坡看著玩家
  const face = (h, dir) => {
    const fx = dir ? -h.p.tz * dir : -h.p.tx,
      fz = dir ? h.p.tx * dir : -h.p.tz;
    h.mesh.rotation.y = Math.atan2(fx, fz);
  };

  // 回傳 { warn: 最近的預警對象, hit: 這一幀撞到的對象 }
  function update(dt, s, d, y, clock) {
    let warn = null,
      hit = null;
    for (const h of list) {
      const dist = h.s - s;
      if (h.state === "idle") {
        if (dist > WARN_AT) continue;
        h.state = "warn";
        h.mesh.visible = true;
        h.sign.visible = true;
        if (h.mark) h.mark.visible = true;
        place(h);
        face(h, h.type === "yeti" ? 0 : -h.side);
      }
      if (h.state === "gone") continue;
      h.t += dt;
      if (h.state === "warn" && dist < GO_AT) h.state = "go";
      const u = h.mesh.userData;
      if (h.type === "ball") {
        if (h.state === "go") {
          const step =
            Math.sign(h.to - h.d) *
            Math.min(Math.abs(h.to - h.d), h.speed * dt);
          h.d += step;
          u.core.rotation.z += (step / 1.5) * (h.p.tx >= 0 ? -1 : 1);
          u.core.rotation.x += Math.abs(step) / 1.5;
        } else u.core.position.y = 1.5 + Math.abs(Math.sin(h.t * 5)) * 0.25; // 預警時原地抖動
      } else if (h.type === "wolf") {
        const run2 = h.state === "go" && Math.abs(h.to - h.d) > 0.05;
        if (run2)
          h.d +=
            Math.sign(h.to - h.d) *
            Math.min(Math.abs(h.to - h.d), h.speed * dt);
        const k = run2 ? Math.sin(h.t * 16) : 0;
        u.legs.forEach(
          (l, i) => (l.rotation.x = (i === 0 || i === 3 ? k : -k) * 0.9),
        );
        u.body.position.y = run2 ? Math.abs(k) * 0.12 : 0;
        u.body.rotation.x = run2 ? 0 : -0.25 - Math.sin(h.t * 3) * 0.08; // 停下來仰頭嚎叫
        u.tail.rotation.y = Math.sin(h.t * 7) * 0.4;
        if (h.state === "go" && !run2) face(h, 0);
      } else {
        const grow = Math.min(1, h.t / 0.6); // 從雪裡冒出來
        h.mesh.scale.setScalar(grow * (2 - grow));
        if (h.state === "go" && dist > 0) {
          const lim = h.w - 2.5,
            to = Math.max(-lim, Math.min(lim, d));
          h.d +=
            Math.sign(to - h.d) * Math.min(Math.abs(to - h.d), h.speed * dt);
        }
        u.arms.forEach(
          (a, i) =>
            (a.rotation.z =
              (i ? -1 : 1) * (0.5 + Math.sin(h.t * 6 + i) * 0.35)),
        );
        u.body.rotation.z = Math.sin(h.t * 3) * 0.06;
        u.body.position.y = Math.abs(Math.sin(h.t * 6)) * 0.12;
      }
      place(h);
      if (h.mark)
        h.mark.material.opacity =
          dist > 0 ? 0.42 + Math.sin(clock * 9) * 0.16 : 0;
      if (dist < 0) h.sign.visible = false;
      if (dist > 0 && (!warn || dist < warn.s - s)) warn = h;
      if (
        !h.hit &&
        Math.abs(dist) < 1.7 &&
        Math.abs(d - h.d) < h.r &&
        !(h.jump && y > 0.9)
      ) {
        h.hit = true;
        hit = h;
      }
      if (dist < -70) {
        h.state = "gone";
        h.mesh.visible = false;
        if (h.mark) h.mark.visible = false;
      }
    }
    return { warn, hit };
  }

  return { list, update };
}
