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

// 評級看四件事各做到幾成，不看總分：總分可以靠連段與特技一直疊，評級不行。
// 旗門四成、速度三成、體力一成半、特技與閃避一成半
export function rating({ hits, gates, time, par, hp, style, kickers }) {
  const clamp = (v) => Math.max(0, Math.min(1, v));
  const gate = gates ? hits / gates : 1,
    pace = clamp(2 - time / par), // 標準時間內滿分，慢到兩倍歸零
    styleRef = Math.max(1, kickers) * POINTS.spin * 1.5 + 500;
  return (
    0.4 * gate +
    0.3 * pace +
    0.15 * clamp(hp / 100) +
    0.15 * clamp(style / styleRef)
  );
}

export const GRADES = [
  ["S", 0.9],
  ["A", 0.75],
  ["B", 0.55],
];
export const grade = (rate) =>
  (GRADES.find(([, min]) => rate >= min) || ["C"])[0];
