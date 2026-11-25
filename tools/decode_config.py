#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
解码「小兵有前途」configs 包的自定义二进制格式（cc.BufferAsset: config/bin/config）

已确认的记法：
  0x01 + int32LE          -> 整数
  0x05 + varintLen + utf8 -> 字符串
  0x08 + varintN          -> 对象：N 个 (key, value)，key = 0x63+varint 或 0x05 字符串
  0x09 + varintN          -> 数组：N 个 value
  0x63 + varint           -> interned 引用（key id 或字符串池）
  0x02 + varint           -> 小整数（待验证）
"""
import json
import sys


class Reader:
    def __init__(self, d):
        self.d = d
        self.i = 0
        self.pool = {}      # ref id -> value (字符串池)
        self.keymap = {}    # key id -> 推测的 key 名
        self.lits = []      # 字符串字面量按首次出现顺序
        self.litset = set()

    def varint(self):
        r = 0
        sh = 0
        while True:
            b = self.d[self.i]
            self.i += 1
            r |= (b & 0x7F) << sh
            if not (b & 0x80):
                return r
            sh += 7

    def ctx(self, back=24):
        return self.d[max(0, self.i - back): self.i + 40].hex(" ")

    def value(self, depth=0):
        t = self.d[self.i]
        self.i += 1
        if t == 0x01:
            v = int.from_bytes(self.d[self.i:self.i + 4], "little")
            self.i += 4
            return v
        if t == 0x04:
            import struct as _s
            v = _s.unpack("<d", self.d[self.i:self.i + 8])[0]
            self.i += 8
            return v
        if t == 0x05:
            n = self.varint()
            v = self.d[self.i:self.i + n].decode("utf-8", "replace")
            self.i += n
            if v not in self.litset:
                self.litset.add(v)
                self.lits.append(v)
            return v
        if t == 0x63:
            idx = self.varint()
            return ("$ref", idx)
        if t == 0x02:
            v = int.from_bytes(self.d[self.i:self.i + 8], "little")
            self.i += 8
            return v
        if t == 0x09:
            n = self.varint()
            return [self.value(depth + 1) for _ in range(n)]
        if t == 0x08:
            n = self.varint()
            o = {}
            for _ in range(n):
                k = self.key(depth)
                v = self.value(depth + 1)
                if k in o:
                    k = f"{k}#{_}"
                o[k] = v
            return o
        raise ValueError(f"未知类型 0x{t:02x} @ {self.i-1} 上下文: {self.ctx()}")

    def key(self, depth=0):
        t = self.d[self.i]
        if t == 0x63:
            self.i += 1
            idx = self.varint()
            return f"k{idx}"
        if t == 0x05:
            self.i += 1
            n = self.varint()
            v = self.d[self.i:self.i + n].decode("utf-8", "replace")
            self.i += n
            if v not in self.litset:
                self.litset.add(v)
                self.lits.append(v)
            return v
        raise ValueError(f"对象 key 类型异常 0x{t:02x} @ {self.i} 上下文: {self.ctx()}")


def resolve(o, lits):
    """递归解析 $ref 引用和 kNNN 键名（key id 即字符串池下标）"""
    if isinstance(o, (list, tuple)):
        if len(o) == 2 and o[0] == "$ref" and isinstance(o[1], int):
            idx = o[1]
            return lits[idx] if 0 <= idx < len(lits) else f"$ref{idx}"
        return [resolve(v, lits) for v in o]
    if isinstance(o, dict):
        out = {}
        for k, v in o.items():
            if k.startswith("k") and k[1:].isdigit():
                idx = int(k[1:])
                k = lits[idx] if 0 <= idx < len(lits) else k
            if k in out:
                k = k + "#2"
            out[k] = resolve(v, lits)
        return out
    return o


def main():
    path = sys.argv[1]
    d = open(path, "rb").read()
    r = Reader(d)
    try:
        root = r.value()
    except ValueError as e:
        print("解析中断:", e)
        root = None
    print("解析结束位置:", r.i, "/", len(d), " 独立字符串数:", len(r.lits))

    resolved = resolve(root, r.lits)
    out = path.rsplit(".", 1)[0] + ".decoded.json"
    with open(out, "w", encoding="utf-8") as f:
        json.dump(resolved, f, ensure_ascii=False, indent=1, default=str)
    print("写出", out)
    if isinstance(resolved, dict):
        print("顶层键数:", len(resolved))
        for k in list(resolved)[:20]:
            v = resolved[k]
            print("  ", k, type(v).__name__, (len(v) if hasattr(v, "__len__") else v))


if __name__ == "__main__":
    main()
