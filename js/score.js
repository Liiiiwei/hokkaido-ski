// 計分：連段倍率、通關總分與評級（純函式，不碰畫面）
export const POINTS = {
  gate: 100,
  near: 150,
  leap: 250,
  spin: 300,
  flip: 500,
  carve: 60,
};

// 連續得分越多倍率越高，12 連段封頂 4 倍
export const comboMult = (combo) => 1 + Math.min(12, Math.max(0, combo)) * 0.25;

// 標準時間：用平均坡度的終端速度打九折估算，與滑行物理的阻力係數一致
export function parTime(len, avgDeg) {
  const sin = Math.max(0.1, Math.sin((avgDeg * Math.PI) / 180));
  const vt = Math.sqrt(Math.max(0.6, 9.81 * sin - 0.29) / 0.0045);
  return len / (vt * 0.9);
}

// 抵達終點才有時間與體力加分；體力耗盡只留途中拿到的分數
export function finalScore({ points, time, par, hp, failed }) {
  const timeBonus = failed
    ? 0
    : Math.round(Math.max(0, Math.min(1.5, 2 - time / par)) * 2000);
  const hpBonus = failed ? 0 : Math.round(hp) * 10;
  return { timeBonus, hpBonus, total: points + timeBonus + hpBonus };
}

// 參考分：標準時間、滿體力、旗門全過且連段不斷、每座跳台一個轉體
export function refScore({ gates, kickers }) {
  let sum = 3000 + kickers * POINTS.spin;
  for (let i = 0; i < gates; i++) sum += POINTS.gate * comboMult(i);
  return sum;
}

// 評級看「拿到參考分的幾成」，長短雪道才能用同一把尺。
// 要拿 S 得比參考分更好：滑得比標準時間快，或靠特技、閃避的倍率多拿分
export function grade(total, course) {
  const p = total / refScore(course);
  return p >= 1 ? "S" : p >= 0.85 ? "A" : p >= 0.65 ? "B" : "C";
}
