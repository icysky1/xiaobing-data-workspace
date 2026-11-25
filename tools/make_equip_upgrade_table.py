# -*- coding: utf-8 -*-
"""生成挖宝装备升级明细表.html：4件道具 × 7品质 × 逐级消耗 + 碎片机制结论"""
import json, math, os

SRC = r"C:/Users/Administrator/AppData/Roaming/Tencent/xwechat/radium/users/17fca8483d3d2e771ee5d292a5e2834c/applet/local/wx95b8d1c9f729b0af/usr/gamecaches/configs/17920673043583.decoded.json"
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "挖宝装备升级明细表.html")

d = json.load(open(SRC, encoding="utf-8"))

def cost(e, q, lv):
    A = e["upgradeCostCoeA"]; C = e["upgradeCostCoeC"]; D = e["upgradeCostCoeD"]
    B = e["upgradeCostQualityCoeB"][q - 1]; Qy = e["upgradeCostQy"][q - 1]
    return math.floor(A + B * lv + C * Qy ** D)

sections = []
for e in d["antiqueEquip"].values():
    mx = e["qualityMaxLevel"]
    # 属性说明
    eff = "、".join(str(b["antiqueValue"]) for b in e["baseEffect"])
    tbls = []
    for q in range(1, 8):
        rows = []
        cum = 0
        for lv in range(1, mx[q - 1] + 1):
            c = cost(e, q, lv)
            cum += c
            rows.append(f"<tr><td class='num'>{lv}→{lv+1}</td><td class='num'>{c}</td><td class='num dim'>{cum}</td></tr>")
        tot = cum
        tbls.append(
            f"<div class='qblk'><div class='qhead'>品质{q}（满级{mx[q-1]}级）品质内总消耗 <b>{tot}</b></div>"
            f"<table><thead><tr><th>升级</th><th>银币</th><th>累计</th></tr></thead><tbody>{''.join(rows)}</tbody></table></div>"
        )
    sections.append(
        f"<h2>{e['name']} <span class='eff'>基础属性: {eff}</span></h2><div class='grid'>{''.join(tbls)}</div>"
    )

html = """<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8"><title>挖宝装备升级明细表</title>
<style>
body{font-family:"Microsoft YaHei",sans-serif;background:#f5f5f0;color:#333;margin:0;padding:24px}
h1{font-size:22px;margin:0 0 4px}h2{font-size:17px;margin:28px 0 10px;border-left:4px solid #b8860b;padding-left:8px}
.eff{font-size:12px;color:#888;font-weight:400;margin-left:8px}
.grid{display:flex;flex-wrap:wrap;gap:14px}
.qblk{background:#fff;border-radius:6px;box-shadow:0 1px 3px rgba(0,0,0,.08);padding:8px 10px;min-width:210px}
.qhead{font-size:12px;margin-bottom:6px;color:#5d4037}
table{border-collapse:collapse;width:100%;font-size:12px}
th{background:#3e2723;color:#f5deb3;padding:4px 8px;text-align:left}
td{padding:3px 8px;border-bottom:1px solid #eee}
.num{text-align:right;font-variant-numeric:tabular-nums}
.dim{color:#999}
.concl{background:#fff8e1;border:1px solid #ffe082;border-radius:6px;padding:12px 16px;font-size:13px;line-height:1.9}
</style></head><body>
<h1>挖宝装备升级明细表（古玩银币）</h1>
<div class="sub" style="color:#888;font-size:13px">单级消耗 = ⌊A + B[品质]×当前等级 + C×Qy[品质]^1.5⌋，数据来自本地配置 antiqueEquip</div>

<div class="concl" style="margin:16px 0">
<b>关于碎片 / 破损宝物（已核查全部本地数据）：</b><br>
① 挖出「宝物的碎片」「破损的宝物」是<b>概率事件</b>，不是等级门槛——7 个场景配置完全相同（宝物概率都是 110‰），配置表里<b>不存在</b>「道具达到某等级该场景必出完整宝物」的字段；碎片/完整由服务端每次挖掘独立掷骰。<br>
② 缓解手段全靠属性和洗练：<b>细刷·专注</b>（基础100，降碎片概率）、<b>探铲·精细</b>（基础10000，降高品相宝物破损概率）、唯一属性<b>「重来」</b>（挖到碎片/破损不消耗细锤）、<b>「活力」</b>（5%不耗洛阳铲）。<br>
③ 每个场景的"最高概率"也不随场景变化：宝物率恒定 11%，能堆的只有装备属性（现宝提品相分、四系鉴赏提对应类型概率、慧眼降垃圾率、精通省锤子）。把<b>细刷和探铲</b>优先升上去，是减少碎片/破损的最直接途径。
</div>

__SECTIONS__
</body></html>
"""
html = html.replace("__SECTIONS__", "\n".join(sections))
open(OUT, "w", encoding="utf-8").write(html)
print("写出", os.path.abspath(OUT))
