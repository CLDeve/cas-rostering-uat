const gateToNode = {
  A1: 'A_G1_8', A2: 'A_G1_8', A3: 'A_G1_8', A4: 'A_G1_8',
  A5: 'A_G1_8', A6: 'A_G1_8', A7: 'A_G1_8', A8: 'A_G1_8',
  A9: 'A_G9_10', A10: 'A_G9_10',
  A11: 'A_G11_12', A12: 'A_G11_12',
  A13: 'A_G13_14', A14: 'A_G13_14',
  A15: 'A15',
  A16: 'A_G16_20', A17: 'A_G16_20', A18: 'A_G16_20', A19: 'A_G16_20', A20: 'A_G16_20',
  A21: 'A21',

  B1: 'B_G1_4', B2: 'B_G1_4', B3: 'B_G1_4', B4: 'B_G1_4',
  B5: 'B5', B6: 'B6', B7: 'B7', B8: 'B8', B9: 'B9', B10: 'B10',

  C1: 'C_G1_3', C2: 'C_G1_3', C3: 'C_G1_3',
  C11: 'C_G11_12', C12: 'C_G11_12',
  C13: 'C_G13_14', C14: 'C_G13_14',
  C15: 'C15', C16: 'C16', C17: 'C17', C18: 'C18',
  C19: 'C_G19_25_26', C25: 'C_G19_25_26', C26: 'C_G19_25_26',
  C20: 'C_G20_21', C21: 'C_G20_21',
  C22: 'C22', C23: 'C23', C24: 'C24',

  D30: 'D30',
  D31: 'D_G31_32', D32: 'D_G31_32',
  D33: 'D_G33_34', D34: 'D_G33_34',
  D35: 'D35', D36: 'D36', D37: 'D37',
  D38: 'D_G38_48_49', D48: 'D_G38_48_49', D49: 'D_G38_48_49',
  D40: 'D40', D41: 'D41', D46: 'D46',
  D42: 'D_G42_43', D43: 'D_G42_43',
  D44: 'D_G44_45', D45: 'D_G44_45',
  D47: 'D47',

  E1: 'E1', E2: 'E2', E3: 'E3', E4: 'E4', E5: 'E5', E6: 'E6',
  E7: 'E_G7_8_12', E8: 'E_G7_8_12', E12: 'E_G7_8_12',
  E10: 'E10', E11: 'E11',
  E20: 'E20', E26: 'E26', E27: 'E27', E28: 'E28',
  E22: 'E_G22_23', E23: 'E_G22_23',
  E24: 'E_G24_25', E25: 'E_G24_25',

  F31: 'F31', F32: 'F32', F33: 'F33', F34: 'F34', F35: 'F35', F36: 'F36', F37: 'F37',
  F40: 'F40', F41: 'F41', F42: 'F42', F50: 'F50',
  F51: 'F_G51_52', F52: 'F_G51_52',
  F53: 'F_G53_54', F54: 'F_G53_54',
  F55: 'F_G55_56', F56: 'F_G55_56',
  F57: 'F_G57_58', F58: 'F_G57_58',
  F59: 'F_G59_60', F60: 'F_G59_60',
}

const edges = [
  ['A_G16_20', 'A15', 60], ['A15', 'A21', 30], ['A15', 'A_G13_14', 60], ['A21', 'A_G13_14', 60],
  ['A_G13_14', 'A_G11_12', 60], ['A_G11_12', 'A_G9_10', 60], ['A_G9_10', 'A_PIER', 90],
  ['A_G1_8', 'A_PIER', 30], ['A_PIER', 'B_PIER', 360],
  ['B_G1_4', 'B_PIER', 30], ['B_PIER', 'B5', 90], ['B5', 'B6', 30], ['B6', 'B7', 60],
  ['B7', 'B8', 60], ['B8', 'B9', 60], ['B9', 'B10', 60], ['B10', 'C_G1_3', 60],
  ['C_G1_3', 'C_PIER', 30], ['C_G1_3', 'C_G20_21', 150], ['C_G20_21', 'C22', 60], ['C22', 'C23', 60],
  ['C23', 'C24', 150], ['C_PIER', 'C_G11_12', 120], ['C_G11_12', 'C_G13_14', 60], ['C_G11_12', 'C_G20_21', 30],
  ['C_G13_14', 'C15', 30], ['C_G13_14', 'C22', 30], ['C15', 'C16', 30], ['C15', 'C23', 30],
  ['C16', 'C17', 90], ['C17', 'C18', 60], ['C18', 'C24', 30], ['C18', 'C_G19_25_26', 60], ['C24', 'C_G19_25_26', 60],
  ['C_PIER', 'D_PIER', 360],
  ['D30', 'D_PIER', 30], ['D30', 'D_G31_32', 60], ['D41', 'D_PIER', 30], ['E28', 'D40', 90], ['D40', 'D41', 60],
  ['D41', 'D_G42_43', 90], ['D_G42_43', 'D_G44_45', 60], ['D_G44_45', 'D46', 60], ['D_G31_32', 'D_G33_34', 60],
  ['D_G33_34', 'D35', 60], ['D_G42_43', 'D30', 30], ['D_G44_45', 'D_G31_32', 30], ['D46', 'D_G33_34', 30],
  ['D35', 'D36', 60], ['D36', 'D37', 60], ['D37', 'D_G38_48_49', 60], ['D47', 'D_G38_48_49', 60],
  ['D46', 'D47', 120], ['D47', 'D37', 30],
  ['E_PIER', 'E1', 30], ['E_PIER', 'E20', 120], ['E20', 'E_G22_23', 90], ['E_G22_23', 'E_G24_25', 90],
  ['E_G24_25', 'E26', 90], ['E26', 'E27', 90], ['E27', 'E28', 90], ['E28', 'D40', 90],
  ['E1', 'E2', 30], ['E2', 'E3', 60], ['E3', 'E4', 60], ['E4', 'E5', 90], ['E5', 'E10', 90],
  ['E10', 'E11', 60], ['E10', 'E6', 30], ['E11', 'E_G7_8_12', 90], ['E5', 'E6', 90], ['E6', 'E_G7_8_12', 150],
  ['F_PIER', 'F31', 30], ['F31', 'F32', 60], ['F32', 'F33', 60], ['F33', 'F34', 90], ['F34', 'F40', 30],
  ['F34', 'F35', 90], ['F40', 'F41', 90], ['F41', 'F35', 30], ['F41', 'F42', 90], ['F35', 'F36', 90],
  ['F42', 'F36', 30], ['F42', 'F37', 30], ['F36', 'F37', 30], ['F_PIER', 'F50', 90], ['F50', 'F_G51_52', 90],
  ['F_G51_52', 'F_G53_54', 90], ['F_G53_54', 'F_G55_56', 90], ['F_G55_56', 'F_G57_58', 90], ['F_G57_58', 'F_G59_60', 90],
  ['F_PIER', 'E_PIER', 240],
]

const graph = (() => {
  const g = {}
  for (const [u, v, w] of edges) {
    if (!g[u]) g[u] = []
    if (!g[v]) g[v] = []
    g[u].push([v, w])
    g[v].push([u, w])
  }
  return g
})()

export function normalizeGateCode(value) {
  const raw = String(value || '').toUpperCase().replace(/\s+/g, '')
  const m = raw.match(/[A-F]\d{1,2}/)
  return m ? m[0] : ''
}

export function estimateWalkSecondsBetweenGates(startGate, endGate) {
  const startCode = normalizeGateCode(startGate)
  const endCode = normalizeGateCode(endGate)
  const startNode = gateToNode[startCode]
  const endNode = gateToNode[endCode]
  if (!startNode || !endNode) return null
  if (startNode === endNode) return 0

  const dist = {}
  for (const node of Object.keys(graph)) dist[node] = Number.POSITIVE_INFINITY
  dist[startNode] = 0
  const pq = [[0, startNode]]

  while (pq.length > 0) {
    pq.sort((a, b) => a[0] - b[0])
    const [d, u] = pq.shift()
    if (u === endNode) return d
    if (d > dist[u]) continue
    for (const [v, w] of graph[u] || []) {
      const nd = d + w
      if (nd < dist[v]) {
        dist[v] = nd
        pq.push([nd, v])
      }
    }
  }
  return null
}

