// 临时自测：后台登录改走 RPC 后的分支处理
const path = require('path')
const base = path.resolve(__dirname, '../xiaobing-data')
const cloudPath = path.join(base, 'utils/cloud.js')
const settingsPath = path.join(base, 'utils/settings.js')

let rpcResult = true
let rpcError = null
const rpcCalls = []

require.cache[cloudPath] = {
  id: cloudPath,
  filename: cloudPath,
  loaded: true,
  exports: {
    cloud: {
      database: {
        rpc(name, params) {
          rpcCalls.push([name, params])
          return Promise.resolve({ data: rpcResult, error: rpcError })
        },
      },
      auth: { getSession: () => Promise.resolve({ data: null }) },
    },
  },
}
require.cache[settingsPath] = {
  id: settingsPath,
  filename: settingsPath,
  loaded: true,
  exports: {
    getSiteSettings: () => Promise.resolve({ hiddenModules: [], adminOnlyModules: [], showAds: false }),
    invalidateSettings() {},
    isAdminUser: () => Promise.resolve(true),
    canViewModule: () => Promise.resolve(true),
  },
}

const store = {}
global.wx = {
  setStorageSync: (k, v) => (store[k] = v),
  getStorageSync: (k) => store[k],
  removeStorageSync: (k) => delete store[k],
}
let def = null
global.Page = (o) => (def = o)
require(path.join(base, 'pages/admin/admin.js'))

function makePage() {
  const p = Object.assign({}, def)
  p.data = JSON.parse(JSON.stringify(def.data))
  p.setData = function (patch) {
    Object.keys(patch).forEach((k) => {
      const m = k.match(/^(\w+)\[(\d+)\]\.(\w+)$/)
      if (m) p.data[m[1]][Number(m[2])][m[3]] = patch[k]
      else p.data[k] = patch[k]
    })
  }
  p.show = function (m) {
    p.data.msg = m
  }
  p.loadAll = () => {}
  p.loadSettings = () => {}
  p.loadOwnerState = () => Promise.resolve()
  return p
}

function flush() {
  return new Promise((r) => setImmediate(r))
}

;(async () => {
  const p1 = makePage()
  p1.data.user = { id: 'wx:test' }
  p1.data.ownerState = 'mine'
  p1.data.passInput = 'xb2026'
  rpcResult = true
  p1.unlock()
  await flush()
  console.log('登录成功分支：isAdmin=', p1.data.isAdmin, 'flag=', store['xb-admin-unlocked'], 'rpc=', JSON.stringify(rpcCalls.at(-1)))

  const p2 = makePage()
  p2.data.user = { id: 'wx:test' }
  p2.data.ownerState = 'mine'
  p2.data.passInput = 'wrong'
  rpcResult = false
  p2.unlock()
  await flush()
  console.log('口令错误分支：isAdmin=', p2.data.isAdmin, 'msg=', p2.data.msg)

  const p3 = makePage()
  p3.data.user = { id: 'wx:test' }
  p3.data.ownerState = 'unbound'
  p3.data.passInput = 'xb-owner-2026'
  rpcResult = [true]
  p3.unlock()
  await flush()
  console.log('首次绑定分支：isAdmin=', p3.data.isAdmin, 'msg=', p3.data.msg, 'rpc=', JSON.stringify(rpcCalls.at(-1)))

  const p4 = makePage()
  p4.data.isAdmin = true
  p4.data.newPass = 'newpass123'
  p4.data.newPass2 = 'newpass123'
  rpcResult = true
  p4.changePass()
  await flush()
  console.log('改口令成功：msg=', p4.data.msg, '清空=', p4.data.newPass === '' && p4.data.newPass2 === '')

  const p5 = makePage()
  p5.data.newPass = '123'
  p5.data.newPass2 = '123'
  p5.changePass()
  await flush()
  console.log('短口令拦截：msg=', p5.data.msg)

  process.exit(0)
})()
