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

const damp = (a, b, rate, dt) => a + (b - a) * (1 - Math.exp(-rate * dt));
const blob = (r, mat, x, y, z, sx = 1, sy = 1, sz = 1) => {
  const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), mat);
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  return m;
};
// 從關節往下垂的一節肢體
const limb = (rTop, rBot, len, mat) => {
  const geo = new THREE.CylinderGeometry(rTop, rBot, len, 6);
  geo.translate(0, -len / 2, 0);
  return new THREE.Mesh(geo, mat);
};
const shadowed = (g) => {
  g.traverse((o) => {
    if (o.isMesh) o.castShadow = true;
  });
  return g;
};

function makeBall() {
  const g = new THREE.Group(),
    geo = new THREE.IcosahedronGeometry(1.5, 2),
    pos = geo.attributes.position;
  // 表面捏得坑坑疤疤，滾起來才看得出在轉
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i),
      y = pos.getY(i),
      z = pos.getZ(i),
      k =
        1 +
        Math.sin(x * 3.1 + y * 1.7) * 0.05 +
        Math.sin(z * 4.3 - x * 2.2) * 0.04;
    pos.setXYZ(i, x * k, y * k, z * k);
  }
  geo.computeVertexNormals();
  const core = new THREE.Mesh(geo, lam("#cfdcee"));
  for (let i = 0; i < 7; i++) {
    const a = i * 2.4,
      b = Math.sin(i * 1.9) * 1.1,
      r = 1.42 * Math.cos(b);
    core.add(
      blob(
        0.3 + (i % 3) * 0.09,
        lam(i % 2 ? "#aebfd6" : "#e6eef8"),
        Math.cos(a) * r,
        Math.sin(b) * 1.42,
        Math.sin(a) * r,
      ),
    );
  }
  core.position.y = 1.5;
  g.add(core);
  g.userData.core = core;
  return shadowed(g);
}

function makeWolf() {
  const g = new THREE.Group(),
    fur = lam("#69727f"),
    back = lam("#4a525d"),
    pale = lam("#c9d1da"),
    dark = lam("#2a3038"),
    eye = new THREE.MeshBasicMaterial({ color: "#ffd23c" });
  const body = new THREE.Group();
  body.add(blob(0.36, fur, 0, 0.95, 0.32, 1, 1.05, 1.35)); // 胸
  body.add(blob(0.3, fur, 0, 0.92, -0.42, 1, 1, 1.4)); // 臀
  body.add(blob(0.24, back, 0, 1.13, -0.05, 0.9, 0.6, 2.5)); // 背上的深色毛
  body.add(blob(0.25, pale, 0, 0.8, 0.52, 0.9, 0.95, 1)); // 胸前白毛
  const neck = limb(0.2, 0.26, 0.42, fur);
  neck.position.set(0, 1.3, 0.72);
  neck.rotation.x = -0.75;
  body.add(neck);

  const head = new THREE.Group();
  head.position.set(0, 1.26, 0.74);
  head.add(blob(0.27, fur, 0, 0.08, 0.12, 1, 0.95, 1.1));
  const snout = new THREE.Mesh(
    new THREE.CylinderGeometry(0.07, 0.15, 0.42, 5),
    pale,
  );
  snout.rotation.x = Math.PI / 2;
  snout.position.set(0, 0.02, 0.48);
  head.add(snout);
  head.add(blob(0.055, dark, 0, 0.05, 0.7));
  const jaw = box(0.15, 0.045, 0.3, dark, 0, 0, 0.15);
  const jawPivot = new THREE.Group();
  jawPivot.position.set(0, -0.08, 0.28);
  jawPivot.add(jaw);
  head.add(jawPivot);
  for (const x of [-0.15, 0.15]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.28, 4), back);
    ear.position.set(x, 0.38, 0.02);
    ear.rotation.z = -x * 1.2;
    head.add(ear);
    head.add(box(0.07, 0.06, 0.04, eye, x * 0.85, 0.15, 0.36));
    head.add(box(0.11, 0.03, 0.05, dark, x * 0.85, 0.2, 0.36)); // 壓低的眉骨，看起來兇
  }
  body.add(head);

  const tail = new THREE.Group();
  tail.position.set(0, 1.0, -0.8);
  tail.add(limb(0.1, 0.13, 0.42, fur));
  const tip = new THREE.Group();
  tip.position.y = -0.4;
  tip.add(limb(0.13, 0.03, 0.36, pale));
  tail.add(tip);
  body.add(tail);
  g.add(body);

  const legs = [];
  for (const [x, z] of [
    [-0.2, 0.46],
    [0.2, 0.46],
    [-0.2, -0.5],
    [0.2, -0.5],
  ]) {
    const hip = new THREE.Group(),
      knee = new THREE.Group();
    hip.position.set(x, 0.74, z);
    hip.add(limb(0.1, 0.07, 0.38, fur));
    knee.position.y = -0.36;
    knee.add(limb(0.065, 0.05, 0.34, fur));
    knee.add(box(0.13, 0.07, 0.19, pale, 0, -0.35, 0.04));
    hip.add(knee);
    g.add(hip);
    legs.push({ hip, knee, front: z > 0, side: Math.sign(x) });
  }
  g.scale.setScalar(1.9);
  g.userData = {
    body,
    head,
    jaw: jawPivot,
    legs,
    tail,
    tip,
    pitch: 0,
    lift: 0,
  };
  return shadowed(g);
}

function makeYeti() {
  const g = new THREE.Group(),
    fur = lam("#9db4d6"),
    shade = lam("#7f99c0"),
    skin = lam("#3d5a8a"),
    dark = lam("#1b2634"),
    white = lam("#f4f8fc"),
    glow = new THREE.MeshBasicMaterial({ color: "#ffe36b" });
  const body = new THREE.Group();
  body.add(blob(1.15, fur, 0, 1.55, 0, 1, 1.2, 0.9));
  body.add(blob(0.8, white, 0, 1.4, 0.62, 0.9, 1.05, 0.62)); // 肚子
  body.add(blob(0.5, shade, -0.75, 2.25, 0, 1, 0.8, 0.9));
  body.add(blob(0.5, shade, 0.75, 2.25, 0, 1, 0.8, 0.9)); // 肩膀
  const head = new THREE.Group();
  head.position.set(0, 3.0, 0.05);
  head.add(blob(0.72, fur, 0, 0, 0));
  head.add(blob(0.5, skin, 0, -0.05, 0.37, 1, 0.9, 0.5));
  head.add(box(0.8, 0.14, 0.2, shade, 0, 0.2, 0.55)); // 眉骨
  for (const x of [-0.2, 0.2]) {
    head.add(blob(0.09, glow, x, 0.06, 0.63));
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.46, 5), skin);
    horn.position.set(x * 2.3, 0.62, -0.05);
    horn.rotation.z = -x * 1.6;
    head.add(horn);
  }
  const mouth = box(0.42, 0.16, 0.06, dark, 0, -0.28, 0.6);
  head.add(mouth);
  for (const x of [-0.13, 0.13]) {
    const fang = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.13, 4), white);
    fang.position.set(x, -0.25, 0.64);
    fang.rotation.x = Math.PI;
    head.add(fang);
  }
  body.add(head);

  const arms = [];
  for (const side of [-1, 1]) {
    // 手臂預設朝上舉，肩膀與手肘各自轉
    const sh = new THREE.Group(),
      el = new THREE.Group(),
      upper = new THREE.Mesh(
        new THREE.CylinderGeometry(0.28, 0.34, 0.9, 6),
        fur,
      ),
      fore = new THREE.Mesh(
        new THREE.CylinderGeometry(0.24, 0.28, 0.8, 6),
        fur,
      );
    sh.position.set(side * 1.05, 2.3, 0);
    upper.position.y = 0.42;
    el.position.y = 0.85;
    fore.position.y = 0.38;
    el.add(fore, blob(0.36, skin, 0, 0.88, 0));
    for (const k of [-1, 0, 1]) {
      const claw = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.24, 4), white);
      claw.position.set(k * 0.17, 1.2, 0.08);
      el.add(claw);
    }
    sh.add(upper, el);
    body.add(sh);
    arms.push({ sh, el, side });
    const leg = new THREE.Mesh(
      new THREE.CylinderGeometry(0.36, 0.42, 0.8, 6),
      fur,
    );
    leg.position.set(side * 0.5, 0.4, 0);
    g.add(leg);
    g.add(blob(0.42, skin, side * 0.5, 0.12, 0.22, 1, 0.4, 1.4)); // 腳掌
  }
  g.add(body);
  g.userData = { body, head, mouth, arms, lunge: 0 };
  return shadowed(g);
}

// 飄在頭頂的紅色警示標，隔著坡頂也看得到位置
const signMat = new THREE.MeshBasicMaterial({ color: "#e0263c", fog: false }),
  beamMat = new THREE.MeshBasicMaterial({
    color: "#e0263c",
    transparent: true,
    opacity: 0.35,
    fog: false,
    depthWrite: false,
  });
function makeSign() {
  const g = new THREE.Group(),
    gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.85), signMat),
    beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.07, 3.2, 5),
      beamMat,
    );
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

/** fx.puff(x, y, z, 顆數, 力道)：揚起雪霧 */
export function createHazards(world, run, kickers, gates, group, fx = {}) {
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
    h.sign.position.set(
      x,
      h.mesh.position.y +
        (h.type === "yeti" ? 9 : 7.5) +
        Math.sin(h.t * 4) * 0.3,
      z,
    );
    h.sign.userData.gem.rotation.y = h.t * 2.5;
  };
  // 面向：dir = 1 朝玩家右側、-1 朝左側、0 朝上坡看著玩家
  const face = (h, dir) => {
    const fx = dir ? -h.p.tz * dir : -h.p.tx,
      fz = dir ? h.p.tx * dir : -h.p.tz;
    h.mesh.rotation.y = Math.atan2(fx, fz);
  };

  const puff = (h, n, power) =>
    fx.puff?.(
      h.mesh.position.x,
      h.mesh.position.y + 0.3,
      h.mesh.position.z,
      n,
      power,
    );
  const slide = (h, to, dt) => {
    const step =
      Math.sign(to - h.d) * Math.min(Math.abs(to - h.d), h.speed * dt);
    h.d += step;
    return step;
  };

  // 回傳 { warn: 最近的預警對象, hit: 這一幀撞到的對象, pass: 這一幀剛閃過的對象與閃法 }
  function update(dt, s, d, y, clock) {
    let warn = null,
      hit = null,
      pass = null;
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
        if (h.type === "yeti") puff(h, 26, 5);
      }
      if (h.state === "gone") continue;
      h.t += dt;
      if (h.state === "warn" && dist < GO_AT) h.state = "go";
      const u = h.mesh.userData,
        windup = h.state === "warn" ? Math.max(0, 1 - (dist - GO_AT) / 22) : 0; // 起跑前的預備
      if (h.type === "ball") {
        if (h.state === "go") {
          const step = slide(h, h.to, dt);
          u.core.rotation.z += (step / 1.5) * (h.p.tx >= 0 ? -1 : 1);
          u.core.rotation.x += Math.abs(step) / 1.5;
          u.core.position.y = 1.5 + Math.abs(Math.sin(h.t * 7)) * 0.12;
          h.rolled = (h.rolled || 0) + Math.abs(step);
          h.mesh.scale.setScalar(1 + Math.min(0.3, h.rolled * 0.012)); // 越滾越大
          h.puffT = (h.puffT || 0) - dt;
          if (step && h.puffT <= 0) {
            h.puffT = 0.07;
            puff(h, 3, 2.2);
          }
        } else {
          // 預警時原地抖動，快出發時往後晃一下再衝
          u.core.position.y = 1.5 + Math.abs(Math.sin(h.t * 5)) * 0.25;
          u.core.rotation.z = Math.sin(h.t * 9) * 0.1 * (1 + windup * 2);
        }
      } else if (h.type === "wolf") {
        const run2 = h.state === "go" && Math.abs(h.to - h.d) > 0.05;
        let pitch = 0,
          lift = 0,
          headX = 0,
          jawX = 0.1;
        if (run2) {
          slide(h, h.to, dt);
          const ph = h.t * 15;
          for (const l of u.legs) {
            const a = ph + (l.front ? 0 : Math.PI * 0.85) + l.side * 0.25;
            l.hip.rotation.x = Math.sin(a) * 0.95;
            l.knee.rotation.x =
              Math.max(0, -Math.cos(a)) * (l.front ? 1.1 : -0.8);
          }
          pitch = Math.sin(ph + 1) * 0.12;
          lift = Math.abs(Math.sin(ph)) * 0.14;
          headX = -pitch;
          jawX = 0.35;
          u.tail.rotation.x = 1.45 + Math.sin(ph) * 0.15;
          h.puffT = (h.puffT || 0) - dt;
          if (h.puffT <= 0) {
            h.puffT = 0.11;
            puff(h, 2, 1.6);
          }
        } else if (h.state === "go") {
          // 撲空之後坐下來仰頭嚎叫
          face(h, 0);
          pitch = -0.32;
          headX = -0.75 - Math.sin(h.t * 3) * 0.08;
          jawX = 0.5 + Math.sin(h.t * 3) * 0.1;
          for (const l of u.legs) {
            l.hip.rotation.x = damp(
              l.hip.rotation.x,
              l.front ? 0.1 : -1.0,
              8,
              dt,
            );
            l.knee.rotation.x = damp(
              l.knee.rotation.x,
              l.front ? 0 : 1.5,
              8,
              dt,
            );
          }
          u.tail.rotation.x = damp(u.tail.rotation.x, 1.9, 6, dt);
        } else {
          // 預警：壓低身體、齜牙、前腳刨雪
          pitch = 0.12 + windup * 0.12;
          lift = -0.08 - windup * 0.1;
          headX = -0.1 + Math.sin(h.t * 2.2) * 0.06;
          jawX = 0.2 + Math.abs(Math.sin(h.t * 6)) * 0.15;
          u.legs.forEach((l, i) => {
            const paw = i === 0 ? Math.max(0, Math.sin(h.t * 8)) * 0.5 : 0;
            l.hip.rotation.x = (l.front ? -0.35 : 0.3) * (1 + windup) - paw;
            l.knee.rotation.x =
              (l.front ? 0.7 : -0.6) * (1 + windup * 0.6) + paw * 1.4;
          });
          u.tail.rotation.x = 1.1;
        }
        u.pitch = damp(u.pitch, pitch, 14, dt);
        u.lift = damp(u.lift, lift, 18, dt);
        u.body.rotation.x = u.pitch;
        u.body.position.y = u.lift;
        u.head.rotation.x = damp(u.head.rotation.x, headX, 10, dt);
        u.jaw.rotation.x = jawX;
        u.tail.rotation.y = Math.sin(h.t * 7) * 0.4;
        u.tip.rotation.x = Math.sin(h.t * 7 + 1) * 0.25;
      } else {
        // 從雪裡冒出來，衝過頭再彈回來
        const g = Math.min(1, h.t / 0.7),
          e = g - 1;
        h.mesh.scale.setScalar(
          Math.max(0.001, 1 + 2.7 * e * e * e + 1.7 * e * e),
        );
        let moving = 0;
        if (h.state === "go" && dist > 0) {
          const lim = h.w - 2.5;
          moving = slide(h, Math.max(-lim, Math.min(lim, d)), dt);
        }
        // 玩家逼近時整隻往前撲、雙手往下抓
        u.lunge = damp(u.lunge, dist > 0 && dist < 34 ? 1 : 0, 6, dt);
        const walk = Math.sin(h.t * 7),
          roar = 0.5 + Math.sin(h.t * 6) * 0.5;
        for (const a of u.arms) {
          a.sh.rotation.z =
            -a.side *
            (0.55 + Math.sin(h.t * 6 + a.side) * 0.3) *
            (1 - u.lunge * 0.6);
          a.sh.rotation.x =
            u.lunge * (1.15 + Math.sin(h.t * 11 + a.side) * 0.2);
          a.el.rotation.x = u.lunge * 0.7 + roar * 0.15;
          a.el.rotation.z = a.side * (0.5 - u.lunge * 0.3);
        }
        u.body.rotation.z = moving ? walk * 0.12 : Math.sin(h.t * 3) * 0.06;
        u.body.rotation.x = u.lunge * 0.3;
        u.body.position.y = Math.abs(Math.sin(h.t * (moving ? 7 : 6))) * 0.14;
        u.head.rotation.x = -0.15 + u.lunge * 0.1 + roar * 0.08;
        u.head.rotation.z = Math.sin(h.t * 2.3) * 0.1;
        u.mouth.scale.y = 0.6 + roar * 1.2 + u.lunge;
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
      if (!h.passed && dist < -1.7) {
        h.passed = true;
        if (!h.hit) {
          const gap = Math.abs(d - h.d);
          pass = {
            h,
            kind:
              h.jump && y > 0.9 && gap < h.r
                ? "leap"
                : gap < h.r + 2.6
                  ? "near"
                  : "clear",
          };
        }
      }
      if (dist < -70) {
        h.state = "gone";
        h.mesh.visible = false;
        if (h.mark) h.mark.visible = false;
      }
    }
    return { warn, hit, pass };
  }

  return { list, update };
}
