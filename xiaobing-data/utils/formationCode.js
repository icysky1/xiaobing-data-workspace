// 阵容码 v3 解析（还原自游戏客户端 FormationCodeCodec，与 tools/formation-code.js 同源）
// 规则：Z3 + base64url(位流+3字节FNV校验)
// 位流：18bit 占位掩码 + 5bit 神兽站位 + 12bit×N 英雄ID偏移(按站位升序) + 20bit 神兽ID(如有)
// 号位按列编号：前排[1,4,7,10,13,16] 中排[2,5,8,11,14,17] 后排[3,6,9,12,15,18]
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
const PREFIX = 'Z3'
const MAX_POSITION = 18
const HERO_BASE = 800000
const PET_MIN = 900000

// 与客户端一致：号位 → 排/列
const GAME_NO = {
  front: [1, 4, 7, 10, 13, 16],
  mid: [2, 5, 8, 11, 14, 17],
  back: [3, 6, 9, 12, 15, 18],
}
function rowColOf(position) {
  const rank = (position - 1) % 3 // 0前排 1中排 2后排
  const col = Math.floor((position - 1) / 3)
  return { row: rank === 0 ? 'front' : rank === 1 ? 'mid' : 'back', col }
}

function fnv1a(bytes) {
  let h = 2166136261
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i]
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}
function b64decode(text) {
  if (!text || !/^[A-Za-z0-9_-]+$/.test(text) || text.length % 4 === 1) throw new Error('阵容码格式不正确')
  const out = []
  let acc = 0, bits = 0
  for (let i = 0; i < text.length; i++) {
    const v = ALPHABET.indexOf(text[i])
    if (v < 0) throw new Error('阵容码格式不正确')
    acc = (acc << 6) | v
    bits += 6
    if (bits >= 8) {
      bits -= 8
      out.push((acc >>> bits) & 255)
      acc &= (1 << bits) - 1
    }
  }
  if (acc !== 0) throw new Error('阵容码格式不正确')
  return out
}
function b64encode(bytes) {
  let out = ''
  for (let n = 0; n < bytes.length; n += 3) {
    const left = bytes.length - n
    const t = (bytes[n] << 16) | (left > 1 ? bytes[n + 1] << 8 : 0) | (left > 2 ? bytes[n + 2] : 0)
    out += ALPHABET[(t >>> 18) & 63]
    out += ALPHABET[(t >>> 12) & 63]
    if (left > 1) out += ALPHABET[(t >>> 6) & 63]
    if (left > 2) out += ALPHABET[t & 63]
  }
  return out
}

// 解析阵容码 → [{position, heroId}]（校验失败抛错，文案与客户端一致）
function decode(code) {
  const text = (code || '').trim()
  if (!text.startsWith(PREFIX)) throw new Error('阵容码格式不正确')
  const raw = b64decode(text.slice(PREFIX.length))
  if (raw.length <= 3) throw new Error('阵容码内容不完整')
  const body = raw.slice(0, -3)
  const crc = (raw[raw.length - 3] << 16) | (raw[raw.length - 2] << 8) | raw[raw.length - 1]
  if ((fnv1a(body) & 0xffffff) !== crc) throw new Error('阵容码校验失败，请重新复制完整阵容码')
  let bit = 0
  const read = (n) => {
    if (bit + n > 8 * body.length) throw new Error('阵容码内容不完整')
    let v = 0
    for (let i = 0; i < n; i++) {
      const byte = Math.floor(bit / 8), b = 7 - (bit % 8)
      v = v * 2 + ((body[byte] >>> b) & 1)
      bit++
    }
    return v
  }
  const mask = read(MAX_POSITION)
  const positions = []
  for (let p = 1; p <= MAX_POSITION; p++) if (mask & (1 << (p - 1))) positions.push(p)
  const petPos = read(5)
  if (petPos > MAX_POSITION || (petPos > 0 && positions.indexOf(petPos) < 0)) throw new Error('阵容码神兽站位不正确')
  const heroCnt = positions.length - (petPos > 0 ? 1 : 0)
  const expect = Math.ceil((MAX_POSITION + 5 + 12 * heroCnt + (petPos > 0 ? 20 : 0)) / 8)
  if (body.length !== expect) throw new Error('阵容码内容不正确')
  const heroes = []
  positions.forEach((p) => {
    if (p === petPos) return
    heroes.push({ position: p, heroId: HERO_BASE + read(12) })
  })
  if (petPos > 0) {
    const id = read(20)
    if (id < PET_MIN) throw new Error('阵容码神兽内容不正确')
    heroes.push({ position: petPos, heroId: id })
  }
  if (read(8 * body.length - bit) !== 0) throw new Error('阵容码内容不正确')
  heroes.sort((a, b) => a.position - b.position)
  return { version: 3, heroes }
}

// 按游戏号位映射到布阵图：返回 [{position, heroId, row, col}]
function withRowCol(heroes) {
  return heroes.map((h) => ({ ...h, ...rowColOf(h.position) }))
}

// ---------- 编码（我方阵容 → 阵容码） ----------
const MAX_HEROES = 16
const HERO_OFFSET_MAX = 4095

function BitWriter() {
  this.bytes = []
  this.bitLength = 0
}
BitWriter.prototype.write = function (value, bits) {
  for (let i = bits - 1; i >= 0; i--) {
    const byteIdx = Math.floor(this.bitLength / 8)
    const bitIdx = 7 - (this.bitLength % 8)
    if (this.bytes[byteIdx] === undefined) this.bytes[byteIdx] = 0
    this.bytes[byteIdx] |= ((value >>> i) & 1) << bitIdx
    this.bitLength++
  }
}

// 规范化：站位/ID 校验、去重、最多 1 神兽、最多 16 武将（与客户端 upHeroFull 一致）
function normalize(entries) {
  const posSet = {}
  const idSet = {}
  const out = []
  let petCount = 0
  ;(entries || []).forEach((e) => {
    const pos = Number(e.position)
    const id = Number(e.heroId)
    if (!(pos >= 1 && pos <= MAX_POSITION) || pos % 1 !== 0) throw new Error('阵容码包含无效站位')
    if (!(id > 0 && id < 1e6) || id % 1 !== 0) throw new Error('阵容码包含无效英雄或神兽')
    if (posSet[pos]) throw new Error('阵容码包含重复站位')
    if (idSet[id]) throw new Error('阵容码包含重复英雄或神兽')
    if (id >= PET_MIN) {
      petCount++
      if (petCount > 1) throw new Error('阵容码最多只能包含一个神兽')
    }
    posSet[pos] = 1
    idSet[id] = 1
    out.push({ position: pos, heroId: id })
  })
  const heroCount = out.length - petCount
  if (heroCount > MAX_HEROES) throw new Error('最多上阵' + MAX_HEROES + '名武将（当前 ' + heroCount + ' 名）')
  return out.sort((a, b) => a.position - b.position)
}

// entries: [{position, heroId}] → 阵容码字符串
function encode(entries) {
  const list = normalize(entries)
  if (!list.length) throw new Error('阵容为空，无法生成阵容码')
  const w = new BitWriter()
  let mask = 0
  list.forEach((e) => { mask |= 1 << (e.position - 1) })
  w.write(mask, MAX_POSITION)
  let pet = null
  list.forEach((e) => { if (e.heroId >= PET_MIN) pet = e })
  w.write(pet ? pet.position : 0, 5)
  list.forEach((e) => {
    if (e.heroId >= PET_MIN) return
    const off = e.heroId - HERO_BASE
    if (off <= 0 || off > HERO_OFFSET_MAX) throw new Error('阵容码暂不支持该英雄（ID ' + e.heroId + '）')
    w.write(off, 12)
  })
  if (pet) w.write(pet.heroId, 20)
  const bytes = w.bytes.concat()
  const crc = fnv1a(bytes) & 0xffffff
  bytes.push(crc >>> 16, (crc >>> 8) & 255, crc & 255)
  return PREFIX + b64encode(bytes)
}

module.exports = {
  decode,
  encode,
  withRowCol,
  rowColOf,
  GAME_NO,
  HERO_BASE,
  PET_MIN,
  MAX_POSITION,
  MAX_HEROES,
}
