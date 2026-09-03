
from io import BytesIO
from pathlib import Path
import uuid

from fastapi import FastAPI, File, Form, UploadFile, HTTPException
from fastapi.responses import HTMLResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from PIL import Image, ImageOps

BASE_DIR = Path(__file__).resolve().parent

app = FastAPI(title="Image Resize & Cropper")
app.mount("/static", StaticFiles(directory=BASE_DIR / "static"), name="static")

ALLOWED = {"JPEG", "PNG", "WEBP", "GIF", "BMP", "TIFF"}

@app.get("/", response_class=HTMLResponse)
async def index():
    return (BASE_DIR / "templates" / "index.html").read_text(encoding="utf-8")

@app.post("/process")
async def process_image(
    file: UploadFile = File(...),
    width: int = Form(...),
    height: int = Form(...),
    x: float = Form(...),
    y: float = Form(...),
    crop_width: float = Form(...),
    crop_height: float = Form(...),
    output_format: str = Form("PNG"),
    quality: int = Form(95),
):
    if width < 1 or height < 1 or width > 20000 or height > 20000:
        raise HTTPException(400, "出力サイズが不正です。")
    if crop_width <= 0 or crop_height <= 0:
        raise HTTPException(400, "クロップ範囲が不正です。")

    raw = await file.read()
    if len(raw) > 100 * 1024 * 1024:
        raise HTTPException(413, "画像サイズは100MB以下にしてください。")

    try:
        img = Image.open(BytesIO(raw))
        img = ImageOps.exif_transpose(img)
        img.load()
    except Exception:
        raise HTTPException(400, "画像を読み込めませんでした。")

    # CSS上の表示座標ではなく、元画像上の座標を想定。
    # 範囲外は黒/透明で補完できるようにする。
    if img.mode not in ("RGB", "RGBA"):
        if "A" in img.getbands():
            img = img.convert("RGBA")
        else:
            img = img.convert("RGB")

    # クロップ領域を整数化し、必要ならキャンバス外も許容
    left = round(x)
    top = round(y)
    right = round(x + crop_width)
    bottom = round(y + crop_height)

    if right <= left or bottom <= top:
        raise HTTPException(400, "クロップ範囲が不正です。")

    if img.mode == "RGBA":
        bg = (0, 0, 0, 0)
    else:
        bg = (0, 0, 0)

    crop = Image.new(img.mode, (right - left, bottom - top), bg)
    src_left = max(0, left)
    src_top = max(0, top)
    src_right = min(img.width, right)
    src_bottom = min(img.height, bottom)

    if src_right > src_left and src_bottom > src_top:
        part = img.crop((src_left, src_top, src_right, src_bottom))
        crop.paste(part, (src_left - left, src_top - top))

    result = crop.resize((width, height), Image.Resampling.LANCZOS)

    fmt = output_format.upper()
    if fmt not in {"PNG", "JPEG", "WEBP"}:
        raise HTTPException(400, "出力形式が不正です。")

    if fmt == "JPEG":
        if result.mode == "RGBA":
            bg_img = Image.new("RGB", result.size, "white")
            bg_img.paste(result, mask=result.getchannel("A"))
            result = bg_img
        elif result.mode != "RGB":
            result = result.convert("RGB")
    elif fmt == "WEBP":
        if result.mode not in ("RGB", "RGBA"):
            result = result.convert("RGBA" if "A" in result.getbands() else "RGB")

    out = BytesIO()
    save_kwargs = {}
    if fmt in {"JPEG", "WEBP"}:
        save_kwargs["quality"] = max(1, min(100, quality))
        save_kwargs["method"] = 6 if fmt == "WEBP" else 0

    result.save(out, format=fmt, **save_kwargs)
    out.seek(0)

    ext = fmt.lower()
    if ext == "jpeg":
        ext = "jpg"
    filename = f"cropped_{uuid.uuid4().hex[:8]}.{ext}"

    media = {
        "PNG": "image/png",
        "JPEG": "image/jpeg",
        "WEBP": "image/webp",
    }[fmt]

    return StreamingResponse(
        out,
        media_type=media,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )
