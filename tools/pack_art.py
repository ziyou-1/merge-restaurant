"""把 art-src/ 里的雪碧图整理进工程：缩放、256 色量化压缩、按网格算出每格的紧贴矩形，
写到 assets/resources/art/（12 张 png + atlas.json）。

用法：python tools/pack_art.py   （需要 Pillow：pip install pillow）
换图：把新的雪碧图按同名放进 art-src/，格数和顺序见下面 SHEETS，再跑一次即可；
      改完后在编辑器里刷新资源（或 GET http://127.0.0.1:7457/refresh）。

雪碧图约定（gpt-image-2 出图时的提示词也是这么写的）：
  物品链  items_*        4 列 × 2 行，顺序 = 1~7 级 + 生成器，透明底
  区域    area_*         3 列 × 2 行，顺序 = 装修状态 0~5（多出来的格子不用）
  剧情角色 chars_story    2 × 2，顺序见 SHEETS
  顾客    chars_customers 3 × 2，顺序要和 GameConfig.ORDER.customers 一致
  UI      ui_panels 3 × 2（面板/卡片/木托盘/空格/按钮底/纸面板，运行时九宫格拉伸）；ui_icons 4 × 2；bg_wallpaper 整张
"""
import json
import os
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "..", "art-src")
DST = os.path.join(HERE, "..", "assets", "resources", "art")
os.makedirs(DST, exist_ok=True)

# name -> (cols, rows, scale, keys in reading order)
LEVELS = ["1", "2", "3", "4", "5", "6", "7", "gen"]
STATES = ["0", "1", "2", "3", "4", "5"]
SHEETS = {
    "items_bread": (4, 2, 0.5, LEVELS),
    "items_drink": (4, 2, 0.5, LEVELS),
    "items_veg": (4, 2, 0.5, LEVELS),
    "items_meat": (4, 2, 0.5, LEVELS),
    "items_dessert": (4, 2, 0.5, LEVELS),
    "items_coffee": (4, 2, 0.5, LEVELS),
    "area_facade": (3, 2, 0.75, STATES),
    "area_hall": (3, 2, 0.75, STATES),
    "area_kitchen": (3, 2, 0.75, STATES),
    "area_bar": (3, 2, 0.75, STATES),
    "area_garden": (3, 2, 0.75, STATES),
    # 第二章
    "area_terrace": (3, 2, 0.75, STATES),
    "area_coffee": (3, 2, 0.75, STATES),
    "area_kids": (3, 2, 0.75, STATES),
    "area_delivery": (3, 2, 0.75, STATES),
    "area_room": (3, 2, 0.75, STATES),
    "chars_story": (2, 2, 0.5, ["小美", "隔壁老王", "工人师傅", "美食博主"]),
    "chars_customers": (3, 2, 0.5, ["阿强", "王阿姨", "李老板", "豆豆", "张教授", "外卖小哥"]),
    # UI：九宫格面板 3×2、图标 4×2、整张壁纸 1×1
    "ui_panels": (3, 2, 0.6, ["panel", "card", "tray", "slot", "button", "paper"]),
    "ui_icons": (4, 2, 0.5, ["coin", "energy", "star", "lock", "check", "tools", "heart", "arrow"]),
    "bg_wallpaper": (1, 1, 0.75, ["bg"]),
}

atlas = {"sheets": {}}
total = 0
for name, (cols, rows, scale, keys) in SHEETS.items():
    im = Image.open(os.path.join(SRC, name + ".png")).convert("RGBA")
    if scale != 1:
        im = im.resize((round(im.width * scale), round(im.height * scale)), Image.LANCZOS)
    W, H = im.size
    cw, ch = W / cols, H / rows
    alpha = im.getchannel("A").point(lambda a: 255 if a > 24 else 0)
    frames = {}
    for i, key in enumerate(keys):
        cx, cy = i % cols, i // cols
        x0, y0 = round(cx * cw), round(cy * ch)
        x1, y1 = round((cx + 1) * cw), round((cy + 1) * ch)
        bbox = alpha.crop((x0, y0, x1, y1)).getbbox()
        if not bbox:
            print(f"  ! {name}[{key}] 空格子")
            continue
        pad = 2
        bx0 = max(x0, x0 + bbox[0] - pad)
        by0 = max(y0, y0 + bbox[1] - pad)
        bx1 = min(x1, x0 + bbox[2] + pad)
        by1 = min(y1, y0 + bbox[3] + pad)
        frames[key] = [bx0, by0, bx1 - bx0, by1 - by0]
    # 量化成 256 色调色板 PNG，体积降 60-70%，透明保留
    q = im.quantize(colors=256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.FLOYDSTEINBERG)
    out = os.path.join(DST, name + ".png")
    q.save(out, optimize=True)
    size = os.path.getsize(out)
    total += size
    atlas["sheets"][name] = {"w": W, "h": H, "frames": frames}
    print(f"{name}: {W}x{H} {len(frames)} 格 {size / 1024:.0f} KB")

with open(os.path.join(DST, "atlas.json"), "w", encoding="utf-8") as f:
    json.dump(atlas, f, ensure_ascii=False, separators=(",", ":"))
print(f"合计 {total / 1024 / 1024:.2f} MB -> {os.path.normpath(DST)}")
