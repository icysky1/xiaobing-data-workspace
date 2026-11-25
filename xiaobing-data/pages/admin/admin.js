const { cloud } = require('../../utils/cloud')
const { getSiteSettings, invalidateSettings } = require('../../utils/settings')
const builtinGuides = require('../../data/guides')

// 口令校验已移到服务端：cloud.database.rpc('admin_login' / 'set_admin_pass')
// 客户端不再保存主人码或管理口令明文

// 与首页 ALL_MODULES 标题保持一致
const MODULE_TITLES = ['小兵攻略', '车夫题库', '英雄图鉴', '众生平等模拟', '小兵工具箱', '神兽图鉴', '科技树', '挖宝大全']
// 模块可见性：0=显示 1=仅管理员 2=隐藏
const MODE_LABELS = ['显示', '仅管理员', '隐藏']

Page({
  data: {
    user: null,
    isAdmin: false,
    passInput: '',
    ownerState: '',
    // 修改管理口令
    newPass: '',
    newPass2: '',
    notices: [],
    title: '',
    content: '',
    msg: '',
    // 显示管理
    moduleSwitches: [], // [{title, mode}] mode: 0 显示 / 1 仅管理员 / 2 隐藏
    modeLabels: MODE_LABELS,
    showAds: true,
    settingsLoaded: false,
    // 攻略管理
    guides: [],
    sortInputs: {}, // id -> 输入中的排序值
    gTitle: '',
    gContent: '',
    gPinned: false, // 编辑表单：置顶
    gSort: '', // 编辑表单：排序值
    gEditingId: null,
    builtinGuideTitles: builtinGuides.map((g) => g.title),
  },
  onShow() {
    this.refresh()
  },
  refresh() {
    cloud.auth.getSession().then(({ data: session }) => {
      this.setData({ user: session && session.user ? session.user : null })
      if (session) {
        this.loadAll()
        this.loadOwnerState()
      }
    })
  },
  // 读取主人绑定状态：unbound=未绑定 / mine=当前账号是主人 / other=已绑定别人
  async loadOwnerState() {
    const uid = this.data.user ? String(this.data.user.id || this.data.user.uid || '') : ''
    let rows = null
    try {
      const r = await cloud.database.from('settings').select('id, value').eq('key', 'admin_owner').limit(1)
      rows = r.data
    } catch (e) {}
    const boundId = rows && rows.length ? String(rows[0].value) : null
    let ownerState = 'unbound'
    if (boundId) ownerState = boundId === uid ? 'mine' : 'other'
    this.setData({ ownerState })
  },
  login() {
    const that = this
    wx.login({
      async success({ code }) {
        try {
          const appid = wx.getAccountInfoSync().miniProgram.appId
          const { data: session, error } = await cloud.auth.signInWithWechat(code, appid)
          if (error) return that.show(error.message || '微信登录失败，请重试')
          that.setData({ user: session.user, isAdmin: false })
          that.loadAll()
        } catch (e) {
          that.show('微信登录失败，请重试')
        }
      },
      fail(err) {
        that.show(err.errMsg || 'wx.login 失败')
      },
    })
  },
  logout() {
    const that = this
    try {
      wx.removeStorageSync('xb-admin-unlocked')
    } catch (e) {}
    cloud.auth.signOut().then(() => that.setData({ user: null, isAdmin: false, notices: [] }))
  },
  onPass(e) {
    this.setData({ passInput: e.detail.value })
  },
  unlock() {
    const that = this
    const pass = String(this.data.passInput || '').trim()
    const uid = this.data.user ? String(this.data.user.id || this.data.user.uid || '') : ''
    if (!uid) return this.show('请先微信登录')
    if (!pass) return this.show('请输入口令')
    const unbound = this.data.ownerState === 'unbound'
    cloud.database
      .rpc('admin_login', { p_code: pass })
      .then(({ data, error }) => {
        if (error) return that.show('校验失败：' + (error.message || '请重试'))
        const ok = Array.isArray(data) ? data[0] === true : data === true
        if (!ok) {
          return that.show(unbound ? '主人码不对，或后台已绑定其他账号' : '口令不对')
        }
        try {
          wx.setStorageSync('xb-admin-unlocked', 1)
        } catch (e) {}
        that.setData({ isAdmin: true, msg: unbound ? '已绑定主人账号，解锁成功' : '', passInput: '' })
        that.loadAll()
        that.loadSettings()
        that.loadOwnerState()
        if (unbound) setTimeout(() => that.setData({ msg: '' }), 2500)
      })
      .catch(() => that.show('校验失败，请重试'))
  },
  // ---- 修改管理口令（服务端校验身份后更新） ----
  onNewPass(e) {
    this.setData({ newPass: e.detail.value })
  },
  onNewPass2(e) {
    this.setData({ newPass2: e.detail.value })
  },
  changePass() {
    const that = this
    const p = String(this.data.newPass || '').trim()
    const p2 = String(this.data.newPass2 || '').trim()
    if (p.length < 6) return this.show('新口令至少 6 位')
    if (p !== p2) return this.show('两次输入不一致')
    cloud.database
      .rpc('set_admin_pass', { p_new: p })
      .then(({ data, error }) => {
        if (error) return that.show('修改失败：' + (error.message || '请重试'))
        const ok = Array.isArray(data) ? data[0] === true : data === true
        if (!ok) return that.show('修改失败：仅管理员可改，或口令太短')
        that.setData({ newPass: '', newPass2: '', msg: '管理口令已更新' })
        setTimeout(() => that.setData({ msg: '' }), 2500)
      })
      .catch(() => that.show('修改失败，请重试'))
  },
  loadAll() {
    const that = this
    cloud.database
      .from('notices')
      .select('id, title, content, created_at')
      .order('created_at', { ascending: false })
      .limit(20)
      .then(({ data }) => that.setData({ notices: data || [] }))
    that.loadGuides()
  },
  // ---- 攻略管理 ----
  loadGuides() {
    const that = this
    cloud.database
      .from('guides')
      .select('id, title, summary, content, pinned, sort, updated_at')
      .limit(50)
      .then(({ data }) => {
        const rows = (data || []).slice().sort((a, b) => {
          const pa = a.pinned ? 1 : 0
          const pb = b.pinned ? 1 : 0
          if (pa !== pb) return pb - pa
          const sa = a.sort || 0
          const sb = b.sort || 0
          if (sa !== sb) return sb - sa
          return String(b.updated_at || '').localeCompare(String(a.updated_at || ''))
        })
        that.setData({ guides: rows })
      })
  },
  onGTitle(e) {
    this.setData({ gTitle: e.detail.value })
  },
  // 把内置攻略填进表单，方便首次发布到云端（之后即可在线编辑）
  loadBuiltinGuide(e) {
    const idx = Number(e.currentTarget.dataset.idx) || 0
    const g = builtinGuides[idx]
    if (!g) return
    this.setData({ gTitle: g.title, gContent: g.content, gPinned: false, gSort: '', gEditingId: null, msg: '已载入「' + g.title + '」，点「发布攻略」发到云端' })
    setTimeout(() => this.setData({ msg: '' }), 2500)
    wx.pageScrollTo({ scrollTop: 0, duration: 200 })
  },
  onGContent(e) {
    this.setData({ gContent: e.detail.value })
  },
  onGPinned(e) {
    this.setData({ gPinned: e.detail.value })
  },
  onGSort(e) {
    this.setData({ gSort: e.detail.value })
  },
  async publishGuide() {
    const { gTitle, gContent, gEditingId, gPinned, gSort } = this.data
    if (!gTitle) return this.show('攻略名称不能为空')
    if (!gContent) return this.show('攻略内容不能为空')
    const sort = Number(gSort) || 0
    const that = this
    if (gEditingId) {
      const { error } = await cloud.database
        .from('guides')
        .update({ title: gTitle, content: gContent, pinned: !!gPinned, sort, updated_at: new Date().toISOString() })
        .eq('id', gEditingId)
        .select()
      if (error) return that.show('保存失败：' + (error.message || '权限不足'))
      this.setData({ gTitle: '', gContent: '', gPinned: false, gSort: '', gEditingId: null, msg: '攻略已更新' })
    } else {
      const { error } = await cloud.database.from('guides').insert({ title: gTitle, content: gContent, pinned: !!gPinned, sort })
      if (error) return that.show('发布失败：' + (error.message || '需要先登录'))
      this.setData({ gTitle: '', gContent: '', gPinned: false, gSort: '', msg: '攻略已发布' })
    }
    setTimeout(() => this.setData({ msg: '' }), 2500)
    this.loadGuides()
  },
  editGuide(e) {
    const id = e.currentTarget.dataset.id
    const g = this.data.guides.filter((x) => String(x.id) === String(id))[0]
    if (!g) return
    this.setData({
      gTitle: g.title,
      gContent: g.content || '',
      gPinned: !!g.pinned,
      gSort: String(g.sort || 0),
      gEditingId: g.id,
      msg: '已载入编辑，可设置置顶与排序，改完点「保存修改」',
    })
    setTimeout(() => this.setData({ msg: '' }), 2500)
    wx.pageScrollTo({ scrollTop: 0, duration: 200 })
  },
  cancelGuideEdit() {
    this.setData({ gTitle: '', gContent: '', gPinned: false, gSort: '', gEditingId: null })
  },
  // 置顶 / 取消置顶
  async togglePin(e) {
    const id = e.currentTarget.dataset.id
    const g = this.data.guides.filter((x) => String(x.id) === String(id))[0]
    if (!g) return
    const { error } = await cloud.database
      .from('guides')
      .update({ pinned: !g.pinned })
      .eq('id', id)
      .select()
    if (error) return this.show('操作失败：' + (error.message || '只能改自己发布的'))
    this.show(!g.pinned ? '已置顶' : '已取消置顶')
    this.loadGuides()
  },
  onSortInput(e) {
    const id = e.currentTarget.dataset.id
    this.setData({ ['sortInputs[' + JSON.stringify(String(id)) + ']']: e.detail.value })
  },
  async saveSort(e) {
    const id = e.currentTarget.dataset.id
    const v = Number((this.data.sortInputs || {})[String(id)])
    const sort = isNaN(v) ? 0 : v
    const { error } = await cloud.database
      .from('guides')
      .update({ sort })
      .eq('id', id)
      .select()
    if (error) return this.show('排序保存失败：' + (error.message || '只能改自己发布的'))
    this.show('排序已保存（数值越大越靠前）')
    this.loadGuides()
  },
  async delGuide(e) {
    const id = e.currentTarget.dataset.id
    const { data } = await cloud.database.from('guides').delete().eq('id', id).select()
    if (!data || !data.length) return this.show('只能删除自己发布的攻略')
    this.show('已删除')
    this.loadGuides()
  },
  onTitle(e) { this.setData({ title: e.detail.value }) },
  onContent(e) { this.setData({ content: e.detail.value }) },
  async publish() {
    if (!this.data.title) return this.show('标题不能为空')
    const { error } = await cloud.database.from('notices').insert({ title: this.data.title, content: this.data.content })
    if (error) return this.show('发布失败：' + (error.message || '权限不足'))
    this.setData({ title: '', content: '', msg: '已发布' })
    this.loadAll()
  },
  async del(e) {
    const id = e.currentTarget.dataset.id
    const { data } = await cloud.database.from('notices').delete().eq('id', id).select()
    if (!data || !data.length) return this.show('只能删除自己发布的公告')
    this.loadAll()
  },
  // ---- 显示管理 ----
  loadSettings() {
    const that = this
    getSiteSettings().then((s) => {
      const hidden = s.hiddenModules || []
      const adminOnly = s.adminOnlyModules || []
      that.setData({
        moduleSwitches: MODULE_TITLES.map((t) => ({
          title: t,
          mode: adminOnly.indexOf(t) >= 0 ? 1 : hidden.indexOf(t) >= 0 ? 2 : 0,
        })),
        showAds: s.showAds !== false,
        settingsLoaded: true,
      })
    })
  },
  onModuleMode(e) {
    const idx = Number(e.currentTarget.dataset.idx)
    this.setData({ ['moduleSwitches[' + idx + '].mode']: Number(e.detail.value) || 0 })
  },
  toggleAds(e) {
    this.setData({ showAds: e.detail.value })
  },
  async saveSettings() {
    const modes = this.data.moduleSwitches || []
    const hidden = modes.filter((m) => m.mode === 2).map((m) => m.title)
    const adminOnly = modes.filter((m) => m.mode === 1).map((m) => m.title)
    const value = JSON.stringify({ hiddenModules: hidden, adminOnlyModules: adminOnly, showAds: this.data.showAds })
    const that = this
    // 按 key 查现有行：有则更新，无则插入
    const { data: rows } = await cloud.database.from('settings').select('id').eq('key', 'site').limit(1)
    let error = null
    if (rows && rows.length) {
      const r = await cloud.database.from('settings').update({ value, updated_at: new Date().toISOString() }).eq('id', rows[0].id).select()
      error = r.error
      if (!error && (!r.data || !r.data.length)) error = { message: '只能修改自己保存过的设置' }
    } else {
      const r = await cloud.database.from('settings').insert({ key: 'site', value })
      error = r.error
    }
    if (error) return that.show('保存失败：' + (error.message || '需要先登录'))
    invalidateSettings()
    that.show('已保存，首页与广告位即时生效')
  },
  show(m) {
    this.setData({ msg: m })
    setTimeout(() => this.setData({ msg: '' }), 2500)
  },
})
