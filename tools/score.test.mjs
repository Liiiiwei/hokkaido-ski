// 計分規則檢查：node tools/score.test.mjs
import assert from "node:assert/strict";
import { comboMult, parTime, finalScore, refScore, grade } from "../js/score.js";

assert.equal(comboMult(0), 1);
assert.equal(comboMult(4), 2);
assert.equal(comboMult(12), 4);
assert.equal(comboMult(99), 4); // 封頂
assert.equal(comboMult(-3), 1);

// 越陡的雪道標準時間越短
assert.ok(parTime(1000, 20) < parTime(1000, 10));
assert.ok(Math.abs(parTime(2000, 12) - 2 * parTime(1000, 12)) < 1e-9);

// 剛好標準時間：時間 2000、滿體力 1000
assert.deepEqual(finalScore({ points: 500, time: 60, par: 60, hp: 100, failed: false }), {
  timeBonus: 2000,
  hpBonus: 1000,
  total: 3500,
});
// 時間加分有上下限
assert.equal(finalScore({ points: 0, time: 10, par: 60, hp: 0, failed: false }).timeBonus, 3000);
assert.equal(finalScore({ points: 0, time: 500, par: 60, hp: 0, failed: false }).timeBonus, 0);
// 沒滑完只留途中分數
assert.deepEqual(finalScore({ points: 800, time: 30, par: 60, hp: 0, failed: true }), {
  timeBonus: 0,
  hpBonus: 0,
  total: 800,
});

// 參考分 = 3000 + 2 跳台 × 300 + 4 門（100 + 125 + 150 + 175）= 4150
const course = { gates: 4, kickers: 2 };
assert.equal(refScore(course), 4150);
assert.equal(grade(4150, course), "S");
assert.equal(grade(4149, course), "A");
assert.equal(grade(Math.ceil(4150 * 0.85), course), "A");
assert.equal(grade(Math.ceil(4150 * 0.65), course), "B");
assert.equal(grade(100, course), "C");

console.log("計分規則檢查通過");
