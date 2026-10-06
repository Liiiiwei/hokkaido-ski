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

// 可選雪板。drag 風阻、turn 轉向靈敏度、jump 跳躍力、trick 特技分倍率、powder 壓雪區外的阻力
export const BOARDS = [
  {
    id: "allround",
    name: "全能雙板",
    kind: "ski",
    color: "#e8433a",
    desc: "速度、轉向、跳躍都平均，第一次滑選這個",
    drag: 1,
    turn: 1,
    jump: 1,
    trick: 1,
    powder: 1,
  },
  {
    id: "race",
    name: "競速雙板",
    kind: "ski",
    color: "#1f6feb",
    desc: "極速最高，但轉向較鈍、跳得較低",
    drag: 0.78,
    turn: 0.8,
    jump: 0.85,
    trick: 0.8,
    powder: 1.2,
  },
  {
    id: "freestyle",
    name: "花式單板",
    kind: "board",
    color: "#b45cf0",
    desc: "跳得最高、特技分 1.5 倍，極速較低",
    drag: 1.2,
    turn: 1.25,
    jump: 1.3,
    trick: 1.5,
    powder: 1,
  },
  {
    id: "powder",
    name: "粉雪單板",
    kind: "board",
    color: "#35b8a6",
    desc: "衝出雪道幾乎不減速，轉向靈活",
    drag: 1.05,
    turn: 1.15,
    jump: 1.1,
    trick: 1.2,
    powder: 0.25,
  },
];

const COLORS = {
  skin: "#ffd9bf",
  jacket: "#ff5a1f",
  trim: "#c93f0f",
  pants: "#22406b",
  hat: "#ffd23c",
  scarf: "#35b8a6",
  pack: "#35b8a6",
  white: "#ffffff",
  dark: "#1b2733",
  blush: "#ff9d9d",
};

// 各情境的手臂姿勢：[肩膀前後擺、外張、雪杖角度、手肘彎曲]
const ARM = {
  ski: {
    idle: [-0.15, 0.3, 0.75, 0.4],
    ready: [-0.7, 0.35, 1.5, 0.9],
    ski: [-0.45, 0.45, 1.75, 0.7],
    tuck: [-0.9, 0.08, 2.55, 1.2],
    brake: [-0.3, 1.0, 1.25, 0.6],
    air: [-0.5, 1.0, 1.9, 0.8],
    trick: [-0.7, 0.25, 2.5, 1.1],
    hurt: [-1.6, 1.3, 1.0, 0.3],
    cheer: [-2.75, 0.5, 0.2, 0.2],
    sad: [0.05, 0.15, 0.3, 0.15],
  },
  board: {
    idle: [0, 0.35, 0, 0.3],
    ready: [-0.2, 0.6, 0, 0.6],
    ski: [0.05, 0.95, 0, 0.35],
    tuck: [-0.4, 0.3, 0, 0.9],
    brake: [0, 1.25, 0, 0.3],
    air: [0, 1.35, 0, 0.4],
    trick: [-0.7, 0.35, 0, 1.0],
    hurt: [-1.2, 1.4, 0, 0.3],
    cheer: [-2.75, 0.5, 0, 0.2],
    sad: [0.05, 0.15, 0, 0.15],
  },
};

const UP = new THREE.Vector3(0, 1, 0),
  FWD = new THREE.Vector3(0, 0, 1),
  vH = new THREE.Vector3(),
  vA = new THREE.Vector3(),
  vK = new THREE.Vector3(),
  vD = new THREE.Vector3(),
  vB = new THREE.Vector3();

// 把一節肢體擺在兩個關節之間
function bone(m, a, b) {
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(UP, vD.copy(b).sub(a).normalize());
}

/** blob：腳下的假影子，沒有開即時陰影的裝置才需要 */
export function createSkier(board = BOARDS[0], { blob = true } = {}) {
  const isBoard = board.kind === "board";
  const colors = { ...COLORS, ski: board.color };
  const mats = {};
  const mat = (name) =>
    (mats[name] ??= new THREE.MeshStandardMaterial({
      color: colors[name],
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
  shadow.visible = blob;
  root.add(shadow);

  // 騰空與特技的旋轉軸心在身體中段
  const PIVOT = 0.75;
  const air = group(root, 0, PIVOT, 0);
  const lean = group(group(air, 0, -PIVOT, 0));
  // 單板是側身站
  const stance = group(lean);
  if (isBoard) stance.rotation.y = -1.15;

  // 雪板、固定器與雪靴
  const bootGeo = new THREE.CapsuleGeometry(0.12, 0.16, 4, 10);
  const cuffGeo = new THREE.CylinderGeometry(0.128, 0.135, 0.1, 12);
  const feet = (isBoard ? [0.27, -0.27] : [0.22, -0.22]).map((x) => {
    const g = group(stance, x, 0.03, 0);
    if (!isBoard) {
      mesh(new THREE.BoxGeometry(0.17, 0.04, 1.7), "ski", g, 0, 0, 0.12);
      const tip = mesh(
        new THREE.BoxGeometry(0.17, 0.04, 0.32),
        "ski",
        g,
        0,
        0.07,
        1.1,
      );
      tip.rotation.x = -0.5;
      mesh(new THREE.BoxGeometry(0.172, 0.042, 0.1), "white", g, 0, 0, 0.72);
      mesh(new THREE.BoxGeometry(0.2, 0.07, 0.12), "dark", g, 0, 0.05, 0.24);
      mesh(new THREE.BoxGeometry(0.2, 0.09, 0.1), "dark", g, 0, 0.06, -0.17);
    }
    const boot = mesh(bootGeo, "dark", g, 0, 0.13, 0.04);
    boot.rotation.x = Math.PI / 2;
    mesh(cuffGeo, "white", g, 0, 0.26, -0.02);
    g.userData.x = x;
    return g;
  });
  if (isBoard) {
    const deck = mesh(
      new THREE.BoxGeometry(0.38, 0.05, 1.4),
      "ski",
      lean,
      0,
      0.03,
      0,
    );
    for (const s of [1, -1]) {
      const tip = mesh(
        new THREE.CylinderGeometry(0.18, 0.18, 0.045, 16, 1, false, 0, Math.PI),
        "ski",
        deck,
        0,
        0.03,
        s * 0.735,
      );
      tip.rotation.set(s * -0.28, s > 0 ? -Math.PI / 2 : Math.PI / 2, 0);
      // 固定器
      const bind = mesh(
        new THREE.BoxGeometry(0.4, 0.05, 0.2),
        "dark",
        deck,
        0,
        0.045,
        s * 0.25,
      );
      bind.rotation.y = 0.42;
    }
    mesh(new THREE.BoxGeometry(0.37, 0.047, 0.16), "white", deck, 0, 0, 0);
  }

  // 腿：大腿、膝蓋、小腿三件，每幀依髖部與腳的位置解出膝蓋
  const HIP = 0.6,
    L1 = 0.21,
    L2 = 0.21,
    ANKLE = 0.25;
  const hips = group(stance, 0, HIP, 0);
  const thighGeo = new THREE.CapsuleGeometry(0.128, L1 - 0.05, 4, 10),
    shinGeo = new THREE.CapsuleGeometry(0.114, L2 - 0.05, 4, 10),
    kneeGeo = new THREE.SphereGeometry(0.122, 12, 10);
  const legs = feet.map((foot) => ({
    foot,
    thigh: mesh(thighGeo, "pants", stance),
    shin: mesh(shinGeo, "pants", stance),
    knee: mesh(kneeGeo, "pants", stance),
  }));

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
  // 外套下襬、拉鍊與口袋
  const hem = mesh(
    new THREE.TorusGeometry(0.3, 0.07, 10, 22),
    "trim",
    torso,
    0,
    0.06,
    0,
  );
  hem.rotation.x = Math.PI / 2;
  hem.scale.set(1, 0.9, 1);
  mesh(
    new THREE.BoxGeometry(0.035, 0.52, 0.03),
    "white",
    torso,
    0,
    0.42,
    0.352,
  );
  for (const x of [-0.2, 0.2]) {
    const pocket = mesh(
      new THREE.BoxGeometry(0.13, 0.03, 0.03),
      "trim",
      torso,
      x,
      0.26,
      0.315,
    );
    pocket.rotation.y = x * 2.2;
  }
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
  for (const x of [-0.19, 0.19]) {
    // 背包肩帶
    const strap = mesh(
      new THREE.TorusGeometry(0.2, 0.028, 6, 14, Math.PI),
      "pack",
      torso,
      x,
      0.5,
      0,
    );
    strap.rotation.y = Math.PI / 2;
    strap.scale.set(1.75, 1.15, 1);
  }

  // 手臂：上臂、前臂、連指手套、雪杖（單板不拿雪杖）
  const upperGeo = new THREE.CapsuleGeometry(0.1, 0.13, 4, 10);
  upperGeo.translate(0, -0.11, 0);
  const foreGeo = new THREE.CapsuleGeometry(0.092, 0.11, 4, 10);
  foreGeo.translate(0, -0.1, 0);
  const poleGeo = new THREE.CylinderGeometry(0.018, 0.018, 1.1, 6);
  poleGeo.translate(0, -0.5, 0);
  const poses = ARM[board.kind];
  const arms = [1, -1].map((side) => {
    const a = group(torso, side * 0.36, 0.6, 0.02);
    mesh(upperGeo, "jacket", a);
    const fore = group(a, 0, -0.23, 0);
    mesh(foreGeo, "jacket", fore);
    const cuff = mesh(
      new THREE.CylinderGeometry(0.1, 0.1, 0.05, 10),
      "trim",
      fore,
      0,
      -0.17,
      0,
    );
    cuff.scale.z = 0.95;
    mesh(new THREE.SphereGeometry(0.125, 12, 10), "white", fore, 0, -0.25, 0);
    mesh(
      new THREE.SphereGeometry(0.055, 8, 6),
      "white",
      fore,
      -side * 0.09,
      -0.22,
      0.05,
    );
    const pole = group(fore, 0, -0.25, 0);
    mesh(poleGeo, "dark", pole);
    mesh(
      new THREE.CylinderGeometry(0.03, 0.03, 0.2, 8),
      "hat",
      pole,
      0,
      0.02,
      0,
    );
    mesh(
      new THREE.CylinderGeometry(0.07, 0.07, 0.015, 10),
      "hat",
      pole,
      0,
      -0.95,
      0,
    );
    pole.visible = !isBoard;
    a.userData = { side, fore, pole, pose: [...poses.idle] };
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
  if (isBoard) tp.rotation.y = 1.15; // 圍巾仍往行進方向的後方飄
  const tailBase = tp.rotation.y;
  for (let i = 0; i < 5; i++) {
    const seg = mesh(tailGeo, "scarf", tp);
    seg.scale.x = 1 - i * 0.08;
    tails.push(tp);
    tp = group(tp, 0, 0, -0.25);
  }

  // 頭：大頭、毛帽、毛球、護目鏡、表情
  const head = group(torso, 0, 0.84, 0.05);
  const headYaw = isBoard ? 0.95 : 0; // 側身時頭轉向前方
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
  // 帽子上的色帶
  const band = mesh(
    new THREE.TorusGeometry(0.325, 0.03, 8, 24),
    "scarf",
    hat,
    0,
    0.21,
    0,
  );
  band.rotation.x = Math.PI / 2;
  const pom = group(hat, 0, 0.38, 0);
  mesh(new THREE.SphereGeometry(0.14, 12, 10), "white", pom, 0, 0.08, 0);
  // 護目鏡與鬆緊帶
  const strap = mesh(
    new THREE.TorusGeometry(0.395, 0.03, 6, 24),
    "dark",
    hat,
    0,
    0.12,
    0,
  );
  strap.rotation.x = Math.PI / 2;
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
  const eyes = [-0.14, 0.14].map((x) => {
    const e = mesh(eyeGeo, "dark", head, x, 0.27, 0.335);
    mesh(new THREE.SphereGeometry(0.017, 6, 5), "white", e, 0.014, 0.02, 0.04);
    return e;
  });
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
  // 騰空、被撞時張開的嘴
  const gasp = mesh(
    new THREE.SphereGeometry(0.05, 10, 8),
    "dark",
    head,
    0,
    0.14,
    0.345,
  );
  gasp.scale.set(1, 1.15, 0.4);
  gasp.visible = false;

  root.traverse((o) => {
    if (o.isMesh && o !== shadow) o.castShadow = true;
  });

  const SCALE = 1.35;
  root.scale.setScalar(SCALE);

  // 動畫狀態
  const sRoll = new Spring(70, 11);
  const sCrouch = new Spring(110, 13, 0.1);
  const sPom = new Spring(140, 9);
  const sYaw = new Spring(60, 10);
  let t = Math.random() * 10,
    lastSteer = 0,
    wasAir = false,
    look = 0,
    lean4 = 0.25,
    wedge = 0,
    hop = 0,
    hurt = 0,
    slump = 0,
    plant = 1;

  /** 被撞到：踉蹌一下 */
  function hit() {
    hurt = 0.75;
    sCrouch.v += 4;
    sRoll.v += (Math.random() < 0.5 ? -1 : 1) * 5;
  }

  /** state: { phase: idle|ski|cheer|sad, ready, steer, ang, v, brake, tuck, push, y, air, trick, impact } */
  function update(dt, s) {
    t += dt;
    const ski = s.phase === "ski",
      cheer = s.phase === "cheer",
      sad = s.phase === "sad",
      inAir = ski && s.air;
    const sp = Math.min(1, s.v / 24);
    hurt = Math.max(0, hurt - dt);
    const hk = hurt / 0.75, // 踉蹌強度，1 → 0
      wob = Math.sin((1 - hk) * 20) * hk;

    // 換邊轉彎時身體先彈起再壓下去；起跳伸展、落地依衝擊力道壓縮
    if (ski && !inAir && s.steer !== lastSteer)
      sCrouch.v -= s.steer ? 2.4 : 1.2;
    lastSteer = s.steer;
    if (inAir && !wasAir) sCrouch.v -= 4;
    if (!inAir && wasAir) sCrouch.v += 3 + Math.min(6, (s.impact || 0) * 0.6);
    wasAir = inAir;

    const roll = sRoll.step(
      ski ? s.ang * 0.82 * Math.min(1, 0.25 + s.v / 8) * (inAir ? 0.4 : 1) : 0,
      dt,
    );
    lean.rotation.z = roll + wob * 0.3;
    torso.rotation.z = -roll * 0.42 - wob * 0.2;
    head.rotation.z = -roll * 0.42;
    // 上半身先轉向彎道，下半身再跟上
    const yaw = sYaw.step(ski && !inAir ? -s.steer * 0.26 : 0, dt);
    torso.rotation.y = yaw + (cheer ? Math.sin(t * 6.5) * 0.18 : 0);

    slump = damp(slump, sad ? 1 : 0, 4, dt);
    let crouchT = 0.1 + Math.sin(t * 3.2) * 0.05;
    if (s.ready) crouchT = 0.36 + Math.sin(t * 5) * 0.03;
    if (ski)
      crouchT =
        0.2 +
        Math.abs(s.ang) * 0.34 +
        (s.tuck ? 0.5 : 0) +
        (s.brake ? 0.22 : 0);
    if (inAir) crouchT = s.trick ? 0.78 : 0.45;
    if (cheer) crouchT = 0.12 - Math.abs(Math.sin(t * 6.5)) * 0.1;
    if (sad) crouchT = 0.42;
    const crouch = THREE.MathUtils.clamp(
      sCrouch.step(crouchT, dt),
      -0.15,
      0.95,
    );
    // 高速時腿吸收雪面的細碎起伏
    const chatter =
      Math.sin(t * (9 + s.v * 0.6)) * 0.012 * sp * (inAir || !ski ? 0 : 1);
    hips.position.set(
      -roll * 0.13, // 髖部往彎道內側送
      HIP - crouch * 0.28 + chatter,
      -crouch * 0.1 - slump * 0.06,
    );

    // 高度：遊戲給的騰空高度＋歡呼時的小跳
    hop = damp(hop, cheer ? Math.max(0, Math.sin(t * 6.5)) * 0.4 : 0, 14, dt);
    const lift = hop + (ski ? s.y || 0 : 0) / SCALE;
    air.position.y = PIVOT + lift;
    const sh = 1 / (1 + lift * 0.45);
    shadow.scale.set(sh, sh * 1.5, sh);
    shadow.material.opacity = 0.28 * sh;

    // 特技旋轉
    const tr = inAir ? s.trick : null;
    const e = tr ? tr.p * tr.p * (3 - 2 * tr.p) * Math.PI * 2 : 0;
    air.rotation.set(
      tr && tr.type !== "spin" ? e * (tr.type === "front" ? 1 : -1) : 0,
      tr && tr.type === "spin" ? e * tr.dir : 0,
      0,
    );

    lean4 = damp(
      lean4,
      cheer
        ? -0.08
        : sad
          ? 0.5
          : inAir
            ? 0.35
            : 0.22 + crouch * 0.85 - hk * 0.7,
      hk > 0 ? 16 : 9,
      dt,
    );
    torso.rotation.x = lean4 * (isBoard ? 0.55 : 1);
    look = damp(
      look,
      ski ? -s.steer * 0.32 : cheer || sad ? 0 : Math.sin(t * 1.3) * 0.4,
      5,
      dt,
    );
    head.rotation.set(
      -torso.rotation.x * 0.8 + (cheer ? -0.15 : 0) + slump * 0.75,
      look - yaw * 0.5 + (cheer ? headYaw * 0.4 : headYaw),
      head.rotation.z,
    );

    // 煞車：雙板內八；單板整個人橫過來
    wedge = damp(wedge, ski && s.brake && !inAir ? 1 : 0, 9, dt);
    plant = damp(plant, inAir ? 0 : 1, 12, dt);
    if (isBoard) {
      lean.rotation.y = wedge * 1.05 - roll * 0.25;
    } else {
      feet.forEach((g, i) => {
        const side = i ? -1 : 1;
        g.rotation.y = -side * wedge * 0.34 + (ski ? -roll * 0.1 : 0);
        g.rotation.x = inAir ? -0.25 : 0; // 騰空時板頭微翹
        g.position.x = g.userData.x * (1 + wedge * 0.45);
        g.position.z = ski ? side * roll * 0.16 : 0; // 彎道內側的腳在前
        // 身體傾斜時兩腳仍踩在雪面：內側腿縮、外側腿伸，雪板只立起一半的角度
        const tilt = lean.rotation.z;
        g.position.y =
          0.03 +
          ((0.03 - g.position.x * Math.sin(tilt)) / Math.cos(tilt) - 0.03) *
            plant;
        g.rotation.z = -tilt * 0.55 * plant;
      });
    }

    // 腿：由髖關節與腳踝解出膝蓋，膝蓋朝前
    for (const l of legs) {
      const f = l.foot;
      vH.set(
        f.userData.x * 0.8 + hips.position.x,
        hips.position.y - 0.02,
        hips.position.z,
      );
      vA.set(f.position.x, f.position.y - 0.03 + ANKLE, f.position.z + 0.01);
      vD.copy(vA).sub(vH);
      const d = Math.min(vD.length(), L1 + L2 - 0.004);
      vD.normalize();
      vB.copy(FWD).addScaledVector(vD, -FWD.dot(vD));
      if (vB.lengthSq() < 1e-6) vB.copy(FWD);
      vB.normalize();
      vK.copy(vH)
        .addScaledVector(vD, d / 2)
        .addScaledVector(vB, Math.sqrt(Math.max(0, L1 * L1 - (d * d) / 4)));
      l.knee.position.copy(vK);
      bone(l.thigh, vH, vK);
      bone(l.shin, vK, vA);
    }

    // 手臂
    let pose = poses.idle;
    if (cheer) pose = poses.cheer;
    else if (sad) pose = poses.sad;
    else if (hk > 0.3) pose = poses.hurt;
    else if (inAir) pose = s.trick ? poses.trick : poses.air;
    else if (ski)
      pose = s.brake ? poses.brake : s.tuck ? poses.tuck : poses.ski;
    else if (s.ready) pose = poses.ready;
    arms.forEach((a) => {
      const u = a.userData,
        inside = Math.max(0, u.side * -roll); // 轉彎內側的手往下
      let ax = pose[0],
        az = pose[1],
        px = pose[2],
        el = pose[3];
      if (ski && !inAir && s.push > 0 && !isBoard && hk <= 0.3) {
        const swing = Math.sin(t * 9); // 起步撐杖
        ax = -0.9 + swing * 0.8;
        el = 0.6 - swing * 0.25;
        px = 1.3;
      } else if (ski && !inAir && !s.tuck && hk <= 0.3) {
        ax += inside * 0.5;
        az += inside * (isBoard ? -0.4 : 0.5);
        px -= inside * 0.6;
        el -= inside * 0.3;
      }
      if (inAir && !s.trick) az += Math.sin(t * 14 + u.side) * 0.12; // 空中揮手保持平衡
      if (hk > 0.3) ax += Math.sin(t * 26 + u.side * 2) * 0.5; // 踉蹌時亂揮
      if (cheer) {
        az += Math.sin(t * 11 + u.side) * 0.28;
        el += Math.abs(Math.sin(t * 6.5)) * 0.5;
      }
      if (!ski && !cheer) ax += Math.sin(t * 3.2 + u.side) * 0.06;
      const rate = cheer ? 8 : hk > 0.3 ? 20 : 11;
      u.pose[0] = damp(u.pose[0], ax, rate, dt);
      u.pose[1] = damp(u.pose[1], az, rate, dt);
      u.pose[2] = damp(u.pose[2], px, rate, dt);
      u.pose[3] = damp(u.pose[3], el, rate, dt);
      a.rotation.set(u.pose[0], 0, u.side * u.pose[1]);
      u.fore.rotation.x = -u.pose[3];
      u.pole.rotation.x = u.pose[2];
    });

    // 圍巾與毛球的拖曳感
    tails.forEach((g, i) => {
      g.rotation.y =
        (i ? 0 : tailBase) +
        Math.sin(t * (5 + sp * 13) - i * 0.9) * (0.12 + sp * 0.3) +
        roll * 0.35;
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

    // 表情：眨眼；歡呼與特技時瞇眼笑；騰空、被撞時張嘴
    const blink = t % 3.4 < 0.12,
      ouch = hk > 0.15;
    eyes.forEach(
      (e2) =>
        (e2.scale.y =
          cheer || tr ? 0.35 : ouch ? 0.2 : sad ? 0.55 : blink ? 0.12 : 1),
    );
    gasp.visible = ouch || !!(inAir && !tr);
    smile.visible = !gasp.visible && !sad;
  }

  return { group: root, update, hit };
}
