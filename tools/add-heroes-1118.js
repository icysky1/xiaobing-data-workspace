#!/usr/bin/env node
// 从最新解码配置（usr/gamecaches/configs）增量更新小程序英雄/羁绊数据
// 只追加新英雄与新羁绊，不改动既有条目（既有英雄本次无实质变动，已比对确认）
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CFG = path.join(ROOT, 'data/configs/config-1110.decoded.json');
const HERO_JS = path.join(ROOT, 'xiaobing-data/data/heroes.js');
const FETTER_JS = path.join(ROOT, 'xiaobing-data/data/fetters.js');

const cfg = JSON.parse(fs.readFileSync(CFG, 'utf8'));
const eraName = {};
Object.values(cfg.eraEnumKeyValue || {}).forEach((v) => { eraName[v.eraEnum] = v.name; });
const skillHero = (cfg.skill && cfg.skill.skillHero) || {};
const heroes = cfg.hero;
const fetters = cfg.fetter;

const curHeroes = require(HERO_JS);
const curFetters = require(FETTER_JS);

const Q2UC = { 2: 290004, 3: 290003, 4: 290002, 5: 290001, 6: 290006 };

function skillOf(sid) {
  const s = skillHero[String(sid)];
  return s ? { name: s.name || '', desc: s.explain || '' } : null;
}

// 1) 新英雄
const newHeroIds = Object.keys(heroes).map(Number).filter((id) => !curHeroes[id]);
const addedHeroes = [];
for (const id of newHeroIds) {
  const h = heroes[String(id)];
  const flist = (h.fetter || []).map((fid) => {
    const f = fetters[String(fid)];
    if (!f) return null;
    return {
      id: Number(fid),
      name: f.fetterName || '',
      heroes: (f.fetterHero || []).map((x) => (heroes[String(x)] || {}).name || String(x)),
      effect: f.fetterExplain || '',
    };
  }).filter(Boolean);
  const rec = {
    id,
    name: h.name || '',
    title: h.title || '',
    era: eraName[h.era] || String(h.era),
    quality: h.quality,
    force: h.force,
    iq: h.iq,
    skill: skillOf(h.skill),
    explain: h.explain || '',
    gender: h.gender,
    uc: h.upgradeConfig || Q2UC[h.quality] || 0,
    fetters: flist,
  };
  curHeroes[id] = rec;
  addedHeroes.push(rec);
}

// 2) 新羁绊
const newFetterIds = Object.keys(fetters).filter((fid) => !curFetters[fid]);
const addedFetters = [];
for (const fid of newFetterIds) {
  const f = fetters[fid];
  const rec = {
    id: Number(fid),
    name: f.fetterName || '',
    heroes: (f.fetterHero || []).map((x) => (heroes[String(x)] || {}).name || String(x)),
    effect: f.fetterExplain || '',
    skill: f.fetterSkill ? (skillHero[String(f.fetterSkill)] ? {
      id: f.fetterSkill,
      name: skillHero[String(f.fetterSkill)].name || '',
      desc: skillHero[String(f.fetterSkill)].explain || '',
    } : null) : null,
  };
  curFetters[fid] = rec;
  addedFetters.push(rec);
}

fs.writeFileSync(HERO_JS, 'module.exports=' + JSON.stringify(curHeroes), 'utf8');
fs.writeFileSync(FETTER_JS, 'module.exports=' + JSON.stringify(curFetters), 'utf8');

console.log('新增英雄', addedHeroes.length, '新增羁绊', addedFetters.length);
addedHeroes.forEach((h) => console.log('  +', h.id, h.name, h.title, h.era, 'Q' + h.quality, '力' + JSON.stringify(h.force), '智' + JSON.stringify(h.iq), '羁绊' + h.fetters.length, '技能:' + (h.skill ? h.skill.name : '-')));
addedFetters.forEach((f) => console.log('  +羁绊', f.id, f.name, f.heroes.join('、'), f.effect));
console.log('heroes 总数', Object.keys(curHeroes).length, 'fetters 总数', Object.keys(curFetters).length);
