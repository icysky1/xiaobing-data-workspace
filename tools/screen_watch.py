#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
持续截屏工具 —— 为「小兵萌趣途」图鉴数据采集准备

用法示例：
  # 每 2 秒截一张，持续 10 分钟（自动去重，画面没变不存）
  python screen_watch.py --interval 2 --duration 600

  # 只截某个窗口（按标题模糊匹配）
  python screen_watch.py --window 小兵萌趣途 --interval 2

  # 只截固定区域 (x,y,w,h)
  python screen_watch.py --region 780,60,560,900

  # 手动停止：在输出目录建一个 STOP 文件，或用 Ctrl+C
"""
import argparse
import ctypes
import ctypes.wintypes as wt
import json
import os
import sys
import time
from datetime import datetime

from PIL import Image, ImageGrab

user32 = ctypes.windll.user32


def set_dpi_aware():
    try:
        ctypes.windll.shcore.SetProcessDpiAwareness(2)  # per-monitor v2
    except Exception:
        try:
            user32.SetProcessDPIAware()
        except Exception:
            pass


def enum_windows():
    handles = []

    @ctypes.WINFUNCTYPE(ctypes.c_bool, wt.HWND, wt.LPARAM)
    def cb(hwnd, lparam):
        if user32.IsWindowVisible(hwnd):
            n = user32.GetWindowTextLengthW(hwnd)
            if n > 0:
                buf = ctypes.create_unicode_buffer(n + 1)
                user32.GetWindowTextW(hwnd, buf, n + 1)
                handles.append((hwnd, buf.value))
        return True

    user32.EnumWindows(cb, 0)
    return handles


def find_window_rect(keyword):
    cands = [(h, t) for h, t in enum_windows() if keyword in t]
    if not cands:
        return None, None
    hwnd, title = cands[0]
    r = wt.RECT()
    user32.GetWindowRect(hwnd, ctypes.byref(r))
    return (r.left, r.top, r.right, r.bottom), title


def grab(region):
    if region:
        x, y, w, h = region
        return ImageGrab.grab(bbox=(x, y, x + w, y + h), all_screens=True)
    return ImageGrab.grab(all_screens=True)


def signature(img):
    """缩到 64x36 灰度，用来判断画面是否变化"""
    return img.convert("L").resize((64, 36)).tobytes()


def diff_ratio(a, b):
    if a is None or b is None or len(a) != len(b):
        return 1.0
    changed = sum(1 for x, y in zip(a, b) if abs(x - y) > 6)
    return changed / len(a)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "captures"))
    ap.add_argument("--interval", type=float, default=2.0, help="截图间隔秒")
    ap.add_argument("--duration", type=float, default=0, help="总时长秒，0=一直跑")
    ap.add_argument("--region", default="", help="x,y,w,h")
    ap.add_argument("--window", default="", help="窗口标题关键词")
    ap.add_argument("--threshold", type=float, default=0.02, help="画面变化比例超过该值才保存")
    ap.add_argument("--scale", type=float, default=1.0, help="截图缩放比例，1=原始")
    args = ap.parse_args()

    set_dpi_aware()

    region = None
    if args.region:
        region = tuple(int(v) for v in args.region.split(","))

    out_dir = os.path.abspath(args.out)
    os.makedirs(out_dir, exist_ok=True)
    stop_file = os.path.join(out_dir, "STOP")
    manifest = os.path.join(out_dir, "manifest.jsonl")

    print(f"[watch] 输出目录: {out_dir}")
    print(f"[watch] 间隔 {args.interval}s  去重阈值 {args.threshold}  Ctrl+C 或创建 STOP 文件停止")

    if args.window:
        rect, title = find_window_rect(args.window)
        if rect:
            print(f"[watch] 绑定窗口: {title}  位置 {rect}")
            region = (rect[0], rect[1], rect[2] - rect[0], rect[3] - rect[1])
        else:
            print(f"[watch] 没找到标题含「{args.window}」的窗口，改为全屏。现有窗口：")
            for h, t in enum_windows()[:25]:
                print("   -", t)

    prev = None
    saved = 0
    seen = 0
    t0 = time.time()

    try:
        while True:
            if os.path.exists(stop_file):
                print("[watch] 检测到 STOP 文件，退出")
                break
            if args.duration and time.time() - t0 > args.duration:
                print("[watch] 到达设定时长，退出")
                break

            img = grab(region)
            if args.scale != 1.0:
                img = img.resize((int(img.width * args.scale), int(img.height * args.scale)), Image.LANCZOS)

            seen += 1
            sig = signature(img)
            d = diff_ratio(prev, sig)

            if d >= args.threshold:
                ts = datetime.now().strftime("%Y%m%d_%H%M%S_%f")[:-3]
                name = f"shot_{ts}_d{int(d*100)}.png"
                path = os.path.join(out_dir, name)
                img.save(path)
                with open(manifest, "a", encoding="utf-8") as f:
                    f.write(json.dumps({
                        "file": name, "time": datetime.now().isoformat(timespec="seconds"),
                        "size": [img.width, img.height], "diff": round(d, 4),
                    }, ensure_ascii=False) + "\n")
                prev = sig
                saved += 1
                print(f"[watch] #{saved} 保存 {name}  变化 {d:.1%}  累计帧 {seen}")
            time.sleep(args.interval)
    except KeyboardInterrupt:
        print("\n[watch] 手动中断")

    print(f"[watch] 结束：共抓 {seen} 帧，保存 {saved} 张 -> {out_dir}")


if __name__ == "__main__":
    main()
