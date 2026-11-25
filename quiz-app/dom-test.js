const fs = require('fs');
const vm = require('vm');

function El(id, extra) {
  const self = {
    id, innerHTML: '', textContent: '', style: {}, children: [], value: '', disabled: false,
    dataset: Object.assign({}, extra && extra.dataset), _h: {}, scrollHeight: 0,
    classList: {
      _s: new Set(extra && extra.cls ? [extra.cls] : []),
      add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); },
      toggle(c, on) { const v = on === undefined ? !this._s.has(c) : !!on; v ? this._s.add(c) : this._s.delete(c); return v; },
      contains(c) { return this._s.has(c); }
    },
    addEventListener(t, fn) { (self._h[t] = self._h[t] || []).push(fn); },
    insertAdjacentHTML(p, h) { self.innerHTML += h; },
    querySelector() { return null; },
    focus() {}, scrollIntoView() {}
  };
  return self;
}

const ids = ['total','kw','clear','results','mic','voiceHint','chips','chipsToggle','chipCover',
  'view-search','view-practice','view-all','view-wrong','wrongBadge','wrongCount','wrongClear','wrongDrill','wrongList',
  'pStart','pPlay','pQ','pOpts','pVerdict','pIdx','pTotal','pIntro','pBar','pScore','pNext','pSkip','pBegin','pResume','pResumeAt',
  'allCount','allList','allMore','jumpNo','jumpBtn'];
const map = {};
ids.forEach(id => map[id] = El(id));

const tabs = ['search','practice','all','wrong'].map(t => El('tab-'+t, { dataset: { tab: t }, cls: t==='search'?'tab on':'tab' }));
const store = {};
const localStorage = {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: k => { delete store[k]; }
};
let confirmAnswer = true;
const document = {
  getElementById: id => map[id] || (map[id] = El(id)),
  querySelectorAll: s => (s === '.tab' ? tabs : []),
  createElement: () => El('tmp'),
  body: El('body'),
  execCommand: () => true
};
const sandbox = { document, window: { scrollTo: () => {} }, navigator: {},
  setTimeout: (fn) => 0, console, confirm: () => confirmAnswer,
  Array, Object, String, Number, Math, JSON, RegExp, Promise, Uint8Array, escape,
  atob: b => Buffer.from(b, 'base64').toString('binary'), TextDecoder: require('util').TextDecoder,
  localStorage };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync('quiz-data.js', 'utf8'), sandbox);
vm.runInContext(fs.readFileSync('index.html', 'utf8').match(/<script>\n([\s\S]*?)\n<\/script>/)[1], sandbox);

const DATA = sandbox.window.QUIZ_DATA;
console.log('题数:', DATA.length, '| 徽标初始:', JSON.stringify(map.wrongBadge.textContent));

// 切到错题页签
tabs[3]._h.click[0]();
console.log('空错题提示:', map.wrongList.innerHTML.includes('还没有错题') ? 'OK' : 'FAIL', '| 只练错题禁用:', map.wrongDrill.disabled);

// 开始练习，答错一题再答对
tabs[1]._h.click[0]();
map.pBegin._h.click[0]();
const qid = sandbox ? null : null;
// 读当前题号
const curId = (function(){ const m = map.pQ.innerHTML; return null; })();
// 直接操纵:从 state 拿不到，改从行为测：连答两题，第一题选错
// 选一个不在正确答案里的选项
function pickWrongThenRight() {
  // 通过 DOM 上的选项按钮找错误选项：随便选一个，若判对就清空重选（桩上无法撤销）
  // 简化：读取 pOpts 第一项 data-o 与 verdict 结果
}
// 第一题：点击第一个选项（可能是对的）→ 观察 verdict
const firstOpt = map.pOpts.innerHTML.match(/data-o="([^"]*)"/);
map.pOpts._h.click[0]({ target: { closest: () => ({ dataset: { o: firstOpt[1] } }) } });
const v1 = map.pVerdict.innerHTML;
console.log('第1题判定:', v1.includes('答对了') ? '对' : (v1.includes('答错了') ? '错' : v1.slice(0,40)));
console.log('徽标:', JSON.stringify(map.wrongBadge.textContent), '| 判定附注:', v1.includes('错题本') ? (v1.includes('已加入错题本')?'加入':'移除') : '无');

// 下一题
map.pNext._h.click[0]();
const secondOpt = map.pOpts.innerHTML.match(/data-o="([^"]*)"/);
map.pOpts._h.click[0]({ target: { closest: () => ({ dataset: { o: secondOpt[1] } }) } });
const v2 = map.pVerdict.innerHTML;
console.log('第2题判定:', v2.includes('答对了') ? '对' : '错', '| 徽标:', JSON.stringify(map.wrongBadge.textContent));

// 存储里的错题数
const wrong = JSON.parse(store['xb-quiz-wrong-v1'] || '[]');
console.log('localStorage 错题数:', wrong.length);

// 跳过题
map.pNext._h.click[0]();
map.pSkip._h.click[0]();
console.log('跳过后徽标:', JSON.stringify(map.wrongBadge.textContent), '| 附注:', map.pVerdict.innerHTML.includes('已加入错题本') ? 'OK' : 'FAIL');

// 错题页渲染
tabs[3]._h.click[0]();
console.log('错题页计数:', map.wrongCount.innerHTML.replace(/<[^>]+>/g,''), '| 卡片数:', (map.wrongList.innerHTML.match(/class="q-card"/g)||[]).length, '| 移除按钮:', (map.wrongList.innerHTML.match(/class="rm"/g)||[]).length);
console.log('只练错题可用:', !map.wrongDrill.disabled);

// 移除一题
const rmBtn = map.wrongList.innerHTML.match(/data-rm="(\d+)"/);
map.wrongList._h.click[0]({ target: { closest: () => ({ dataset: { rm: rmBtn[1] } }) } });
console.log('移除后:', map.wrongCount.innerHTML.replace(/<[^>]+>/g,''), '| 徽标:', JSON.stringify(map.wrongBadge.textContent));

// 只练错题
map.wrongDrill._h.click[0]();
console.log('错题轮进入练习视图:', !map.pPlay.classList.contains('hidden') ? 'OK' : 'FAIL');

// 清空
confirmAnswer = true;
map.wrongClear._h.click[0]();
console.log('清空后徽标:', JSON.stringify(map.wrongBadge.textContent), '| 空提示:', map.wrongList.innerHTML.includes('还没有错题') ? 'OK' : 'FAIL');
