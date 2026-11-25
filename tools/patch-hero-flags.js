#!/usr/bin/env node
// 同步英雄机制标志到 heroes.js（幂等）：
//   cf: 1  = crossFetter（共鸣）：羁绊可跨阵容（二/三/四阵）激活，模拟按满羁绊计
//   rs: 1  = replaceSkill（连携）：与其他进化英雄相邻时技能替换为强化版（1.5 倍）
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const CFG = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/configs/config-1123.decoded.json'), 'utf8'));
const HERO_JS = path.join(ROOT, 'xiaobing-data/data/heroes.js');
const heroes = require(HERO_JS);
let cf = 0, rs = 0;
for (const [id, h] of Object.entries(CFG.hero)) {
  const rec = heroes[id];
  if (!rec) continue;
  if (h.crossFetter === 1) { rec.cf = 1; cf++; } else if (rec.cf) { delete rec.cf; }
  if (h.replaceSkill) { rec.rs = 1; rs++; } else if (rec.rs) { delete rec.rs; }
}
fs.writeFileSync(HERO_JS, 'module.exports=' + JSON.stringify(heroes), 'utf8');
console.log('cf(共鸣):', cf, 'rs(连携):', rs);
