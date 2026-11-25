# -*- coding: utf-8 -*-
"""构建小程序静态数据模块（扁平主包版）：全部数据进 data/，按需瘦身"""
import json, os, math

ROOT = os.path.join(os.path.dirname(__file__), "..", "xiaobing-data")
DATA = os.path.join(os.path.dirname(__file__), "..", "data")
SRC = r"C:/Users/Administrator/AppData/Roaming/Tencent/xwechat/radium/users/17fca8483d3d2e771ee5d292a5e2834c/applet/local/wx95b8d1c9f729b0af/usr/gamecaches/configs/17920673043583.decoded.json"

def dump(obj, rel):
    p = os.path.join(ROOT, rel)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, "w", encoding="utf-8") as f:
        f.write("module.exports=" + json.dumps(obj, ensure_ascii=False, separators=(",", ":")) + ";")
    print(rel, os.path.getsize(p) // 1024, "KB")

def load(name):
    return json.load(open(os.path.join(DATA, name), encoding="utf-8"))

dump(load("carrier_quiz.json"), "data/quiz.js")
# 英雄瘦身：去内部 id（skill.id / fetter.id），技能与羁绊保留展示字段
heroes = load("heroes.json")
heroes_min = {}
for k, h in heroes.items():
    heroes_min[k] = {
        "id": h["id"], "name": h["name"], "title": h.get("title", ""), "era": h.get("era", ""),
        "quality": h.get("quality"), "force": h.get("force"), "iq": h.get("iq"),
        "skill": ({"name": h["skill"]["name"], "desc": h["skill"]["desc"]} if h.get("skill") else None),
        "fetters": [{"name": f["name"], "heroes": f.get("heroes", []), "effect": f.get("effect", "")}
                    for f in h.get("fetters", [])],
    }
dump(heroes_min, "data/heroes.js")
dump(load("fetters.json"), "data/fetters.js")
dump(load("dig_atlas.json"), "data/atlas.js")
dump(load("treasure_pavilion.json"), "data/pavilion.js")

# 神兽瘦身
pets = load("pets.json")
pets_min = [{
    "id": x["id"], "name": x["name"], "qi": x.get("qualityIcon"), "q": x.get("quality", 0),
    "pos": x.get("battlePos"), "inherit": x.get("inherit"), "story": x.get("story"),
    "fp": x.get("baseFightPower"), "sp": x.get("baseSmartPower"),
    "mf": x.get("mergeFrom") or [], "mm": x.get("mergeAsMaterial") or [],
    "skills": [{"n": s["name"], "d": s["desc"]} for g in x.get("skillGroups", []) for s in g.get("skills", [])],
} for x in (pets.values() if isinstance(pets, dict) else pets)]
dump(pets_min, "data/pets.js")

# 科技瘦身（短键名）
tech = load("tech_tree.json")
tech_min = {k: {"entries": [{"n": e.get("name"), "e": e.get("effect"), "c": e.get("coin"),
                             "i": e.get("items"), "t": e.get("timeMinutes"), "u": e.get("unlockText")}
                            for e in v["entries"]]}
            for k, v in tech.items() if isinstance(v, dict) and "entries" in v}
dump(tech_min, "data/tech.js")

# ---- 装备数据（含逐级消耗，预计算） ----
cfg = json.load(open(SRC, encoding="utf-8"))
eqs = []
for e in cfg["antiqueEquip"].values():
    A = e["upgradeCostCoeA"]; C = e["upgradeCostCoeC"]; D = e["upgradeCostCoeD"]
    B = e["upgradeCostQualityCoeB"]; Qy = e["upgradeCostQy"]; mx = e["qualityMaxLevel"]
    levels = []
    for q in range(1, 8):
        b = B[q - 1]; qy = Qy[q - 1]
        rows = []; cum = 0
        for lv in range(1, mx[q - 1] + 1):
            c = math.floor(A + b * lv + C * qy ** D)
            cum += c
            rows.append([lv, c, cum])
        levels.append({"quality": q, "maxLevel": mx[q - 1], "rows": rows})
    eqs.append({
        "name": e["name"], "baseEffect": e["baseEffect"], "levels": levels,
        "baseLevelBonuses": e["baseLevelBonuses"],
        "recoinSilver": math.floor(e["recoinCostCoeA"] + e["recoinCostCoeB"] * e["recoinCostQy"][0]),
        "recoinDiamond": math.floor(e["recoinDiamondCostCoeA"] + e["recoinDiamondCostCoeB"] * e["recoinDiamondCostQy"][0]),
        "recoinMaxQy": e["recoinEffectQualityMax"][0],
    })
effects = [{"name": x["effectName"], "special": x["special"], "des": x["effectDes"]}
           for x in sorted(cfg["antiqueEquipEffect"].values(), key=lambda x: x["id"])]
dump({"equips": eqs, "effects": effects}, "data/equips.js")

# ---- 跑商数据 ----
ptName = {int(k): v["typeName"] for k, v in cfg["productType"].items()}
cityName = {int(k): v["cityName"] for k, v in cfg["city"].items()}
products = sorted(cfg["product"].values(), key=lambda p: (p["productType"], -p["price"]))
prod = [{"name": p["name"], "type": ptName.get(p["productType"], str(p["productType"])),
         "quality": p.get("quality", 1), "price": p["price"],
         "from": [cityName.get(c, c) for c in p.get("fromCity", [])]} for p in products]
cities = []
for c in sorted(cfg["city"].values(), key=lambda c: c["id"]):
    sell = [cfg["product"].get(str(sid), {}).get("name", f"?{sid}") for sid in c.get("sell", [])]
    buys = [ptName.get(b, f"?{b}") for b in c.get("buy", [])]
    dead = all(str(b) not in ptName for b in c.get("buy", []))
    cities.append({"name": c["cityName"], "sell": sell, "unlock": c.get("productUnlock", []),
                   "buy": buys, "dead": dead,
                   "specialPremium": c.get("specialPremium", []), "todayPremium": c.get("todayPremium", [])})
dump({"products": prod, "cities": cities}, "data/trade.js")
print("done")
