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
const lockAspectLabel = document.getElementById("lockAspectLabel");
const generalPresetBlock = document.getElementById("generalPresetBlock");
const sitePreset = document.getElementById("sitePreset");
const marketplaceControls = document.getElementById("marketplaceControls");
const marketplaceCurrentTarget = document.getElementById("marketplaceCurrentTarget");
const marketplaceZipBtn = document.getElementById("marketplaceZipBtn");
const processBtn = document.getElementById("processBtn");
const format = document.getElementById("format");
const qualityWrap = document.getElementById("qualityWrap");
const quality = document.getElementById("quality");
const zoomRange = document.getElementById("zoomRange");
const zoomLabel = document.getElementById("zoomLabel");
const sourceSize = document.getElementById("sourceSize");
const cropSize = document.getElementById("cropSize");
const outputSize = document.getElementById("outputSize");
const status = document.getElementById("status");

const MIN_ZOOM = 1;
const MAX_ZOOM = 5;

const MARKETPLACE_TARGETS = {
  "FANZA/package": {
    service: "FANZA",
    imageType: "package",
    label: "FANZA / パッケージ",
    width: 560,
    height: 420,
    formPrefix: "fanza_package",
  },
  "FANZA/thumbnail": {
    service: "FANZA",
    imageType: "thumbnail",
    label: "FANZA / サムネイル",
    width: 100,
    height: 100,
    formPrefix: "fanza_thumbnail",
  },
  "DLsite/package": {
    service: "DLsite",
    imageType: "package",
    label: "DLsite / パッケージ",
    width: 560,
    height: 420,
    formPrefix: "dlsite_package",
  },
  "DLsite/thumbnail": {
    service: "DLsite",
    imageType: "thumbnail",
    label: "DLsite / サムネイル",
    width: 300,
    height: 300,
    formPrefix: "dlsite_thumbnail",
  },
};

let image = null;
let imageURL = null;

let zoom = MIN_ZOOM;
let baseScale = 1;
let offsetX = 0;
let offsetY = 0;

let dragging = false;
let lastPointerX = 0;
let lastPointerY = 0;

let previousWidth = Number(outWidth.value) || 1024;
let previousHeight = Number(outHeight.value) || 1024;

let marketplaceMode = false;
let marketplaceService = "FANZA";
let marketplaceImageType = "package";
let marketplaceStates = {};
let normalOutputState = {
  width: previousWidth,
  height: previousHeight,
  lockAspect: lockAspect.checked,
};

zoomRange.min = String(MIN_ZOOM * 100);
zoomRange.max = String(MAX_ZOOM * 100);
zoomRange.value = String(MIN_ZOOM * 100);

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function outputDimensions() {
  return {
    width: Math.max(1, Number(outWidth.value) || 1),
    height: Math.max(1, Number(outHeight.value) || 1),
  };
}

function cropSourceSizeForDimensions(width, height) {
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

function cropSourceSize() {
  const { width, height } = outputDimensions();
  return cropSourceSizeForDimensions(width, height);
}

function canvasSize() {
  return {
    width: stage.clientWidth,
    height: stage.clientHeight,
  };
}

function baseScaleForCrop(cropWidth, cropHeight) {
  const { width: stageWidth, height: stageHeight } = canvasSize();
  const targetWidth = stageWidth * 0.86;
  const targetHeight = stageHeight * 0.86;

  return Math.min(
    targetWidth / cropWidth,
    targetHeight / cropHeight
  );
}

function clampOffsets() {
  if (!image) return;

  const { cropWidth, cropHeight } = cropSourceSize();
  const scale = baseScale * zoom;

  const imageWidth = image.naturalWidth * scale;
  const imageHeight = image.naturalHeight * scale;
  const cropDisplayWidth = cropWidth * scale;
  const cropDisplayHeight = cropHeight * scale;

  const maxOffsetX = Math.max(0, (imageWidth - cropDisplayWidth) / 2);
  const maxOffsetY = Math.max(0, (imageHeight - cropDisplayHeight) / 2);

  offsetX = clamp(offsetX, -maxOffsetX, maxOffsetX);
  offsetY = clamp(offsetY, -maxOffsetY, maxOffsetY);
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

function marketplaceTargetKey(service = marketplaceService, imageType = marketplaceImageType) {
  return `${service}/${imageType}`;
}

function currentMarketplaceTarget() {
  return MARKETPLACE_TARGETS[marketplaceTargetKey()];
}

function saveMarketplaceState() {
  if (!marketplaceMode || !image) return;

  marketplaceStates[marketplaceTargetKey()] = {
    zoom,
    offsetX,
    offsetY,
    initialized: true,
  };
}

function updateMarketplaceUi() {
  if (!marketplaceMode) return;

  const target = currentMarketplaceTarget();
  marketplaceCurrentTarget.textContent =
    `${target.label}（${target.width}×${target.height}）`;

  document.querySelectorAll("[data-service]").forEach((button) => {
    button.classList.toggle("active", button.dataset.service === marketplaceService);
  });

  document.querySelectorAll("[data-image-type]").forEach((button) => {
    button.classList.toggle("active", button.dataset.imageType === marketplaceImageType);
  });

  document.querySelectorAll("[data-target-card]").forEach((card) => {
    card.classList.toggle("active", card.dataset.targetCard === marketplaceTargetKey());
  });
}

function applyMarketplaceTarget() {
  const target = currentMarketplaceTarget();

  outWidth.value = target.width;
  outHeight.value = target.height;
  previousWidth = target.width;
  previousHeight = target.height;
  updateMarketplaceUi();

  if (!image) {
    outputSize.textContent = `${target.width} × ${target.height} px`;
    return;
  }

  const { cropWidth, cropHeight } = cropSourceSizeForDimensions(
    target.width,
    target.height
  );
  baseScale = baseScaleForCrop(cropWidth, cropHeight);

  const state = marketplaceStates[marketplaceTargetKey()];
  if (state?.initialized) {
    zoom = clamp(state.zoom, MIN_ZOOM, MAX_ZOOM);
    offsetX = state.offsetX;
    offsetY = state.offsetY;
  } else {
    zoom = MIN_ZOOM;
    offsetX = 0;
    offsetY = 0;
  }

  clampOffsets();
  zoomRange.value = String(Math.round(zoom * 100));
  draw();
}

function setMarketplaceTarget(service, imageType) {
  if (!marketplaceMode) return;
  saveMarketplaceState();
  marketplaceService = service;
  marketplaceImageType = imageType;
  applyMarketplaceTarget();
}

function setMarketplaceMode(enabled) {
  if (enabled === marketplaceMode) return;

  if (enabled) {
    normalOutputState = {
      width: Math.max(1, Number(outWidth.value) || 1),
      height: Math.max(1, Number(outHeight.value) || 1),
      lockAspect: lockAspect.checked,
    };

    marketplaceMode = true;
    marketplaceControls.classList.remove("hidden");
    marketplaceZipBtn.classList.remove("hidden");
    processBtn.classList.add("hidden");
    generalPresetBlock.classList.add("hidden");
    lockAspectLabel.classList.add("hidden");
    outWidth.readOnly = true;
    outHeight.readOnly = true;
    applyMarketplaceTarget();
  } else {
    saveMarketplaceState();
    marketplaceMode = false;
    marketplaceControls.classList.add("hidden");
    marketplaceZipBtn.classList.add("hidden");
    processBtn.classList.remove("hidden");
    generalPresetBlock.classList.remove("hidden");
    lockAspectLabel.classList.remove("hidden");
    outWidth.readOnly = false;
    outHeight.readOnly = false;
    lockAspect.checked = normalOutputState.lockAspect;
    setOutputSize(normalOutputState.width, normalOutputState.height);
  }
}

function draw() {
  if (!image) return;

  resizeCanvas();
  clampOffsets();

  const { width: stageWidth, height: stageHeight } = canvasSize();
  const t = currentTransform();

  ctx.clearRect(0, 0, stageWidth, stageHeight);
  ctx.drawImage(image, t.imageLeft, t.imageTop, t.imageWidth, t.imageHeight);

  ctx.save();
  ctx.fillStyle = "rgba(0, 0, 0, 0.58)";
  ctx.fillRect(0, 0, stageWidth, stageHeight);
  ctx.globalCompositeOperation = "destination-out";
  ctx.fillRect(t.cropLeft, t.cropTop, t.cropDisplayWidth, t.cropDisplayHeight);
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.rect(t.cropLeft, t.cropTop, t.cropDisplayWidth, t.cropDisplayHeight);
  ctx.clip();
  ctx.drawImage(image, t.imageLeft, t.imageTop, t.imageWidth, t.imageHeight);
  ctx.restore();

  ctx.strokeStyle = "rgba(255, 255, 255, 0.95)";
  ctx.lineWidth = 1;
  ctx.strokeRect(
    t.cropLeft + 0.5,
    t.cropTop + 0.5,
    t.cropDisplayWidth - 1,
    t.cropDisplayHeight - 1
  );

  ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
  ctx.beginPath();
  ctx.moveTo(t.cropLeft + t.cropDisplayWidth / 3, t.cropTop);
  ctx.lineTo(t.cropLeft + t.cropDisplayWidth / 3, t.cropTop + t.cropDisplayHeight);
  ctx.moveTo(t.cropLeft + t.cropDisplayWidth * 2 / 3, t.cropTop);
  ctx.lineTo(t.cropLeft + t.cropDisplayWidth * 2 / 3, t.cropTop + t.cropDisplayHeight);
  ctx.moveTo(t.cropLeft, t.cropTop + t.cropDisplayHeight / 3);
  ctx.lineTo(t.cropLeft + t.cropDisplayWidth, t.cropTop + t.cropDisplayHeight / 3);
  ctx.moveTo(t.cropLeft, t.cropTop + t.cropDisplayHeight * 2 / 3);
  ctx.lineTo(t.cropLeft + t.cropDisplayWidth, t.cropTop + t.cropDisplayHeight * 2 / 3);
  ctx.stroke();

  const { cropWidth, cropHeight } = cropSourceSize();
  const { width, height } = outputDimensions();

  cropSize.textContent = `${Math.round(cropWidth)} × ${Math.round(cropHeight)} px`;
  outputSize.textContent = `${width} × ${height} px`;
  zoomLabel.textContent = `${Math.round(zoom * 100)}%`;
  saveMarketplaceState();
}

function fitImage() {
  if (!image) return;

  const { cropWidth, cropHeight } = cropSourceSize();
  baseScale = baseScaleForCrop(cropWidth, cropHeight);
  zoom = MIN_ZOOM;
  offsetX = 0;
  offsetY = 0;
  zoomRange.value = String(Math.round(zoom * 100));
  draw();
}

function centerImage() {
  offsetX = 0;
  offsetY = 0;
  clampOffsets();
  draw();
}

function setOutputSize(width, height) {
  outWidth.value = width;
  outHeight.value = height;
  previousWidth = width;
  previousHeight = height;

  if (image) {
    fitImage();
  } else {
    outputSize.textContent = `${width} × ${height} px`;
  }
}

function loadFile(file) {
  if (!file || !file.type.startsWith("image/")) {
    status.textContent = "画像ファイルを選択してください。";
    return;
  }

  if (imageURL) {
    URL.revokeObjectURL(imageURL);
  }

  marketplaceStates = {};
  imageURL = URL.createObjectURL(file);
  image = new Image();

  image.onload = () => {
    sourceSize.textContent = `${image.naturalWidth} × ${image.naturalHeight} px`;
    fileInfo.textContent = `${file.name} — ${image.naturalWidth} × ${image.naturalHeight} px`;
    fileInfo.classList.remove("hidden");
    editor.classList.remove("hidden");
    document.getElementById("emptyPreview").classList.add("hidden");

    if (marketplaceMode) {
      applyMarketplaceTarget();
    } else {
      fitImage();
    }
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

outWidth.addEventListener("input", () => {
  if (marketplaceMode) return;
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
  if (marketplaceMode) return;
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
    if (marketplaceMode) return;
    const [width, height] = button.dataset.size.split("x").map(Number);
    setOutputSize(width, height);
  });
});

sitePreset.addEventListener("change", () => {
  setMarketplaceMode(sitePreset.value === "marketplace");
});

document.querySelectorAll("[data-service]").forEach((button) => {
  button.addEventListener("click", () => {
    setMarketplaceTarget(button.dataset.service, marketplaceImageType);
  });
});

document.querySelectorAll("[data-image-type]").forEach((button) => {
  button.addEventListener("click", () => {
    setMarketplaceTarget(marketplaceService, button.dataset.imageType);
  });
});

document.querySelectorAll("[data-target-card]").forEach((card) => {
  card.addEventListener("click", () => {
    const [service, imageType] = card.dataset.targetCard.split("/");
    setMarketplaceTarget(service, imageType);
  });
});

function setZoom(newZoom, focusX = null, focusY = null) {
  if (!image) return;

  const oldZoom = zoom;
  const nextZoom = clamp(newZoom, MIN_ZOOM, MAX_ZOOM);

  if (focusX !== null && focusY !== null && oldZoom !== nextZoom) {
    const scaleRatio = nextZoom / oldZoom;
    offsetX = focusX + (offsetX - focusX) * scaleRatio;
    offsetY = focusY + (offsetY - focusY) * scaleRatio;
  }

  zoom = nextZoom;
  clampOffsets();
  zoomRange.value = String(Math.round(zoom * 100));
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
  clampOffsets();
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

canvas.addEventListener("wheel", (event) => {
  if (!image) return;
  event.preventDefault();

  const rect = canvas.getBoundingClientRect();
  const mouseX = event.clientX - rect.left - stage.clientWidth / 2;
  const mouseY = event.clientY - rect.top - stage.clientHeight / 2;
  const factor = event.deltaY < 0 ? 1.08 : 1 / 1.08;
  setZoom(zoom * factor, mouseX, mouseY);
}, { passive: false });

format.addEventListener("change", () => {
  qualityWrap.classList.toggle("hidden", format.value === "PNG");
});

function sourceCropForTransform(t) {
  return {
    x: clamp(
      (t.cropLeft - t.imageLeft) / t.scale,
      0,
      Math.max(0, image.naturalWidth - t.cropWidth)
    ),
    y: clamp(
      (t.cropTop - t.imageTop) / t.scale,
      0,
      Math.max(0, image.naturalHeight - t.cropHeight)
    ),
    cropWidth: t.cropWidth,
    cropHeight: t.cropHeight,
  };
}

function sourceCropForMarketplaceTarget(target, state) {
  const { cropWidth, cropHeight } = cropSourceSizeForDimensions(
    target.width,
    target.height
  );
  const targetBaseScale = baseScaleForCrop(cropWidth, cropHeight);
  const targetZoom = clamp(state?.zoom ?? MIN_ZOOM, MIN_ZOOM, MAX_ZOOM);
  const scale = targetBaseScale * targetZoom;
  const targetOffsetX = state?.offsetX ?? 0;
  const targetOffsetY = state?.offsetY ?? 0;

  const maxOffsetX = Math.max(0, ((image.naturalWidth - cropWidth) * scale) / 2);
  const maxOffsetY = Math.max(0, ((image.naturalHeight - cropHeight) * scale) / 2);
  const safeOffsetX = clamp(targetOffsetX, -maxOffsetX, maxOffsetX);
  const safeOffsetY = clamp(targetOffsetY, -maxOffsetY, maxOffsetY);

  return {
    x: clamp(
      (image.naturalWidth - cropWidth) / 2 - safeOffsetX / scale,
      0,
      Math.max(0, image.naturalWidth - cropWidth)
    ),
    y: clamp(
      (image.naturalHeight - cropHeight) / 2 - safeOffsetY / scale,
      0,
      Math.max(0, image.naturalHeight - cropHeight)
    ),
    cropWidth,
    cropHeight,
  };
}

async function currentImageBlob() {
  return fetch(image.src).then((response) => response.blob());
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

processBtn.addEventListener("click", async () => {
  if (!image || marketplaceMode) return;

  const t = currentTransform();
  const { width, height } = outputDimensions();
  const crop = sourceCropForTransform(t);
  status.textContent = "生成中…";

  try {
    const imageBlob = await currentImageBlob();
    const formData = new FormData();
    formData.append("file", imageBlob, "image");
    formData.append("width", String(width));
    formData.append("height", String(height));
    formData.append("x", String(crop.x));
    formData.append("y", String(crop.y));
    formData.append("crop_width", String(crop.cropWidth));
    formData.append("crop_height", String(crop.cropHeight));
    formData.append("output_format", format.value);
    formData.append("quality", String(quality.value || 100));

    const response = await fetch("/process", { method: "POST", body: formData });
    if (!response.ok) {
      let message = "生成に失敗しました。";
      try {
        const json = await response.json();
        if (json.detail) message = json.detail;
      } catch (_) {}
      throw new Error(message);
    }

    const blob = await response.blob();
    const extension = format.value === "JPEG" ? "jpg" : format.value.toLowerCase();
    triggerDownload(blob, `cropped_${Date.now()}.${extension}`);
    status.textContent = "生成しました。ダウンロードを開始します。";
  } catch (error) {
    status.textContent = error.message;
  }
});

marketplaceZipBtn.addEventListener("click", async () => {
  if (!image || !marketplaceMode) return;

  saveMarketplaceState();
  status.textContent = "販売サイト用画像を生成中…";
  marketplaceZipBtn.disabled = true;

  try {
    const imageBlob = await currentImageBlob();
    const formData = new FormData();
    formData.append("file", imageBlob, "image");
    formData.append("output_format", format.value);

    Object.values(MARKETPLACE_TARGETS).forEach((target) => {
      const state = marketplaceStates[`${target.service}/${target.imageType}`];
      const crop = sourceCropForMarketplaceTarget(target, state);
      formData.append(`${target.formPrefix}_x`, String(crop.x));
      formData.append(`${target.formPrefix}_y`, String(crop.y));
      formData.append(`${target.formPrefix}_crop_width`, String(crop.cropWidth));
      formData.append(`${target.formPrefix}_crop_height`, String(crop.cropHeight));
    });

    const response = await fetch("/process-marketplace", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      let message = "販売サイト用ZIPの生成に失敗しました。";
      try {
        const json = await response.json();
        if (json.detail) message = json.detail;
      } catch (_) {}
      throw new Error(message);
    }

    const blob = await response.blob();
    triggerDownload(blob, `marketplace_images_${Date.now()}.zip`);
    status.textContent = "販売サイト用ZIPを生成しました。";
  } catch (error) {
    status.textContent = error.message;
  } finally {
    marketplaceZipBtn.disabled = false;
  }
});

document.getElementById("resetBtn").addEventListener("click", () => {
  fileInput.value = "";
  editor.classList.add("hidden");
  fileInfo.classList.add("hidden");
  image = null;
  marketplaceStates = {};
  zoom = MIN_ZOOM;
  offsetX = 0;
  offsetY = 0;
  zoomRange.value = String(MIN_ZOOM * 100);

  if (imageURL) {
    URL.revokeObjectURL(imageURL);
  }

  imageURL = null;
  status.textContent = "";
});

window.addEventListener("resize", () => {
  if (!image) return;

  if (marketplaceMode) {
    saveMarketplaceState();
    applyMarketplaceTarget();
  } else {
    fitImage();
  }
});

format.dispatchEvent(new Event("change"));
