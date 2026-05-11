import { getBestSupplier, calcBOMCost } from './costEngine'

function getBoardPrefix(configName) {
  if (configName.startsWith('E2CMB')) return 'E2CMB'
  if (configName.startsWith('E2CAB')) return 'E2CAB'
  if (configName.startsWith('E2CF'))  return 'E2CF'
  return null
}

export function calcAlerts(bom, builds, budgetPerRun = 12000) {
  const alerts = []

  builds.forEach(build => {
    const board = getBoardPrefix(build.Config)
    if (!board) return

    const parts = bom.filter(p => p.appliesTo === board)
    const qty = build.Quantity

    if (qty === 0) {
      alerts.push({
        id: `zero-${build.Config}`,
        type: 'info',
        config: build.Config,
        title: 'Zero Quantity',
        message: `${build.Config} has 0 units scheduled`,
      })
      return
    }

    // MOQ shortfall — parts needed vs supplier minimum order
    parts.forEach(part => {
      const best = getBestSupplier(part)
      const needed = part.qtyPerUnit * qty
      if (needed < best.moq) {
        alerts.push({
          id: `moq-${build.Config}-${part.id}`,
          type: 'warning',
          config: build.Config,
          partId: part.id,
          title: 'MOQ Shortfall',
          message: `${build.Config} → ${part.id}: needs ${needed.toLocaleString()} but ${best.name} MOQ is ${best.moq.toLocaleString()}`,
        })
      }
    })

    // Budget overrun
    const runCost = calcBOMCost(parts, qty)
    if (runCost > budgetPerRun) {
      alerts.push({
        id: `budget-${build.Config}`,
        type: 'danger',
        config: build.Config,
        title: 'Budget Overrun',
        message: `${build.Config}: $${Math.round(runCost).toLocaleString()} exceeds $${Math.round(budgetPerRun).toLocaleString()} budget`,
      })
    }
  })

  return alerts
}

export function alertedConfigSet(alerts) {
  return new Set(alerts.map(a => a.config))
}

export function alertedPartSet(alerts) {
  return new Set(alerts.filter(a => a.partId).map(a => a.partId))
}
