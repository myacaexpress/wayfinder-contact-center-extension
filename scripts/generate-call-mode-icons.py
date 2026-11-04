"""Render the Wayfinder Sora Bold W using existing brand assets.

Optional authoring dependencies: Pillow, fonttools[woff]. Generated PNGs are
committed; packaging and production builds do not install these dependencies.
"""
from io import BytesIO
from pathlib import Path

from fontTools.ttLib import TTFont
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
font = TTFont(ROOT / "assets/fonts/sora-latin-700.woff2")
font.flavor = None
buffer = BytesIO()
font.save(buffer)
for size in (16, 32, 48, 128):
    scale = 4
    canvas = size * scale
    face = ImageFont.truetype(BytesIO(buffer.getvalue()), round(canvas * .76))
    image = Image.new("RGB", (canvas, canvas), "#0E7C78")
    draw = ImageDraw.Draw(image)
    left, top, right, bottom = draw.textbbox((0, 0), "W", font=face)
    draw.text(((canvas - (right - left)) / 2 - left,
               (canvas - (bottom - top)) / 2 - top), "W", font=face, fill="white")
    image.resize((size, size), Image.Resampling.LANCZOS).save(
        ROOT / f"extensions/allcalls-mode/icons/icon-{size}.png")
