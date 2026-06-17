const SHEET_PRESETS = {
  "40": { key: "40", count: 40, cols: 5, rows: 8, cellW: 210, cellH: 374, label: "40コマ版" },
  "16": { key: "16", count: 16, cols: 4, rows: 4, cellW: 210, cellH: 374, label: "16コマ版" }
};
const GAP = 12;
const OUTER = 16;
const HEADER_H = 84;
const ANALYSIS_SAMPLES = 96;
const ANALYSIS_W = 64;
const ANALYSIS_H = 36;

const filePickerInput = document.getElementById("filePickerInput");
const cameraInput = document.getElementById("cameraInput");
const dropZone = document.getElementById("dropZone");
const video = document.getElementById("video");
const videoMeta = document.getElementById("videoMeta");
const timelineBox = document.getElementById("timelineBox");
const workflowCard = document.getElementById("workflowCard");
const manualCard = document.getElementById("manualCard");
const scrubber = document.getElementById("scrubber");
const currentTimeLabel = document.getElementById("currentTimeLabel");
const durationLabel = document.getElementById("durationLabel");
const confidenceLabel = document.getElementById("confidenceLabel");
const startLabel = document.getElementById("startLabel");
const endLabel = document.getElementById("endLabel");
const rangeLabel = document.getElementById("rangeLabel");
const statusEl = document.getElementById("status");
const savePanel = document.getElementById("savePanel");
const sheetCanvas = document.getElementById("sheetCanvas");
const sheetCanvas16 = document.getElementById("sheetCanvas16");
const workCanvas = document.getElementById("workCanvas");

const downloadBothBtn = document.getElementById("downloadBothBtn");
const download40Btn = document.getElementById("download40Btn");
const download16Btn = document.getElementById("download16Btn");
const regenerateBtn = document.getElementById("regenerateBtn");
const autoDetectBtn = document.getElementById("autoDetectBtn");
const markStartBtn = document.getElementById("markStartBtn");
const markEndBtn = document.getElementById("markEndBtn");
const jumpStartBtn = document.getElementById("jumpStartBtn");
const jumpEndBtn = document.getElementById("jumpEndBtn");

let objectUrl = null;
let currentFileName = "golf_swing";
let startTime = 0;
let endTime = 0;
let confidenceText = "-";
let lastSheetReady = false;
let busy = false;
let activeDownloadUrls = [];

function fmt(t) {
  return Number(t || 0).toFixed(2);
}

function clamp(v, min, max) {
  return Math.min(Math.max(v, min), max);
}

function setStatus(message) {
  statusEl.textContent = message;
}

function sanitizeFilename(name) {
  return name.replace(/[\\/:*?"<>|]+/g, "_").replace(/\s+/g, "_");
}

function setBusy(flag) {
  busy = flag;
  const disabled = !!flag;
  [downloadBothBtn, download40Btn, download16Btn].forEach((btn) => {
    btn.disabled = disabled || !lastSheetReady;
  });
  [regenerateBtn, autoDetectBtn, markStartBtn, markEndBtn].forEach((btn) => {
    btn.disabled = disabled;
  });
}

function updateCurrentTimeUI() {
  const t = Number(video.currentTime || 0);
  currentTimeLabel.textContent = fmt(t);
  if (document.activeElement !== scrubber) scrubber.value = t;
}

function updateRangeUI() {
  startLabel.textContent = `${fmt(startTime)}s`;
  endLabel.textContent = `${fmt(endTime)}s`;
  rangeLabel.textContent = `${fmt(Math.max(0, endTime - startTime))}s`;
  confidenceLabel.textContent = confidenceText;
}

function clearDownloadUrls() {
  activeDownloadUrls.forEach((url) => URL.revokeObjectURL(url));
  activeDownloadUrls = [];
}

function resetOutput() {
  [sheetCanvas, sheetCanvas16].forEach((canvas) => {
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    canvas.classList.add("hidden");
  });
  savePanel.classList.add("hidden");
  clearDownloadUrls();
  lastSheetReady = false;
  [downloadBothBtn, download40Btn, download16Btn].forEach((btn) => {
    btn.disabled = true;
  });
}

async function loadVideoFile(file) {
  if (!file || !file.type.startsWith("video/")) {
    setStatus("動画ファイルを選択してください。");
    return;
  }

  resetOutput();
  currentFileName = file.name.replace(/\.[^.]+$/, "") || "golf_swing";
  confidenceText = "-";

  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = URL.createObjectURL(file);
  video.src = objectUrl;
  video.load();

  video.onloadedmetadata = async () => {
    const duration = Number(video.duration || 0);
    startTime = 0;
    endTime = duration;
    durationLabel.textContent = fmt(duration);
    videoMeta.classList.remove("hidden");
    timelineBox.classList.remove("hidden");
    workflowCard.classList.remove("hidden");
    manualCard.classList.remove("hidden");
    videoMeta.textContent = `ファイル: ${file.name} / 長さ: ${fmt(duration)}秒 / 解像度: ${video.videoWidth}×${video.videoHeight} / 出力: 40コマ版・16コマ版`;
    scrubber.min = 0;
    scrubber.max = duration;
    scrubber.value = 0;
    updateCurrentTimeUI();
    updateRangeUI();

    try {
      await autoDetectAndGenerate();
    } catch (err) {
      console.error(err);
      setStatus(`エラー: ${err.message}`);
      setBusy(false);
    }
  };

  video.onerror = () => {
    setStatus("動画を読み込めませんでした。MP4形式で再度お試しください。");
  };
}

filePickerInput.addEventListener("change", (e) => loadVideoFile(e.target.files[0]));
cameraInput.addEventListener("change", (e) => loadVideoFile(e.target.files[0]));

["dragenter", "dragover"].forEach((name) => {
  dropZone.addEventListener(name, (e) => {
    e.preventDefault();
    dropZone.classList.add("dragover");
  });
});
["dragleave", "drop"].forEach((name) => {
  dropZone.addEventListener(name, (e) => {
    e.preventDefault();
    dropZone.classList.remove("dragover");
  });
});
dropZone.addEventListener("drop", (e) => loadVideoFile(e.dataTransfer.files[0]));

video.addEventListener("timeupdate", updateCurrentTimeUI);
scrubber.addEventListener("input", () => {
  if (!Number.isFinite(video.duration)) return;
  video.currentTime = Number(scrubber.value);
  updateCurrentTimeUI();
});

document.querySelectorAll("[data-nudge]").forEach((btn) => {
  btn.addEventListener("click", () => {
    if (!Number.isFinite(video.duration)) return;
    const delta = Number(btn.dataset.nudge);
    video.currentTime = clamp((video.currentTime || 0) + delta, 0, video.duration);
    updateCurrentTimeUI();
  });
});

markStartBtn.addEventListener("click", () => {
  if (!Number.isFinite(video.duration) || busy) return;
  startTime = Number(video.currentTime || 0);
  if (startTime >= endTime) endTime = clamp(startTime + 0.04, 0, video.duration);
  confidenceText = "手動調整";
  updateRangeUI();
  setStatus("アドレス位置を手動設定しました。必要ならフィニッシュ位置も調整してください。");
});

markEndBtn.addEventListener("click", () => {
  if (!Number.isFinite(video.duration) || busy) return;
  endTime = Number(video.currentTime || 0);
  if (endTime <= startTime) startTime = clamp(endTime - 0.04, 0, video.duration);
  confidenceText = "手動調整";
  updateRangeUI();
  setStatus("フィニッシュ位置を手動設定しました。問題なければ再生成してください。");
});

jumpStartBtn.addEventListener("click", () => {
  video.currentTime = startTime || 0;
  updateCurrentTimeUI();
});

jumpEndBtn.addEventListener("click", () => {
  video.currentTime = endTime || 0;
  updateCurrentTimeUI();
});

autoDetectBtn.addEventListener("click", async () => {
  if (busy) return;
  try {
    await autoDetectAndGenerate();
  } catch (err) {
    console.error(err);
    setStatus(`エラー: ${err.message}`);
    setBusy(false);
  }
});

regenerateBtn.addEventListener("click", async () => {
  if (busy) return;
  try {
    await generateSheets();
  } catch (err) {
    console.error(err);
    setStatus(`エラー: ${err.message}`);
    setBusy(false);
  }
});

downloadBothBtn.addEventListener("click", async () => {
  if (!lastSheetReady) return;
  await downloadSheets(["40", "16"]);
});

download40Btn.addEventListener("click", async () => {
  if (!lastSheetReady) return;
  await downloadSheets(["40"]);
});

download16Btn.addEventListener("click", async () => {
  if (!lastSheetReady) return;
  await downloadSheets(["16"]);
});

function buildTimes(start, end, count) {
  const range = Math.max(0.001, end - start);
  const step = count === 1 ? 0 : range / (count - 1);
  return Array.from({ length: count }, (_, i) => clamp(start + step * i, start, end));
}

function movingAverage(arr, windowSize) {
  return arr.map((_, idx) => {
    let sum = 0;
    let count = 0;
    for (let i = Math.max(0, idx - windowSize); i <= Math.min(arr.length - 1, idx + windowSize); i++) {
      sum += arr[i];
      count += 1;
    }
    return sum / count;
  });
}

function quantile(arr, q) {
  const sorted = [...arr].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sorted[base + 1] !== undefined) {
    return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
  }
  return sorted[base] ?? 0;
}

async function seekVideo(time) {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error("動画のシークに失敗しました。別形式の動画でお試しください。"));
    }, 8000);

    const cleanup = () => {
      clearTimeout(timeoutId);
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
    };

    const onSeeked = () => requestAnimationFrame(() => {
      cleanup();
      resolve();
    });

    const onError = () => {
      cleanup();
      reject(new Error("フレーム取得に失敗しました。"));
    };

    video.addEventListener("seeked", onSeeked, { once: true });
    video.addEventListener("error", onError, { once: true });
    video.currentTime = clamp(time, 0, video.duration || time);
  });
}

function getGrayFrame() {
  workCanvas.width = ANALYSIS_W;
  workCanvas.height = ANALYSIS_H;
  const ctx = workCanvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(video, 0, 0, ANALYSIS_W, ANALYSIS_H);
  const { data } = ctx.getImageData(0, 0, ANALYSIS_W, ANALYSIS_H);
  const gray = new Float32Array(ANALYSIS_W * ANALYSIS_H);
  for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
    gray[p] = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
  }
  return gray;
}

function motionDiff(frameA, frameB) {
  let sum = 0;
  for (let i = 0; i < frameA.length; i += 1) {
    sum += Math.abs(frameA[i] - frameB[i]);
  }
  return sum / frameA.length;
}

async function estimateSwingRange() {
  if (!video.src || !Number.isFinite(video.duration)) {
    throw new Error("先に動画を読み込んでください。");
  }

  const duration = Number(video.duration);
  const sampleCount = Math.min(ANALYSIS_SAMPLES, Math.max(28, Math.round(duration * 12)));
  const times = buildTimes(0, duration, sampleCount);
  const motion = [];
  let prevGray = null;

  for (let i = 0; i < times.length; i += 1) {
    setStatus(`自動推定中です… ${i + 1}/${times.length}`);
    await seekVideo(times[i]);
    const gray = getGrayFrame();
    motion.push(prevGray ? motionDiff(prevGray, gray) : 0);
    prevGray = gray;
  }

  const smoothed = movingAverage(motion, 2);
  const peakVal = Math.max(...smoothed);
  const peakIdx = smoothed.indexOf(peakVal);
  const base = quantile(smoothed, 0.2);
  const activeThresh = base + (peakVal - base) * 0.20;
  const settleThresh = base + (peakVal - base) * 0.12;

  let startIdx = 0;
  for (let i = 1; i < peakIdx; i += 1) {
    if (smoothed[i] > activeThresh) {
      startIdx = Math.max(0, i - 2);
      break;
    }
  }

  let endIdx = smoothed.length - 1;
  for (let i = Math.max(peakIdx + 1, startIdx + 4); i < smoothed.length - 2; i += 1) {
    if (smoothed[i] < settleThresh && smoothed[i + 1] < settleThresh) {
      endIdx = Math.min(smoothed.length - 1, i + 2);
      break;
    }
  }

  if (endIdx <= startIdx) {
    startIdx = Math.max(0, peakIdx - 8);
    endIdx = Math.min(smoothed.length - 1, peakIdx + 10);
  }

  const paddingPre = Math.min(0.20, duration * 0.02);
  const paddingPost = Math.min(0.35, duration * 0.03);
  let estStart = clamp(times[startIdx] - paddingPre, 0, duration);
  let estEnd = clamp(times[endIdx] + paddingPost, estStart + 0.10, duration);

  const activityRatio = peakVal > 0 ? (peakVal - base) / Math.max(peakVal, 1) : 0;
  let confidence = "中";
  if (activityRatio > 0.72) confidence = "高";
  if (activityRatio < 0.45) confidence = "低";

  return { start: estStart, end: estEnd, confidence };
}

async function autoDetectAndGenerate() {
  setBusy(true);
  resetOutput();
  setStatus("アドレス〜フィニッシュの自動推定を開始します…");
  const result = await estimateSwingRange();
  startTime = result.start;
  endTime = result.end;
  confidenceText = result.confidence;
  updateRangeUI();
  await generateSheets(true);
}

function captureFrame(time, index, preset) {
  const cellCanvas = document.createElement("canvas");
  cellCanvas.width = preset.cellW;
  cellCanvas.height = preset.cellH;
  const ctx = cellCanvas.getContext("2d");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, preset.cellW, preset.cellH);

  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const scale = Math.min(preset.cellW / vw, preset.cellH / vh);
  const drawW = vw * scale;
  const drawH = vh * scale;
  const dx = (preset.cellW - drawW) / 2;
  const dy = (preset.cellH - drawH) / 2;
  ctx.drawImage(video, dx, dy, drawW, drawH);

  const label = `#${String(index + 1).padStart(2, "0")}  ${fmt(time)}s`;
  ctx.fillStyle = "rgba(0,0,0,.68)";
  roundRect(ctx, 8, 8, 110, 28, 8);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.font = "700 12px system-ui, sans-serif";
  ctx.fillText(label, 16, 26);

  return cellCanvas;
}

function roundRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

async function captureFramesForPreset(preset) {
  const times = buildTimes(startTime, endTime, preset.count);
  const frames = [];

  for (let i = 0; i < times.length; i += 1) {
    setStatus(`${preset.label}を生成中です… ${i + 1}/${preset.count}`);
    await seekVideo(times[i]);
    frames.push(captureFrame(times[i], i, preset));
  }

  return frames;
}

async function generateSheets(autoMode = false) {
  if (!video.src || !Number.isFinite(video.duration)) {
    throw new Error("先に動画を読み込んでください。");
  }
  if (endTime <= startTime) {
    throw new Error("切り出し範囲が正しくありません。アドレスとフィニッシュを見直してください。");
  }

  setBusy(true);
  resetOutput();

  const preset40 = SHEET_PRESETS["40"];
  const frames40 = await captureFramesForPreset(preset40);
  drawSheet(frames40, preset40, sheetCanvas);

  const preset16 = SHEET_PRESETS["16"];
  const frames16 = await captureFramesForPreset(preset16);
  drawSheet(frames16, preset16, sheetCanvas16);

  lastSheetReady = true;
  [downloadBothBtn, download40Btn, download16Btn].forEach((btn) => {
    btn.disabled = false;
  });
  setBusy(false);

  const message = `${fmt(startTime)}s〜${fmt(endTime)}s を40コマ版・16コマ版にしました。`;
  setStatus(autoMode ? `自動推定完了: ${message}` : `再生成完了: ${message}`);
}

function drawSheet(frames, preset, canvas) {
  canvas.width = OUTER * 2 + preset.cols * preset.cellW + (preset.cols - 1) * GAP;
  canvas.height = HEADER_H + OUTER + preset.rows * preset.cellH + (preset.rows - 1) * GAP + OUTER;

  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "#132017";
  ctx.font = "700 28px system-ui, sans-serif";
  ctx.fillText(`Golf Swing Contact Sheet ${preset.count} Frames`, OUTER, 36);

  ctx.fillStyle = "#617064";
  ctx.font = "600 14px system-ui, sans-serif";
  const meta = `${currentFileName} / Address ${fmt(startTime)}s / Finish ${fmt(endTime)}s / Confidence ${confidenceText} / ${preset.count} frames / ${preset.cols} x ${preset.rows} layout`;
  ctx.fillText(meta, OUTER, 60);

  frames.forEach((frameCanvas, idx) => {
    const col = idx % preset.cols;
    const row = Math.floor(idx / preset.cols);
    const x = OUTER + col * (preset.cellW + GAP);
    const y = HEADER_H + row * (preset.cellH + GAP);
    ctx.strokeStyle = "#dfe6dc";
    ctx.lineWidth = 1;
    ctx.strokeRect(x - 0.5, y - 0.5, preset.cellW + 1, preset.cellH + 1);
    ctx.drawImage(frameCanvas, x, y, preset.cellW, preset.cellH);
  });
}

function canvasToPngBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("画像データの生成に失敗しました。"));
    }, "image/png");
  });
}

function getCanvasByKey(key) {
  return key === "16" ? sheetCanvas16 : sheetCanvas;
}

async function createSheetBlob(key) {
  const preset = SHEET_PRESETS[key];
  const canvas = getCanvasByKey(key);
  const blob = await canvasToPngBlob(canvas);
  const filename = sanitizeFilename(`${currentFileName}_swing_sheet_${preset.count}frames.png`);
  return { blob, filename, preset };
}

function triggerDownload(blob, filename, delay = 0) {
  window.setTimeout(() => {
    const url = URL.createObjectURL(blob);
    activeDownloadUrls.push(url);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }, delay);
}

async function downloadSheets(keys) {
  if (!lastSheetReady) return;

  savePanel.classList.add("hidden");
  const sheets = [];
  for (const key of keys) {
    sheets.push(await createSheetBlob(key));
  }

  sheets.forEach((sheet, idx) => {
    triggerDownload(sheet.blob, sheet.filename, idx * 700);
  });

  savePanel.classList.remove("hidden");
  const label = keys.length === 2 ? "40コマ版・16コマ版" : `${SHEET_PRESETS[keys[0]].count}コマ版`;
  setStatus(`${label}のダウンロードを開始しました。`);
}

// PWA service worker
const installStatus = document.getElementById("installStatus");

function updateInstallStatus(message) {
  if (installStatus) installStatus.textContent = message;
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js")
      .then(() => updateInstallStatus("ホーム画面に追加すると、アプリのように起動できます。"))
      .catch(() => updateInstallStatus("ホーム画面追加の準備に失敗しました。HTTPS環境またはGitHub Pagesで開いてください。"));
  });
} else {
  updateInstallStatus("このブラウザではホーム画面追加やオフライン起動が制限される可能性があります。");
}
