// 音效：全部用 Web Audio 即時合成，不載入音檔
let ctx = null,
  master = null,
  noise = null,
  wind = null,
  carve = null,
  muted = false;
try {
  muted = localStorage.getItem("mute") === "1";
} catch {}

const VOL = 0.55;
// 五聲音階：連段越高，旗門音越往上爬
const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28];

// 要在使用者點擊之後呼叫，瀏覽器才允許出聲
export function initAudio() {
  if (ctx) {
    if (ctx.state === "suspended") ctx.resume();
    return;
  }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : VOL;
  master.connect(ctx.destination);

  noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

  // 兩條持續的底噪：風聲跟著速度、刻雪聲跟著壓邊與煞車
  const loop = (type, freq, q) => {
    const src = ctx.createBufferSource(),
      filter = ctx.createBiquadFilter(),
      gain = ctx.createGain();
    src.buffer = noise;
    src.loop = true;
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    gain.gain.value = 0;
    src.connect(filter).connect(gain).connect(master);
    src.start();
    return { filter, gain };
  };
  wind = loop("bandpass", 400, 0.5);
  carve = loop("highpass", 2600, 0.7);
}

export const isMuted = () => muted;
export function setMuted(v) {
  muted = v;
  try {
    localStorage.setItem("mute", v ? "1" : "0");
  } catch {}
  if (master) master.gain.setTargetAtTime(v ? 0 : VOL, ctx.currentTime, 0.03);
}

// 暫停時整個停掉，回來再接續
export function suspendAudio(on) {
  if (!ctx) return;
  if (on) ctx.suspend();
  else ctx.resume();
}

// 每幀更新持續音。speed 公尺／秒、edge 壓邊與煞車的強度 0～1.5、air 是否騰空
export function updateAudio(speed, edge, air) {
  if (!ctx) return;
  const t = ctx.currentTime,
    k = Math.min(1, speed / 30);
  wind.gain.gain.setTargetAtTime(k * k * 0.5 + (air ? 0.08 : 0), t, 0.12);
  wind.filter.frequency.setTargetAtTime(300 + k * 1300, t, 0.15);
  carve.gain.gain.setTargetAtTime(
    air ? 0 : Math.min(0.34, edge * 0.26 + k * 0.03),
    t,
    0.06,
  );
  carve.filter.frequency.setTargetAtTime(2200 + edge * 1600, t, 0.1);
}
export const quietAudio = () => updateAudio(0, 0, false);

function tone(freq, dur, { type = "sine", vol = 0.3, at = 0, to = 0 } = {}) {
  if (!ctx) return;
  const t = ctx.currentTime + at,
    osc = ctx.createOscillator(),
    g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(master);
  osc.start(t);
  osc.stop(t + dur + 0.03);
}

function hiss(
  dur,
  { type = "bandpass", freq = 1200, to = 0, vol = 0.3, q = 0.8, at = 0 } = {},
) {
  if (!ctx) return;
  const t = ctx.currentTime + at,
    src = ctx.createBufferSource(),
    f = ctx.createBiquadFilter(),
    g = ctx.createGain();
  src.buffer = noise;
  f.type = type;
  f.Q.value = q;
  f.frequency.setValueAtTime(freq, t);
  if (to) f.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t, Math.random());
  src.stop(t + dur + 0.03);
}

const note = (semi, base = 523.25) => base * 2 ** (semi / 12);

export const sfx = {
  ui() {
    tone(880, 0.05, { type: "triangle", vol: 0.12 });
  },
  count() {
    tone(523, 0.14, { type: "triangle", vol: 0.28 });
  },
  go() {
    tone(1046, 0.42, { type: "triangle", vol: 0.32 });
    tone(1568, 0.42, { type: "sine", vol: 0.14 });
  },
  gate(combo) {
    const f = note(SCALE[Math.min(SCALE.length - 1, combo)]);
    tone(f, 0.16, { type: "triangle", vol: 0.26 });
    tone(f * 1.5, 0.24, { type: "sine", vol: 0.2, at: 0.06 });
  },
  miss() {
    tone(196, 0.22, { type: "square", vol: 0.1, to: 130 });
  },
  jump() {
    hiss(0.22, { freq: 500, to: 2600, vol: 0.28 });
  },
  land(power = 1) {
    const v = Math.min(1, 0.35 + power * 0.08);
    tone(120, 0.22, { vol: 0.5 * v, to: 42 });
    hiss(0.3, { type: "lowpass", freq: 1800, to: 300, vol: 0.4 * v });
  },
  trick() {
    [0, 4, 7, 12].forEach((s, i) =>
      tone(note(s, 659.25), 0.16, {
        type: "triangle",
        vol: 0.22,
        at: i * 0.055,
      }),
    );
  },
  near() {
    tone(820, 0.16, { type: "triangle", vol: 0.24, to: 1640 });
    hiss(0.18, { freq: 3000, to: 900, vol: 0.14 });
  },
  warn() {
    tone(740, 0.1, { type: "square", vol: 0.1 });
    tone(740, 0.1, { type: "square", vol: 0.1, at: 0.16 });
  },
  hit() {
    tone(210, 0.34, { type: "sawtooth", vol: 0.3, to: 52 });
    hiss(0.3, { type: "lowpass", freq: 2400, to: 200, vol: 0.5 });
  },
  tick() {
    tone(1320, 0.03, { type: "square", vol: 0.04 });
  },
  grade(top) {
    tone(note(top ? 12 : 7), 0.5, { type: "triangle", vol: 0.3 });
    tone(note(top ? 16 : 4), 0.5, { type: "sine", vol: 0.18 });
    hiss(0.12, { type: "lowpass", freq: 900, vol: 0.3 });
  },
  finish() {
    [0, 4, 7, 12, 16].forEach((s, i) =>
      tone(note(s), i === 4 ? 0.7 : 0.2, {
        type: "triangle",
        vol: 0.26,
        at: i * 0.11,
      }),
    );
  },
  fail() {
    [7, 3, 0].forEach((s, i) =>
      tone(note(s, 261.63), 0.36, {
        type: "triangle",
        vol: 0.24,
        at: i * 0.24,
      }),
    );
  },
};
