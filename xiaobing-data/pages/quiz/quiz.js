const { questions } = require('../../data/quiz.js')

function fmt(q) {
  const parts = q.question.split(/\{\d\}/)
  // 配置里正确答案固定排在 options 最前，展示前必须打乱
  const opts = q.options.slice()
  for (let i = opts.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const t = opts[i]
    opts[i] = opts[j]
    opts[j] = t
  }
  return { parts, blanks: q.blanks, correct: q.correctAnswers, options: opts, face: q.faceScore, id: q.id }
}

// 随机练习固定锁定前 100 题
const PRACTICE_POOL = questions.slice(0, 100)

function stripMarks(s) {
  // 检索时忽略标点与空格，避免输入法带句末标点搜不到
  return String(s || '').replace(/[\s，。、！？；：""''（）()《》·,.!?;:"'\-]/g, '')
}

Page({
  data: {
    keyword: '',
    focusKw: false,
    results: null,
    searched: false,
    hitCount: 0,
    total: questions.length,
    current: null,
    revealed: false,
    started: false,
    picked: [], // 按顺序选入的答案
  },
  pickOpt(e) {
    const opt = e.currentTarget.dataset.opt
    if (this.data.revealed || !this.data.current) return
    let picked = this.data.picked.slice()
    const at = picked.indexOf(opt)
    if (at >= 0) {
      picked.splice(at, 1) // 再点一次取消
    } else if (picked.length < this.data.current.blanks) {
      picked.push(opt)
    } else {
      picked = [opt] // 已满则重新开始选
    }
    const full = picked.length === this.data.current.blanks
    const correct =
      full &&
      picked.every((v, i) => v === this.data.current.correct[i]) &&
      this.data.current.blanks === picked.length
    this.setData({ picked, revealed: full })
    if (full && !correct) {
      // 答错也直接揭示正确答案
      this.setData({ revealed: true })
    }
  },
  onInput(e) {
    const kw = e.detail.value.trim()
    this.setData({ keyword: kw })
    if (!kw) return this.setData({ results: null, searched: false, hitCount: 0 })
    const key = stripMarks(kw)
    const hits = questions.filter(
      (q) => stripMarks(q.question).indexOf(key) >= 0 || q.correctAnswers.some((a) => stripMarks(a).indexOf(key) >= 0)
    )
    this.setData({ results: hits.map(fmt), searched: true, hitCount: hits.length })
  },
  onBlur() {
    this.setData({ focusKw: false })
  },
  clearKeyword() {
    // 清空后立刻把焦点还给输入框，方便直接继续输入
    this.setData({ keyword: '', results: null, searched: false, focusKw: true, hitCount: 0 })
  },
  startRandom() {
    this.pool = PRACTICE_POOL.slice()
    for (let i = this.pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      const t = this.pool[i]
      this.pool[i] = this.pool[j]
      this.pool[j] = t
    }
    this.idx = 0
    this.setData({
      current: fmt(this.pool[this.idx]),
      revealed: false,
      started: true,
      picked: [],
    })
  },
  reveal() {
    this.setData({ revealed: true })
  },
  next() {
    this.idx++
    if (this.idx >= this.pool.length) {
      this.setData({ current: null })
      return
    }
    this.setData({ current: fmt(this.pool[this.idx]), revealed: false, picked: [] })
  },
})
