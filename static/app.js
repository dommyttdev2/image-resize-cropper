
const fileInput = document.getElementById("fileInput");
const dropZone = document.getElementById("dropZone");
const fileInfo = document.getElementById("fileInfo");
const editor = document.getElementById("editor");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const stage = document.getElementById("stage");

const outWidth = document.getElementById("outWidth");
const outHeight = document.getElementById("outHeight");
const lockAspect = document.getElementById("lockAspect");
const format = document.getElementById("format");
const qualityWrap = document.getElementById("qualityWrap");
const quality = document.getElementById("quality");
const zoomRange = document.getElementById("zoomRange");
const zoomLabel = document.getElementById("zoomLabel");
const sourceSize = document.getElementById("sourceSize");
const cropSize = document.getElementById("cropSize");
const outputSize = document.getElementById("outputSize");
const status = document.getElementById("status");

let image = null;
let imageURL = null;

// Display transform:
// image is drawn with its center at (stage center + offset)
// zoom is relative to the automatic fit scale.
let zoom = 1;
let baseScale = 1;
let offsetX = 0;
let offsetY = 0;

let dragging = false;
let lastPointerX = 0;
let lastPointerY = 0;

let previousWidth = Number(outWidth.value) || 1024;
let previousHeight = Number(outHeight.value) || 1024;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function outputDimensions() {
  return {
    width: Math.max(1, Number(outWidth.value) || 1),
    height: Math.max(1, Number(outHeight.value) || 1),
  };
}

function cropSourceSize() {
  const { width, height } = outputDimensions();
  const aspect = width / height;

  let cropWidth;
  let cropHeight;

  if (image.naturalWidth / image.naturalHeight >= aspect) {
    cropHeight = image.naturalHeight;
    cropWidth = cropHeight * aspect;
  } else {
    cropWidth = image.naturalWidth;
    cropHeight = cropWidth / aspect;
  }

  return { cropWidth, cropHeight };
}

function canvasSize() {
  return {
    width: stage.clientWidth,
    height: stage.clientHeight,
  };
}

function currentTransform() {
  const { width: stageWidth, height: stageHeight } = canvasSize();
  const { cropWidth, cropHeight } = cropSourceSize();

  const scale = baseScale * zoom;

  const imageWidth = image.naturalWidth * scale;
  const imageHeight = image.naturalHeight * scale;

  const centerX = stageWidth / 2 + offsetX;
  const centerY = stageHeight / 2 + offsetY;

  const cropDisplayWidth = cropWidth * scale;
  const cropDisplayHeight = cropHeight * scale;

  const imageLeft = centerX - imageWidth / 2;
  const imageTop = centerY - imageHeight / 2;

  const cropLeft = stageWidth / 2 - cropDisplayWidth / 2;
  const cropTop = stageHeight / 2 - cropDisplayHeight / 2;

  return {
    scale,
    imageWidth,
    imageHeight,
    imageLeft,
    imageTop,
    cropWidth,
    cropHeight,
    cropDisplayWidth,
    cropDisplayHeight,
    cropLeft,
    cropTop,
    centerX,
    centerY,
  };
}

function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const width = stage.clientWidth;
  const height = stage.clientHeight;

  canvas.width = Math.max(1, Math.round(width * dpr));
  canvas.height = Math.max(1, Math.round(height * dpr));
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function draw() {
  if (!image) return;

  resizeCanvas();

  const { width: stageWidth, height: stageHeight } = canvasSize();
  const t = currentTransform();

  ctx.clearRect(0, 0, stageWidth, stageHeight);

  // Draw image.
  ctx.drawImage(
    image,
    t.imageLeft,
    t.imageTop,
    t.imageWidth,
    t.imageHeight
  );

  // Darken everything outside the crop rectangle.
  ctx.save();
  ctx.fillStyle = "rgba(0, 0, 0, 0.58)";
  ctx.fillRect(0, 0, stageWidth, stageHeight);

  ctx.globalCompositeOperation = "destination-out";
  ctx.fillRect(
    t.cropLeft,
    t.cropTop,
    t.cropDisplayWidth,
    t.cropDisplayHeight
  );
  ctx.restore();

  // Draw the image again inside the crop rectangle.
  ctx.save();
  ctx.beginPath();
  ctx.rect(
    t.cropLeft,
    t.cropTop,
    t.cropDisplayWidth,
    t.cropDisplayHeight
  );
  ctx.clip();

  ctx.drawImage(
    image,
    t.imageLeft,
    t.imageTop,
    t.imageWidth,
    t.imageHeight
  );
  ctx.restore();

  // Crop border.
  ctx.strokeStyle = "rgba(255, 255, 255, 0.95)";
  ctx.lineWidth = 1;
  ctx.strokeRect(
    t.cropLeft + 0.5,
    t.cropTop + 0.5,
    t.cropDisplayWidth - 1,
    t.cropDisplayHeight - 1
  );

  // Rule-of-thirds guide.
  ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
  ctx.beginPath();

  ctx.moveTo(
    t.cropLeft + t.cropDisplayWidth / 3,
    t.cropTop
  );
  ctx.lineTo(
    t.cropLeft + t.cropDisplayWidth / 3,
    t.cropTop + t.cropDisplayHeight
  );

  ctx.moveTo(
    t.cropLeft + t.cropDisplayWidth * 2 / 3,
    t.cropTop
  );
  ctx.lineTo(
    t.cropLeft + t.cropDisplayWidth * 2 / 3,
    t.cropTop + t.cropDisplayHeight
  );

  ctx.moveTo(
    t.cropLeft,
    t.cropTop + t.cropDisplayHeight / 3
  );
  ctx.lineTo(
    t.cropLeft + t.cropDisplayWidth,
    t.cropTop + t.cropDisplayHeight / 3
  );

  ctx.moveTo(
    t.cropLeft,
    t.cropTop + t.cropDisplayHeight * 2 / 3
  );
  ctx.lineTo(
    t.cropLeft + t.cropDisplayWidth,
    t.cropTop + t.cropDisplayHeight * 2 / 3
  );

  ctx.stroke();

  const { cropWidth, cropHeight } = cropSourceSize();
  const { width, height } = outputDimensions();

  cropSize.textContent =
    `${Math.round(cropWidth)} × ${Math.round(cropHeight)} px`;
  outputSize.textContent = `${width} × ${height} px`;
  zoomLabel.textContent = `${Math.round(zoom * 100)}%`;
}

function fitImage() {
  if (!image) return;

  const { cropWidth, cropHeight } = cropSourceSize();
  const { width: stageWidth, height: stageHeight } = canvasSize();

  // The crop frame occupies about 86% of the preview area.
  const targetWidth = stageWidth * 0.86;
  const targetHeight = stageHeight * 0.86;

  baseScale = Math.min(
    targetWidth / cropWidth,
    targetHeight / cropHeight
  );

  zoom = 1;
  offsetX = 0;
  offsetY = 0;

  zoomRange.value = 100;
  draw();
}

function centerImage() {
  offsetX = 0;
  offsetY = 0;
  draw();
}

function setOutputSize(width, height) {
  outWidth.value = width;
  outHeight.value = height;

  previousWidth = width;
  previousHeight = height;

  fitImage();
}

function loadFile(file) {
  if (!file || !file.type.startsWith("image/")) {
    status.textContent = "画像ファイルを選択してください。";
    return;
  }

  if (imageURL) {
    URL.revokeObjectURL(imageURL);
  }

  imageURL = URL.createObjectURL(file);
  image = new Image();

  image.onload = () => {
    sourceSize.textContent =
      `${image.naturalWidth} × ${image.naturalHeight} px`;

    fileInfo.textContent =
      `${file.name} — ${image.naturalWidth} × ${image.naturalHeight} px`;

    fileInfo.classList.remove("hidden");
    editor.classList.remove("hidden");
    document.getElementById("emptyPreview").classList.add("hidden");

    fitImage();
    status.textContent = "";
  };

  image.onerror = () => {
    status.textContent = "画像の読み込みに失敗しました。";
  };

  image.src = imageURL;
}

fileInput.addEventListener("change", (event) => {
  loadFile(event.target.files[0]);
});

dropZone.addEventListener("dragover", (event) => {
  event.preventDefault();
  dropZone.classList.add("dragover");
});

dropZone.addEventListener("dragleave", () => {
  dropZone.classList.remove("dragover");
});

dropZone.addEventListener("drop", (event) => {
  event.preventDefault();
  dropZone.classList.remove("dragover");
  loadFile(event.dataTransfer.files[0]);
});

// -------------------------
// Output size
// -------------------------

outWidth.addEventListener("input", () => {
  const width = Number(outWidth.value) || 1;

  if (lockAspect.checked && previousWidth > 0) {
    const ratio = previousHeight / previousWidth;
    outHeight.value = Math.max(1, Math.round(width * ratio));
  }

  previousWidth = Number(outWidth.value) || 1;
  previousHeight = Number(outHeight.value) || 1;

  if (image) fitImage();
});

outHeight.addEventListener("input", () => {
  const height = Number(outHeight.value) || 1;

  if (lockAspect.checked && previousHeight > 0) {
    const ratio = previousWidth / previousHeight;
    outWidth.value = Math.max(1, Math.round(height * ratio));
  }

  previousWidth = Number(outWidth.value) || 1;
  previousHeight = Number(outHeight.value) || 1;

  if (image) fitImage();
});

document.querySelectorAll(".presets button").forEach((button) => {
  button.addEventListener("click", () => {
    const [width, height] = button.dataset.size
      .split("x")
      .map(Number);

    setOutputSize(width, height);
  });
});

// -------------------------
// Zoom
// -------------------------

function setZoom(newZoom, focusX = null, focusY = null) {
  if (!image) return;

  const oldZoom = zoom;
  const nextZoom = clamp(newZoom, 0.1, 5);

  if (focusX !== null && focusY !== null && oldZoom !== nextZoom) {
    // Keep the point under the mouse stationary while zooming.
    const scaleRatio = nextZoom / oldZoom;

    offsetX =
      focusX + (offsetX - focusX) * scaleRatio;

    offsetY =
      focusY + (offsetY - focusY) * scaleRatio;
  }

  zoom = nextZoom;
  zoomRange.value = Math.round(zoom * 100);
  draw();
}

zoomRange.addEventListener("input", () => {
  setZoom(Number(zoomRange.value) / 100);
});

document.getElementById("zoomOut").addEventListener("click", () => {
  setZoom(zoom / 1.15);
});

document.getElementById("zoomIn").addEventListener("click", () => {
  setZoom(zoom * 1.15);
});

document.getElementById("fitBtn").addEventListener("click", fitImage);
document.getElementById("centerBtn").addEventListener("click", centerImage);

// -------------------------
// Image movement
// -------------------------
// IMPORTANT:
// Dragging the canvas moves the IMAGE, not the crop frame.
// The crop frame stays fixed at the center.

canvas.addEventListener("pointerdown", (event) => {
  if (!image) return;

  dragging = true;
  lastPointerX = event.clientX;
  lastPointerY = event.clientY;

  canvas.classList.add("dragging");
  canvas.setPointerCapture(event.pointerId);

  event.preventDefault();
});

canvas.addEventListener("pointermove", (event) => {
  if (!dragging || !image) return;

  const dx = event.clientX - lastPointerX;
  const dy = event.clientY - lastPointerY;

  offsetX += dx;
  offsetY += dy;

  lastPointerX = event.clientX;
  lastPointerY = event.clientY;

  draw();
  event.preventDefault();
});

function stopDragging(event) {
  dragging = false;
  canvas.classList.remove("dragging");

  try {
    if (canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
  } catch (_) {}
}

canvas.addEventListener("pointerup", stopDragging);
canvas.addEventListener("pointercancel", stopDragging);
canvas.addEventListener("pointerleave", () => {
  // Do not stop here. Pointer capture keeps dragging alive.
});

canvas.addEventListener("wheel", (event) => {
  if (!image) return;

  event.preventDefault();

  const rect = canvas.getBoundingClientRect();
  const mouseX = event.clientX - rect.left - stage.clientWidth / 2;
  const mouseY = event.clientY - rect.top - stage.clientHeight / 2;

  const factor = event.deltaY < 0 ? 1.08 : 1 / 1.08;

  setZoom(zoom * factor, mouseX, mouseY);
}, { passive: false });

// -------------------------
// Output format
// -------------------------

format.addEventListener("change", () => {
  qualityWrap.classList.toggle(
    "hidden",
    format.value === "PNG"
  );
});

// -------------------------
// Generate
// -------------------------

document.getElementById("processBtn").addEventListener("click", async () => {
  if (!image) return;

  const t = currentTransform();
  const { width, height } = outputDimensions();

  // The crop frame is fixed at the center of the preview.
  // Convert its display coordinates back to source-image coordinates.
  const cropDisplayLeft = t.cropLeft;
  const cropDisplayTop = t.cropTop;

  const sourceX =
    (cropDisplayLeft - t.imageLeft) / t.scale;

  const sourceY =
    (cropDisplayTop - t.imageTop) / t.scale;

  status.textContent = "生成中…";

  try {
    const imageBlob = await fetch(image.src).then((response) =>
      response.blob()
    );

    const formData = new FormData();

    formData.append("file", imageBlob, "image");
    formData.append("width", String(width));
    formData.append("height", String(height));
    formData.append("x", String(sourceX));
    formData.append("y", String(sourceY));
    formData.append("crop_width", String(t.cropWidth));
    formData.append("crop_height", String(t.cropHeight));
    formData.append("output_format", format.value);
    formData.append("quality", String(quality.value));

    const response = await fetch("/process", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      let message = "生成に失敗しました。";

      try {
        const json = await response.json();
        if (json.detail) message = json.detail;
      } catch (_) {}

      throw new Error(message);
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);

    const extension =
      format.value === "JPEG"
        ? "jpg"
        : format.value.toLowerCase();

    const link = document.createElement("a");
    link.href = url;
    link.download =
      `cropped_${Date.now()}.${extension}`;

    document.body.appendChild(link);
    link.click();
    link.remove();

    URL.revokeObjectURL(url);

    status.textContent =
      "生成しました。ダウンロードを開始します。";
  } catch (error) {
    status.textContent = error.message;
  }
});

// -------------------------
// Reset
// -------------------------

document.getElementById("resetBtn").addEventListener("click", () => {
  fileInput.value = "";

  editor.classList.add("hidden");
  fileInfo.classList.add("hidden");

  image = null;

  if (imageURL) {
    URL.revokeObjectURL(imageURL);
  }

  imageURL = null;
  status.textContent = "";
});

// -------------------------
// Resize
// -------------------------

window.addEventListener("resize", () => {
  if (image) {
    fitImage();
  }
});

format.dispatchEvent(new Event("change"));
