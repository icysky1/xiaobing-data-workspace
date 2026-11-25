// 临时自测：模块可见性（显示 / 仅管理员 / 隐藏）逻辑
const path = require('path')
const settingsPath = path.resolve(__dirname, '../xiaobing-data/utils/settings.js')
const cloudPath = path.resolve(__dirname, '../xiaobing-data/utils/cloud.js')

function makeCloud(siteValue, ownerId, sessionUser) {
  const rowsFor = (key) => {
    if (key === 'site') return [{ value: siteValue }]
    if (key === 'admin_owner') return ownerId ? [{ value: ownerId }] : []
    return []
  }
  const db = {
    from: () => ({
      select: () => ({
        eq: (k, v) => ({ limit: () => Promise.resolve({ data: rowsFor(v) }) }),
      }),
    }),
  }
  return {
    database: db,
    auth: {
      getSession: () => Promise.resolve({ data: sessionUser ? { user: sessionUser } : null }),
    },
  }
}

function load(siteValue, ownerId, sessionUser, localAdmin) {
  delete require.cache[settingsPath]
  require.cache[cloudPath] = {
    id: cloudPath,
    filename: cloudPath,
    loaded: true,
    exports: { cloud: makeCloud(siteValue, ownerId, sessionUser) },
  }
  global.wx = {
    getStorageSync: (k) => (k === 'xb-admin-unlocked' && localAdmin ? 1 : ''),
  }
  return require(settingsPath)
}

;(async () => {
  const legacyEmpty = JSON.stringify({ hiddenModules: [], showAds: false })
  const s1 = load(legacyEmpty, 'u1', { id: 'u1' })
  const st1 = await s1.getSiteSettings()
  console.log('旧格式(空隐藏) 默认 ->', JSON.stringify(st1))
  console.log('  管理员可见:', await s1.canViewModule('众生平等模拟'), '(应为 true)')

  const s2 = load(legacyEmpty, 'u1', { id: 'u2' })
  console.log('  普通用户可见:', await s2.canViewModule('众生平等模拟'), '(应为 false)')

  const legacyHidden = JSON.stringify({ hiddenModules: ['众生平等模拟', '科技树'], showAds: true })
  const s3 = load(legacyHidden, 'u1', { id: 'u1' })
  const st3 = await s3.getSiteSettings()
  console.log('旧格式(隐藏众生+科技树) ->', JSON.stringify(st3))
  console.log('  科技树可见:', await s3.canViewModule('科技树'), '(应为 false)')

  const s4 = load(legacyEmpty, null, null, true)
  console.log('未登录但本机已解锁后台，可见:', await s4.canViewModule('众生平等模拟'), '(应为 true)')

  const explicitShow = JSON.stringify({ hiddenModules: [], adminOnlyModules: [], showAds: false })
  const s5 = load(explicitShow, 'u1', { id: 'u2' })
  console.log('后台显式设为「显示」后普通用户可见:', await s5.canViewModule('众生平等模拟'), '(应为 true)')

  const explicitHide = JSON.stringify({ hiddenModules: ['众生平等模拟'], adminOnlyModules: [], showAds: false })
  const s6 = load(explicitHide, 'u1', { id: 'u1' }, true)
  console.log('后台显式设为「隐藏」后管理员可见:', await s6.canViewModule('众生平等模拟'), '(应为 false)')
})()
