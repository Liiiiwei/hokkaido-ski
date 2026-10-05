// 滑雪小人：模型＋程序動畫（彈簧與阻尼，確保動作連貫）
import * as THREE from "three";

const damp = (a, b, rate, dt) => a + (b - a) * (1 - Math.exp(-rate * dt));

class Spring {
  constructor(k, c, x = 0) {
    this.x = x;
    this.v = 0;
    this.k = k;
    this.c = c;
  }
  step(target, dt) {
    this.v += ((target - this.x) * this.k - this.v * this.c) * dt;
    this.x += this.v * dt;
    return this.x;
  }
}

const COLORS = {
  skin: "#ffd9bf",
  jacket: "#ff5a1f",
  pants: "#22406b",
  hat: "#ffd23c",
  scarf: "#35b8a6",
  pack: "#35b8a6",
  white: "#ffffff",
  dark: "#1b2733",
  ski: "#e8433a",
  blush: "#ff9d9d",
};

// 各情境的手臂姿勢：[前後擺、外張、雪杖角度]
const ARM = {
  idle: [-0.35, 0.3, 0.35],
  ski: [-0.75, 0.45, 1.35],
  tuck: [-1.5, 0.08, 1.95],
  brake: [-0.55, 1.0, 0.9],
  cheer: [-2.85, 0.5, 0.0],
};

export function createSkier() {
  const mats = {};
  const mat = (name) =>
    (mats[name] ??= new THREE.MeshStandardMaterial({
      color: COLORS[name],
      roughness: 0.75,
    }));
  const mesh = (geo, color, parent, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(geo, mat(color));
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  };
  const group = (parent, x = 0, y = 0, z = 0) => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    parent.add(g);
    return g;
  };

  const root = new THREE.Group();

  // 腳下的影子，讓人物貼在雪面上
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.75, 20),
    new THREE.MeshBasicMaterial({
      color: "#16304d",
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
    }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.06;
  shadow.scale.set(1, 1.5, 1);
  root.add(shadow);

  const lean = group(root);

  // 雪板與雪靴
  const skiGeo = new THREE.BoxGeometry(0.17, 0.04, 1.7);
  const tipGeo = new THREE.BoxGeometry(0.17, 0.04, 0.32);
  const bootGeo = new THREE.CapsuleGeometry(0.12, 0.16, 4, 10);
  const skis = [0.22, -0.22].map((x) => {
    const g = group(lean, x, 0.03, 0);
    mesh(skiGeo, "ski", g, 0, 0, 0.12);
    const tip = mesh(tipGeo, "ski", g, 0, 0.07, 1.1);
    tip.rotation.x = -0.5;
    const boot = mesh(bootGeo, "dark", g, 0, 0.13, 0.04);
    boot.rotation.x = Math.PI / 2;
    g.userData.x = x;
    return g;
  });

  // 髖部以上
  const HIP = 0.6;
  const hips = group(lean, 0, HIP, 0);
  const legGeo = new THREE.CapsuleGeometry(0.135, 0.22, 4, 10);
  legGeo.translate(0, -0.24, 0);
  const legs = [0.2, -0.2].map((x) => mesh(legGeo, "pants", hips, x, 0.04, 0));

  const torso = group(hips, 0, 0.02, 0);
  const body = mesh(
    new THREE.SphereGeometry(0.4, 20, 16),
    "jacket",
    torso,
    0,
    0.36,
    0,
  );
  body.scale.set(1, 1.08, 0.9);
  const pack = mesh(
    new THREE.CapsuleGeometry(0.15, 0.16, 4, 10),
    "pack",
    torso,
    0,
    0.4,
    -0.36,
  );
  pack.scale.set(1.25, 1, 0.8);
  mesh(new THREE.SphereGeometry(0.06, 10, 8), "white", torso, 0, 0.42, -0.5);

  // 手臂、手套、雪杖
  const armGeo = new THREE.CapsuleGeometry(0.1, 0.22, 4, 10);
  armGeo.translate(0, -0.2, 0);
  const poleGeo = new THREE.CylinderGeometry(0.018, 0.018, 1.1, 6);
  poleGeo.translate(0, -0.5, 0);
  const arms = [1, -1].map((side) => {
    const a = group(torso, side * 0.36, 0.6, 0.02);
    mesh(armGeo, "jacket", a);
    mesh(new THREE.SphereGeometry(0.125, 12, 10), "white", a, 0, -0.44, 0);
    const pole = group(a, 0, -0.44, 0);
    mesh(poleGeo, "dark", pole);
    const basket = mesh(
      new THREE.CylinderGeometry(0.07, 0.07, 0.015, 10),
      "hat",
      pole,
      0,
      -0.95,
      0,
    );
    basket.userData.keep = true;
    a.userData = { side, pole, pose: [...ARM.idle] };
    return a;
  });

  // 圍巾
  const neck = mesh(
    new THREE.TorusGeometry(0.2, 0.085, 10, 20),
    "scarf",
    torso,
    0,
    0.78,
    0.02,
  );
  neck.rotation.x = Math.PI / 2;
  const tailGeo = new THREE.BoxGeometry(0.15, 0.045, 0.27);
  tailGeo.translate(0, 0, -0.13);
  const tails = [];
  let tp = group(torso, 0.1, 0.78, -0.22);
  for (let i = 0; i < 4; i++) {
    mesh(tailGeo, "scarf", tp);
    tails.push(tp);
    tp = group(tp, 0, 0, -0.25);
  }

  // 頭：大頭、毛帽、毛球、護目鏡、表情
  const head = group(torso, 0, 0.84, 0.05);
  mesh(new THREE.SphereGeometry(0.37, 24, 18), "skin", head, 0, 0.3, 0);
  const hat = group(head, 0, 0.33, 0);
  hat.rotation.x = -0.28;
  mesh(
    new THREE.SphereGeometry(0.39, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.5),
    "hat",
    hat,
  );
  const brim = mesh(
    new THREE.TorusGeometry(0.375, 0.065, 10, 24),
    "white",
    hat,
  );
  brim.rotation.x = Math.PI / 2;
  const pom = group(hat, 0, 0.38, 0);
  mesh(new THREE.SphereGeometry(0.14, 12, 10), "white", pom, 0, 0.08, 0);
  const goggles = mesh(
    new THREE.CapsuleGeometry(0.085, 0.26, 4, 10),
    "dark",
    hat,
    0,
    0.12,
    0.36,
  );
  goggles.rotation.z = Math.PI / 2;
  const lensMat = new THREE.MeshStandardMaterial({
    color: "#7fd6ff",
    roughness: 0.2,
    metalness: 0.4,
  });
  for (const x of [-0.12, 0.12]) {
    const lens = new THREE.Mesh(
      new THREE.SphereGeometry(0.075, 10, 8),
      lensMat,
    );
    lens.position.set(x, 0.12, 0.42);
    lens.scale.set(1.2, 0.9, 0.5);
    hat.add(lens);
  }
  const eyeGeo = new THREE.SphereGeometry(0.05, 10, 8);
  const eyes = [-0.14, 0.14].map((x) =>
    mesh(eyeGeo, "dark", head, x, 0.27, 0.335),
  );
  for (const x of [-0.24, 0.24]) {
    const b = mesh(
      new THREE.SphereGeometry(0.06, 10, 8),
      "blush",
      head,
      x,
      0.17,
      0.27,
    );
    b.scale.set(1, 0.7, 0.4);
  }
  const smile = mesh(
    new THREE.TorusGeometry(0.055, 0.014, 6, 12, Math.PI),
    "dark",
    head,
    0,
    0.17,
    0.345,
  );
  smile.rotation.z = Math.PI;

  root.scale.setScalar(1.35);

  // 動畫狀態
  const sRoll = new Spring(70, 11);
  const sCrouch = new Spring(110, 13, 0.1);
  const sPom = new Spring(140, 9);
  let t = Math.random() * 10,
    lastSteer = 0,
    look = 0,
    lean4 = 0.25,
    wedge = 0,
    hop = 0;

  /** state: { phase: idle|ski|cheer, steer, ang, v, brake, tuck, push } */
  function update(dt, s) {
    t += dt;
    const ski = s.phase === "ski",
      cheer = s.phase === "cheer";
    const sp = Math.min(1, s.v / 24);

    // 換邊轉彎時身體先彈起再壓下去
    if (ski && s.steer !== lastSteer) sCrouch.v -= s.steer ? 2.2 : 1.2;
    lastSteer = s.steer;

    const roll = sRoll.step(ski ? s.ang * 0.78 * Math.min(1, 0.25 + s.v / 8) : 0, dt);
    lean.rotation.z = roll;
    torso.rotation.z = -roll * 0.38;
    head.rotation.z = -roll * 0.42;

    let crouchT = 0.1 + Math.sin(t * 3.2) * 0.05;
    if (ski)
      crouchT =
        0.2 +
        Math.abs(s.ang) * 0.32 +
        (s.tuck ? 0.5 : 0) +
        (s.brake ? 0.22 : 0);
    if (cheer) crouchT = 0.12 - Math.abs(Math.sin(t * 6.5)) * 0.1;
    const crouch = THREE.MathUtils.clamp(
      sCrouch.step(crouchT, dt),
      -0.15,
      0.95,
    );
    hips.position.y =
      HIP - crouch * 0.3 + Math.sin(t * (9 + s.v * 0.6)) * 0.012 * sp;
    const legScale = hips.position.y / HIP;
    legs.forEach((l) =>
      l.scale.set(1 + (1 - legScale) * 0.5, legScale, 1 + (1 - legScale) * 0.5),
    );

    hop = damp(hop, cheer ? Math.max(0, Math.sin(t * 6.5)) * 0.4 : 0, 14, dt);
    lean.position.y = hop;
    shadow.scale.setScalar(1 - hop * 0.6);
    shadow.scale.y *= 1.5;

    lean4 = damp(lean4, cheer ? -0.08 : 0.22 + crouch * 0.85, 9, dt);
    torso.rotation.x = lean4;
    look = damp(
      look,
      ski ? -s.steer * 0.32 : cheer ? 0 : Math.sin(t * 1.3) * 0.4,
      5,
      dt,
    );
    head.rotation.set(
      -lean4 * 0.8 + (cheer ? -0.15 : 0),
      look,
      head.rotation.z,
    );

    // 雪板：煞車時內八，轉彎時內側板往前
    wedge = damp(wedge, ski && s.brake ? 1 : 0, 9, dt);
    skis.forEach((g, i) => {
      const side = i ? -1 : 1;
      g.rotation.y = -side * wedge * 0.34 + (ski ? -roll * 0.1 : 0);
      g.position.x = g.userData.x * (1 + wedge * 0.45);
      g.position.z = ski ? side * roll * 0.14 : 0;
      legs[i].position.x = g.position.x * 0.92;
    });

    // 手臂
    let pose = ARM.idle;
    if (cheer) pose = ARM.cheer;
    else if (ski) pose = s.brake ? ARM.brake : s.tuck ? ARM.tuck : ARM.ski;
    arms.forEach((a) => {
      const u = a.userData,
        inside = Math.max(0, u.side * -roll); // 轉彎內側的手往下點杖
      let ax = pose[0],
        az = pose[1],
        px = pose[2];
      if (ski && s.push > 0) {
        ax = -1.25 + Math.sin(t * 9) * 0.85; // 起步撐杖
        px = 0.9;
      } else if (ski && !s.tuck) {
        ax += inside * 0.5;
        az += inside * 0.5;
        px -= inside * 0.6;
      }
      if (cheer) az += Math.sin(t * 11 + u.side) * 0.28;
      if (!ski && !cheer) ax += Math.sin(t * 3.2 + u.side) * 0.06;
      const rate = cheer ? 8 : 11;
      u.pose[0] = damp(u.pose[0], ax, rate, dt);
      u.pose[1] = damp(u.pose[1], az, rate, dt);
      u.pose[2] = damp(u.pose[2], px, rate, dt);
      a.rotation.set(u.pose[0], 0, u.side * u.pose[1]);
      u.pole.rotation.x = u.pose[2];
    });

    // 圍巾與毛球的拖曳感
    tails.forEach((g, i) => {
      g.rotation.y =
        Math.sin(t * (5 + sp * 13) - i * 0.9) * (0.12 + sp * 0.3) + roll * 0.35;
      g.rotation.x =
        (i ? 0 : -0.95 * (1 - sp) + lean4 * 0.5) +
        Math.sin(t * (7 + sp * 8) - i * 1.1) * (0.05 + sp * 0.14);
    });
    const pz = sPom.step(-sRoll.v * 0.12, dt);
    pom.rotation.set(
      Math.sin(t * 12) * 0.08 * sp - sCrouch.v * 0.08,
      0,
      THREE.MathUtils.clamp(pz, -0.7, 0.7),
    );

    // 眨眼；歡呼時瞇眼笑
    const blink = t % 3.4 < 0.12;
    eyes.forEach((e) => (e.scale.y = cheer ? 0.35 : blink ? 0.12 : 1));
  }

  return { group: root, update };
}
