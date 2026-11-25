const { cloud } = require('./cloud')

let cache = null
let ownerCache = null

const ALIAS = { 阵容模拟器: '众生平等模拟' }
function normTitle(t) {
  return ALIAS[t] || t
}

// 结构：{ hiddenModules: [标题], adminOnlyModules: [标题], showAds: bool }
//   hiddenModules     —— 所有人不可见
//   adminOnlyModules  —— 仅主人（管理员）可见，普通用户不显示，便于上线期间调试
function normalize(raw) {
  const s = Object.assign({ hiddenModules: [], showAds: false }, raw || {})
  s.hiddenModules = Array.isArray(s.hiddenModules) ? s.hiddenModules.map(normTitle) : []
  const isNew = Array.isArray(s.adminOnlyModules)
  s.adminOnlyModules = isNew ? s.adminOnlyModules.map(normTitle) : []
  if (!isNew) {
    // 旧版只有「隐藏」：众生平等模拟仍在数据校准期，升级后默认「仅管理员可见」
    // （后台改成「显示」并保存后，adminOnlyModules 会写入空数组，不再走这段默认）
    s.hiddenModules = s.hiddenModules.filter((t) => t !== '众生平等模拟')
    if (s.adminOnlyModules.indexOf('众生平等模拟') < 0) s.adminOnlyModules.push('众生平等模拟')
  }
  return s
}

// 读取站点设置（公开读，全员可用）
function getSiteSettings() {
  if (cache) return cache
  cache = cloud.database
    .from('settings')
    .select('value')
    .eq('key', 'site')
    .limit(1)
    .then(({ data }) => {
      let v = {}
      if (data && data.length && data[0].value) {
        try {
          v = JSON.parse(data[0].value)
        } catch (e) {}
      }
      return normalize(v)
    })
    .catch(() => normalize({}))
  return cache
}

// 主人（管理员）的账号 id：绑定在 settings.admin_owner
function getAdminOwnerId() {
  if (ownerCache) return ownerCache
  ownerCache = cloud.database
    .from('settings')
    .select('value')
    .eq('key', 'admin_owner')
    .limit(1)
    .then(({ data }) => (data && data.length ? String(data[0].value) : null))
    .catch(() => {
      ownerCache = null
      return null
    })
  return ownerCache
}

// 本机是否已通过后台口令解锁（主人首次绑定或每次进入后台时写入）
// 作用：即使云端会话过期 / 尚未绑定 admin_owner，主人本机也不会把自己的调试入口挡掉
function hasLocalAdminFlag() {
  try {
    return typeof wx !== 'undefined' && !!wx.getStorageSync('xb-admin-unlocked')
  } catch (e) {
    return false
  }
}

// 当前账号是否管理员（主人）：云端绑定账号 或 本机已解锁后台
function isAdminUser() {
  if (hasLocalAdminFlag()) return Promise.resolve(true)
  return Promise.all([
    cloud.auth.getSession().catch(() => ({ data: null })),
    getAdminOwnerId(),
  ])
    .then(([r, ownerId]) => {
      const u = r && r.data && r.data.user
      const uid = u ? String(u.id || u.uid || '') : ''
      return !!(uid && ownerId && uid === ownerId)
    })
    .catch(() => false)
}

// 某个模块当前账号能否看到：隐藏=否；仅管理员=需管理员；其余=是
function canViewModule(title) {
  const t = normTitle(title)
  return Promise.all([getSiteSettings(), isAdminUser()])
    .then(([s, admin]) => {
      if (s.hiddenModules.indexOf(t) >= 0) return false
      if (s.adminOnlyModules.indexOf(t) >= 0) return admin
      return true
    })
    .catch(() => true)
}

// 后台保存后清除缓存，让下次读取拿到最新
function invalidateSettings() {
  cache = null
}

module.exports = { getSiteSettings, isAdminUser, canViewModule, invalidateSettings }
