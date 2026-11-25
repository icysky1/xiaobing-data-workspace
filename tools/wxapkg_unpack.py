#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
微信 4.x 小程序包（V1MMWX）解密 + 解包  v2
格式: 6字节magic + AES-CBC(前1024字节) + 单字节XOR(其余)
key = PBKDF2-SHA1(appid, salt=b"saltiest", 1000 iter, 32B), iv = b"the iv: 16 bytes"
"""
import hashlib
import os
import struct
import sys

from Crypto.Cipher import AES

MAGIC = b"V1MMWX"
IV = b"the iv: 16 bytes"
AES_LEN = 1024  # AES 覆盖 file[6 : 6+1024]


def _key(appid):
    return hashlib.pbkdf2_hmac("sha1", appid.encode(), b"saltiest", 1000, 32)


def decrypt(path, appid, xor_key=None):
    """返回 blob。官方算法:
    - 前 1024 字节(跳过6字节magic) AES-CBC 解密
    - 其余数据与 xor_key 异或; xor_key = appid 倒数第2个字符(不足2位用 0x66)"""
    data = open(path, "rb").read()
    assert data[:6] == MAGIC, "不是 V1MMWX 格式: " + repr(data[:8])
    k = _key(appid)
    first = AES.new(k, AES.MODE_CBC, IV).decrypt(data[6:6 + AES_LEN])
    rest = data[6 + AES_LEN:]
    if xor_key is None:
        xor_key = ord(appid[-2]) if len(appid) >= 2 else 0x66
    return first + bytes(b ^ xor_key for b in rest)


def fit_xor_key(rest, sample=20000):
    """数据区应为大量 JSON/JS 文本，用可打印率拟合单字节 XOR key。"""
    seg = rest[:sample]
    best, best_score = 0, -1
    for cand in range(256):
        score = 0
        for b in seg:
            c = b ^ cand
            if 32 <= c < 127 or c in (9, 10, 13):
                score += 1
        if score > best_score:
            best, best_score = cand, score
    return best


def parse(blob):
    assert blob[0] == 0xBE, "解密后包头不对: " + blob[:4].hex()
    info1, idx_len, body_len = struct.unpack(">III", blob[1:13])
    idx = blob[13: 13 + idx_len]
    cnt = struct.unpack(">I", idx[0:4])[0]
    files = []
    p = 4
    for _ in range(cnt):
        nlen = struct.unpack(">I", idx[p:p + 4])[0]
        p += 4
        name = idx[p:p + nlen].decode("utf-8")
        p += nlen
        off, size = struct.unpack(">II", idx[p:p + 8])
        p += 8
        files.append((name, off, size))
    assert p == idx_len, f"索引消耗 {p} != idx_len {idx_len}"
    return info1, idx_len, body_len, files


def main():
    pkg = sys.argv[1]
    appid = sys.argv[2]
    outdir = sys.argv[3]

    blob, xk = decrypt(pkg, appid)
    info1, idx_len, body_len, files = parse(blob)
    print(f"xor_key=0x{xk:02x}  解密后 {len(blob)} 字节, 索引 {idx_len}, 数据 {body_len}, 文件 {len(files)} 个")

    base = 13 + idx_len
    for name, off, size in files:
        rel = name.lstrip("/").replace("\\", "/")
        dst = os.path.join(outdir, rel)
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        with open(dst, "wb") as f:
            f.write(blob[base + off: base + off + size])
    print("解包完成 ->", outdir)


if __name__ == "__main__":
    main()
