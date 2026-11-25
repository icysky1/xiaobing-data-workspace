"""生成小兵题库 App 图标（无第三方依赖，纯 zlib 手写 PNG）。
设计：青瓷绿渐变底 + 米色卷轴 + 深绿文字线 + 金色印章块，对应小程序配色。
"""
import struct, zlib, math, os

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'quiz-app', 'icons')
os.makedirs(OUT, exist_ok=True)

def lerp(a, b, t):
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3))

def in_round_rect(x, y, x0, y0, x1, y1, r):
    if x < x0 or x > x1 or y < y0 or y > y1:
        return False
    cx = min(max(x, x0 + r), x1 - r)
    cy = min(max(y, y0 + r), y1 - r)
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r

def render(size, ss=3):
    """ss: 超采样倍数，用于抗锯齿"""
    W = size * ss
    px = [[(0, 0, 0, 0)] * W for _ in range(W)]

    top = (0x7c, 0xb8, 0x97)
    bot = (0x45, 0x6f, 0x60)
    pad = W * 0.02
    radius = W * 0.22

    # 卷轴（米色卡片）
    cx0, cy0 = W * 0.235, W * 0.175
    cx1, cy1 = W * 0.765, W * 0.825
    crad = W * 0.055

    # 印章（金色方块）
    sx0, sy0 = W * 0.60, W * 0.66
    sx1, sy1 = W * 0.745, W * 0.805

    for y in range(W):
        for x in range(W):
            # 背景圆角方块
            if not in_round_rect(x, y, pad, pad, W - pad, W - pad, radius):
                continue
            t = y / (W - 1)
            col = lerp(top, bot, t)
            # 卷轴
            if in_round_rect(x, y, cx0, cy0, cx1, cy1, crad):
                col = (0xfb, 0xf7, 0xe8)
                # 文字线
                rel = (y - cy0) / (cy1 - cy0)
                inset_l = cx0 + (cx1 - cx0) * 0.11
                inset_r = cx1 - (cx1 - cx0) * 0.11
                line_bands = [(0.16, 0.215), (0.30, 0.355), (0.44, 0.495), (0.58, 0.635)]
                for a, b in line_bands:
                    if a <= rel <= b and inset_l <= x <= inset_r:
                        # 最后一行只画 60% 宽，像文章结尾
                        w = 1.0 if b < 0.58 else 0.62
                        if x <= inset_l + (inset_r - inset_l) * w:
                            col = (0x4e, 0x7a, 0x68)
                # 印章
                if in_round_rect(x, y, sx0, sy0, sx1, sy1, W * 0.012):
                    col = (0xc8, 0x8a, 0x3c)
                    # 印章中间镂空一个小十字，像刻印
                    mx, my = (sx0 + sx1) / 2, (sy0 + sy1) / 2
                    dx, dy = abs(x - mx), abs(y - my)
                    half = (sx1 - sx0) * 0.13
                    thick = (sx1 - sx0) * 0.11
                    if (dx <= half and dy <= thick) or (dy <= half and dx <= thick):
                        col = (0xfb, 0xf7, 0xe8)
            px[y][x] = (col[0], col[1], col[2], 255)

    # 降采样
    out = bytearray()
    for y in range(size):
        out.append(0)  # filter type 0
        for x in range(size):
            r = g = b = a = 0
            for dy in range(ss):
                for dx in range(ss):
                    p = px[y * ss + dy][x * ss + dx]
                    r += p[0]; g += p[1]; b += p[2]; a += p[3]
            n = ss * ss
            out += bytes((r // n, g // n, b // n, a // n))
    return bytes(out)

def write_png(path, size, raw):
    def chunk(tag, data):
        c = struct.pack('>I', len(data)) + tag + data
        return c + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff)
    ihdr = struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0)
    png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', ihdr) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b'')
    with open(path, 'wb') as f:
        f.write(png)
    print('wrote', path, len(png), 'bytes')

for size in (512, 192):
    write_png(os.path.join(OUT, 'icon-%d.png' % size), size, render(size))
