#!/usr/bin/env python3
"""Draws the app icon source and the menu-bar icon. Standard library only.

Run from apps/desktop:

    python3 scripts/make-icons.py
    pnpm tauri icon src-tauri/icons/source.png

The first command writes `source.png` (1024 px) and `tray.png` (a black
template image; macOS tints it to suit the menu bar). The second cuts every
size the bundle needs from the source.
"""

import math
import struct
import zlib
from pathlib import Path

ICONS = Path(__file__).resolve().parent.parent / "src-tauri" / "icons"
SAMPLES = 3  # supersampling per axis


def write_png(path, size, pixels):
    rows = b"".join(
        b"\x00" + bytes(channel for pixel in pixels[y * size : (y + 1) * size] for channel in pixel)
        for y in range(size)
    )

    def chunk(kind, data):
        body = kind + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body))

    header = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    path.write_bytes(
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", header)
        + chunk(b"IDAT", zlib.compress(rows, 9))
        + chunk(b"IEND", b"")
    )


def in_rounded_square(x, y, inset, radius):
    low, high = inset, 1 - inset
    if not (low <= x <= high and low <= y <= high):
        return False
    cx = min(max(x, low + radius), high - radius)
    cy = min(max(y, low + radius), high - radius)
    return math.hypot(x - cx, y - cy) <= radius


def near_segment(x, y, ax, ay, bx, by, half_width):
    dx, dy = bx - ax, by - ay
    t = max(0.0, min(1.0, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)))
    return math.hypot(x - (ax + t * dx), y - (ay + t * dy)) <= half_width


def in_clock(x, y, ring, stroke):
    distance = math.hypot(x - 0.5, y - 0.5)
    on_ring = ring - stroke <= distance <= ring
    minute_hand = near_segment(x, y, 0.5, 0.5, 0.5, 0.5 - ring * 0.62, stroke / 2)
    hour_hand = near_segment(x, y, 0.5, 0.5, 0.5 + ring * 0.42, 0.5, stroke / 2)
    return on_ring or minute_hand or hour_hand


def render(size, shade):
    pixels = []
    step = 1 / (size * SAMPLES)
    for py in range(size):
        for px in range(size):
            total = [0.0, 0.0, 0.0, 0.0]
            for sy in range(SAMPLES):
                for sx in range(SAMPLES):
                    r, g, b, a = shade((px * SAMPLES + sx + 0.5) * step, (py * SAMPLES + sy + 0.5) * step)
                    total[0] += r * a
                    total[1] += g * a
                    total[2] += b * a
                    total[3] += a
            count = SAMPLES * SAMPLES
            alpha = total[3] / count
            if alpha == 0:
                pixels.append((0, 0, 0, 0))
            else:
                pixels.append(
                    (
                        round(total[0] / total[3]),
                        round(total[1] / total[3]),
                        round(total[2] / total[3]),
                        round(alpha * 255),
                    )
                )
    return pixels


def app_icon(x, y):
    if not in_rounded_square(x, y, 0.1, 0.18):
        return (0, 0, 0, 0)
    if in_clock(x, y, 0.27, 0.05):
        return (244, 239, 230, 1)
    return (31, 77, 70, 1)


def tray_icon(x, y):
    return (0, 0, 0, 1) if in_clock(x, y, 0.42, 0.1) else (0, 0, 0, 0)


if __name__ == "__main__":
    ICONS.mkdir(parents=True, exist_ok=True)
    write_png(ICONS / "source.png", 1024, render(1024, app_icon))
    write_png(ICONS / "tray.png", 36, render(36, tray_icon))
