export function getBestSupplier(part) {
  return part.suppliers.reduce((best, s) => (s.unitCost < best.unitCost ? s : best))
}

export function calcPartLineCost(part, quantity, supplierName = null) {
  const supplier = supplierName
    ? part.suppliers.find(s => s.name === supplierName)
    : getBestSupplier(part)
  if (!supplier) return 0
  return supplier.unitCost * part.qtyPerUnit * quantity
}

export function calcBOMCost(bom, quantity, supplierPreferences = {}) {
  return bom.reduce((total, part) => {
    return total + calcPartLineCost(part, quantity, supplierPreferences[part.id] ?? null)
  }, 0)
}

export function getAllSupplierNames(bom) {
  const names = new Set()
  bom.forEach(part => part.suppliers.forEach(s => names.add(s.name)))
  return [...names].sort()
}

export function calcSupplierTotals(bom, quantity) {
  const suppliers = getAllSupplierNames(bom)
  return suppliers.map(name => {
    let total = 0
    let covered = 0
    bom.forEach(part => {
      const s = part.suppliers.find(sup => sup.name === name)
      if (s) {
        total += s.unitCost * part.qtyPerUnit * quantity
        covered++
      }
    })
    return { name, total, covered, partsCount: bom.length }
  })
}
