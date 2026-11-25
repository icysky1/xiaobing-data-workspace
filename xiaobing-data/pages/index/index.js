const { getSiteSettings, isAdminUser } = require('../../utils/settings')

// 全部模块（后台「显示管理」可控制显隐）
const ALL_MODULES = [
  { icon: '📖', title: '小兵攻略', desc: '开荒跑商 · 阵容 · 称王战 · 神兽神器', url: '/pages/guides/guides' },
  { icon: '🧭', title: '车夫题库', desc: '全部 417 题检索 + 随机练习（锁 1/4 题库）', url: '/pages/quiz/quiz' },
  { icon: '⛏️', title: '挖宝大全', desc: '装备升级 · 场景图鉴 · 收藏品 · 属性池', url: '/pages/dig/dig' },
  { icon: '⚖️', title: '众生平等模拟', desc: '1级纯阵容对决 · 我方敌方对比 · 拖动布阵', url: '/pages/lineup/lineup' },
  { icon: '🧰', title: '小兵工具箱', desc: '活动日历 · 羁绊反查 · 结义文案', url: '/pages/toolbox/toolbox' },
  { icon: '🐉', title: '神兽图鉴', desc: '58 只神兽 · 技能 · 传承', url: '/pages/pets/pets' },
  { icon: '🔬', title: '科技树', desc: '5 分支全等级消耗与效果', url: '/pages/tech/tech' },
  { icon: '⚔️', title: '英雄图鉴', desc: '技能羁绊 · 阵营检索', url: '/pages/heroes/heroes' },
  { icon: '📝', title: '意见反馈', desc: '功能异常 · 建议 · 体验问题', url: '/pages/feedback/feedback' },
]

Page({
  data: { modules: [], settingsReady: false, notices: [], loading: true },
  onShow() {
    this.loadNotices()
    this.applySettings()
  },
  // 应用后台显示设置：隐藏 / 仅管理员可见（兼容旧名「阵容模拟器」）
  // 先渲染公开模块，再异步补上管理员专属模块，避免普通用户等待会话校验、也避免入口闪现
  applySettings() {
    const that = this
    getSiteSettings()
      .then((s) => {
        const hidden = s.hiddenModules || []
        const adminOnly = s.adminOnlyModules || []
        const visible = (m) => hidden.indexOf(m.title) < 0
        that.setData({
          modules: ALL_MODULES.filter((m) => visible(m) && adminOnly.indexOf(m.title) < 0),
          settingsReady: true,
        })
        if (!adminOnly.length) return
        isAdminUser()
          .then((admin) => {
            if (admin) that.setData({ modules: ALL_MODULES.filter(visible) })
          })
          .catch(() => {})
      })
      .catch(() => that.setData({ modules: ALL_MODULES, settingsReady: true }))
  },
  loadNotices() {
    const { cloud } = require('../../utils/cloud')
    cloud.database
      .from('notices')
      .select('id, title, content, created_at')
      .order('created_at', { ascending: false })
      .limit(3)
      .then(({ data, error }) => {
        this.setData({ notices: error ? [] : (data || []), loading: false })
      })
      .catch(() => this.setData({ notices: [], loading: false }))
  },
  go(e) {
    wx.navigateTo({ url: e.currentTarget.dataset.url })
  },
  // 长按页脚 8 秒才进入后台管理（隐蔽入口，无任何提示，避免误触与暴露）
  adminPressStart() {
    if (this.adminTimer) return
    this.adminTimer = setTimeout(() => {
      this.adminTimer = null
      wx.navigateTo({ url: '/pages/admin/admin' })
    }, 8000)
  },
  adminPressEnd() {
    if (!this.adminTimer) return
    clearTimeout(this.adminTimer)
    this.adminTimer = null
  },
  onHide() {
    this.adminPressEnd()
  },
  onUnload() {
    this.adminPressEnd()
  },
})
