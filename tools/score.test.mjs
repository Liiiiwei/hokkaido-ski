// 計分規則檢查：node tools/score.test.mjs
import assert from "node:assert/strict";
import { comboMult, parTime, finalScore, rating, grade } from "../js/score.js";

assert.equal(comboMult(0), 1);
assert.equal(comboMult(4), 2);
assert.equal(comboMult(12), 4);
assert.equal(comboMult(99), 4); // 封頂
assert.equal(comboMult(-3), 1);

// 越陡的雪道標準時間越短
assert.ok(parTime(1000, 20) < parTime(1000, 10));
assert.ok(Math.abs(parTime(2000, 12) - 2 * parTime(1000, 12)) < 1e-9);

// 剛好標準時間：時間 2000、滿體力 1000
assert.deepEqual(
  finalScore({ points: 500, time: 60, par: 60, hp: 100, failed: false }),
  {
    timeBonus: 2000,
    hpBonus: 1000,
    total: 3500,
  },
);
// 時間加分有上下限
assert.equal(
  finalScore({ points: 0, time: 10, par: 60, hp: 0, failed: false }).timeBonus,
  3000,
);
assert.equal(
  finalScore({ points: 0, time: 500, par: 60, hp: 0, failed: false }).timeBonus,
  0,
);
// 沒滑完只留途中分數
assert.deepEqual(
  finalScore({ points: 800, time: 30, par: 60, hp: 0, failed: true }),
  {
    timeBonus: 0,
    hpBonus: 0,
    total: 800,
  },
);

// 評級：四項全滿才是 1
const perfect = {
  hits: 10,
  gates: 10,
  time: 60,
  par: 60,
  hp: 100,
  style: 9999,
  kickers: 2,
};
assert.ok(Math.abs(rating(perfect) - 1) < 1e-9);
assert.equal(grade(rating(perfect)), "S");
// 特技分數再高也補不回漏掉的旗門
assert.ok(rating({ ...perfect, hits: 5 }) < 0.9);
assert.equal(grade(rating({ ...perfect, hits: 5 })), "A");
// 完全不做特技、不閃避，其餘全滿只到 0.85
assert.equal(grade(rating({ ...perfect, style: 0 })), "A");
// 慢到兩倍標準時間，速度那三成歸零
assert.ok(Math.abs(rating({ ...perfect, time: 120 }) - 0.7) < 1e-9);
assert.equal(grade(0.55), "B");
assert.equal(grade(0.2), "C");

console.log("計分規則檢查通過");
