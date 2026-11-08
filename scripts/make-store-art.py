# -*- coding: utf-8 -*-
"""从应用图标和实机截图生成 Microsoft Store 封面、主视觉、方形图和徽标。

用法（需要 Pillow）：
    python scripts/make-store-art.py [--version 0.1.3]
输出到 artifacts/marketing/covers/<version>/。只使用应用图标和
store-screenshots 目录里的真实截图，不含任何游戏官方美术。
"""
import argparse
import os
from PIL import Image, ImageDraw, ImageFont, ImageFilter

VERSION = '0.1.3'

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def out_dir():
    return os.path.join(ROOT, 'artifacts', 'marketing', 'covers', VERSION)


def shots_dir():
    return os.path.join(ROOT, 'src-tauri', 'target', 'release', VERSION, 'store-screenshots')


ICON = os.path.join(ROOT, 'src-tauri', 'icons', '1024x1024.png')
FONT_BOLD = r'C:\Windows\Fonts\msyhbd.ttc'
FONT_REG = r'C:\Windows\Fonts\msyh.ttc'

TEAL_DARK = (18, 58, 58)
TEAL = (85, 173, 156)
TEAL_LIGHT = (120, 201, 181)
RED = (255, 41, 41)
WHITE = (255, 255, 255)


def font(path, size):
    return ImageFont.truetype(path, size)


def vertical_gradient(size, top, bottom):
    w, h = size
    img = Image.new('RGB', (1, h))
    px = img.load()
    for y in range(h):
        t = y / max(1, h - 1)
        px[0, y] = tuple(round(top[i] + (bottom[i] - top[i]) * t) for i in range(3))
    return img.resize((w, h), Image.BILINEAR)


def add_soft_glow(img, box, color, blur=90, alpha=110):
    layer = Image.new('RGBA', img.size, (0, 0, 0, 0))
    ImageDraw.Draw(layer).ellipse(box, fill=color + (alpha,))
    img.alpha_composite(layer.filter(ImageFilter.GaussianBlur(blur)))


def rounded_mask(size, radius, feather=0):
    m = Image.new('L', size, 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, size[0] - 1, size[1] - 1), radius=radius, fill=255)
    if feather:
        m = m.filter(ImageFilter.GaussianBlur(feather))
    return m


def paste_screenshot(canvas, shot_path, target_w, radius, xy, shadow=True):
    shot = Image.open(shot_path).convert('RGBA')
    scale = target_w / shot.width
    shot = shot.resize((target_w, round(shot.height * scale)), Image.LANCZOS)
    pad = max(4, target_w // 190)
    framed = Image.new('RGBA', (shot.width + pad * 2, shot.height + pad * 2), (0, 0, 0, 0))
    framed.paste(shot, (pad, pad), rounded_mask(shot.size, radius, feather=1))
    frame = Image.new('RGBA', framed.size, WHITE + (34,))
    fmask = rounded_mask(framed.size, radius + pad, feather=1)
    framed.alpha_composite(Image.composite(frame, Image.new('RGBA', framed.size, (0, 0, 0, 0)), fmask))
    mask = rounded_mask(framed.size, radius + pad, feather=1)
    if shadow:
        sh = Image.new('RGBA', canvas.size, (0, 0, 0, 0))
        ImageDraw.Draw(sh).rounded_rectangle(
            (xy[0] + 10, xy[1] + 18, xy[0] + framed.width + 10, xy[1] + framed.height + 18),
            radius=radius + pad, fill=(0, 0, 0, 120),
        )
        canvas.alpha_composite(sh.filter(ImageFilter.GaussianBlur(28)))
    canvas.paste(framed, xy, mask)


def draw_rule(d, x, y, w, color, thickness=4):
    d.rounded_rectangle((x, y, x + w, y + thickness), radius=thickness // 2,
                        fill=tuple(color) + (255,))


def text_with_shadow(d, xy, text, f, fill, shadow=(0, 0, 0, 90), offset=(0, 3)):
    d.text((xy[0] + offset[0], xy[1] + offset[1]), text, font=f, fill=shadow)
    d.text(xy, text, font=f, fill=fill)


def make_poster(path, w=1440, h=2160):
    """2:3 poster art; title in the upper two-thirds per the Store rule."""
    img = vertical_gradient((w, h), (10, 34, 36), (6, 20, 24)).convert('RGBA')
    add_soft_glow(img, (int(w * 0.18), int(h * 0.20), int(w * 0.95), int(h * 0.52)), TEAL, 140, 150)
    add_soft_glow(img, (-int(w * 0.4), int(h * 0.62), int(w * 0.5), int(h * 0.95)), TEAL_DARK, 160, 160)
    d = ImageDraw.Draw(img)
    for x in range(0, w, 72):
        d.line((x, 0, x, h), fill=(255, 255, 255, 5), width=1)
    for y in range(0, h, 72):
        d.line((0, y, w, y), fill=(255, 255, 255, 5), width=1)

    d.rounded_rectangle((96, 120, 110, 212), radius=7, fill=RED + (255,))
    d.text((134, 118), '萌新工具箱', font=font(FONT_BOLD, 62), fill=WHITE + (255,))
    d.text((136, 196), f'MxTools  ·  {VERSION}', font=font(FONT_REG, 40), fill=(120, 201, 181, 235))

    icon = Image.open(ICON).convert('RGBA').resize((330, 330), Image.LANCZOS)
    img.alpha_composite(icon, (96, 300))

    f_title = font(FONT_BOLD, 118)
    text_with_shadow(d, (96, 706), '游戏配置', f_title, WHITE + (255,))
    text_with_shadow(d, (96, 838), '一个工具箱搞定', f_title, WHITE + (255,))
    draw_rule(d, 100, 1000, 240, RED, 8)
    d.text((96, 1044), 'Apex  ·  PUBG  ·  Windows 工具', font=font(FONT_REG, 54), fill=(196, 232, 224, 240))

    paste_screenshot(img, os.path.join(shots_dir(), '02-apex-video.png'), 1152, 18, (96, 1140))

    f_badge = font(FONT_BOLD, 44)
    fy, bx = 2008, 96
    for label in ['完全免费', '无广告', '不收集遥测']:
        tw = d.textlength(label, font=f_badge)
        d.rounded_rectangle((bx, fy, bx + tw + 60, fy + 76), radius=38, outline=TEAL_LIGHT + (200,), width=3)
        d.text((bx + 30, fy + 12), label, font=f_badge, fill=(214, 240, 234, 255))
        bx += tw + 84
    img.convert('RGB').save(path, 'PNG', optimize=True)


def make_hero(path, w=1920, h=1080):
    img = vertical_gradient((w, h), (12, 40, 42), (7, 22, 26)).convert('RGBA')
    add_soft_glow(img, (int(w * 0.40), int(h * 0.05), int(w * 1.05), int(h * 0.85)), TEAL, 150, 140)
    d = ImageDraw.Draw(img)
    for x in range(0, w, 80):
        d.line((x, 0, x, h), fill=(255, 255, 255, 5), width=1)
    for y in range(0, h, 80):
        d.line((0, y, w, y), fill=(255, 255, 255, 5), width=1)

    icon = Image.open(ICON).convert('RGBA').resize((150, 150), Image.LANCZOS)
    img.alpha_composite(icon, (96, 82))
    d.rounded_rectangle((270, 118, 280, 196), radius=5, fill=RED + (255,))
    d.text((300, 112), '萌新工具箱', font=font(FONT_BOLD, 72), fill=WHITE + (255,))
    d.text((302, 196), 'MxTools  ·  Apex / PUBG 配置与 Windows 工具',
           font=font(FONT_REG, 38), fill=(186, 226, 217, 245))

    f_big = font(FONT_BOLD, 92)
    text_with_shadow(d, (96, 356), '可视化改配置', f_big, WHITE + (255,))
    text_with_shadow(d, (96, 462), '新手也能一键上手', f_big, WHITE + (255,))
    draw_rule(d, 100, 592, 200, RED, 7)

    paste_screenshot(img, os.path.join(shots_dir(), '01-apex-launch.png'), 980, 16, (872, 330))
    paste_screenshot(img, os.path.join(shots_dir(), '05-pubg.png'), 680, 14, (96, 686))
    img.convert('RGB').save(path, 'PNG', optimize=True)


def make_box(path, size=2160):
    img = vertical_gradient((size, size), (11, 36, 38), (6, 20, 24)).convert('RGBA')
    add_soft_glow(img, (int(size * 0.15), int(size * 0.1), int(size * 0.95), int(size * 0.7)), TEAL, 170, 150)
    d = ImageDraw.Draw(img)
    icon = Image.open(ICON).convert('RGBA').resize((560, 560), Image.LANCZOS)
    img.alpha_composite(icon, ((size - 560) // 2, 190))
    f_title = font(FONT_BOLD, 150)
    tw = d.textlength('萌新工具箱', font=f_title)
    text_with_shadow(d, ((size - tw) / 2, 830), '萌新工具箱', f_title, WHITE + (255,))
    f_sub = font(FONT_REG, 66)
    s = 'Apex · PUBG · Windows'
    d.text(((size - d.textlength(s, font=f_sub)) / 2, 1040), s, font=f_sub, fill=(186, 226, 217, 245))
    draw_rule(d, (size - 300) // 2, 1160, 300, RED, 10)
    paste_screenshot(img, os.path.join(shots_dir(), '02-apex-video.png'), 1680, 18, ((size - 1680) // 2, 1180))
    img.convert('RGB').save(path, 'PNG', optimize=True)


def make_square_logo(path, size):
    """1:1 Store listing logo: the app icon on transparent, with safe padding."""
    pad = int(size * 0.12)
    icon = Image.open(ICON).convert('RGBA').resize((size - pad * 2, size - pad * 2), Image.LANCZOS)
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    img.alpha_composite(icon, (pad, pad))
    img.save(path, 'PNG', optimize=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='生成 Microsoft Store 图片素材')
    parser.add_argument('--version', default=VERSION, help='应用版本，决定截图与输出目录')
    globals()['VERSION'] = parser.parse_args().version
    if not os.path.isdir(shots_dir()):
        raise SystemExit(f'找不到截图目录：{shots_dir()}')
    os.makedirs(out_dir(), exist_ok=True)
    prefix = f'mxtools-{VERSION}-store-'
    jobs = [
        (make_poster, prefix + 'poster-1440x2160.png'),
        (make_hero, prefix + 'hero-1920x1080.png'),
        (make_box, prefix + 'boxart-2160x2160.png'),
        (lambda p: make_square_logo(p, 1080), prefix + 'logo-1080x1080.png'),
        (lambda p: make_square_logo(p, 300), prefix + 'logo-300x300.png'),
    ]
    for fn, name in jobs:
        p = os.path.join(out_dir(), name)
        fn(p)
        print(name, Image.open(p).size, os.path.getsize(p) // 1024, 'KB')
