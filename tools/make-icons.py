# 生成插件图标（纯 Python，无第三方依赖）。
# 图案：一行歌词（粗条），上方带注音条。
# 用法：python3 tools/make-icons.py <A.png> <B.png>（当前插件用 B：japanese-lyrics-furigana/icon.png）
import math, struct, sys, zlib

SIZE = 1024
SHIFT = 105   # 内容整体上移，使其在画面中垂直居中

# 每项：(种类, 左, 右, 纵向中心)
LAYOUT_A = [
    ('ruby', 190, 330, 360), ('ruby', 560, 700, 360),
    ('text', 160, 400, 500), ('text', 450, 600, 500), ('text', 650, 864, 500),
    ('ruby', 300, 420, 690),
    ('text', 160, 540, 830), ('text', 590, 864, 830),
]
LAYOUT_B = [
    ('ruby', 250, 390, 360),
    ('text', 160, 520, 500), ('text', 570, 864, 500),
    ('ruby', 480, 600, 690), ('ruby', 690, 810, 690),
    ('text', 160, 400, 830), ('text', 450, 640, 830), ('text', 690, 864, 830),
]

def rrect(cx, cy, hw, hh, r):
    """圆角矩形的有符号距离函数：负数在内部。"""
    def d(x, y):
        qx = abs(x - cx) - (hw - r)
        qy = abs(y - cy) - (hh - r)
        return math.hypot(max(qx, 0.0), max(qy, 0.0)) + min(max(qx, qy), 0.0) - r
    return d

def lerp(a, b, t):
    return a + (b - a) * t

def hexrgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))

def render(top, bottom, layout, path):
    top, bottom = hexrgb(top), hexrgb(bottom)
    buf = bytearray(SIZE * SIZE * 4)

    # 背景：整幅圆角方块 + 竖向渐变
    bg = rrect(SIZE / 2, SIZE / 2, SIZE / 2, SIZE / 2, 224)
    for y in range(SIZE):
        t = y / (SIZE - 1)
        col = tuple(lerp(top[i], bottom[i], t) for i in range(3))
        row = y * SIZE * 4
        for x in range(SIZE):
            a = min(max(0.5 - bg(x + 0.5, y + 0.5), 0.0), 1.0)
            o = row + x * 4
            buf[o] = int(col[0]); buf[o + 1] = int(col[1]); buf[o + 2] = int(col[2]); buf[o + 3] = int(a * 255)

    def paint(shape, bbox, color, opacity):
        x0, y0, x1, y1 = bbox
        for y in range(max(0, int(y0) - 2), min(SIZE, int(y1) + 3)):
            for x in range(max(0, int(x0) - 2), min(SIZE, int(x1) + 3)):
                a = min(max(0.5 - shape(x + 0.5, y + 0.5), 0.0), 1.0) * opacity
                if a <= 0:
                    continue
                o = (y * SIZE + x) * 4
                for i in range(3):
                    buf[o + i] = int(buf[o + i] * (1 - a) + color[i] * a)

    def bar(x0, x1, cy, h, color, opacity):
        r = h / 2
        cx, hw = (x0 + x1) / 2, (x1 - x0) / 2
        paint(rrect(cx, cy, hw, r, r), (x0, cy - r, x1, cy + r), color, opacity)

    white = (255, 255, 255)
    for kind, x0, x1, cy in layout:
        if kind == 'ruby':
            bar(x0, x1, cy - SHIFT, 44, white, 0.62)   # 注音条（细、半透明）
        else:
            bar(x0, x1, cy - SHIFT, 120, white, 1.0)   # 歌词（粗）

    raw = b''.join(b'\x00' + bytes(buf[y * SIZE * 4:(y + 1) * SIZE * 4]) for y in range(SIZE))
    def chunk(tag, data):
        c = struct.pack('>I', len(data)) + tag + data
        return c + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff)
    png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', SIZE, SIZE, 8, 6, 0, 0, 0)) \
        + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b'')
    with open(path, 'wb') as f:
        f.write(png)

if __name__ == '__main__':
    netease_path, kugou_path = sys.argv[1], sys.argv[2]
    render('#6d4ae0', '#a24bd6', LAYOUT_A, netease_path)   # 紫
    render('#0f9d8f', '#1fc7a0', LAYOUT_B, kugou_path)     # 青绿
