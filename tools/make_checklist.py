# -*- coding: utf-8 -*-
"""根据 data/dig_atlas.json 生成「逐场景宝物核对」交互页，
勾选每个场景的特殊宝物后可直接导出 JSON，便于人工确认。
"""
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "data", "dig_atlas.json")
OUT = os.path.join(ROOT, "data", "宝物核对表.html")

dg = json.load(open(SRC, encoding="utf-8"))

TYPE_ORDER = {"器物": 1, "奇珍": 2, "书画": 3, "典籍": 4}
QNAME = {1: "白", 2: "绿", 3: "蓝", 4: "紫", 5: "红"}


def rows_html(scene_idx, scene):
    out = []
    groups = scene["groups"]
    gi = 0
    for g in groups:
        items = sorted(g["items"], key=lambda x: (TYPE_ORDER.get(x["type"], 9), x.get("quality") or 0))
        for it in items:
            gi += 1
            q = it.get("quality") or 0
            gr = it.get("gradeRange") or [0, 0]
            gr_txt = f"{gr[0]}~{gr[1]}" if gr[1] else "—"
            checked = "checked" if it.get("needsSpecialHammer") else ""
            inferred = " inferred" if it.get("needsSpecialHammer") and not it.get("confirmed") else ""
            tag = '<span class="tag">推测</span>' if it.get("needsSpecialHammer") and not it.get("confirmed") else ""
            out.append(
                f"""<tr class="item{inferred}" data-scene="{scene_idx}" data-name="{it['name']}" data-type="{it['type']}" data-quality="{q}">
      <td class="chk"><input type="checkbox" {checked} aria-label="标记为特殊宝物"></td>
      <td class="nm">{it['name']}{tag}</td>
      <td class="tp">{it['type']}</td>
      <td class="ql"><span class="q q{q}">q{q} {QNAME.get(q, '')}</span></td>
      <td class="gr">{gr_txt}</td>
      <td class="gp">{g['name']}</td>
    </tr>"""
            )
    return "\n".join(out)


sections = []
for i, s in enumerate(dg["scenes"]):
    n = sum(len(g["items"]) for g in s["groups"])
    sections.append(
        f"""<section class="scene" data-scene="{i}">
  <header class="sh">
    <div class="st"><h2>{i + 1}. {s['name']}</h2><span class="cnt">{len(s['groups'])} 组 / {n} 件</span></div>
    <div class="picked" id="picked{i}">未选择</div>
  </header>
  <table>
    <thead><tr><th class="chk">特殊</th><th>宝物名称</th><th>类型</th><th>品质</th><th>品相分区间</th><th>所属分组</th></tr></thead>
    <tbody>
{rows_html(i, s)}
    </tbody>
  </table>
</section>"""
    )

coll_rows = []
for g in dg["collections"]:
    for it in g["items"]:
        coll_rows.append(
            f"<tr><td>{it['name']}</td><td>{g['name']}</td><td><span class=\"q q{it.get('quality') or 0}\">q{it.get('quality')}</span></td></tr>"
        )

html = f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>挖宝图鉴 · 特殊宝物核对表</title>
<style>
  :root {{
    --bg:#f7f8fa; --card:#ffffff; --line:#e6e8ee; --text:#1f2430; --muted:#6b7280;
    --accent:#c0392b; --accent-soft:#fdecea; --blue:#2f6feb; --chip:#f2f4f8;
  }}
  * {{ box-sizing:border-box; }}
  body {{ margin:0; background:var(--bg); color:var(--text);
    font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;
    font-size:14px; line-height:1.6; }}
  .wrap {{ max-width:1080px; margin:0 auto; padding:28px 20px 90px; }}
  h1 {{ font-size:22px; margin:0 0 6px; letter-spacing:.5px; }}
  .sub {{ color:var(--muted); margin:0 0 18px; }}
  .tips {{ background:#fff; border:1px solid var(--line); border-left:3px solid var(--accent);
    border-radius:8px; padding:12px 16px; margin-bottom:22px; color:#424b5c; }}
  .tips b {{ color:var(--accent); }}
  .scene {{ background:var(--card); border:1px solid var(--line); border-radius:10px;
    margin-bottom:18px; overflow:hidden; }}
  .sh {{ display:flex; justify-content:space-between; align-items:center; gap:12px;
    padding:12px 16px; background:#fbfcfe; border-bottom:1px solid var(--line); }}
  .st {{ display:flex; align-items:baseline; gap:10px; }}
  .st h2 {{ font-size:16px; margin:0; }}
  .cnt {{ color:var(--muted); font-size:12px; }}
  .picked {{ font-size:12px; color:var(--muted); background:var(--chip);
    border-radius:20px; padding:4px 12px; white-space:nowrap; }}
  .picked.on {{ background:var(--accent-soft); color:var(--accent); font-weight:600; }}
  table {{ width:100%; border-collapse:collapse; }}
  th, td {{ padding:8px 12px; border-bottom:1px solid #f0f2f6; text-align:left; }}
  th {{ font-size:12px; font-weight:600; color:var(--muted); background:#fff; }}
  tbody tr:last-child td {{ border-bottom:none; }}
  tr.item:hover {{ background:#fafbfd; }}
  tr.item.inferred {{ background:#fffdf9; }}
  tr.item.checked {{ background:var(--accent-soft); }}
  .chk {{ width:52px; text-align:center; }}
  input[type=checkbox] {{ width:16px; height:16px; accent-color:var(--accent); cursor:pointer; }}
  .nm {{ font-weight:600; }}
  .tag {{ display:inline-block; margin-left:8px; font-size:11px; font-weight:500;
    color:#8a6d3b; background:#fdf3e2; border-radius:4px; padding:0 6px; }}
  .tp {{ color:#4b5563; }}
  .gr {{ color:var(--muted); font-variant-numeric:tabular-nums; }}
  .gp {{ color:var(--muted); }}
  .q {{ display:inline-block; padding:1px 8px; border-radius:20px; font-size:12px; font-weight:600; }}
  .q0, .q1 {{ background:#f1f2f4; color:#6b7280; }}
  .q2 {{ background:#e8f6ee; color:#1f7a4d; }}
  .q3 {{ background:#e9f0fd; color:#2456b3; }}
  .q4 {{ background:#f2eafd; color:#6b3fa0; }}
  .q5 {{ background:#fdeaea; color:#b02a1f; }}
  .appendix {{ margin-top:26px; }}
  .appendix h3 {{ font-size:15px; margin:0 0 8px; }}
  .appendix table {{ background:var(--card); border:1px solid var(--line); border-radius:10px; overflow:hidden; }}
  .bar {{ position:fixed; left:0; right:0; bottom:0; background:rgba(255,255,255,.96);
    border-top:1px solid var(--line); backdrop-filter:blur(8px); }}
  .bar .in {{ max-width:1080px; margin:0 auto; padding:10px 20px; display:flex;
    align-items:center; gap:12px; }}
  .bar .sum {{ flex:1; font-size:13px; color:var(--muted); }}
  .bar .sum b {{ color:var(--accent); }}
  button {{ font:inherit; font-size:13px; padding:7px 14px; border-radius:8px; cursor:pointer;
    border:1px solid var(--line); background:#fff; color:var(--text); }}
  button.primary {{ background:var(--accent); border-color:var(--accent); color:#fff; }}
  button:hover {{ filter:brightness(.97); }}
  .mask {{ position:fixed; inset:0; background:rgba(20,24,34,.45); display:none;
    align-items:center; justify-content:center; padding:20px; z-index:50; }}
  .mask.show {{ display:flex; }}
  .dlg {{ background:#fff; border-radius:12px; width:min(680px,100%); max-height:86vh;
    display:flex; flex-direction:column; padding:18px 18px 14px; box-shadow:0 18px 50px rgba(0,0,0,.2); }}
  .dh {{ font-size:16px; font-weight:700; margin-bottom:4px; }}
  .dhint {{ font-size:12px; color:var(--muted); margin-bottom:10px; }}
  #dlgText {{ flex:1; min-height:260px; width:100%; resize:vertical; font-family:ui-monospace,Menlo,Consolas,monospace;
    font-size:12px; line-height:1.7; padding:12px; border:1px solid var(--line); border-radius:8px;
    background:#fbfcfe; color:var(--text); }}
  .df {{ display:flex; justify-content:flex-end; gap:10px; margin-top:12px; }}
  @media (max-width:640px) {{
    .gp, th:nth-child(6) {{ display:none; }}
    th, td {{ padding:8px 8px; }}
  }}
</style>
</head>
<body>
<div class="wrap">
  <h1>挖宝图鉴 · 特殊宝物核对表</h1>
  <p class="sub">共 {len(dg['scenes'])} 个场景 · {sum(len(g['items']) for s in dg['scenes'] for g in s['groups'])} 件宝物（不含收藏品）</p>

  <div class="tips">
    <b>怎么用：</b>每个场景只有 <b>1 件</b> 宝物需要特殊细锤——在每个场景里勾出那一件即可（同场景内只能勾一个）。
    带「推测」标签的是我按「该场景唯一 q5 极品」规律预填的结果，如果不对，直接改勾并告诉我。
    全部确认后点右下角「导出结果」，把结果贴给我。
  </div>

{''.join(sections)}

  <div class="appendix">
    <h3>附：收藏品图鉴（{len(dg['collections'])} 组，不在场景内，仅供对照）</h3>
    <table>
      <thead><tr><th>宝物名称</th><th>所属分组</th><th>品质</th></tr></thead>
      <tbody>
{''.join(coll_rows)}
      </tbody>
    </table>
  </div>
</div>

<div class="bar"><div class="in">
  <div class="sum" id="sum">已确认 0 / {len(dg['scenes'])} 个场景</div>
  <button id="clear">清空</button>
  <button class="primary" id="export">导出结果</button>
</div></div>

<script>
const SCENES = {json.dumps([s['name'] for s in dg['scenes']], ensure_ascii=False)};
const state = {{}};

function refresh() {{
  document.querySelectorAll('section.scene').forEach(sec => {{
    const idx = sec.dataset.scene;
    const sel = sec.querySelector('input[type=checkbox]:checked');
    const box = document.getElementById('picked' + idx);
    sec.querySelectorAll('tr.item').forEach(tr => {{
      tr.classList.toggle('checked', tr.querySelector('input').checked);
    }});
    if (sel) {{
      const tr = sel.closest('tr');
      box.textContent = '特殊宝物：' + tr.dataset.name;
      box.classList.add('on');
      state[idx] = {{ scene: SCENES[idx], item: tr.dataset.name, type: tr.dataset.type, quality: +tr.dataset.quality }};
    }} else {{
      box.textContent = '未选择';
      box.classList.remove('on');
      delete state[idx];
    }}
  }});
  document.getElementById('sum').innerHTML = '已确认 <b>' + Object.keys(state).length + '</b> / ' + SCENES.length + ' 个场景';
}}

document.addEventListener('change', e => {{
  if (e.target.matches('tr.item input[type=checkbox]')) {{
    if (e.target.checked) {{
      const sec = e.target.closest('section.scene');
      sec.querySelectorAll('tr.item input').forEach(i => {{ if (i !== e.target) i.checked = false; }});
    }}
    refresh();
    saveLocal();
  }}
}});

document.getElementById('clear').onclick = () => {{
  document.querySelectorAll('tr.item input').forEach(i => i.checked = false);
  refresh();
  saveLocal();
}};

// ---- 本地暂存，刷新页面也不丢 ----
function saveLocal() {{
  try {{
    const list = SCENES.map((_, i) => state[i] ? state[i].item : null);
    localStorage.setItem('digChecklistV1', JSON.stringify(list));
  }} catch (err) {{}}
}}
function loadLocal() {{
  try {{
    const raw = localStorage.getItem('digChecklistV1');
    if (!raw) return;
    const list = JSON.parse(raw);
    document.querySelectorAll('section.scene').forEach(sec => {{
      const want = list[+sec.dataset.scene];
      if (!want) return;
      sec.querySelectorAll('tr.item').forEach(tr => {{
        const box = tr.querySelector('input');
        if (box) box.checked = (tr.dataset.name === want);
      }});
    }});
  }} catch (err) {{}}
}}

// ---- 导出：弹窗展示文本，绝不依赖剪贴板权限 ----
function fallbackCopy(text) {{
  try {{
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.top = '-1000px';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    return true;
  }} catch (err) {{ return false; }}
}}

function showResult(text) {{
  const mask = document.getElementById('dlgMask');
  const box = document.getElementById('dlgText');
  box.value = text;
  mask.classList.add('show');
  box.focus();
  box.select();
  let ok = false;
  if (navigator.clipboard && navigator.clipboard.writeText) {{
    navigator.clipboard.writeText(text).then(() => {{
      document.getElementById('dlgHint').textContent = '✅ 已自动复制到剪贴板，直接粘贴给我即可';
    }}).catch(() => {{
      ok = fallbackCopy(text);
      document.getElementById('dlgHint').textContent = ok ? '✅ 已复制到剪贴板，直接粘贴给我' : '请手动全选复制下面的内容';
    }});
  }} else {{
    ok = fallbackCopy(text);
    document.getElementById('dlgHint').textContent = ok ? '✅ 已复制到剪贴板，直接粘贴给我' : '请手动全选复制下面的内容';
  }}
}}

document.getElementById('dlgClose').onclick = () => document.getElementById('dlgMask').classList.remove('show');
document.getElementById('dlgMask').onclick = (e) => {{
  if (e.target.id === 'dlgMask') e.target.classList.remove('show');
}};
document.getElementById('dlgCopy').onclick = () => {{
  const text = document.getElementById('dlgText').value;
  const ok = fallbackCopy(text);
  document.getElementById('dlgHint').textContent = ok ? '✅ 已复制' : '复制失败，请手动全选后按 Ctrl+C';
}};

document.getElementById('export').onclick = () => {{
  try {{
    refresh();
    const list = SCENES.map((_, i) => state[i] ? state[i] : {{ scene: SCENES[i], item: null }});
    const filled = list.filter(x => x.item);
    let text = '挖宝特殊宝物核对结果：\\n';
    list.forEach((x, i) => {{
      text += (i + 1) + '. ' + x.scene + ' → ' + (x.item ? x.item + '（' + (x.type || '') + ' / q' + (x.quality || '') + '）' : '（未勾选）') + '\\n';
    }});
    if (filled.length < SCENES.length) text += '\\n注意：还有 ' + (SCENES.length - filled.length) + ' 个场景未勾选\\n';
    text += '\\n---JSON---\\n' + JSON.stringify(list, null, 2);
    showResult(text);
  }} catch (err) {{
    alert('导出出错：' + err.message);
  }}
}};

loadLocal();
refresh();
</script>

<div class="mask" id="dlgMask">
  <div class="dlg">
    <div class="dh">核对结果（可直接复制粘贴给我）</div>
    <div class="dhint" id="dlgHint">请手动全选复制下面的内容</div>
    <textarea id="dlgText" readonly></textarea>
    <div class="df">
      <button id="dlgCopy">再复制一次</button>
      <button class="primary" id="dlgClose">关闭</button>
    </div>
  </div>
</div>
</body>
</html>
"""

open(OUT, "w", encoding="utf-8").write(html)
print("written", OUT, len(html))
