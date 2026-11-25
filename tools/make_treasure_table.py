# -*- coding: utf-8 -*-
"""生成「全部宝物总表」页面：按场景分组，含需用细锤及单价。"""
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "data", "dig_atlas.json")
OUT = os.path.join(ROOT, "data", "宝物总表.html")

dg = json.load(open(SRC, encoding="utf-8"))

TYPE_ORDER = {"器物": 1, "奇珍": 2, "书画": 3, "典籍": 4}
QNAME = {1: "白", 2: "绿", 3: "蓝", 4: "紫", 5: "红"}

# 商店价（钻石）：细锤单价 = price / 把数
HAMMER_PRICE = {
    "玄玉细锤": 1, "玄铁细锤": 1, "石髓细锤": 1, "乌木细锤": 1,
    "金丝细锤": 2, "云纹细锤": 2, "紫晶细锤": 2, "寒铁细锤": 2,
    "龙纹细锤": 8, "赤金细锤": 8, "青璃细锤": 8, "黑曜细锤": 8,
    "幸运细锤": 8, "熔岩细锤": 8,
}


def hammer_text(it):
    if it.get("needsSpecialHammer") and it.get("specialHammer"):
        p = HAMMER_PRICE.get(it["specialHammer"])
        tag = "" if it.get("confirmed") else "（推测）"
        return f"{it['specialHammer']}{tag}{(' · ' + str(p) + '钻/把') if p else ''}"
    return "普通细锤"


def row(scene_name, group_name, it):
    q = it.get("quality") or 0
    gr = it.get("gradeRange") or [0, 0]
    gr_txt = f"{gr[0]}~{gr[1]}" if gr[1] else "—"
    star = "★" if it.get("needsSpecialHammer") and it.get("confirmed") else ("☆" if it.get("needsSpecialHammer") else "")
    special = "special" if star else ""
    return f"""    <tr class="{special}">
      <td class="sc">{scene_name}</td>
      <td class="nm">{star} {it['name']}</td>
      <td class="tp">{it['type']}</td>
      <td class="ql"><span class="q q{q}">{QNAME.get(q, '')}</span></td>
      <td class="gr">{gr_txt}</td>
      <td class="gp">{group_name}</td>
      <td class="hm">{hammer_text(it)}</td>
    </tr>"""


sections = []
for i, s in enumerate(dg["scenes"]):
    n = sum(len(g["items"]) for g in s["groups"])
    rows = []
    for g in s["groups"]:
        items = sorted(g["items"], key=lambda x: (TYPE_ORDER.get(x["type"], 9), x.get("quality") or 0))
        rows.extend(row(s["name"], g["name"], it) for it in items)
    sections.append(f"""<section class="scene">
  <header class="sh">
    <div class="st"><h2>{i + 1}. {s['name']}</h2><span class="cnt">{len(s['groups'])} 组 / {n} 件</span></div>
  </header>
  <table>
    <thead><tr><th>场景</th><th>宝物名称</th><th>类型</th><th>品质</th><th>品相分区间</th><th>所属分组</th><th>需用细锤</th></tr></thead>
    <tbody>
{chr(10).join(rows)}
    </tbody>
  </table>
</section>""")

total = sum(len(g["items"]) for s in dg["scenes"] for g in s["groups"])

html = f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>挖宝图鉴 · 全部宝物总表</title>
<style>
  :root {{
    --bg:#f7f8fa; --card:#ffffff; --line:#e6e8ee; --text:#1f2430; --muted:#6b7280;
    --accent:#c0392b; --accent-soft:#fdecea; --chip:#f2f4f8;
  }}
  * {{ box-sizing:border-box; }}
  body {{ margin:0; background:var(--bg); color:var(--text);
    font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;
    font-size:14px; line-height:1.6; }}
  .wrap {{ max-width:1080px; margin:0 auto; padding:28px 20px 60px; }}
  h1 {{ font-size:22px; margin:0 0 6px; letter-spacing:.5px; }}
  .sub {{ color:var(--muted); margin:0 0 18px; }}
  .legend {{ background:#fff; border:1px solid var(--line); border-left:3px solid var(--accent);
    border-radius:8px; padding:12px 16px; margin-bottom:22px; color:#424b5c; font-size:13px; }}
  .legend b {{ color:var(--accent); }}
  .scene {{ background:var(--card); border:1px solid var(--line); border-radius:10px;
    margin-bottom:18px; overflow:hidden; }}
  .sh {{ padding:12px 16px; background:#fbfcfe; border-bottom:1px solid var(--line); }}
  .st {{ display:flex; align-items:baseline; gap:10px; }}
  .st h2 {{ font-size:16px; margin:0; }}
  .cnt {{ color:var(--muted); font-size:12px; }}
  table {{ width:100%; border-collapse:collapse; }}
  th, td {{ padding:8px 12px; border-bottom:1px solid #f0f2f6; text-align:left; }}
  th {{ font-size:12px; font-weight:600; color:var(--muted); background:#fff; }}
  tbody tr:last-child td {{ border-bottom:none; }}
  tr.special {{ background:var(--accent-soft); }}
  tr.special:hover {{ background:#fbdcd8; }}
  tbody tr:hover {{ background:#fafbfd; }}
  tr.special:hover {{ background:#fbdcd8; }}
  .sc {{ color:var(--muted); white-space:nowrap; }}
  .nm {{ font-weight:600; }}
  .tp {{ color:#4b5563; }}
  .gr {{ color:var(--muted); font-variant-numeric:tabular-nums; }}
  .gp {{ color:var(--muted); }}
  .hm {{ white-space:nowrap; }}
  tr.special .hm {{ color:var(--accent); font-weight:600; }}
  .q {{ display:inline-block; padding:1px 8px; border-radius:20px; font-size:12px; font-weight:600; }}
  .q0, .q1 {{ background:#f1f2f4; color:#6b7280; }}
  .q2 {{ background:#e8f6ee; color:#1f7a4d; }}
  .q3 {{ background:#e9f0fd; color:#2456b3; }}
  .q4 {{ background:#f2eafd; color:#6b3fa0; }}
  .q5 {{ background:#fdeaea; color:#b02a1f; }}
  @media (max-width:640px) {{
    .sc, .gp, th:nth-child(1), th:nth-child(6) {{ display:none; }}
    th, td {{ padding:8px 8px; }}
  }}
</style>
</head>
<body>
<div class="wrap">
  <h1>挖宝图鉴 · 全部宝物总表</h1>
  <p class="sub">{len(dg['scenes'])} 个场景 · {total} 件宝物 · 细锤商店价：难觅锤（玄玉/玄铁/石髓/乌木）10钻=10把 · 鉴赏锤（金丝/云纹/紫晶/寒铁）20钻=10把 · 高级锤（龙纹/赤金/青璃/黑曜/幸运/熔岩）40钻=5把</p>

  <div class="legend">
    <b>★</b> = 已实测确认需要专用细锤的特殊宝物（每场景仅 1 件，同组行标红）；其余宝物任何品质均用<b>普通细锤</b>即可挖出。
    ☆ = 推测的特殊宝物（海底沉船未验证 / 边塞烽燧未开放），按普通细锤对待。品相分区间数值越高越难挖出。
  </div>

{''.join(sections)}
</div>
</body>
</html>
"""

open(OUT, "w", encoding="utf-8").write(html)
print("written", OUT, len(html))
