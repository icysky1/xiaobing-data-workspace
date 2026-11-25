const heroesMap = require('../../data/heroes.js')

// 进化前缀英雄（飞仙·/戏魂·/黄金甲·）按基础名参与羁绊
const EVOLVE_PREFIX = ['飞仙·', '戏魂·', '黄金甲·']
function nameBase(n) {
  for (let i = 0; i < EVOLVE_PREFIX.length; i++) {
    if (n.indexOf(EVOLVE_PREFIX[i]) === 0) return n.slice(EVOLVE_PREFIX[i].length)
  }
  return n
}

const heroByBase = {}
const all = Object.keys(heroesMap)
  .map((k) => heroesMap[k])
  .filter((h) => h.era !== '神话' && h.title !== '妖魔鬼怪' && h.quality > 1)
  .sort((a, b) => (b.quality || 0) - (a.quality || 0) || a.id - b.id)
all.forEach((h) => {
  const bn = nameBase(h.name)
  if (!heroByBase[bn] || h.name === bn) heroByBase[bn] = h
})

const Q_COLOR = { 1: '#9aa0a6', 2: '#2e9dbe', 3: '#a058c8', 4: '#e0913c', 5: '#c85f50', 6: '#e0417a' }

// 与英雄图鉴一致的朝代顺序，额外加「全部」方便一次看全
const ERAS = ['全部', '巅峰', '夏', '商', '周', '春秋', '战国', '秦', '西汉', '东汉', '三国', '晋', '十六国', '南北朝', '隋', '唐', '五代十国', '北宋', '南宋', '元', '明', '清', '义军', '外族', '侠']
const POOL_CAP = 60

// 活动日历：神兽周 → 挖宝周 → 招募周，每 7 天轮换、21 天一循环
// 锚点 = 2026-09-28（神兽周首日，玩家实测表）
const CAL_ANCHOR = new Date(2026, 8, 28)
const CAL_TYPES = [
  { name: '神兽周', desc: '神兽相关活动', bg: '#e2f3df', fg: '#2e7d32' },
  { name: '挖宝周', desc: '挖宝相关活动', bg: '#fbe2df', fg: '#c62828' },
  { name: '招募周', desc: '招募相关活动', bg: '#fdf5cd', fg: '#9a7b00' },
]
const CAL_WEEKS_AHEAD = 6

Page({
  data: {
    tab: 0,
    tabs: ['羁绊反查', '活动日历', '结义文案'],

    // 活动日历
    calWeeks: [],
    calName: '',
    calDesc: '',
    calBg: '',
    calFg: '',
    calRange: '',
    calDay: '',
    calToday: '',

    // 羁绊反查
    eras: ERAS,
    curEra: 0,
    kwF: '',
    fHits: [],
    fTrunc: false,
    mine: [],
    act: [],
    near: [],
    actCount: 0,
    nearCount: 0,

    // 结义文案
    server: '',
    name: '',
    power: '',
    online: '',
    extra: '',
    tags: [
      { k: '每日活跃', on: true },
      { k: '竞技场按时出战', on: true },
      { k: '不挂机不划水', on: true },
      { k: '能用语音', on: false },
      { k: '新手也带', on: false },
    ],
    preview: '',
    copyTip: false,
  },
  onLoad() {
    this.refreshPool()
    this.build()
    this.buildCalendar()
  },
  onShow() {
    // 跨天返回小程序时刷新「本周」判断
    this.buildCalendar()
  },
  pickTab(e) {
    this.setData({ tab: Number(e.currentTarget.dataset.idx) })
  },

  /* ---------------- 羁绊反查 ---------------- */
  // 可选英雄池：按朝代 + 关键词过滤，已加入的自动隐藏（与英雄图鉴同一套筛选方式）
  refreshPool() {
    const era = ERAS[this.data.curEra]
    const kw = (this.data.kwF || '').trim()
    const picked = {}
    this.data.mine.forEach((m) => {
      picked[m.base] = 1
    })
    let src = all
    if (era && era !== '全部') src = src.filter((h) => h.era === era)
    if (kw) src = src.filter((h) => h.name.indexOf(kw) >= 0 || (h.title && h.title.indexOf(kw) >= 0))
    src = src.filter((h) => !picked[nameBase(h.name)])
    // 进化版（飞仙·/戏魂·/黄金甲·）与本体同名参与羁绊，列表里合并成一个，避免重复刷屏
    const seen = {}
    const uniq = []
    src.forEach((h) => {
      const bn = nameBase(h.name)
      if (seen[bn] !== undefined) {
        if (h.name === bn) uniq[seen[bn]] = h
        return
      }
      seen[bn] = uniq.length
      uniq.push(h)
    })
    src = uniq
    const hits = src.slice(0, POOL_CAP).map((h) => ({
      id: h.id,
      name: h.name,
      quality: h.quality,
      qcolor: Q_COLOR[h.quality] || '#9c8a70',
    }))
    this.setData({ fHits: hits, fTrunc: src.length > POOL_CAP })
  },
  pickEra(e) {
    this.setData({ curEra: Number(e.currentTarget.dataset.idx) }, () => this.refreshPool())
  },
  onSearchF(e) {
    this.setData({ kwF: e.detail.value }, () => this.refreshPool())
  },
  addHero(e) {
    const name = e.currentTarget.dataset.name
    const mine = this.data.mine.slice()
    if (mine.length >= 16) {
      wx.showToast({ title: '最多 16 位（一队上限）', icon: 'none' })
      return
    }
    if (mine.some((m) => m.base === nameBase(name))) return
    const h = heroByBase[nameBase(name)]
    mine.push({ name, base: nameBase(name), quality: h ? h.quality : 0 })
    this.setData({ mine }, () => {
      this.refreshPool()
      this.computeFetters()
    })
  },
  delHero(e) {
    const name = e.currentTarget.dataset.name
    const mine = this.data.mine.filter((m) => m.name !== name)
    this.setData({ mine }, () => {
      this.refreshPool()
      this.computeFetters()
    })
  },
  clearMine() {
    this.setData({ mine: [], act: [], near: [], actCount: 0, nearCount: 0 }, () => this.refreshPool())
  },
  computeFetters() {
    const bases = this.data.mine.map((m) => m.base)
    const act = []
    const near = []
    const seenA = {}
    const seenN = {}
    bases.forEach((bn) => {
      const h = heroByBase[bn]
      if (!h) return
      ;(h.fetters || []).forEach((ft) => {
        const need = ft.heroes || []
        if (need.length) {
          const missing = need.filter((n) => bases.indexOf(n) < 0)
          if (!missing.length) {
            const key = ft.name + '|' + (ft.effect || '')
            if (seenA[key]) return
            seenA[key] = 1
            act.push({ name: ft.name, owner: bn, who: '与' + need.join('、'), effect: ft.effect || '' })
          } else if (missing.length === 1) {
            const key = ft.name + '|' + (ft.effect || '') + '|' + missing[0]
            if (seenN[key]) return
            seenN[key] = 1
            near.push({
              name: ft.name,
              owner: bn,
              who: '与' + need.join('、'),
              missing: missing[0],
              effect: ft.effect || '',
            })
          }
        } else if (ft.number) {
          const cnt = bases.filter((b) => b !== bn && (heroByBase[b] || {}).quality === 5).length
          if (cnt >= ft.number) {
            const key = ft.name + '|' + (ft.effect || '')
            if (seenA[key]) return
            seenA[key] = 1
            act.push({ name: ft.name, owner: bn, who: '与任意' + ft.number + '位神话英雄', effect: ft.effect || '' })
          } else {
            const key = ft.name + '|' + (ft.effect || '')
            if (seenN[key]) return
            seenN[key] = 1
            near.push({
              name: ft.name,
              owner: bn,
              who: '与任意' + ft.number + '位神话英雄',
              missing: '还需 ' + (ft.number - cnt) + ' 位神话品质英雄',
              effect: ft.effect || '',
            })
          }
        }
      })
    })
    // wx:key 必须是真实存在的唯一字段，否则重复 key 会导致列表只渲染第一条
    act.forEach((x, i) => {
      x.k = 'a' + i
    })
    near.forEach((x, i) => {
      x.k = 'n' + i
    })
    this.setData({ act: act.slice(0, 80), near: near.slice(0, 80), actCount: act.length, nearCount: near.length })
  },

  /* ---------------- 活动日历 ---------------- */
  fmtD(d) {
    return d.getMonth() + 1 + '月' + d.getDate() + '日'
  },
  calType(k) {
    return CAL_TYPES[((k % 3) + 3) % 3]
  },
  buildCalendar() {
    const now = new Date()
    const day0 = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    // 距锚点的天数（锚点当天 = 0），负数也能正确取模
    const diff = Math.round((day0 - CAL_ANCHOR) / 86400000)
    const weekIdx = Math.floor(diff / 7)
    const dayInWeek = diff - weekIdx * 7 // 0..6，周期第几天
    const weeks = []
    for (let i = 0; i < CAL_WEEKS_AHEAD; i++) {
      const k = weekIdx + i
      const t = this.calType(k)
      const s = new Date(CAL_ANCHOR)
      s.setDate(s.getDate() + 7 * k)
      const e = new Date(s)
      e.setDate(e.getDate() + 6)
      weeks.push({
        k: 'w' + k,
        name: t.name,
        desc: t.desc,
        bg: t.bg,
        fg: t.fg,
        range: this.fmtD(s) + ' ~ ' + this.fmtD(e),
        cur: i === 0,
      })
    }
    const cur = this.calType(weekIdx)
    this.setData({
      calWeeks: weeks,
      calName: cur.name,
      calDesc: cur.desc,
      calBg: cur.bg,
      calFg: cur.fg,
      calRange: weeks[0].range,
      calToday: this.fmtD(day0),
      calDay: '周期第 ' + (dayInWeek + 1) + ' 天 · 还剩 ' + (7 - dayInWeek) + ' 天换下一个活动',
    })
  },

  /* ---------------- 结义文案 ---------------- */
  onField(e) {
    const k = e.currentTarget.dataset.k
    const patch = {}
    patch[k] = e.detail.value
    this.setData(patch, () => this.build())
  },
  toggleTag(e) {
    const idx = Number(e.currentTarget.dataset.idx)
    const tags = this.data.tags.slice()
    tags[idx] = { k: tags[idx].k, on: !tags[idx].on }
    this.setData({ tags }, () => this.build())
  },
  // 本地拼装结义文案（不上传、不展示他人内容，纯本地生成）
  build() {
    const d = this.data
    const needs = d.tags.filter((t) => t.on).map((t) => t.k)
    const lines = ['【结义招募 · 小兵有前途】']
    lines.push('区服：' + (d.server ? d.server + ' 服' : '____ 服'))
    lines.push('角色：' + (d.name || '____'))
    lines.push('战力：' + (d.power || '____'))
    if (d.online) lines.push('常在线：' + d.online)
    if (needs.length) lines.push('要求：' + needs.join('、'))
    if (d.extra) lines.push('补充：' + d.extra)
    lines.push('有意者本服私聊我，或在结义界面直接申请，看到就通过～')
    this.setData({ preview: lines.join('\n'), copyTip: false })
  },
  copy() {
    const text = this.data.preview || ''
    if (!text) return
    const done = () => {
      this.setData({ copyTip: false })
      wx.showToast({ title: '文案已复制，去游戏或群里发吧', icon: 'none', duration: 2200 })
    }
    // 部分运行环境（预览器 / 模拟器）未实现剪贴板接口，降级为长按手动复制
    const fallback = () => {
      this.setData({ copyTip: true })
      if (typeof wx !== 'undefined' && typeof wx.showModal === 'function') {
        wx.showModal({
          title: '请手动复制',
          content: '当前环境不支持一键复制，长按文案区域全选即可复制。',
          showCancel: false,
          confirmText: '知道了',
        })
      } else if (typeof wx !== 'undefined' && typeof wx.showToast === 'function') {
        wx.showToast({ title: '请长按文案手动复制', icon: 'none', duration: 2500 })
      }
    }
    try {
      if (typeof wx !== 'undefined' && typeof wx.setClipboardData === 'function') {
        wx.setClipboardData({
          data: text,
          success: done,
          fail: fallback,
        })
      } else {
        fallback()
      }
    } catch (e) {
      fallback()
    }
  },
})
