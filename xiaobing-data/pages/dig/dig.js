const atlas = require('../../data/atlas.js')
const pavilion = require('../../data/pavilion.js')
const { equips, effects } = require('../../data/equips.js')

const QC = { 1: '#9d9d9d', 2: '#4caf50', 3: '#42a5f5', 4: '#ab47bc', 5: '#ef5350' }
// 场景6（海底沉船）特殊宝物已实测确认：龙骨侧舷彩绘残片（紫晶细锤）；场景7（边塞烽燧）未开放 → 不显示
const NO_SPECIAL_SCENES = []
const HIDDEN_SCENES = [7]
const scenes = atlas.scenes
  .filter((s) => HIDDEN_SCENES.indexOf(s.sceneId) < 0)
  .map((s) => ({
    name: s.name,
    special: NO_SPECIAL_SCENES.indexOf(s.sceneId) >= 0 ? '' : s.specialItem,
    groups: (s.groups || []).map((g) => ({
      name: g.name,
      items: (g.items || []).map((it) => ({
        name: it.name,
        type: it.type,
        q: it.quality,
        qcolor: QC[it.quality] || '#9c8a70',
        grade: it.gradeRange ? it.gradeRange[0] + '~' + it.gradeRange[1] : '—',
        special: NO_SPECIAL_SCENES.indexOf(s.sceneId) < 0 && it.needsSpecialHammer,
        hammer: NO_SPECIAL_SCENES.indexOf(s.sceneId) >= 0 ? '' : (it.specialHammer || '普通锤'),
      })),
    })),
  }))

const TOPS = ['装备', '图鉴', '属性', '藏宝阁', '场景']

// 收藏品图鉴：图鉴页签里排在场景之后的附加页签
const collections = (atlas.collections || []).map((g) => ({
  name: g.name,
  bonus: g.bonus,
  items: (g.items || []).map((it) => ({
    name: it.name,
    location: it.location,
    digRange: it.digRange,
    est: it.est,
  })),
}))

// 货币来源转数组，避免 WXML 遍历对象在部分基础库下渲染为空
const currencyList = Object.keys(pavilion.currencies || {}).map((k) => ({ name: k, desc: pavilion.currencies[k] }))

Page({
  data: {
    tops: TOPS,
    top: 0, // 0 装备 / 1 图鉴 / 2 属性 / 3 藏宝阁 / 4 场景
    // 装备
    equips,
    effects,
    cur: 0,
    curQ: 0,
    // 图鉴
    scenes,
    curScene: 0,
    collections,
    collectionNote: atlas.collectionNote || '',
    // 藏宝阁 / 场景
    boxLevels: pavilion.boxLevels || [],
    currencies: currencyList,
    sceneUnlocks: pavilion.sceneUnlocks || [],
  },
  pickTop(e) {
    this.setData({ top: Number(e.currentTarget.dataset.idx) })
  },
  pick(e) {
    this.setData({ cur: Number(e.currentTarget.dataset.idx), curQ: 0 })
  },
  pickQ(e) {
    this.setData({ curQ: Number(e.currentTarget.dataset.q) })
  },
  pickScene(e) {
    this.setData({ curScene: Number(e.currentTarget.dataset.idx) })
  },
})
