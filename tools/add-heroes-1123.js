#!/usr/bin/env node
// 从 11-23 解码配置增量更新小程序英雄/羁绊/神兽数据
// 内容：27 名赛博系列 Q6 进化英雄（800545~800571）+ 108 条新羁绊
//      + 旧英雄 evolutionId 进化指针 + 3 处既有英雄修正 + 新神兽白泽 + 鸣蛇解锁等级修正
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CFG = path.join(ROOT, 'data/configs/config-1123.decoded.json');
const HERO_JS = path.join(ROOT, 'xiaobing-data/data/heroes.js');
const FETTER_JS = path.join(ROOT, 'xiaobing-data/data/fetters.js');
const PETS_JS = path.join(ROOT, 'xiaobing-data/data/pets.js');

const cfg = JSON.parse(fs.readFileSync(CFG, 'utf8'));
const eraName = {};
Object.values(cfg.eraEnumKeyValue || {}).forEach((v) => { eraName[v.eraEnum] = v.name; });
const skillHero = (cfg.skill && cfg.skill.skillHero) || {};
const skillPet = (cfg.skill && cfg.skill.skillPet) || {};
const heroes = cfg.hero;
const fetters = cfg.fetter;

const curHeroes = require(HERO_JS);
const curFetters = require(FETTER_JS);
const curPets = require(PETS_JS);

const Q2UC = { 2: 290004, 3: 290003, 4: 290002, 5: 290001, 6: 290006 };

function skillOf(sid) {
  const s = skillHero[String(sid)];
  return s ? { name: s.name || '', desc: s.explain || '' } : null;
}

// ---- 1) 既有英雄：进化指针 + 数据修正 ----
let evoCount = 0, fixCount = 0;
for (const [id, h] of Object.entries(heroes)) {
  const rec = curHeroes[id];
  if (!rec) continue;
  if (h.evolutionId && rec.evolve !== h.evolutionId) {
    rec.evolve = h.evolutionId;
    evoCount++;
  }
  // 石矶娘娘性别修正 1→2
  if (id === '800046' && rec.gender !== h.gender) { rec.gender = h.gender; fixCount++; console.log('修正性别:', rec.name, '→', h.gender === 2 ? '女' : '男'); }
  // 洪秀全称号修正
  if (id === '800340' && rec.title !== h.title) { rec.title = h.title; fixCount++; console.log('修正称号:', rec.name, '→', h.title); }
}

// ---- 2) 新英雄（赛博系列）----
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
  if (h.evolutionId) rec.evolve = h.evolutionId;
  curHeroes[id] = rec;
  addedHeroes.push(rec);
}

// ---- 3) 新羁绊 ----
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

// ---- 4) 神兽：新增白泽 + 鸣蛇解锁等级修正 ----
function petSkillBrief(sid) {
  const s = skillPet[String(sid)];
  return s ? { name: s.name || '', desc: s.explain || '' } : { name: '未知技能' + sid, desc: '' };
}
function buildPet(pid) {
  const p = cfg.pet[String(pid)];
  const merges = Object.values(cfg.petMerge || {});
  const mergeFrom = merges.filter((m) => (m.successPet || []).includes(pid))
    .map((m) => ({ petA: m.petA, petB: m.petB }));
  const mergeAsMaterial = merges.filter((m) => m.petA === pid || m.petB === pid)
    .map((m) => ({ other: m.petA === pid ? m.petB : m.petA, outs: m.successPet }));
  const skills = [];
  (p.levelSkill || []).forEach((ids, gi) => {
    const unlock = (p.levelSkillUnlock || [])[gi] || [];
    ids.forEach((sid, si) => {
      const s = petSkillBrief(sid);
      skills.push({ n: s.name, d: s.desc, ul: unlock[si] || 1 });
    });
  });
  const inherit = p.petInherit || [0, 0];
  return {
    id: p.id,
    name: p.name || '',
    qi: p.qualityIcon || '',
    q: p.quality || 0,
    pos: { 1: '前排', 2: '中排', 3: '后排' }[p.battlePos] || String(p.battlePos),
    inherit: { force: Math.round(inherit[0] / 10 * 10) / 10, iq: Math.round(inherit[1] / 10 * 10) / 10 },
    story: p.story || '',
    fp: p.baseFightPower,
    sp: p.baseSmartPower,
    mf: mergeFrom,
    mm: mergeAsMaterial,
    skills,
  };
}
let petAdded = 0, petFixed = 0;
const petsArr = Array.isArray(curPets) ? curPets : Object.values(curPets);
if (!petsArr.find((x) => x.id === 910807)) {
  const bz = buildPet(910807);
  petsArr.push(bz);
  petsArr.sort((a, b) => a.id - b.id);
  petAdded++;
}
const ms = petsArr.find((x) => x.id === 910804);
if (ms) {
  const np = cfg.pet['910804'];
  const unlock = (np.levelSkillUnlock || [])[2] || [];
  let changed = false;
  (np.levelSkill[2] || []).forEach((sid, si) => {
    const sk = ms.skills.find((s) => s.n === (skillPet[String(sid)] || {}).name);
    const ul = unlock[si] || 1;
    if (sk && sk.ul !== ul) { sk.ul = ul; changed = true; }
  });
  if (changed) { petFixed++; console.log('修正鸣蛇第三技能解锁等级 →', JSON.stringify(ms.skills.filter((s) => s.n === '龟裂禁域').map((s) => s.ul))); }
}

fs.writeFileSync(HERO_JS, 'module.exports=' + JSON.stringify(curHeroes), 'utf8');
fs.writeFileSync(FETTER_JS, 'module.exports=' + JSON.stringify(curFetters), 'utf8');
fs.writeFileSync(PETS_JS, 'module.exports=' + JSON.stringify(petsArr), 'utf8');

console.log('进化指针更新', evoCount, '既有修正', fixCount);
console.log('新增英雄', addedHeroes.length, '新增羁绊', addedFetters.length, '新增神兽', petAdded, '修正神兽', petFixed);
addedHeroes.forEach((h) => console.log('  +', h.id, h.name, h.title, h.era, 'Q' + h.quality, '力' + JSON.stringify(h.force), '智' + JSON.stringify(h.iq), '羁绊' + h.fetters.length, '技能:' + (h.skill ? h.skill.name : '-')));
console.log('heroes 总数', Object.keys(curHeroes).length, 'fetters 总数', Object.keys(curFetters).length, 'pets 总数', petsArr.length);
