from io import BytesIO
from pathlib import Path
import uuid
import zipfile

from fastapi import FastAPI, File, Form, UploadFile, HTTPException
from fastapi.responses import HTMLResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from PIL import Image, ImageOps

BASE_DIR = Path(__file__).resolve().parent

app = FastAPI(title="Image Resize & Cropper")
app.mount("/static", StaticFiles(directory=BASE_DIR / "static"), name="static")

OUTPUT_FORMATS = {"PNG", "JPEG", "WEBP"}
MARKETPLACE_TARGETS = (
    ("FANZA", "package", 560, 420),
    ("FANZA", "thumbnail", 100, 100),
    ("DLsite", "package", 560, 420),
    ("DLsite", "thumbnail", 300, 300),
)


@app.get("/", response_class=HTMLResponse)
async def index():
    return HTMLResponse(
        content=(BASE_DIR / "templates" / "index.html").read_text(encoding="utf-8"),
        headers={"Cache-Control": "no-store, max-age=0"},
    )


def load_image(raw: bytes) -> Image.Image:
    if len(raw) > 100 * 1024 * 1024:
        raise HTTPException(413, "画像サイズは100MB以下にしてください。")

    try:
        img = Image.open(BytesIO(raw))
        img = ImageOps.exif_transpose(img)
        img.load()
    except Exception:
        raise HTTPException(400, "画像を読み込めませんでした。")

    if img.mode not in ("RGB", "RGBA"):
        if "A" in img.getbands():
            img = img.convert("RGBA")
        else:
            img = img.convert("RGB")

    return img


def crop_and_resize(
    img: Image.Image,
    *,
    width: int,
    height: int,
    x: float,
    y: float,
    crop_width: float,
    crop_height: float,
) -> Image.Image:
    if width < 1 or height < 1 or width > 20000 or height > 20000:
        raise HTTPException(400, "出力サイズが不正です。")
    if crop_width <= 0 or crop_height <= 0:
        raise HTTPException(400, "クロップ範囲が不正です。")

    crop_w = round(crop_width)
    crop_h = round(crop_height)
    if crop_w <= 0 or crop_h <= 0:
        raise HTTPException(400, "クロップ範囲が不正です。")

    crop_w = min(crop_w, img.width)
    crop_h = min(crop_h, img.height)

    max_left = max(0, img.width - crop_w)
    max_top = max(0, img.height - crop_h)

    left = min(max(0, round(x)), max_left)
    top = min(max(0, round(y)), max_top)
    right = left + crop_w
    bottom = top + crop_h

    result = img.crop((left, top, right, bottom))
    return result.resize((width, height), Image.Resampling.LANCZOS)


def normalized_format(output_format: str) -> str:
    fmt = output_format.upper()
    if fmt not in OUTPUT_FORMATS:
        raise HTTPException(400, "出力形式が不正です。")
    return fmt


def encode_image(result: Image.Image, fmt: str) -> bytes:
    if fmt == "JPEG":
        if result.mode == "RGBA":
            bg_img = Image.new("RGB", result.size, "white")
            bg_img.paste(result, mask=result.getchannel("A"))
            result = bg_img
        elif result.mode != "RGB":
            result = result.convert("RGB")
    elif fmt == "WEBP" and result.mode not in ("RGB", "RGBA"):
        result = result.convert("RGBA" if "A" in result.getbands() else "RGB")

    out = BytesIO()
    save_kwargs = {}
    if fmt == "JPEG":
        save_kwargs["quality"] = 100
    elif fmt == "WEBP":
        save_kwargs["quality"] = 100
        save_kwargs["method"] = 6

    result.save(out, format=fmt, **save_kwargs)
    return out.getvalue()


def format_extension(fmt: str) -> str:
    return "jpg" if fmt == "JPEG" else fmt.lower()


@app.post("/process")
async def process_image(
    file: UploadFile = File(...),
    width: int = Form(...),
    height: int = Form(...),
    x: float = Form(...),
    y: float = Form(...),
    crop_width: float = Form(...),
    crop_height: float = Form(...),
    output_format: str = Form("JPEG"),
):
    raw = await file.read()
    img = load_image(raw)
    fmt = normalized_format(output_format)

    result = crop_and_resize(
        img,
        width=width,
        height=height,
        x=x,
        y=y,
        crop_width=crop_width,
        crop_height=crop_height,
    )
    encoded = encode_image(result, fmt)

    filename = f"cropped_{uuid.uuid4().hex[:8]}.{format_extension(fmt)}"
    media = {
        "PNG": "image/png",
        "JPEG": "image/jpeg",
        "WEBP": "image/webp",
    }[fmt]

    return StreamingResponse(
        BytesIO(encoded),
        media_type=media,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.post("/process-marketplace")
async def process_marketplace(
    file: UploadFile = File(...),
    output_format: str = Form("JPEG"),
    fanza_package_x: float = Form(...),
    fanza_package_y: float = Form(...),
    fanza_package_crop_width: float = Form(...),
    fanza_package_crop_height: float = Form(...),
    fanza_thumbnail_x: float = Form(...),
    fanza_thumbnail_y: float = Form(...),
    fanza_thumbnail_crop_width: float = Form(...),
    fanza_thumbnail_crop_height: float = Form(...),
    dlsite_package_x: float = Form(...),
    dlsite_package_y: float = Form(...),
    dlsite_package_crop_width: float = Form(...),
    dlsite_package_crop_height: float = Form(...),
    dlsite_thumbnail_x: float = Form(...),
    dlsite_thumbnail_y: float = Form(...),
    dlsite_thumbnail_crop_width: float = Form(...),
    dlsite_thumbnail_crop_height: float = Form(...),
):
    raw = await file.read()
    img = load_image(raw)
    fmt = normalized_format(output_format)
    ext = format_extension(fmt)

    crop_params = {
        ("FANZA", "package"): (
            fanza_package_x,
            fanza_package_y,
            fanza_package_crop_width,
            fanza_package_crop_height,
        ),
        ("FANZA", "thumbnail"): (
            fanza_thumbnail_x,
            fanza_thumbnail_y,
            fanza_thumbnail_crop_width,
            fanza_thumbnail_crop_height,
        ),
        ("DLsite", "package"): (
            dlsite_package_x,
            dlsite_package_y,
            dlsite_package_crop_width,
            dlsite_package_crop_height,
        ),
        ("DLsite", "thumbnail"): (
            dlsite_thumbnail_x,
            dlsite_thumbnail_y,
            dlsite_thumbnail_crop_width,
            dlsite_thumbnail_crop_height,
        ),
    }

    zip_buffer = BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        # Each marketplace target is rendered independently by design.
        # Do not reuse another target's rendered bytes even when dimensions match.
        for service, image_type, width, height in MARKETPLACE_TARGETS:
            x, y, crop_width, crop_height = crop_params[(service, image_type)]
            result = crop_and_resize(
                img,
                width=width,
                height=height,
                x=x,
                y=y,
                crop_width=crop_width,
                crop_height=crop_height,
            )
            encoded = encode_image(result, fmt)
            archive.writestr(f"{service}/{image_type}.{ext}", encoded)

    zip_buffer.seek(0)
    filename = f"marketplace_images_{uuid.uuid4().hex[:8]}.zip"
    return StreamingResponse(
        zip_buffer,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
