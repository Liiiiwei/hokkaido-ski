// 北海道滑雪遊戲的共用排行榜：綁在一份 Google 試算表上的網頁應用程式。
// 讀取：GET  ?run=雪場:雪道        → { ok, list: [{ n, s, g, t, at }] }
// 寫入：POST { run, name, score, grade, time } → { ok, at, rank, list }
const SHEET = "scores";
const HEAD = ["時間戳", "雪道", "名字", "分數", "評級", "秒數"];
const TOP = 20;
const RUN_RE = /^[a-z0-9-]{1,30}:[a-z0-9-]{1,60}$/;

function sheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET);
  if (!sh) {
    sh = ss.insertSheet(SHEET);
    sh.appendRow(HEAD);
    sh.setFrozenRows(1);
  }
  return sh;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON,
  );
}

// 某條雪道的前幾名，分數高的在前，同分先到的在前
function top_(sh, run) {
  const last = sh.getLastRow();
  if (last < 2) return [];
  return sh
    .getRange(2, 1, last - 1, 6)
    .getValues()
    .filter((r) => r[1] === run)
    .map((r) => ({
      at: Number(r[0]),
      n: String(r[2]),
      s: Number(r[3]),
      g: String(r[4]),
      t: Number(r[5]),
    }))
    .sort((a, b) => b.s - a.s || a.at - b.at);
}

function doGet(e) {
  const run = String((e.parameter && e.parameter.run) || "");
  if (!RUN_RE.test(run)) return json_({ ok: false, error: "bad run" });
  return json_({ ok: true, list: top_(sheet_(), run).slice(0, TOP) });
}

function doPost(e) {
  let d;
  try {
    d = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ ok: false, error: "bad json" });
  }
  const run = String(d.run || ""),
    // 去掉控制字元，最多 12 個字
    name = Array.from(
      String(d.name || "")
        .replace(/[\u0000-\u001f\u007f]/g, "")
        .trim(),
    )
      .slice(0, 12)
      .join(""),
    score = Math.round(Number(d.score)),
    grade = ["S", "A", "B", "C"].indexOf(d.grade) >= 0 ? d.grade : "",
    time = Math.round(Number(d.time) * 100) / 100;
  if (!RUN_RE.test(run) || !name)
    return json_({ ok: false, error: "bad input" });
  if (!(score >= 0 && score <= 9999999) || !(time >= 0 && time <= 7200))
    return json_({ ok: false, error: "bad number" });

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sh = sheet_(),
      at = Date.now();
    // 名字以 = + - @ 開頭會被試算表當成公式，前面補一個撇號強制當文字
    sh.appendRow([
      at,
      run,
      /^[=+\-@]/.test(name) ? "'" + name : name,
      score,
      grade,
      time,
    ]);
    const all = top_(sh, run);
    return json_({
      ok: true,
      at: at,
      rank: all.findIndex((r) => r.at === at) + 1,
      list: all.slice(0, TOP),
    });
  } finally {
    lock.releaseLock();
  }
}

// 第一次部署後在編輯器裡手動執行一次，完成授權並建立工作表
function setup() {
  sheet_();
}
