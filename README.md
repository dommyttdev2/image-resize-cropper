
# Image Resize & Cropper

FastAPI + Pillow + HTML/CSS/JavaScript で動作する画像リサイズ・クロップWebアプリです。

## 起動

Python 3.10 以上を推奨します。

```bash
python -m venv .venv
```

Windows:

```powershell
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python -m uvicorn app:app --host 127.0.0.1 --port 8000
```

Linux/macOS:

```bash
source .venv/bin/activate
pip install -r requirements.txt
python -m uvicorn app:app --host 127.0.0.1 --port 8000
```

ブラウザで http://127.0.0.1:8000/ を開きます。

LAN内の別PCからアクセスする場合:

```bash
python -m uvicorn app:app --host 0.0.0.0 --port 8000
```

その場合は `http://サーバーのIP:8000/` にアクセスします。

## 機能

- 画像のドラッグ＆ドロップ
- 任意の出力幅・高さ
- 1:1、16:9、9:16等のプリセット
- アスペクト比固定
- プレビュー上でドラッグして位置調整
- マウスホイールによるズーム
- フィット / 中央ボタン
- Lanczosによる高品質リサイズ
- PNG / JPEG / WebP
- JPEG / WebP品質指定
- EXIF回転情報の自動補正
- 最大100MBの入力画像
- クロップ領域外を透過（PNG）または黒（JPEG等）で補完

## 注意

出力サイズが元画像より大きい場合もLanczosで拡大します。

## Windows

プロジェクト直下の `.venv` を使用する場合は `run.bat` をダブルクリックして起動できます。
