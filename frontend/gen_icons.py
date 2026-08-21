from PIL import Image, ImageDraw, ImageFont
import os

OUT = "/home/claude/meal-planner-app/public/icons"
os.makedirs(OUT, exist_ok=True)

INDIGO = (44, 74, 107, 255)
PORCELAIN = (238, 241, 239, 255)
WHEAT = (201, 154, 62, 255)

FONT_PATH = "/usr/share/fonts/opentype/noto/NotoSerifCJK-Bold.ttc"

def make_icon(size, path, maskable=False):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    if maskable:
        # maskable 图标需要留安全边距，背景铺满
        draw.rectangle([0, 0, size, size], fill=INDIGO)
        pad = size * 0.22
    else:
        radius = size * 0.22
        draw.rounded_rectangle([0, 0, size, size], radius=radius, fill=INDIGO)
        pad = size * 0.14

    # 一个简单的碗形状（弧线）作为图形符号
    bowl_top = size * 0.52
    bowl_bottom = size * 0.74
    draw.pieslice(
        [pad, bowl_top - (size - 2 * pad) * 0.25, size - pad, bowl_top + (size - 2 * pad) * 0.55],
        0, 180, fill=PORCELAIN,
    )
    draw.rectangle([pad + size * 0.02, bowl_top, size - pad - size * 0.02, bowl_bottom], fill=PORCELAIN)
    # 碗沿的一条金线
    draw.rectangle([pad, bowl_top - size * 0.015, size - pad, bowl_top + size * 0.015], fill=WHEAT)

    # 顶部小字 "食"
    try:
        font = ImageFont.truetype(FONT_PATH, int(size * 0.28))
        text = "食"
        bbox = draw.textbbox((0, 0), text, font=font)
        tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
        draw.text(
            ((size - tw) / 2 - bbox[0], size * 0.14 - bbox[1]),
            text, font=font, fill=PORCELAIN,
        )
    except Exception as e:
        print("font render skipped:", e)

    img.save(path)
    print("saved", path)

make_icon(192, f"{OUT}/icon-192.png")
make_icon(512, f"{OUT}/icon-512.png")
make_icon(512, f"{OUT}/icon-512-maskable.png", maskable=True)
