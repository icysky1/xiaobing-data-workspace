/* 按网页版 quiz-app 的搜索标签（CHIPS）顺序，列出各标签命中的题目与标准答案 */
global.window = {}
require('../quiz-app/quiz-data.js')
const DATA = window.QUIZ_DATA
if (!Array.isArray(DATA)) throw new Error('decode failed')

function stripMarks(s) {
  return String(s || '').replace(/[\s，。、！？；：""''（）()《》·,.!?;:"'\-]/g, '')
}

// 与 index.html 中 CHIPS 完全一致（38 个，按顺序）
const CHIPS = [
  ['真假判断', ['：对', '：错']],
  ['身份职业', ['谁是', '哪位', '的人是', '以下是', '哪国人']],
  ['称号外号', ['被称为', '被誉为', '号称', '史称', '外号', '小名', '原名', '本名', '戏称']],
  ['诗词名句', ['作者', '诗', '云想', '醉里挑灯', '功名']],
  ['名将战绩', ['名将', '将军', '击杀', '攻克', '阵亡', '百人斩', '徐达', '左宗棠', '秦琼', '岳飞', '刘裕', '邓禹', '凌烟阁', '云台二十八将', '汉初三杰', '项羽', '林则徐']],
  ['成语典故', ['成语', '出自', '典故', '说的是', '主人公', '纸上谈兵', '杯酒释兵权', '运筹帷幄', '顾茅庐', '三顾']],
  ['都城地点', ['定都', '哪里', '登基', '住在', '关']],
  ['籍贯', ['籍贯']],
  ['读音', ['读音']],
  ['英雄品质', ['品质为']],
  ['人物关系', ['的关系', '是谁的孙子']],
  ['送分题', ['送分']],
  ['数字题', ['多少', '几位', '几个', '超过']],
  ['之最第一', ['最早', '第一', '唯一']],
  ['朝代顺序', ['按朝代顺序', '按时间先后']],
  ['辈分排序', ['按照辈分']],
  ['按朝代填人', ['按朝代填人']],
  ['人物名字', ['人物名字']],
  ['三国', ['三国', '蜀汉', '五虎将', '华雄']],
  ['水浒梁山', ['梁山', '水浒', '宋江']],
  ['西游记', ['西游', '悟空', '沙僧', '八戒', '唐僧']],
  ['封神演义', ['封神', '哪吒', '周武王', '周文王']],
  ['神话传说', ['神话', '女娲', '盘古', '夸父', '后羿', '嫦娥', '精卫', '王母', '伏羲', '妈祖', '大禹', '门神', '尉迟恭']],
  ['巾帼英雄', ['巾帼', '奢香']],
  ['帝王将相', ['皇帝', '帝王', '登基', '皇后', '刘秀', '秦始皇']],
  ['著名战役', ['之战', '战役']],
  ['亡国起义', ['起义', '灭亡', '亡国', '之变', '之乱', '兵变']],
  ['兵器阵法', ['阵', '刀', '剑', '虎符', '武器', '盔']],
  ['文化常识', ['象棋', '衣冠', '学富五车', '砸', '科举', '状元', '纸币', '甲子', '诗歌总集', '编年体', '孔子', '大运河', '独尊儒术', '天人合一', '道德文化']],
  ['名言名场面', ['宁有', '明犯强汉', '不入虎穴', '项庄', '何不食', '仕宦', '前知五百年', '卧薪', '吐哺', '驴车']],
  ['成语补全', ['孟姜女', '精卫', '太公', '卧薪', '三顾', '约法', '归赵', '暗渡', '赴会', '霸王']],
  ['四大系列', ['四大', '沉鱼落雁', '杨贵妃']],
  ['刺客侠客', ['刺客', '侠']],
  ['教派起义', ['白莲教', '明教', '太平天国', '张角', '洪秀全']],
  ['找出不同类', ['找出', '选出一位', '不是一家人', '没有“动物”', '不属于']],
  ['小说戏曲', ['演义', '武松', '林黛玉', '赵氏孤儿', '鹿鼎', '亚瑟', '贞德', '织田', '查理', '艳后', '天竺']],
  ['游戏相关', ['小兵有前途', '本游戏', '小兵冯']],
  ['现代梗', ['戏称', '地狱', '特朗普', '皮卡丘', '外地的']]
]

const NORM = DATA.map((it) => ({
  t: stripMarks(it.q),
  a: it.a.map((x) => stripMarks(x)),
}))

function chipHits(kws) {
  const ks = kws.map(stripMarks)
  const out = []
  for (let n = 0; n < DATA.length; n++) {
    const t = NORM[n].t, as = NORM[n].a
    for (let i = 0; i < ks.length; i++) {
      if (t.indexOf(ks[i]) >= 0) { out.push(DATA[n]); break }
      let hitAns = false
      for (let j = 0; j < as.length; j++) { if (as[j].indexOf(ks[i]) >= 0) { hitAns = true; break } }
      if (hitAns) { out.push(DATA[n]); break }
    }
  }
  return out
}

// 题干填空：{0} → a[0]；HTML 版中【】内答案用红色
function filled(q) {
  return String(q.q).replace(/\{(\d)\}/g, (m, d) => '【' + (q.a[Number(d)] || '?') + '】')
}
function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
function filledHtml(q) {
  return esc(String(q.q)).replace(/\{(\d)\}/g, (m, d) => '【<span style="color:#FF0000;font-weight:bold">' + esc(q.a[Number(d)] || '?') + '</span>】')
}

let out = []
out.push('# 题库清单（按网页版搜索标签顺序）')
out.push('')
out.push('来源：quiz-app/quiz-data.js（共 ' + DATA.length + ' 题）；匹配规则与 index.html 的 chipHits 完全一致：关键词命中题干或答案即归入该标签。一题可同时出现在多个标签下。')
out.push('')
out.push('说明：题干中【】内为填空标准答案；「答案」列出全部空的答案（原样）。')
out.push('')

const covered = {}
let dupCount = 0
CHIPS.forEach((c, idx) => {
  const hits = chipHits(c[1])
  hits.forEach((it) => { if (covered[it.i]) dupCount++; covered[it.i] = 1 })
  out.push('## ' + (idx + 1) + '. ' + c[0] + '（' + hits.length + ' 题）')
  out.push('')
  if (!hits.length) { out.push('（无命中）'); out.push('') ; return }
  hits.forEach((it) => {
    const multi = it.b > 1 ? '（' + it.b + ' 空）' : ''
    out.push('- #' + it.i + multi + ' ' + filled(it))
  })
  out.push('')
})

out.push('---')
out.push('')
out.push('覆盖统计：38 个标签合计覆盖 ' + Object.keys(covered).length + ' / ' + DATA.length + ' 题；跨标签重复出现 ' + dupCount + ' 题·次。')

require('fs').writeFileSync(__dirname + '/quiz-list-by-tags.md', out.join('\n'), 'utf8')

// HTML 版（供转 Word：【】内答案红色加粗），不含「→ 答案」段
const html = []
html.push('<h1>题库清单（按搜索标签顺序）</h1>')
html.push('<p>共 ' + DATA.length + ' 题；【】内红色文字为填空标准答案。一题可同时出现在多个标签下。</p>')
CHIPS.forEach((c, idx) => {
  const hits = chipHits(c[1])
  html.push('<h2>' + (idx + 1) + '. ' + esc(c[0]) + '（' + hits.length + ' 题）</h2>')
  if (!hits.length) return
  html.push('<ul>')
  hits.forEach((it) => {
    const multi = it.b > 1 ? '（' + it.b + ' 空）' : ''
    html.push('<li>#' + it.i + multi + ' ' + filledHtml(it) + '</li>')
  })
  html.push('</ul>')
})
require('fs').writeFileSync(__dirname + '/quiz-list-by-tags.html', html.join('\n'), 'utf8')

console.log('written, tags=' + CHIPS.length + ', covered=' + Object.keys(covered).length + '/' + DATA.length)
