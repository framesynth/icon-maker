// ================================
// FrameLab User Interface (PRO EDITION)
// ================================

// ▼ Worker API (Fetch frame list)
const WORKER_LIST_API = "https://framelab.narun091525-b98.workers.dev?mode=list";

// ▼ DOM elements
const imageInput = document.getElementById("imageInput");
const frameSelect = document.getElementById("frameSelect");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const saveBtn = document.getElementById("saveBtn");
const resetBtn = document.getElementById("resetBtn");

// ▼ Image objects
let baseImage = null;
let frameImage = null;

// ▼ Transform parameters
let scale = 1;
let minScale = 0.3;
let maxScale = 4;
let offsetX = 0;
let offsetY = 0;

// ▼ DPI (Retina) 対応
function applyDPI() {
  const dpr = window.devicePixelRatio || 1;
  const size = canvas.clientWidth;

  canvas.width = size * dpr;
  canvas.height = size * dpr;

  ctx.scale(dpr, dpr);
}

// ================================
// ▼ Fetch frame list from Worker
// ================================
async function loadFrames() {
  try {
    const res = await fetch(WORKER_LIST_API, { cache: "no-store" });
    const data = await res.json();

    if (!data.success) {
      frameSelect.innerHTML = '<option value="">未選択</option>';
      return;
    }

    const frames = data.data.frames;

    frameSelect.innerHTML = '<option value="">未選択</option>';

    frames.forEach(frame => {
      const option = document.createElement("option");
      option.textContent = frame.displayName || frame.filename || "名称未設定";
      option.value = frame.url;
      frameSelect.appendChild(option);
    });

  } catch (err) {
    console.error("フレーム一覧取得エラー:", err);
    frameSelect.innerHTML = '<option value="">未選択</option>';
  }
}

// ================================
// ▼ Canvas resizing
// ================================
function resizeCanvas() {
  applyDPI();
  redraw();
}

window.addEventListener("DOMContentLoaded", () => {
  loadFrames();
  setTimeout(resizeCanvas, 50);
});

window.addEventListener("resize", () => {
  setTimeout(resizeCanvas, 50);
});

// ================================
// ▼ EXIF 回転補正
// ================================
async function fixExifOrientation(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = function () {
      const img = new Image();
      img.onload = function () {
        resolve(img);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

// ================================
// ▼ Load baseImage
// ================================
imageInput.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  baseImage = await fixExifOrientation(file);

  const cw = canvas.clientWidth;
  const ch = canvas.clientHeight;
  const iw = baseImage.width;
  const ih = baseImage.height;

  const fitScale = Math.min(cw / iw, ch / ih);
  scale = fitScale;

  minScale = fitScale * 0.25;
  maxScale = fitScale * 6.0;

  offsetX = cw / 2 - (iw * scale) / 2;
  offsetY = ch / 2 - (ih * scale) / 2;

  redraw();
});

// ================================
// ▼ Frame selection（Safari高速化）
// ================================
frameSelect.addEventListener("change", async () => {
  const value = frameSelect.value;
  if (!value) {
    frameImage = null;
    redraw();
    return;
  }

  const res = await fetch(value + "?t=" + Date.now());
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);

  frameImage = new Image();
  frameImage.onload = () => {
    URL.revokeObjectURL(url);
    redraw();
  };
  frameImage.src = url;
});

// ================================
// ▼ PointerEvent（ドラッグ + ピンチズーム）完全版
// ================================
let pointerState = {
  pointers: new Map(),
  isDragging: false,
  lastX: 0,
  lastY: 0,
  lastDist: 0,
  lastCenterX: 0,
  lastCenterY: 0,
  velocityX: 0,
  velocityY: 0
};

canvas.addEventListener("pointerdown", (e) => {
  canvas.setPointerCapture(e.pointerId);

  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  pointerState.pointers.set(e.pointerId, { x, y });

  if (pointerState.pointers.size === 1) {
    pointerState.isDragging = true;
    pointerState.lastX = x;
    pointerState.lastY = y;
  }

  if (pointerState.pointers.size === 2) {
    const pts = [...pointerState.pointers.values()];
    pointerState.lastDist = Math.hypot(
      pts[0].x - pts[1].x,
      pts[0].y - pts[1].y
    );

    pointerState.lastCenterX = (pts[0].x + pts[1].x) / 2;
    pointerState.lastCenterY = (pts[0].y + pts[1].y) / 2;

    pointerState.isDragging = false;
  }
});

canvas.addEventListener("pointermove", (e) => {
  if (!pointerState.pointers.has(e.pointerId)) return;

  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  pointerState.pointers.set(e.pointerId, { x, y });

  if (pointerState.pointers.size === 2) {
    const pts = [...pointerState.pointers.values()];

    const dist = Math.hypot(
      pts[0].x - pts[1].x,
      pts[0].y - pts[1].y
    );

    const oldScale = scale;
    const delta = (dist - pointerState.lastDist) * 0.004;

    scale = Math.max(minScale, Math.min(maxScale, scale + delta));
    const zoomRatio = scale / oldScale;

    const cx = pointerState.lastCenterX;
    const cy = pointerState.lastCenterY;

    offsetX = cx - (cx - offsetX) * zoomRatio;
    offsetY = cy - (cy - offsetY) * zoomRatio;

    pointerState.lastDist = dist;
    requestRedraw();
    return;
  }

  if (pointerState.isDragging && pointerState.pointers.size === 1) {
    const dx = x - pointerState.lastX;
    const dy = y - pointerState.lastY;

    offsetX += dx;
    offsetY += dy;

    pointerState.velocityX = dx;
    pointerState.velocityY = dy;

    pointerState.lastX = x;
    pointerState.lastY = y;

    requestRedraw();
  }
});

canvas.addEventListener("pointerup", (e) => {
  pointerState.pointers.delete(e.pointerId);

  if (pointerState.pointers.size === 1) {
    const [remaining] = pointerState.pointers.values();
    pointerState.isDragging = true;
    pointerState.lastX = remaining.x;
    pointerState.lastY = remaining.y;
  } else {
    pointerState.isDragging = false;
    pointerState.lastDist = 0;
  }
});

canvas.addEventListener("pointercancel", (e) => {
  pointerState.pointers.delete(e.pointerId);
  pointerState.isDragging = false;
  pointerState.lastDist = 0;
});

// ================================
// ▼ 慣性ドラッグ
// ================================
function applyMomentum() {
  if (pointerState.isDragging || pointerState.pointers.size > 0) return;

  pointerState.velocityX *= 0.92;
  pointerState.velocityY *= 0.92;

  offsetX += pointerState.velocityX;
  offsetY += pointerState.velocityY;

  if (Math.abs(pointerState.velocityX) < 0.1 &&
      Math.abs(pointerState.velocityY) < 0.1) return;

  requestRedraw();
  requestAnimationFrame(applyMomentum);
}

// ================================
// ▼ ホイールズーム（ピンチと同じ中心計算）
// ================================
canvas.addEventListener("wheel", (e) => {
  e.preventDefault();

  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;

  const oldScale = scale;
  const delta = e.deltaY > 0 ? -0.05 : 0.05;

  scale = Math.max(minScale, Math.min(maxScale, scale + delta));
  const zoomRatio = scale / oldScale;

  offsetX = mx - (mx - offsetX) * zoomRatio;
  offsetY = my - (my - offsetY) * zoomRatio;

  requestRedraw();
});

// ================================
// ▼ 境界制御（画像が飛ばない）
// ================================
function clampOffsets() {
  if (!baseImage) return;

  const cw = canvas.clientWidth;
  const ch = canvas.clientHeight;

  const iw = baseImage.width * scale;
  const ih = baseImage.height * scale;

  const minX = cw - iw;
  const minY = ch - ih;

  offsetX = Math.min(0, Math.max(minX, offsetX));
  offsetY = Math.min(0, Math.max(minY, offsetY));
}

// ================================
// ▼ ズームスナップ
// ================================
function applyZoomSnap() {
  const cw = canvas.clientWidth;
  const ch = canvas.clientHeight;

  const iw = baseImage.width * scale;
  const ih = baseImage.height * scale;

  const fitScale = Math.min(cw / baseImage.width, ch / baseImage.height);

  if (Math.abs(scale - fitScale) < 0.02) {
    scale = fitScale;
  }
}

// ================================
// ▼ 描画（フレームもズーム）
// ================================
let redrawPending = false;

function requestRedraw() {
  if (!redrawPending) {
    redrawPending = true;
    requestAnimationFrame(() => {
      redrawPending = false;
      redraw();
    });
  }
}

function redraw() {
  clampOffsets();
  applyZoomSnap();

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (baseImage) {
    const drawW = baseImage.width * scale;
    const drawH = baseImage.height * scale;
    ctx.drawImage(baseImage, offsetX, offsetY, drawW, drawH);
  }

  if (frameImage && frameImage.complete) {
    ctx.drawImage(frameImage, 0, 0, canvas.clientWidth, canvas.clientHeight);
  }
}

// ================================
// ▼ High-resolution save
// ================================
function saveHighRes() {
  if (!baseImage) {
    alert("画像が選択されていません。");
    return;
  }

  const scaleFactor = 3;
  const saveCanvas = document.createElement("canvas");
  saveCanvas.width = canvas.clientWidth * scaleFactor;
  saveCanvas.height = canvas.clientHeight * scaleFactor;
  const sctx = saveCanvas.getContext("2d");

  sctx.fillStyle = "#ffffff";
  sctx.fillRect(0, 0, saveCanvas.width, saveCanvas.height);

  const drawW = baseImage.width * scale * scaleFactor;
  const drawH = baseImage.height * scale * scaleFactor;
  const x = offsetX * scaleFactor;
  const y = offsetY * scaleFactor;

  sctx.drawImage(baseImage, x, y, drawW, drawH);

  if (frameImage && frameImage.complete) {
    sctx.drawImage(frameImage, 0, 0, saveCanvas.width, saveCanvas.height);
  }

  const now = new Date();
  const filename =
    `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}` +
    `${String(now.getDate()).padStart(2, "0")}_` +
    `${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}` +
    `${String(now.getSeconds()).padStart(2, "0")}.png`;

  saveCanvas.toBlob((blob) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, "image/png");
}

// ================================
// ▼ Full reset
// ================================
resetBtn.addEventListener("click", () => {
  baseImage = null;
  frameImage = null;

  scale = 1;
  offsetX = 0;
  offsetY = 0;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  imageInput.value = "";
  frameSelect.selectedIndex = 0;

  console.log("Full reset completed");
});

// ================================
// ▼ Save button
// ================================
saveBtn.addEventListener("click", saveHighRes);
