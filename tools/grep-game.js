#!/usr/bin/env node
// 检索 game.js 关键词上下文: node tools/grep-game.js <keyword> [before] [after] [max]
const fs = require('fs');
const path = require('path');
const kw = process.argv[2];
const before = Number(process.argv[3] || 200);
const after = Number(process.argv[4] || 200);
const max = Number(process.argv[5] || 6);
const s = fs.readFileSync(path.resolve(__dirname, '../unpacked/scripts/subpackages/scripts/game.js'), 'utf8');
let i = 0, c = 0;
while ((i = s.indexOf(kw, i)) >= 0 && c < max) {
  console.log('=== @' + i);
  console.log(s.slice(Math.max(0, i - before), i + after).replace(/\n/g, ' '));
  i += kw.length; c++;
}
console.log('(' + kw + ' total ' + (s.match(new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length + ')');
