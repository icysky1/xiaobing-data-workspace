// 判别力：战力差 → 胜率曲线（新口径：释放在前、比拼在后，误差来自 ±2% 战斗浮动）
const sim = require('../xiaobing-data/utils/battleSim.js')

function side(label, k) {
  const mk = (name, row, slot, f, i) => ({
    name,
    row,
    slot,
    baseFmin: f * k,
    baseFmax: f * k,
    baseImin: i * k,
    baseImax: i * k,
  })
  return {
    label,
    finalMult: 2,
    units: [mk('前', 'front', 1, 1000, 600), mk('中', 'mid', 2, 800, 900), mk('后', 'back', 3, 100, 1200)],
    skills: [],
  }
}

const A = side('A', 1)
console.log('战力差%   A胜      平       B胜    | 终局战力 A/B')
;[0, 0.5, 1, 2, 3, 5, 8, 12].forEach((gap) => {
  const B = side('B', 1 + gap / 100)
  const st = sim.createJob({ ours: A, enemy: B, sims: 2000, opt: {} }).step(1e9).stats
  console.log(
    String(gap).padStart(5) + '   ' +
    (st.winRate * 100).toFixed(1).padStart(6) + '% ' +
    (st.drawRate * 100).toFixed(1).padStart(6) + '% ' +
    (st.loseRate * 100).toFixed(1).padStart(6) + '%   | ' +
    st.ours.total + '/' + st.enemy.total
  )
})
