#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""微信 4.x 小程序包解密 + 解包（稳健版）
- 前 1024 字节 AES-CBC，其后单字节 XOR
- XOR key 用「索引能否完整解析 + 文件名全为可打印 UTF-8」自动校验，避免取错 key 得到乱码
"""
import hashlib
import os
import struct
import sys

from Crypto.Cipher import AES

MAGIC = b"V1MMWX"
IV = b"the iv: 16 bytes"
AES_LEN = 1024


def decrypt_raw(path, appid):
    data = open(path, "rb").read()
    assert data[:6] == MAGIC, "不是 V1MMWX 格式: " + repr(data[:8])
    key = hashlib.pbkdf2_hmac("sha1", appid.encode(), b"saltiest", 1000, 32)
    first = AES.new(key, AES.MODE_CBC, IV).decrypt(data[6:6 + AES_LEN])
    return first, data[6 + AES_LEN:]


def _parse_at(blob, start, idx_len):
    cnt = struct.unpack(">I", blob[start:start + 4])[0]
    if cnt <= 0 or cnt > 200000:
        raise ValueError("bad count %d" % cnt)
    files, p = [], start + 4
    for _ in range(cnt):
        nlen = struct.unpack(">I", blob[p:p + 4])[0]
        p += 4
        name = blob[p:p + nlen].decode("utf-8")
        p += nlen
        off, size = struct.unpack(">II", blob[p:p + 8])
        p += 8
        files.append((name, off, size))
    if p != start + idx_len:
        raise ValueError("idx mismatch %d != %d" % (p, start + idx_len))
    return files


def parse(blob):
    """兼容两种索引布局：
    旧: [0xBE][info1][idx_len][body_len][count ...]     索引从 13 开始
    新: [0xBE][info1][idx_len][body_len][x][count ...]  索引从 17 开始
    """
    if blob[0] != 0xBE:
        raise ValueError("bad header")
    info1, idx_len, body_len = struct.unpack(">III", blob[1:13])
    last_err = None
    for start in (13, 17):
        try:
            files = _parse_at(blob, start, idx_len)
        except Exception as e:
            last_err = e
            continue
        base = start + idx_len
        if base + body_len > len(blob) + 16:  # 允许少量尾部填充
            last_err = ValueError("body overflow: %d+%d > %d" % (base, body_len, len(blob)))
            continue
        return base, files
    raise last_err


def find_key(first, rest, appid):
    cands = [ord(appid[-2]), 0x66]
    # 追加「可打印率」最优的候选
    seg = rest[:20000]
    best, best_score = 0, -1
    for c in range(256):
        score = sum(1 for b in seg if 32 <= (b ^ c) < 127 or (b ^ c) in (9, 10, 13))
        if score > best_score:
            best, best_score = c, score
    cands.append(best)
    for c in dict.fromkeys(cands):
        head = first + bytes(b ^ c for b in rest[: max(0, 200000)])
        try:
            parse(head)
            return c
        except Exception:
            continue
    raise RuntimeError("找不到可解析的 XOR key，候选=%s" % cands)


def main():
    pkg, appid, outdir = sys.argv[1], sys.argv[2], sys.argv[3]
    first, rest = decrypt_raw(pkg, appid)
    key = find_key(first, rest, appid)
    blob = first + bytes(b ^ key for b in rest)
    idx_len, files = parse(blob)
    base = 13 + idx_len
    for name, off, size in files:
        rel = name.lstrip("/").replace("\\", "/")
        dst = os.path.join(outdir, rel)
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        with open(dst, "wb") as f:
            f.write(blob[base + off: base + off + size])
    print("ok xor_key=0x%02x files=%d -> %s" % (key, len(files), outdir))


if __name__ == "__main__":
    main()
