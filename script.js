// ================================
// FrameLab User Interface
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
  const size = canvas.clientWidth;
  if (!size) return;

  canvas.width = size;
  canvas.height = size;

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
// ▼ Load baseImage
// ================================
imageInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    baseImage = new Image();
    baseImage.onload = () => {
      const cw = canvas.width;
      const ch = canvas.height;
      const iw = baseImage.width;
      const ih = baseImage.height;

      const fitScale = Math.min(cw / iw, ch / ih);
      scale = fitScale;
      minScale = fitScale * 0.3;

      offsetX = cw / 2 - (iw * scale) / 2;
      offsetY = ch / 2 - (ih * scale) / 2;

      redraw();
    };
    baseImage.src = reader.result;
  };
  reader.readAsDataURL(file);
});

// ================================
// ▼ Frame selection
// ================================
frameSelect.addEventListener("change", () => {
  const value = frameSelect.value;
  if (!value) {
    frameImage = null;
    redraw();
    return;
  }

  frameImage = new Image();
  frameImage.crossOrigin = "anonymous";
  frameImage.onload = redraw;

  frameImage.src = value + "?t=" + Date.now();
});

// ================================
// ▼ PointerEvent 統合版（ドラッグ + ピンチズーム）
// ================================
let pointerState = {
  pointers: new Map(),
  isDragging: false,
  lastX: 0,
  lastY: 0,
  lastDist: 0
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

    const centerX = (pts[0].x + pts[1].x) / 2;
    const centerY = (pts[0].y + pts[1].y) / 2;

    const oldScale = scale;
    const delta = (dist - pointerState.lastDist) * 0.004;

    scale = Math.max(minScale, Math.min(maxScale, scale + delta));
    const zoomRatio = scale / oldScale;

    offsetX = centerX - (centerX - offsetX) * zoomRatio;
    offsetY = centerY - (centerY - offsetY) * zoomRatio;

    pointerState.lastDist = dist;
    redraw();
    return;
  }

  if (pointerState.isDragging && pointerState.pointers.size === 1) {
    offsetX += x - pointerState.lastX;
    offsetY += y - pointerState.lastY;

    pointerState.lastX = x;
    pointerState.lastY = y;

    redraw();
  }
});

canvas.addEventListener("pointerup", (e) => {
  pointerState.pointers.delete(e.pointerId);
  pointerState.isDragging = false;
});

canvas.addEventListener("pointercancel", (e) => {
  pointerState.pointers.delete(e.pointerId);
  pointerState.isDragging = false;
});

// ▼ PC: Wheel zoom
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

  redraw();
});

// ================================
// ▼ Drawing process
// ================================
function redraw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (baseImage) {
    const drawW = baseImage.width * scale;
    const drawH = baseImage.height * scale;
    ctx.drawImage(baseImage, offsetX, offsetY, drawW, drawH);
  }

  if (frameImage && frameImage.complete) {
    ctx.drawImage(frameImage, 0, 0, canvas.width, canvas.height);
  }
}

// ================================
// ▼ High-resolution save（Safari＝表示のみ）
// ================================
function saveHighRes() {
  if (!baseImage) {
    alert("画像が選択されていません。");
    return;
  }

  const scaleFactor = 3;
  const saveCanvas = document.createElement("canvas");
  saveCanvas.width = canvas.width * scaleFactor;
  saveCanvas.height = canvas.height * scaleFactor;
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

  const ua = navigator.userAgent;
  const isSafari = /^((?!chrome|android).)*safari/i.test(ua);

  if (isSafari) {
    saveCanvas.toBlob((blob) => {
      const blobURL = URL.createObjectURL(blob);
      window.location.href = blobURL;
      alert("Safariでは画像が表示されます。表示された画像を長押しして保存してください。");
    }, "image/png");

    return;
  }

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
