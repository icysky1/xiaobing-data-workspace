#!/usr/bin/env node
// 阵容码编解码器（复刻客户端 FormationCodeCodec v3）
// 用法：
//   node tools/formation-code.js decode Z3xxxxxxxx
//   node tools/formation-code.js encode "1=黄金甲·嫦娥,2=飞仙·李白,...,12=鸣蛇"
//   node tools/formation-code.js demo            # 用推荐阵容编码并回解自测
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const heroArr = (() => { const h = require(path.join(ROOT, 'data/heroes.json')); return Array.isArray(h) ? h : Object.values(h) })()
const petArr = (() => { const p = require(path.join(ROOT, 'data/pets.json')); return Array.isArray(p) ? p : Object.values(p) })()
const byId = {}, byName = {}
heroArr.forEach((h) => { byId[h.id] = h; byName[h.name] = h })
petArr.forEach((p) => { byId[p.id] = p; byName[p.name] = p })

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
const MAX_POSITION = 18
const MAX_HEROES = 16
const HERO_BASE = 800000
const HERO_OFFSET_MAX = 4095
const PET_MIN = 900000
const PREFIX = 'Z3'

class BitWriter {
  constructor() { this.bytes = []; this.bitLength = 0 }
  write(value, bits) {
    for (let i = bits - 1; i >= 0; i--) {
      const byteIdx = Math.floor(this.bitLength / 8)
      const bitIdx = 7 - (this.bitLength % 8)
      if (!this.bytes[byteIdx]) this.bytes[byteIdx] = 0
      this.bytes[byteIdx] |= ((value >>> i) & 1) << bitIdx
      this.bitLength++
    }
  }
  toBytes() { return this.bytes.concat() }
}
class BitReader {
  constructor(bytes) { this.bytes = bytes; this.bitOffset = 0 }
  read(bits) {
    if (this.bitOffset + bits > 8 * this.bytes.length) throw new Error('阵容码内容不完整')
    let out = 0
    for (let i = 0; i < bits; i++) {
      const byteIdx = Math.floor(this.bitOffset / 8)
      const bitIdx = 7 - (this.bitOffset % 8)
      out = out * 2 + ((this.bytes[byteIdx] >>> bitIdx) & 1)
      this.bitOffset++
    }
    return out
  }
  readPadding() { return this.read(8 * this.bytes.length - this.bitOffset) }
}
// FNV-1a 32bit
function fnv1a(bytes) {
  let h = 2166136261
  for (const b of bytes) { h ^= b; h = Math.imul(h, 16777619) }
  return h >>> 0
}
function b64encode(bytes) {
  let out = ''
  for (let n = 0; n < bytes.length; n += 3) {
    const left = bytes.length - n
    const triple = (bytes[n] << 16) | (left > 1 ? bytes[n + 1] << 8 : 0) | (left > 2 ? bytes[n + 2] : 0)
    out += ALPHABET[(triple >>> 18) & 63]
    out += ALPHABET[(triple >>> 12) & 63]
    if (left > 1) out += ALPHABET[(triple >>> 6) & 63]
    if (left > 2) out += ALPHABET[triple & 63]
  }
  return out
}
function b64decode(str) {
  if (!str || !/^[A-Za-z0-9_-]+$/.test(str) || str.length % 4 === 1) throw new Error('阵容码格式不正确')
  const bytes = []
  let acc = 0, accBits = 0
  for (const ch of str) {
    const v = ALPHABET.indexOf(ch)
    if (v < 0) throw new Error('阵容码格式不正确')
    acc = (acc << 6) | v
    accBits += 6
    if (accBits >= 8) { accBits -= 8; bytes.push((acc >>> accBits) & 255); acc &= (1 << accBits) - 1 }
  }
  if (acc !== 0 || b64encode(bytes) !== str) throw new Error('阵容码格式不正确')
  return bytes
}
// 规范化：校验站位/ID/去重/单神兽，按站位排序
function normalize(entries) {
  const posSet = new Set(), idSet = new Set(), out = []
  let petCount = 0
  for (const e of entries) {
    const pos = Number(e.position), id = Number(e.heroId)
    if (!Number.isInteger(pos) || pos < 1 || pos > MAX_POSITION) throw new Error('阵容码包含无效站位')
    if (!Number.isSafeInteger(id) || id <= 0 || id >= 1e6) throw new Error('阵容码包含无效英雄或神兽')
    if (posSet.has(pos)) throw new Error('阵容码包含重复站位')
    if (idSet.has(id)) throw new Error('阵容码包含重复英雄或神兽')
    if (id >= PET_MIN && ++petCount > 1) throw new Error('阵容码最多只能包含一个神兽')
    posSet.add(pos); idSet.add(id); out.push({ position: pos, heroId: id })
  }
  // 客户端 upHeroFull：「最多上阵16名武将」；18 格中神兽占 1 格 → 必然空 1 格
  const heroCount = out.length - petCount
  if (heroCount > MAX_HEROES) throw new Error(`最多上阵${MAX_HEROES}名武将（当前 ${heroCount} 名）`)
  return out.sort((a, b) => a.position - b.position)
}
function encode(entries) {
  const list = normalize(entries)
  const w = new BitWriter()
  let mask = 0
  list.forEach((e) => { mask |= 1 << (e.position - 1) })
  w.write(mask, MAX_POSITION)
  const pet = list.find((e) => e.heroId >= PET_MIN)
  w.write(pet ? pet.position : 0, 5)
  list.forEach((e) => {
    if (e.heroId >= PET_MIN) return
    const off = e.heroId - HERO_BASE
    if (off <= 0 || off > HERO_OFFSET_MAX) throw new Error('阵容码暂不支持该英雄（ID ' + e.heroId + '）')
    w.write(off, 12)
  })
  if (pet) w.write(pet.heroId, 20)
  const bytes = w.toBytes()
  const crc = fnv1a(bytes) & 0xffffff
  return PREFIX + b64encode(bytes.concat([crc >>> 16, (crc >>> 8) & 255, crc & 255]))
}
function decode(code) {
  const text = (code || '').trim()
  if (!text.startsWith(PREFIX)) throw new Error('阵容码格式不正确')
  const raw = b64decode(text.slice(PREFIX.length))
  if (raw.length <= 3) throw new Error('阵容码内容不完整')
  const body = raw.slice(0, -3)
  const n = raw.length - 3
  const crc = (raw[n] << 16) | (raw[n + 1] << 8) | raw[n + 2]
  if ((fnv1a(body) & 0xffffff) !== crc) throw new Error('阵容码校验失败，请重新复制完整阵容码')
  const r = new BitReader(body)
  const mask = r.read(MAX_POSITION)
  const positions = []
  for (let pos = 1; pos <= MAX_POSITION; pos++) if (mask & (1 << (pos - 1))) positions.push(pos)
  const petPos = r.read(5)
  if (petPos > MAX_POSITION || (petPos > 0 && !positions.includes(petPos))) throw new Error('阵容码神兽站位不正确')
  const heroCnt = positions.length - (petPos > 0 ? 1 : 0)
  const expectBytes = Math.ceil((MAX_POSITION + 5 + 12 * heroCnt + (petPos > 0 ? 20 : 0)) / 8)
  if (body.length !== expectBytes) throw new Error('阵容码内容不正确')
  const out = []
  positions.forEach((pos) => {
    if (pos !== petPos) out.push({ position: pos, heroId: HERO_BASE + r.read(12) })
  })
  if (petPos > 0) {
    const petId = r.read(20)
    if (petId < PET_MIN) throw new Error('阵容码神兽内容不正确')
    out.push({ position: petPos, heroId: petId })
  }
  if (r.readPadding() !== 0) throw new Error('阵容码内容不正确')
  return { version: 3, heroes: out.sort((a, b) => a.position - b.position) }
}
const label = (id) => {
  const x = byId[id]
  if (!x) return '未知(' + id + ')'
  return x.name + (id >= PET_MIN ? '（神兽）' : '（' + x.era + '）')
}

// ---------- CLI ----------
if (require.main !== module) { module.exports = { encode, decode }; return }
const [, , cmd, arg] = process.argv
function printCode(code) {
  console.log('阵容码：' + code)
  try {
    const d = decode(code)
    console.log('解码结果（' + d.heroes.length + ' 个单位，版本 v' + d.version + '）：')
    d.heroes.forEach((e) => console.log(`  ${String(e.position).padStart(2)} 号位  ${label(e.heroId)}  [${e.heroId}]`))
  } catch (e) {
    console.log('❌ ' + e.message)
  }
}
if (cmd === 'decode') {
  printCode(arg)
} else if (cmd === 'encode') {
  const entries = String(arg || '').split(',').map((x) => x.trim()).filter(Boolean).map((pair) => {
    const [p, nameOrId] = pair.split('=')
    const id = /^\d+$/.test(String(nameOrId)) ? Number(nameOrId) : (byName[nameOrId.trim()] && byName[nameOrId.trim()].id)
    if (!id) throw new Error('未知英雄：' + nameOrId)
    return { position: Number(p), heroId: id }
  })
  printCode(encode(entries))
} else {
  // demo：推荐阵容 vs 敌方阵容
  // 合法阵容：16 英雄 + 1 神兽 = 17 单位，固定空 1 格
  const ours = {
    back: ['飞仙·黄帝', '太阴星君', null, '飞仙·苏妲己', '妈祖', '飞仙·李白'],
    mid: ['戏魂·华胥氏', '黄金甲·精卫', '黄金甲·嫦娥', '黄金甲·聂隐娘', '飞仙·甄嬛儿'],
    front: ['戏魂·阿青', '孙悟空', '戏魂·九天玄女', '飞仙·新月娥', '飞仙·孙尚香', '飞仙·樊梨花'],
    pet: '鸣蛇', petPos: 17,
  }
  const enemy = {
    back: ['九天玄女', '女艾', null, '后羿', '黄金甲·精卫', '女娲'],
    mid: ['黄金甲·雨师妾', '伏羲', '黄金甲·嫦娥', '刘邦', '李白', '洛嫔'],
    front: [null, '张良', '飞仙·涂山女', '夏启', '大禹', '飞仙·赵飞燕'],
    pet: '九尾狐', petPos: 3,
  }
  // 游戏号位按列编号：前排[1,4,7,10,13,16] 中排[2,5,8,11,14,17] 后排[3,6,9,12,15,18]
  const GAME_NO = { front: [1, 4, 7, 10, 13, 16], mid: [2, 5, 8, 11, 14, 17], back: [3, 6, 9, 12, 15, 18] }
  const build = (cfg) => {
    const entries = []
    ;['front', 'mid', 'back'].forEach((row) => {
      cfg[row].forEach((n, i) => { if (n) entries.push({ position: GAME_NO[row][i], heroId: byName[n].id }) })
    })
    entries.push({ position: cfg.petPos, heroId: byName[cfg.pet].id })
    return entries
  }
  console.log('=== 我方（鸣蛇）===')
  printCode(encode(build(ours)))
  console.log('\n=== 敌方（九尾狐，13 号位空）===')
  printCode(encode(build(enemy)))
}
module.exports = { encode, decode }
