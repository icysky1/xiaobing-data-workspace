const tech = require('../../data/tech.js')

// 分支中文名取自游戏配置 _branchNames 官方映射
const BRANCH_NAME = {
  researchTrade: '行商',
  researchWar: '军事',
  researchCombat: '战略',
  researchHeroGroup: '群英',
  researchLocation: '行位',
}
const BRANCH_DESC = {
  researchTrade: '消耗：铜钱',
  researchWar: '消耗：铜钱+科技点',
  researchCombat: '消耗：铜钱+战略令/金色战略令',
  researchHeroGroup: '消耗：群英点',
  researchLocation: '消耗：铜钱+陨石/黄金陨石',
}

// 单次渲染上限（战略 1200 条/群英 1375 条，全量渲染易卡顿）
const PAGE_SIZE = 100

const branches = Object.keys(tech)
  .filter((k) => tech[k] && tech[k].entries)
  .map((k) => ({
    key: k,
    name: BRANCH_NAME[k] || k.replace('research', ''),
    desc: BRANCH_DESC[k] || '',
    count: tech[k].entries.length,
    // k 为唯一 key 供 wx:key 使用；材料数组拼接为「战略令x13＋金色战略令x1」
    all: tech[k].entries.map((e, i) => ({
      k: k + '-' + i,
      n: e.n,
      e: e.e,
      c: e.c,
      i: Array.isArray(e.i) ? e.i.join('＋') : e.i || '',
      t: e.t,
      u: e.u,
    })),
  }))

Page({
  data: {
    branches, // {key,name,desc,count}
    current: 0,
    query: '',
    focusKw: false,
    shown: [], // 当前分支过滤后的条目
    hasMore: false,
    total: 0, // 当前分支过滤后总条数
  },
  onLoad() {
    this.apply()
  },
  // 根据当前分支 + 搜索词重算列表
  apply(append) {
    const idx = this.data.current
    const b = branches[idx]
    const q = (this.data.query || '').trim()
    let src = b.all
    if (q) src = b.all.filter((e) => e.n.indexOf(q) >= 0 || e.e.indexOf(q) >= 0 || e.i.indexOf(q) >= 0)
    const base = append ? this.data.shown.length : 0
    const shown = src.slice(0, base + PAGE_SIZE)
    this.setData({
      shown,
      total: src.length,
      hasMore: src.length > shown.length,
    })
  },
  pick(e) {
    const idx = Number(e.currentTarget.dataset.idx)
    this.setData({ current: idx }, () => this.apply())
  },
  onInput(e) {
    this.setData({ query: e.detail.value }, () => this.apply())
  },
  onBlur() {
    this.setData({ focusKw: false })
  },
  clearQuery() {
    // 清空后立刻把焦点还给输入框，方便直接继续输入
    this.setData({ query: '', focusKw: true }, () => this.apply())
  },
  loadMore() {
    if (!this.data.hasMore) return
    this.apply(true)
  },
})
