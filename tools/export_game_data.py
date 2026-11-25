#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""从解码后的配置导出 英雄/阵营/羁绊/技能 结构化数据"""
import json
import os
import sys

SRC = r"C:\Users\Administrator\AppData\Roaming\Tencent\xwechat\radium\users\17fca8483d3d2e771ee5d292a5e2834c\applet\local\wx95b8d1c9f729b0af\usr\gamecaches\configs\17920673043583.decoded.json"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data")


def main():
    d = json.load(open(SRC, encoding="utf-8"))
    os.makedirs(OUT, exist_ok=True)

    eras = d.get("eraEnumKeyValue", {})
    era_name = {int(v["eraEnum"]): v.get("name", "") for v in eras.values()}

    skills = d.get("skill", {}).get("skillHero", {})
    fetters = d.get("fetter", {})
    heroes = d.get("hero", {})

    def skill_brief(sid):
        s = skills.get(str(sid))
        if not s:
            return None
        return {"id": sid, "name": s.get("name", ""), "desc": s.get("explain", "")}

    # 羁绊表
    fetter_out = {}
    for fid, f in fetters.items():
        partners = []
        for hid in f.get("fetterHero") or []:
            h = heroes.get(str(hid))
            partners.append(h.get("name", str(hid)) if h else str(hid))
        fetter_out[fid] = {
            "id": int(fid),
            "name": f.get("fetterName", ""),
            "heroes": partners,
            "effect": f.get("fetterExplain", ""),
            "skill": skill_brief(f.get("fetterSkill")) if f.get("fetterSkill") else None,
        }

    # 英雄表
    hero_out = {}
    for hid, h in heroes.items():
        flist = []
        for fid in h.get("fetter") or []:
            fb = fetter_out.get(str(fid))
            if fb:
                flist.append({"id": fb["id"], "name": fb["name"], "heroes": fb["heroes"], "effect": fb["effect"]})
        hero_out[hid] = {
            "id": int(hid),
            "name": h.get("name", ""),
            "title": h.get("title", ""),
            "era": era_name.get(h.get("era"), str(h.get("era"))),
            "eraId": h.get("era"),
            "quality": h.get("quality"),
            "qualityFrom": h.get("qualityFrom"),
            "force": h.get("force"),
            "iq": h.get("iq"),
            "gender": h.get("gender"),
            "skill": skill_brief(h.get("skill")),
            "fetters": flist,
            "fetterNames": h.get("fetterName") or [],
            "explain": h.get("explain", ""),
            "victory": h.get("victory", ""),
            "bio": h.get("invadeUndergo", ""),
            "evolutionId": h.get("evolutionId", 0),
        }

    faction_out = []
    for v in sorted(eras.values(), key=lambda x: int(x["eraEnum"])):
        faction_out.append({
            "id": int(v["eraEnum"]),
            "name": v.get("name", ""),
            "formationEffect": v.get("eraSkillEra", ""),   # 阵容效果
            "campSkill": v.get("eraSkillSkill", ""),        # 阵营技能
        })

    # 神兽（宠物）表
    pets = d.get("pet", {})
    pet_skills = d.get("skill", {}).get("skillPet", {})
    merges = d.get("petMerge", {})
    eggs = d.get("petEgg", {})

    def pet_skill_brief(sid):
        s = pet_skills.get(str(sid))
        if not s:
            return {"id": sid, "name": f"未知技能{sid}", "desc": ""}
        return {"id": sid, "name": s.get("name", ""), "desc": s.get("explain", "")}

    # 合成路径索引：产物 -> 配方列表
    merge_by_out = {}
    merge_by_material = {}
    for m in merges.values():
        a, b = m.get("petA"), m.get("petB")
        outs = m.get("successPet") or []
        for o in outs:
            merge_by_out.setdefault(str(o), []).append({"petA": a, "petB": b, "weights": m.get("successPetWeight")})
        if outs:
            merge_by_material.setdefault(str(a), []).append({"other": b, "outs": outs})
            merge_by_material.setdefault(str(b), []).append({"other": a, "outs": outs})

    def pos_name(p):
        return {1: "前排", 2: "中排", 3: "后排"}.get(p, str(p))

    pet_out = {}
    for pid, p in pets.items():
        # 技能组：levelSkill 按组给出，levelSkillUnlock 是对应解锁等级
        groups = []
        for gi, ids in enumerate(p.get("levelSkill") or []):
            unlock = (p.get("levelSkillUnlock") or [[]])[gi] or []
            groups.append({
                "unlockLevels": unlock,
                "skills": [pet_skill_brief(i) for i in ids],
            })
        pet_out[pid] = {
            "id": int(pid),
            "name": p.get("name", ""),
            "quality": p.get("quality"),
            "qualityIcon": p.get("qualityIcon", ""),
            "battlePos": pos_name(p.get("battlePos")),
            "baseFightPower": p.get("baseFightPower"),   # 武力区间
            "baseSmartPower": p.get("baseSmartPower"),   # 智力区间
            "inherit": {                                   # 继承比例（千分比）
                "force": round((p.get("petInherit") or [0, 0])[0] / 10, 1),
                "iq": round((p.get("petInherit") or [0, 0])[1] / 10, 1),
            },
            "petType": p.get("petType"),
            "skillGroups": groups,
            "story": p.get("story", ""),
            "mergeFrom": merge_by_out.get(pid, []),        # 合成它的配方
            "mergeAsMaterial": merge_by_material.get(pid, []),  # 它做材料能合出什么
        }

    pet_egg_out = {}
    for eid, e in eggs.items():
        pet_egg_out[eid] = {
            "id": int(eid),
            "name": e.get("name", ""),
            "quality": e.get("quality"),
            "cost": e.get("costPrice"),
            "petWeights": e.get("petWeights"),
        }

    # ========== 英雄成长（强化/等级/突破） ==========
    ITEM_NAME = {6: "鸡腿", 7: "小兵", 4: "英雄之魂", 60: "群英点", 3: "铜钱", 8: "钻石",
                 25: "战略令", 26: "金色战略令", 33: "科技点", 57: "陨石", 58: "黄金陨石",
                 38: "神兽券", 39: "神兽碎片", 40: "神兽蛋"}

    def cons_name(c):
        t = c.get("type")
        return ITEM_NAME.get(t, f"type{t}")

    ups = d.get("heroUpgrade", {})
    tier_by_quality = {u.get("quality"): k for k, u in ups.items()}

    hero_growth = {}
    for tid, u in ups.items():
        lv_growth = u.get("modifyValueLevel") or []
        lv_cost = u.get("upgradeConsumNew") or []
        levels = []
        acc = {}
        for lv in range(len(lv_growth)):
            cons = {cons_name(c): c.get("num") for c in (lv_cost[lv] if lv < len(lv_cost) else [])}
            for k, v in cons.items():
                acc[k] = acc.get(k, 0) + v
            levels.append({
                "level": lv,
                "growth": lv_growth[lv],
                "cost": cons,
                "cumulative": dict(acc),
            })
        breaks = []
        for i in range(len(u.get("openLevel") or [])):
            breaks.append({
                "stage": i,
                "playerLevel": u["openLevel"][i],
                "soulNeed": u["upgradeSelf"][i] if u.get("upgradeSelf") else 0,
                "extraNeed": (u.get("upgradeSub")[i] if u.get("upgradeSub") else 0),
                "bonus": u["modifyValueSelf"][i] if u.get("modifyValueSelf") else 0,
            })
        hero_growth[tid] = {
            "id": int(tid),
            "quality": u.get("quality"),
            "tier": u.get("num"),
            "growthPerLevel": lv_growth[1] if len(lv_growth) > 1 else 0,
            "maxLevel": len(lv_growth) - 1,
            "breakthroughs": breaks,
            "levels": levels,
        }

    # 每个英雄 → 成长档位
    hero_tier = {}
    for hid, h in heroes.items():
        cfg = str(h.get("upgradeConfig") or 0)
        tier = cfg if cfg in hero_growth else tier_by_quality.get(h.get("quality"))
        hero_tier[hid] = {"heroId": int(hid), "name": h.get("name", ""),
                          "quality": h.get("quality"), "upgradeConfig": tier}

    # ========== 神兽成长（等级经验 / 属性 / 怪蛋经验） ==========
    pl = d.get("petLevel", {})
    pet_levels = []
    for k in sorted(pl, key=lambda x: int(x)):
        v = pl[k]
        pet_levels.append({
            "level": v.get("id"),
            "upExp": v.get("upExp"),          # 升到下一级所需经验
            "accExp": v.get("accExp"),        # 从1级升到本级累计经验
            "addByQuality": v.get("addAttribute"),  # 按下标=品质(0~8)取成长值
        })

    # 怪蛋（吞噬给经验）
    egg_food = []
    for pid, p in pets.items():
        if p.get("petType") in (2, 3):
            sk = (p.get("levelSkill") or [[]])[0]
            desc = pet_skill_brief(sk[0])["desc"] if sk else ""
            exp = 0
            for tok in ("提供", "经验"):
                pass
            import re as _re
            m = _re.search(r"提供(\d+)经验", desc)
            if m:
                exp = int(m.group(1))
            egg_food.append({"id": int(pid), "name": p.get("name", ""),
                             "quality": p.get("quality"), "petType": p.get("petType"),
                             "exp": exp, "desc": desc})

    pet_growth = {
        "maxLevel": len(pet_levels),
        "levels": pet_levels,
        "expFood": egg_food,
        "note": "addByQuality 的 9 个值对应神兽品质 0~8（D/C/B/A/S/SS/SSS/SSSS/U），取本级该品质的成长值",
    }

    # ========== 科技树 ==========
    import re as _re

    def cost_str(c):
        return f"{ITEM_NAME.get(c['type'], f"type{c['type']}")}x{c['num']}"

    tech_branches = {}
    for bk, branch in d.get("research", {}).items():
        items = []
        for rid, v in branch.items():
            items.append({
                "id": int(rid),
                "name": v.get("name", ""),
                "effect": v.get("effect", ""),
                "coin": v.get("spendCoin", 0),                       # 铜钱
                "items": [cost_str(c) for c in (v.get("upConsum") or [])],
                "timeMinutes": v.get("spendTime"),
                "stage": v.get("stage"),
                "location": v.get("location"),
                "unlockText": v.get("unlockText", ""),
            })
        items.sort(key=lambda x: (x["stage"] or 0, x["location"] or [0, 0]))
        tech_branches[bk] = {"count": len(items), "entries": items}

    tech_branches["_branchNames"] = {
        "researchTrade": "行商（消耗：铜钱）",
        "researchWar": "军事（消耗：铜钱+科技点）",
        "researchCombat": "战略（消耗：铜钱+战略令/金色战略令）",
        "researchHeroGroup": "群英（消耗：群英点）",
        "researchLocation": "行位（消耗：铜钱+陨石/黄金陨石）",
    }
    tech_branches["positionTech"] = d.get("positionTech", {})       # 阵位科技（陨石）

    # ========== 车夫答题题库 ==========
    quiz = []
    for k, v in d.get("funnyKnowledge", {}).items():
        q = v.get("Knowledge", "")
        blanks = len(_re.findall(r"\{\d\}", q))
        opts = v.get("selectAnswer") or []
        quiz.append({
            "id": int(k),
            "question": q,
            "blanks": blanks,
            "correctAnswers": opts[:blanks],      # 规律：前K个为正确答案
            "options": opts,                       # 全部选项（正确+干扰）
            "faceScore": v.get("FaceScore"),       # 答题获得颜值分
            "reduceTime": v.get("reduceTime"),
            "weight": v.get("weight"),
        })
    quiz.sort(key=lambda x: x["id"])

    with open(os.path.join(OUT, "tech_tree.json"), "w", encoding="utf-8") as f:
        json.dump(tech_branches, f, ensure_ascii=False, indent=1)
    with open(os.path.join(OUT, "carrier_quiz.json"), "w", encoding="utf-8") as f:
        json.dump({"total": len(quiz), "note": "correctAnswers=选项前K个(K=空格数)", "questions": quiz},
                  f, ensure_ascii=False, indent=1)

    # ========== 挖宝图鉴 / 场景 / 细锤 ==========
    ANTIQUE_TYPE = {1: "器物", 2: "奇珍", 3: "书画", 4: "典籍", 5: "垃圾", 6: "收藏品"}
    # 专用锤：玄玉=器物 / 玄铁=奇珍 / 石髓=书画 / 乌木=典籍（按 antiqueHammer.effects 的类型对应）
    an_data = d.get("antique", {})
    ef_data = d.get("antiqueEquipEffect", {})
    hammers = []
    for k, v in d.get("antiqueHammer", {}).items():
        effects = []
        for e in v.get("effects") or []:
            ef = ef_data.get(str(e.get("antiqueadditionType")), {})
            effects.append({
                "effect": ef.get("effectName", f"效果{e.get('antiqueadditionType')}"),
                "value": e.get("antiqueValue"),
                "desc": ef.get("effectDes", ""),
            })
        hammers.append({
            "id": int(k), "name": v.get("name"), "quality": v.get("quality"),
            "isInfinity": v.get("isInfinity"),
            "desc": v.get("hammerDes", ""), "effects": effects,
            "fishScene": v.get("fishScene") or [],
        })
    hammers.sort(key=lambda x: x["id"])

    # 特殊锤绑定：服务端逐场景硬编码，无统一公式（2026-10-20 用户实测推翻"唯一q5/类型规律"推断）。
    # 以下为用户人工确认的实测结果；未确认场景保留推断值并标记 confirmed=False。
    CONFIRMED_SPECIAL = {
        "荒沙古城": ("不落日轮", "石髓细锤", True),
        "青铜祭坛": ("苍穹祭神图", "玄铁细锤", True),
        "云岭古墓": ("玄甲镇墓俑", "乌木细锤", True),
        "江南旧窑": ("《秘色开片图谱》", "金丝细锤", True),
        "皇城遗址": ("宫墙琉璃残片", "云纹细锤", True),
        "海底沉船": ("不没星灯", "石髓细锤", False),   # 未确认，按奇珍q5推断
        "边塞烽燧": ("不熄烽心", "石髓细锤", False),   # 场景未开放，无法验证
    }

    used_gids = set()
    scenes = []
    for sid in sorted(d.get("antiqueScene", {}), key=int):
        s = d["antiqueScene"][sid]
        groups = []
        atlas = d.get("antiqueAtlas", {}).get(str(s["id"]), {})
        gids = atlas.get("fetters") or []
        if not gids:
            # 边塞烽燧等新场景：antiqueAtlas 尚未配置，取未分配的 fetter 组
            all_gids = sorted((int(k) for k in d.get("antiqueFetter", {}) if int(k) < 1000))
            gids = [g for g in all_gids if g not in used_gids and g > max(used_gids, default=0)][:5]
        scene_items = []
        for gid in gids:
            used_gids.add(int(gid))
            g = d.get("antiqueFetter", {}).get(str(gid))
            if not g:
                continue
            items = []
            for fid in g.get("fishes") or []:
                a = an_data.get(str(fid))
                if not a:
                    continue
                items.append({
                    "id": int(fid), "name": a.get("Name"),
                    "type": ANTIQUE_TYPE.get(a.get("type"), a.get("type")),
                    "typeId": a.get("type"),
                    "quality": a.get("quality"),
                    "gradeRange": [a.get("minLen"), a.get("maxLen")],  # 品相分区间
                    "reward": a.get("RewardData"),
                })
                scene_items.append(items[-1])
            groups.append({"groupId": int(gid), "name": g.get("name"), "items": items,
                           "effects": g.get("effects")})
        # 特殊宝物：优先用用户实测确认表，否则回退到 q5 推断
        conf = CONFIRMED_SPECIAL.get(s.get("name"))
        for it in scene_items:
            it["specialHammer"] = None
            it["needsSpecialHammer"] = False
            it["confirmed"] = False
        if conf:
            for it in scene_items:
                if it["name"] == conf[0]:
                    it["needsSpecialHammer"] = True
                    it["specialHammer"] = conf[1]
                    it["confirmed"] = conf[2]
                    special = it
                    break
        else:
            special = None
        scenes.append({"sceneId": int(sid), "name": s.get("name"),
                       "unlockOrder": s.get("unlockOrder"), "bait": s.get("baitAntiques"),
                       "specialItem": special.get("name") if special else None,
                       "groups": groups})

    # 收藏品独立组（atlas id 0）；发现地点在 antique[].desc「可在XX发现」，
    # 保底进度 = antique.lootValue（图鉴进度% = 累计进度/lootValue*100，满 100% 必得，每锤增量服务端结算），
    # 集齐加成 = antiqueFetter.effects（additionType6=全体，百分比=rewardValue/10，subType 1=武力 2=智力）
    _SUB = {0: "武智", 1: "武力", 2: "智力"}

    def _bonus_text(effects):
        return "、".join(
            f"全体{_SUB.get(e.get('subType'), e.get('subType'))}+{e.get('rewardValue', 0) / 10:g}%"
            for e in (effects or []) if e.get("additionType") == 6
        )

    coll_groups = []
    for gid in (d.get("antiqueAtlas", {}).get("0", {}).get("fetters") or []):
        g = d.get("antiqueFetter", {}).get(str(gid))
        if not g:
            continue
        items = []
        for fid in g.get("fishes") or []:
            a = an_data.get(str(fid))
            if a:
                items.append({"id": int(fid), "name": a.get("Name"), "type": "收藏品",
                              "quality": a.get("quality"), "reward": a.get("RewardData"),
                              "location": _re.search(r"可在(.+?)(?:发现|内发现)", a.get("desc", "")).group(1) if _re.search(r"可在(.+?)(?:发现|内发现)", a.get("desc", "")) else "未知",
                              "lootValue": a.get("lootValue", 0)})
        coll_groups.append({"groupId": int(gid), "name": g.get("name"), "items": items,
                            "bonus": _bonus_text(g.get("effects"))})

    shop_hammer = [{"id": int(k), "name": v.get("giftName"), "content": v.get("rewardContent"),
                    "price": v.get("price") or v.get("cost")}
                   for k, v in d.get("shop", {}).get("shopHammer", {}).items()]

    dig = {
        "typeNames": ANTIQUE_TYPE,
        "hammerByType": {1: "玄玉细锤（器物）", 2: "玄铁细锤（奇珍）", 3: "石髓细锤（书画）", 4: "乌木细锤（典籍）"},
        "note": "每个场景只有 1 件特殊宝物（needsSpecialHammer=true）需要专用细锤，其余宝物任何品质普通锤即可。"
                "绑定关系是服务端逐场景硬编码，无统一类型/品质公式（用户实测已推翻 q5 与类型规律推断）。"
                "confirmed=true 为玩家实测确认；false 为未验证推断。"
                "鉴赏/难觅类锤子只改变对应类型出现概率（antiqueEquipEffect 8-11提升 / 13-16降低）",
        "scenes": scenes,
        "collections": coll_groups,
        "hammers": hammers,
        "shopHammers": shop_hammer,
    }
    with open(os.path.join(OUT, "dig_atlas.json"), "w", encoding="utf-8") as f:
        json.dump(dig, f, ensure_ascii=False, indent=1)

    # ========== 藏宝阁等级 + 场景解锁条件 ==========
    # antiqueBox: 藏宝阁1~15级。fishTypeLimit=各类型(器物/奇珍/书画/典籍)订单位上限；
    # orderSilverCost=升到下一级需逐单完成的消耗序列（银币type61，10级起每单加夜明珠type63）；
    # timeCost=每单耗时(秒)。银币出售宝物获得，夜明珠特定细锤挖宝获得。
    pavilion_levels = []
    for k in sorted(d.get("antiqueBox", {}), key=int):
        b = d["antiqueBox"][k]
        costs = []
        for c in b.get("orderSilverCost") or []:
            costs.append({"item": "银币" if c["type"] == 61 else "夜明珠" if c["type"] == 63 else f"type{c['type']}",
                          "num": c["num"]})
        # 合并成逐单消耗
        orders = []
        for i in range(0, len(costs), 2 if len(costs) > 5 and len(costs) % 2 == 0 else 1):
            pass
        pavilion_levels.append({
            "level": int(k),
            "orderSlots": b.get("fishTypeLimit"),  # [器物,奇珍,书画,典籍] 同时接单位
            "nextLevelOrders": len(costs) and (len(costs) // 2 if len(costs) > 5 and len(costs) % 2 == 0 else len(costs)),
            "costPerOrder": costs,
            "orderTimeSec": b.get("timeCost"),
        })
    # 场景解锁条件（taskFish 任务组）
    scene_unlocks = {}
    tfish = d.get("task", {}).get("taskFish", {})
    for v in tfish.values():
        g = v.get("taskGroup")
        if g and 1 <= g <= 6:
            td = v["taskDataDefine"]
            scene_unlocks.setdefault(g, []).append(v.get("taskDescription", ""))
    scene_unlock_list = []
    for sid in sorted(d.get("antiqueScene", {}), key=int):
        s = d["antiqueScene"][sid]
        scene_unlock_list.append({
            "sceneId": int(sid), "name": s.get("name"),
            "unlockOrder": s.get("unlockOrder"),
            "taskGroup": s.get("unlockTaskGroup"),
            "conditions": scene_unlocks.get(s.get("unlockTaskGroup"), []),
        })
    pavilion = {
        "currencies": {
            "银币": "提升藏宝阁等级/订单消耗；出售宝物获得",
            "夜明珠": "突破藏宝阁等级(高等级订单需要)；唯一来源=挖到「黑邃玉石」(id200002, q5奇珍, 每颗给2夜明珠, 全场景通用诱饵宝物, 固定奖励不受品相影响)。按规律用石髓细锤(书画难觅)提高奇珍类出现率",
            "珍珠": "提升寻宝具等级；挖宝订单获得 + 灵玉细锤每次挖宝直接给珍珠 + 挖到「灵白玉石」(id200001, q5奇珍)给6珍珠",
            "洛阳铲": "每次挖宝消耗10个；随时间恢复，上限2500",
        },
        "globalConfig": {"orderMaxCount": d["global"].get("antiqueOrderMaxCount"),
                          "dailyOrderReset": d["global"].get("dailyOrderResetCount"),
                          "digCostHammer": d["global"].get("antiqueCostHammer")},
        "levels": pavilion_levels,
        "sceneUnlocks": scene_unlock_list,
        "note": "orderSlots=[器物,奇珍,书画,典籍]可同时接单数；nextLevelOrders=升到下一级需完成订单数；"
                "costPerOrder 为逐单消耗（10级起每单额外含夜明珠，即突破材料）；orderTimeSec=每单耗时秒。",
    }
    with open(os.path.join(OUT, "treasure_pavilion.json"), "w", encoding="utf-8") as f:
        json.dump(pavilion, f, ensure_ascii=False, indent=1)

    with open(os.path.join(OUT, "hero_growth.json"), "w", encoding="utf-8") as f:
        json.dump({"tiers": hero_growth, "heroTier": hero_tier}, f, ensure_ascii=False, indent=1)
    with open(os.path.join(OUT, "pet_growth.json"), "w", encoding="utf-8") as f:
        json.dump(pet_growth, f, ensure_ascii=False, indent=1)

    with open(os.path.join(OUT, "pets.json"), "w", encoding="utf-8") as f:
        json.dump(pet_out, f, ensure_ascii=False, indent=1)
    with open(os.path.join(OUT, "pet_eggs.json"), "w", encoding="utf-8") as f:
        json.dump(pet_egg_out, f, ensure_ascii=False, indent=1)

    print(f"英雄 {len(hero_out)} 个，阵营 {len(faction_out)} 个，羁绊 {len(fetter_out)} 条，技能 {len(skills)} 条，"
          f"神兽 {len(pet_out)} 只，神兽蛋 {len(pet_egg_out)} 个，合成配方 {len(merges)} 条，"
          f"英雄成长档 {len(hero_growth)} 个，神兽等级 {len(pet_levels)} 级")

    # 用截图校验：黄金甲·精卫
    h = hero_out.get("800460")
    print("\n=== 校验：黄金甲·精卫（对照你的截图）===")
    print("名字:", h["name"], "| 阵营:", h["era"], "| 武力:", h["force"], "| 智力:", h["iq"])
    print("技能:", h["skill"]["name"], "->", h["skill"]["desc"].replace("\n", " / "))
    for fb in h["fetters"]:
        print("羁绊:", fb["name"], "(", "、".join(fb["heroes"]), ")", fb["effect"])

    # 用截图校验：神兽穷奇
    q = pet_out.get("910901")
    print("\n=== 校验：神兽穷奇（对照你的截图）===")
    print("名字:", q["name"], "| 品质:", q["qualityIcon"], "| 位置:", q["battlePos"],
          "| 继承: 武力", q["inherit"]["force"], "% / 智力", q["inherit"]["iq"], "%")
    print("小传:", q["story"][:60], "...")
    for g in q["skillGroups"]:
        for s in g["skills"]:
            print("技能:", s["name"], "->", s["desc"].replace("\n", " / ")[:70])
    print("合成配方数:", len(q["mergeFrom"]), "| 作为材料参与:", len(q["mergeAsMaterial"]))


if __name__ == "__main__":
    main()
