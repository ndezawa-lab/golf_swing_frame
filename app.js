const FRAME_COUNT = 40;
const COLS = 5;
const ROWS = 8;
const CELL_W = 210;
const CELL_H = 374;
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
const sheetCanvas = document.getElementById("sheetCanvas");
const workCanvas = document.getElementById("workCanvas");
const downloadBtn = document.getElementById("downloadBtn");
const savePanel = document.getElementById("savePanel");
const savePreview = document.getElementById("savePreview");
const openImageBtn = document.getElementById("openImageBtn");
const closePreviewBtn = document.getElementById("closePreviewBtn");
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
let latestImageUrl = null;

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
  downloadBtn.disabled = disabled || !lastSheetReady;
  regenerateBtn.disabled = disabled;
  autoDetectBtn.disabled = disabled;
  markStartBtn.disabled = disabled;
  markEndBtn.disabled = disabled;
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

function resetOutput() {
  const ctx = sheetCanvas.getContext("2d");
  ctx.clearRect(0, 0, sheetCanvas.width, sheetCanvas.height);
  sheetCanvas.classList.add("hidden");
  if (savePanel) savePanel.classList.add("hidden");
  if (savePreview) savePreview.removeAttribute("src");
  if (latestImageUrl) {
    URL.revokeObjectURL(latestImageUrl);
    latestImageUrl = null;
  }
  lastSheetReady = false;
  downloadBtn.disabled = true;
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
    videoMeta.textContent = `ファイル: ${file.name} / 長さ: ${fmt(duration)}秒 / 解像度: ${video.videoWidth}×${video.videoHeight} / 出力: 固定40コマ・5列×8行`;
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
    await generateSheet();
  } catch (err) {
    console.error(err);
    setStatus(`エラー: ${err.message}`);
    setBusy(false);
  }
});

downloadBtn.addEventListener("click", async () => {
  if (!lastSheetReady) return;
  await saveOrShareImage();
});

openImageBtn?.addEventListener("click", async () => {
  if (!lastSheetReady) return;
  const url = await ensureLatestImageUrl();
  window.open(url, "_blank", "noopener,noreferrer");
});

closePreviewBtn?.addEventListener("click", () => {
  if (savePanel) savePanel.classList.add("hidden");
});

function canvasToPngBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("画像データの生成に失敗しました。"));
    }, "image/png");
  });
}

async function ensureLatestImageUrl() {
  if (latestImageUrl) return latestImageUrl;
  const blob = await canvasToPngBlob(sheetCanvas);
  latestImageUrl = URL.createObjectURL(blob);
  return latestImageUrl;
}

async function saveOrShareImage() {
  const filename = sanitizeFilename(`${currentFileName}_swing_sheet_40frames.png`);
  const blob = await canvasToPngBlob(sheetCanvas);
  const file = new File([blob], filename, { type: "image/png" });

  if (latestImageUrl) URL.revokeObjectURL(latestImageUrl);
  latestImageUrl = URL.createObjectURL(blob);

  if (navigator.canShare && navigator.canShare({ files: [file] }) && navigator.share) {
    try {
      await navigator.share({
        files: [file],
        title: "Golf Swing Contact Sheet",
        text: "ゴルフスイングの40コマ一覧画像"
      });
      return;
    } catch (error) {
      // 共有キャンセルや非対応時は下のプレビュー保存へフォールバックします。
    }
  }

  const a = document.createElement("a");
  a.href = latestImageUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();

  showSavePreview(latestImageUrl);
}

function showSavePreview(url) {
  if (!savePanel || !savePreview) return;
  savePreview.src = url;
  savePanel.classList.remove("hidden");
  savePanel.scrollIntoView({ behavior: "smooth", block: "start" });
}

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
    if (prevGray) {
      motion.push(motionDiff(prevGray, gray));
    } else {
      motion.push(0);
    }
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

  let estStart = times[startIdx];
  let estEnd = times[endIdx];

  const paddingPre = Math.min(0.20, duration * 0.02);
  const paddingPost = Math.min(0.35, duration * 0.03);
  estStart = clamp(estStart - paddingPre, 0, duration);
  estEnd = clamp(estEnd + paddingPost, estStart + 0.10, duration);

  const activityRatio = peakVal > 0 ? (peakVal - base) / Math.max(peakVal, 1) : 0;
  let confidence = "中";
  if (activityRatio > 0.72) confidence = "高";
  if (activityRatio < 0.45) confidence = "低";

  return {
    start: estStart,
    end: estEnd,
    confidence,
  };
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
  await generateSheet(true);
}

function captureFrame(time, index) {
  const cellCanvas = document.createElement("canvas");
  cellCanvas.width = CELL_W;
  cellCanvas.height = CELL_H;
  const ctx = cellCanvas.getContext("2d");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, CELL_W, CELL_H);

  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const scale = Math.min(CELL_W / vw, CELL_H / vh);
  const drawW = vw * scale;
  const drawH = vh * scale;
  const dx = (CELL_W - drawW) / 2;
  const dy = (CELL_H - drawH) / 2;
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

async function generateSheet(autoMode = false) {
  if (!video.src || !Number.isFinite(video.duration)) {
    throw new Error("先に動画を読み込んでください。");
  }
  if (endTime <= startTime) {
    throw new Error("切り出し範囲が正しくありません。アドレスとフィニッシュを見直してください。");
  }

  setBusy(true);
  resetOutput();
  const times = buildTimes(startTime, endTime, FRAME_COUNT);
  const frames = [];

  for (let i = 0; i < times.length; i += 1) {
    setStatus(`一覧画像を生成中です… ${i + 1}/${FRAME_COUNT}`);
    await seekVideo(times[i]);
    frames.push(captureFrame(times[i], i));
  }

  drawSheet(frames);
  lastSheetReady = true;
  downloadBtn.disabled = false;
  setBusy(false);
  setStatus(
    autoMode
      ? `自動推定完了: ${fmt(startTime)}s〜${fmt(endTime)}s を40コマの一覧画像にしました。`
      : `再生成完了: ${fmt(startTime)}s〜${fmt(endTime)}s を40コマの一覧画像にしました。`
  );
}

function drawSheet(frames) {
  sheetCanvas.width = OUTER * 2 + COLS * CELL_W + (COLS - 1) * GAP;
  sheetCanvas.height = HEADER_H + OUTER + ROWS * CELL_H + (ROWS - 1) * GAP + OUTER;
  sheetCanvas.classList.remove("hidden");

  const ctx = sheetCanvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, sheetCanvas.width, sheetCanvas.height);

  ctx.fillStyle = "#132017";
  ctx.font = "700 28px system-ui, sans-serif";
  ctx.fillText("Golf Swing Contact Sheet", OUTER, 36);

  ctx.fillStyle = "#617064";
  ctx.font = "600 14px system-ui, sans-serif";
  const meta = `${currentFileName} / Address ${fmt(startTime)}s / Finish ${fmt(endTime)}s / Confidence ${confidenceText} / 40 frames / 5 x 8 layout`;
  ctx.fillText(meta, OUTER, 60);

  frames.forEach((frameCanvas, idx) => {
    const col = idx % COLS;
    const row = Math.floor(idx / COLS);
    const x = OUTER + col * (CELL_W + GAP);
    const y = HEADER_H + row * (CELL_H + GAP);
    ctx.strokeStyle = "#dfe6dc";
    ctx.lineWidth = 1;
    ctx.strokeRect(x - 0.5, y - 0.5, CELL_W + 1, CELL_H + 1);
    ctx.drawImage(frameCanvas, x, y, CELL_W, CELL_H);
  });
}


// PWA: service worker registration and simple install status
const installStatus = document.getElementById("installStatus");

function updateInstallStatus(message) {
  if (installStatus) installStatus.textContent = message;
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js")
      .then(() => updateInstallStatus("PWA対応済み: ホーム画面に追加するとアプリ風に起動できます。"))
      .catch(() => updateInstallStatus("PWA登録に失敗しました。HTTPS環境またはGitHub Pagesで開いてください。"));
  });
} else {
  updateInstallStatus("このブラウザはPWAのオフライン起動に対応していない可能性があります。");
}
