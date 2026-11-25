# -*- coding: utf-8 -*-
"""生成跑商参考表.html：商品基础价/产地 + 城池需求/溢价 + 利润公式说明"""
import json, os

SRC = r"C:/Users/Administrator/AppData/Roaming/Tencent/xwechat/radium/users/17fca8483d3d2e771ee5d292a5e2834c/applet/local/wx95b8d1c9f729b0af/usr/gamecaches/configs/17920673043583.decoded.json"
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "跑商参考表.html")

d = json.load(open(SRC, encoding="utf-8"))
product, productType, city = d["product"], d["productType"], d["city"]

city_name = {int(k): v["cityName"] for k, v in city.items()}
pt_name = {int(k): v["typeName"] for k, v in productType.items()}

Q_COLOR = {1: "#9d9d9d", 2: "#4caf50", 3: "#42a5f5", 4: "#ab47bc", 5: "#ff9800", 6: "#ef5350"}

# ---- 商品表（按大类分组，大类内按基础价降序） ----
prods = sorted(product.values(), key=lambda p: (p["productType"], -p["price"]))
prod_rows = []
cur_type = None
for p in prods:
    frm = "、".join(city_name.get(c, str(c)) for c in p.get("fromCity", [])) or "—"
    q = p.get("quality", 1)
    cls = Q_COLOR.get(q, "#666")
    tn = pt_name.get(p["productType"], str(p["productType"]))
    prod_rows.append(
        f'<tr><td>{p["name"]}</td><td style="color:{cls};font-weight:600">{tn}</td>'
        f'<td style="color:{cls}">Q{q}</td><td class="num">{p["price"]}</td><td>{frm}</td></tr>'
    )

# ---- 城池表 ----
city_rows = []
for c in sorted(city.values(), key=lambda c: c["id"]):
    sell_names = [product.get(str(sid), {}).get("name", f"?{sid}") for sid in c.get("sell", [])]
    # 按解锁顺序合并显示：商品名(解锁等级)
    unlock = c.get("productUnlock", [])
    sell_html = "、".join(
        f'{n}<span class="lv">{u}</span>' for n, u in zip(sell_names, unlock + [0] * len(sell_names))
    ) if sell_names else "—"
    buys = [pt_name.get(b, f"?{b}") for b in c.get("buy", [])]
    sp = c.get("specialPremium", [0, 0]); td = c.get("todayPremium", [0, 0])
    dead = all(b not in pt_name for b in c.get("buy", [])) or not buys
    buy_html = "、".join(buys)
    if dead:
        buy_html += ' <span class="dead">（无对应商品，死订单）</span>'
    city_rows.append(
        f'<tr><td>{c["cityName"]}</td><td>{sell_html}</td>'
        f'<td>{buy_html}</td>'
        f'<td class="num hot">{sp[0]}‰~{sp[1]}‰</td><td class="num">{td[0]}‰~{td[1]}‰</td></tr>'
    )

html = """<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>小兵有前途 · 跑商参考表</title>
<style>
body{font-family:"Microsoft YaHei",sans-serif;background:#f5f5f0;color:#333;margin:0;padding:24px}
h1{font-size:22px;margin:0 0 4px} h2{font-size:17px;margin:28px 0 10px;border-left:4px solid #b8860b;padding-left:8px}
.sub{color:#888;font-size:13px;margin-bottom:8px}
table{border-collapse:collapse;width:100%;background:#fff;font-size:13px;box-shadow:0 1px 3px rgba(0,0,0,.08)}
th{background:#3e2723;color:#f5deb3;padding:7px 9px;text-align:left;position:sticky;top:0}
td{padding:5px 9px;border-bottom:1px solid #eee}
tr:hover td{background:#fdf6e3}
.num{text-align:right;font-variant-numeric:tabular-nums}
.hot{color:#c62828;font-weight:600}
.lv{color:#aaa;font-size:11px;margin-left:1px}
.dead{color:#e53935;font-size:11px}
.formula{background:#fff8e1;border:1px solid #ffe082;border-radius:6px;padding:12px 16px;font-size:13px;line-height:1.9}
.formula b{color:#b8860b}
.tip{color:#777;font-size:12px;margin-top:6px}
.count{color:#2e7d32;font-size:12px}
</style>
</head>
<body>
<h1>跑商参考表</h1>
<div class="sub">数据来源：小程序配置表 product / city / productType（172 商品 · 39 城池）</div>

<h2>利润计算公式（客户端实时计算）</h2>
<div class="formula">
单件卖价 = <b>⌈商品基础价 × (订单溢价系数 + 个人加成)⌉ + 固定利润加成</b><br>
单件利润 = 单件卖价 − 商品基础价<br>
城市总利润(allProfit) = 最佳商品单件利润 × <b>载货容量</b><br>
<span class="tip">订单溢价系数：特殊需求 = specialPremium（1600~1700‰），今日需求 = todayPremium（1200~1300‰），由服务端定时随机刷新；
个人加成 = 结义/联盟加成 + 角色 profitAdd + 占城加成（千分比）；固定加成来自宝物/装备的 profitValue 效果。</span>
</div>
<div class="tip">💡 最佳城池排序规则：路程 &lt;20 分钟的城优先 → 按利润降序 → 同利润按路程短优先。溢价越高越好：特殊订单（红色气泡）160%~170% &gt; 今日订单 120%~130%。</div>

<h2>城池总表（39 城）<span class="count">特产商品后小字 = 解锁所需城池等级</span></h2>
<table id="t1">
<thead><tr><th>城池</th><th>本城特产（库存各 1 万）</th><th>需求大类</th><th>特殊需求溢价</th><th>今日需求溢价</th></tr></thead>
<tbody>__CITY__</tbody>
</table>

<h2>商品总表（172 种，按大类分组、大类内按基础价降序）</h2>
<table id="t2">
<thead><tr><th>商品</th><th>大类</th><th>品质</th><th>基础价(铜钱)</th><th>产地</th></tr></thead>
<tbody>__PROD__</tbody>
</table>

<script>
// 简易筛选：输入过滤两个表格
var bar=document.createElement('div');
bar.innerHTML='<input id="flt" placeholder="筛选：输入城池/商品/大类名…" style="width:260px;padding:6px 10px;border:1px solid #ccc;border-radius:4px;margin:14px 0">';
document.querySelector('h2#') ;
</script>
</body>
</html>
"""
# 简化：去掉残缺 script（上面写入时直接不包含）
html = html.replace("""<script>
// 简易筛选：输入过滤两个表格
var bar=document.createElement('div');
bar.innerHTML='<input id="flt" placeholder="筛选：输入城池/商品/大类名…" style="width:260px;padding:6px 10px;border:1px solid #ccc;border-radius:4px;margin:14px 0">';
document.querySelector('h2#') ;
</script>
""", """<script>
var inp=document.createElement('input');
inp.placeholder='输入关键字筛选两个表格…';
inp.style.cssText='width:280px;padding:6px 10px;border:1px solid #ccc;border-radius:4px;margin:14px 0';
document.body.insertBefore(inp,document.getElementById('t1'));
inp.oninput=function(){
  var k=this.value.trim();
  ['t1','t2'].forEach(function(id){
    document.querySelectorAll('#'+id+' tbody tr').forEach(function(tr){
      tr.style.display=(!k||tr.textContent.indexOf(k)>=0)?'':'none';
    });
  });
};
</script>
""")

html = html.replace("__CITY__", "\n".join(city_rows)).replace("__PROD__", "\n".join(prod_rows))
open(OUT, "w", encoding="utf-8").write(html)
print("写出", os.path.abspath(OUT), len(html), "bytes,", len(city_rows), "城,", len(prod_rows), "商品")
