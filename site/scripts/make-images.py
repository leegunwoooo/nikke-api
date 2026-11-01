"""Regenerate the site's raster assets (run by hand, outputs are committed):
  public/og.png              1200x630 share card (text only — no game art)
  public/apple-touch-icon.png 180x180
  public/favicon.ico         16/32/48
public/favicon.svg is hand-written. Colors follow the --nk-* tokens in
.vitepress/theme/custom.css. Needs Pillow and a Korean font (macOS: Apple SD
Gothic Neo; override with FONT=/path/to/font).

  python3 site/scripts/make-images.py
"""
import os
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

PUBLIC = Path(__file__).resolve().parent.parent / "public"
FONT = os.environ.get("FONT", "/System/Library/Fonts/AppleSDGothicNeo.ttc")

BG = "#1b1b1f"
SURFACE = "#25252b"
TEXT = "#f2f2f4"
MUTED = "#a6a6ae"
ACCENT = "#c93a53"
ACCENT_TEXT = "#ef6a80"


def font(size, bold=True):
    # Apple SD Gothic Neo .ttc: index 6 = Bold, 0 = Regular
    try:
        return ImageFont.truetype(FONT, size, index=6 if bold else 0)
    except OSError:
        return ImageFont.truetype(FONT, size)


def icon(size):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=round(size * 0.22), fill=ACCENT)
    f = font(round(size * 0.62))
    d.text((size / 2, size / 2 + size * 0.02), "N", font=f, fill="#ffffff", anchor="mm")
    return img


def og():
    w, h = 1200, 630
    img = Image.new("RGB", (w, h), BG)
    d = ImageDraw.Draw(img)
    pad = 88
    d.rectangle([0, 0, 12, h], fill=ACCENT)
    d.text((pad, 92), "nikke-api · 비공식 팬 프로젝트", font=font(30, bold=False), fill=MUTED)
    d.text((pad, 168), "니케 데이터를", font=font(84), fill=TEXT)
    d.text((pad, 270), "AI에게 물어보세요", font=font(84), fill=TEXT)
    d.text((pad, 400), "ChatGPT·Claude에 주소 하나로 연결하는 MCP 서버 · REST API", font=font(32, bold=False), fill=MUTED)
    chips = ["캐릭터·스킬", "스토리 대본", "감상 순서", "소장품"]
    x = pad
    for c in chips:
        f = font(28)
        tw = d.textlength(c, font=f)
        d.rounded_rectangle([x, 488, x + tw + 44, 540], radius=26, fill=SURFACE)
        d.text((x + 22, 514), c, font=f, fill=ACCENT_TEXT, anchor="lm")
        x += tw + 44 + 16
    img.paste(icon(96), (w - pad - 96, 84), icon(96))
    return img


if __name__ == "__main__":
    PUBLIC.mkdir(exist_ok=True)
    og().save(PUBLIC / "og.png", optimize=True)
    icon(180).save(PUBLIC / "apple-touch-icon.png", optimize=True)
    icon(48).save(PUBLIC / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])
    print("wrote og.png, apple-touch-icon.png, favicon.ico")
