export const bomData = [
  // ── Modem Board (E2CMB) ────────────────────────────────────────────────────
  {
    id: 'PN-101',
    description: 'Modem SoC (Snapdragon-class)',
    category: 'IC',
    appliesTo: 'E2CMB',
    uom: 'EA',
    qtyPerUnit: 1,
    suppliers: [
      { name: 'Alpha Electronics', unitCost: 62.00, leadTimeDays: 16, moq: 100 },
      { name: 'Beta Components',   unitCost: 58.50, leadTimeDays: 24, moq: 200 },
      { name: 'Gamma Supply',      unitCost: 60.75, leadTimeDays: 18, moq: 150 },
    ],
  },
  {
    id: 'PN-102',
    description: 'LPDDR4X RAM 4GB',
    category: 'Memory',
    appliesTo: 'E2CMB',
    uom: 'EA',
    qtyPerUnit: 1,
    suppliers: [
      { name: 'Alpha Electronics', unitCost: 18.50, leadTimeDays: 12, moq: 200 },
      { name: 'Beta Components',   unitCost: 17.00, leadTimeDays: 20, moq: 500 },
      { name: 'Delta Parts',       unitCost: 18.25, leadTimeDays: 14, moq: 300 },
    ],
  },
  {
    id: 'PN-103',
    description: 'eMMC Flash 64GB',
    category: 'Memory',
    appliesTo: 'E2CMB',
    uom: 'EA',
    qtyPerUnit: 1,
    suppliers: [
      { name: 'Alpha Electronics', unitCost: 12.00, leadTimeDays: 10, moq: 200 },
      { name: 'Gamma Supply',      unitCost: 11.25, leadTimeDays: 18, moq: 500 },
      { name: 'Delta Parts',       unitCost: 11.50, leadTimeDays: 15, moq: 300 },
    ],
  },
  {
    id: 'PN-104',
    description: 'PMIC (Power Management IC)',
    category: 'IC',
    appliesTo: 'E2CMB',
    uom: 'EA',
    qtyPerUnit: 1,
    suppliers: [
      { name: 'Alpha Electronics', unitCost: 8.75, leadTimeDays: 14, moq: 100 },
      { name: 'Beta Components',   unitCost: 8.00, leadTimeDays: 21, moq: 200 },
      { name: 'Gamma Supply',      unitCost: 8.50, leadTimeDays: 16, moq: 150 },
    ],
  },
  {
    id: 'PN-105',
    description: 'RF Front End Module',
    category: 'RF',
    appliesTo: 'E2CMB',
    uom: 'EA',
    qtyPerUnit: 2,
    suppliers: [
      { name: 'Beta Components',   unitCost: 14.50, leadTimeDays: 18, moq: 100 },
      { name: 'Gamma Supply',      unitCost: 15.00, leadTimeDays: 14, moq: 50 },
      { name: 'Delta Parts',       unitCost: 13.75, leadTimeDays: 22, moq: 200 },
    ],
  },
  {
    id: 'PN-106',
    description: 'PCB – Modem Board 8-Layer',
    category: 'PCB',
    appliesTo: 'E2CMB',
    uom: 'EA',
    qtyPerUnit: 1,
    suppliers: [
      { name: 'Alpha Electronics', unitCost: 22.00, leadTimeDays: 21, moq: 50 },
      { name: 'Gamma Supply',      unitCost: 21.00, leadTimeDays: 24, moq: 75 },
      { name: 'Delta Parts',       unitCost: 19.50, leadTimeDays: 28, moq: 100 },
    ],
  },

  // ── Antenna Board (E2CAB) ──────────────────────────────────────────────────
  {
    id: 'PN-201',
    description: 'Antenna PCB 4-Layer',
    category: 'PCB',
    appliesTo: 'E2CAB',
    uom: 'EA',
    qtyPerUnit: 1,
    suppliers: [
      { name: 'Alpha Electronics', unitCost: 14.00, leadTimeDays: 18, moq: 50 },
      { name: 'Beta Components',   unitCost: 12.75, leadTimeDays: 25, moq: 100 },
      { name: 'Delta Parts',       unitCost: 13.50, leadTimeDays: 21, moq: 75 },
    ],
  },
  {
    id: 'PN-202',
    description: 'RF Switch IC (SP4T)',
    category: 'RF',
    appliesTo: 'E2CAB',
    uom: 'EA',
    qtyPerUnit: 4,
    suppliers: [
      { name: 'Beta Components',   unitCost: 3.25, leadTimeDays: 14, moq: 500 },
      { name: 'Gamma Supply',      unitCost: 3.50, leadTimeDays: 10, moq: 250 },
      { name: 'Delta Parts',       unitCost: 3.10, leadTimeDays: 18, moq: 1000 },
    ],
  },
  {
    id: 'PN-203',
    description: 'LNA (Low Noise Amplifier)',
    category: 'RF',
    appliesTo: 'E2CAB',
    uom: 'EA',
    qtyPerUnit: 2,
    suppliers: [
      { name: 'Alpha Electronics', unitCost: 5.50, leadTimeDays: 16, moq: 200 },
      { name: 'Beta Components',   unitCost: 5.25, leadTimeDays: 20, moq: 500 },
      { name: 'Gamma Supply',      unitCost: 5.75, leadTimeDays: 12, moq: 100 },
    ],
  },
  {
    id: 'PN-204',
    description: 'SMA Connector (Female)',
    category: 'Connector',
    appliesTo: 'E2CAB',
    uom: 'EA',
    qtyPerUnit: 4,
    suppliers: [
      { name: 'Alpha Electronics', unitCost: 1.20, leadTimeDays: 7,  moq: 1000 },
      { name: 'Gamma Supply',      unitCost: 1.10, leadTimeDays: 10, moq: 2000 },
      { name: 'Delta Parts',       unitCost: 1.15, leadTimeDays: 8,  moq: 1000 },
    ],
  },

  // ── FATP (E2CF) ────────────────────────────────────────────────────────────
  {
    id: 'PN-301',
    description: 'Aluminum Enclosure – Top Shell',
    category: 'Mechanical',
    appliesTo: 'E2CF',
    uom: 'EA',
    qtyPerUnit: 1,
    suppliers: [
      { name: 'Alpha Electronics', unitCost: 9.50, leadTimeDays: 21, moq: 50 },
      { name: 'Beta Components',   unitCost: 8.75, leadTimeDays: 28, moq: 100 },
      { name: 'Delta Parts',       unitCost: 9.00, leadTimeDays: 24, moq: 75 },
    ],
  },
  {
    id: 'PN-302',
    description: 'Aluminum Enclosure – Bottom Shell',
    category: 'Mechanical',
    appliesTo: 'E2CF',
    uom: 'EA',
    qtyPerUnit: 1,
    suppliers: [
      { name: 'Alpha Electronics', unitCost: 8.75, leadTimeDays: 21, moq: 50 },
      { name: 'Beta Components',   unitCost: 8.00, leadTimeDays: 28, moq: 100 },
      { name: 'Delta Parts',       unitCost: 8.50, leadTimeDays: 24, moq: 75 },
    ],
  },
  {
    id: 'PN-303',
    description: 'Internal Cable Harness',
    category: 'Cable',
    appliesTo: 'E2CF',
    uom: 'EA',
    qtyPerUnit: 1,
    suppliers: [
      { name: 'Alpha Electronics', unitCost: 6.75, leadTimeDays: 12, moq: 50 },
      { name: 'Gamma Supply',      unitCost: 6.50, leadTimeDays: 14, moq: 50 },
      { name: 'Delta Parts',       unitCost: 6.00, leadTimeDays: 21, moq: 100 },
    ],
  },
  {
    id: 'PN-304',
    description: 'Thermal Interface Pad',
    category: 'Thermal',
    appliesTo: 'E2CF',
    uom: 'EA',
    qtyPerUnit: 2,
    suppliers: [
      { name: 'Alpha Electronics', unitCost: 0.85, leadTimeDays: 7,  moq: 500 },
      { name: 'Beta Components',   unitCost: 0.75, leadTimeDays: 10, moq: 1000 },
      { name: 'Gamma Supply',      unitCost: 0.80, leadTimeDays: 8,  moq: 500 },
    ],
  },
  {
    id: 'PN-305',
    description: 'Retail Packaging Box',
    category: 'Packaging',
    appliesTo: 'E2CF',
    uom: 'EA',
    qtyPerUnit: 1,
    suppliers: [
      { name: 'Gamma Supply',      unitCost: 2.25, leadTimeDays: 10, moq: 200 },
      { name: 'Beta Components',   unitCost: 2.15, leadTimeDays: 12, moq: 300 },
      { name: 'Delta Parts',       unitCost: 2.00, leadTimeDays: 14, moq: 500 },
    ],
  },

  // ── Cisco 8000 Router – Top-Level Assembly (C8K) ──────────────────────────
  {
    id: 'C8K-901', kpn: 'C8K-901',
    description: 'Router Chassis – 1U Rack-Mount Steel/Aluminum',
    category: 'Mechanical', appliesTo: 'C8K', uom: 'EA', qtyPerUnit: 1,
    suppliers: [
      { name: 'Foxconn',   unitCost: 215.00, leadTimeDays: 28, moq: 10 },
      { name: 'Celestica', unitCost: 235.00, leadTimeDays: 21, moq:  5 },
      { name: 'Jabil',     unitCost: 198.00, leadTimeDays: 35, moq: 20 },
    ],
  },
  {
    id: 'C8K-902', kpn: 'C8K-902',
    description: 'System Board Sub-Assembly (C8K-SYB)',
    category: 'Assembly', appliesTo: 'C8K', uom: 'EA', qtyPerUnit: 1,
    suppliers: [
      { name: 'Celestica', unitCost: 2100.00, leadTimeDays: 45, moq: 5 },
      { name: 'Foxconn',   unitCost: 1980.00, leadTimeDays: 42, moq: 5 },
    ],
  },
  {
    id: 'C8K-903', kpn: 'C8K-903',
    description: 'AC/DC Power Supply Unit 3000W Redundant',
    category: 'Power', appliesTo: 'C8K', uom: 'EA', qtyPerUnit: 2,
    suppliers: [
      { name: 'Delta Electronics', unitCost: 520.00, leadTimeDays: 21, moq:  5 },
      { name: 'Acbel Polytech',    unitCost: 485.00, leadTimeDays: 28, moq: 10 },
      { name: 'Murata Power',      unitCost: 545.00, leadTimeDays: 18, moq:  5 },
    ],
  },
  {
    id: 'C8K-904', kpn: 'C8K-904',
    description: 'Fan Tray Module – N+1 Redundant',
    category: 'Thermal', appliesTo: 'C8K', uom: 'EA', qtyPerUnit: 2,
    suppliers: [
      { name: 'Delta Electronics', unitCost: 145.00, leadTimeDays: 14, moq: 10 },
      { name: 'Ebm-papst',         unitCost: 162.00, leadTimeDays: 21, moq:  5 },
      { name: 'Sanyo Denki',       unitCost: 155.00, leadTimeDays: 18, moq: 10 },
    ],
  },
  {
    id: 'C8K-905', kpn: 'C8K-905',
    description: 'QSFP-DD 400G Optics Module (SR8)',
    category: 'Optics', appliesTo: 'C8K', uom: 'EA', qtyPerUnit: 8,
    suppliers: [
      { name: 'Coherent (II-VI)', unitCost: 1150.00, leadTimeDays: 35, moq: 1 },
      { name: 'Lumentum',         unitCost: 1080.00, leadTimeDays: 42, moq: 1 },
      { name: 'Inphi',            unitCost: 1210.00, leadTimeDays: 28, moq: 1 },
    ],
  },
  {
    id: 'C8K-906', kpn: 'C8K-906',
    description: 'Front Panel Assembly (LCD, LEDs, USB 3.0)',
    category: 'Mechanical', appliesTo: 'C8K', uom: 'EA', qtyPerUnit: 1,
    suppliers: [
      { name: 'Foxconn',   unitCost: 62.00, leadTimeDays: 21, moq: 10 },
      { name: 'Pegatron',  unitCost: 57.50, leadTimeDays: 28, moq: 20 },
      { name: 'Celestica', unitCost: 65.00, leadTimeDays: 18, moq:  5 },
    ],
  },
  {
    id: 'C8K-907', kpn: 'C8K-907',
    description: 'Packaging Set (Master Carton, Foam Inserts, Documentation)',
    category: 'Packaging', appliesTo: 'C8K', uom: 'EA', qtyPerUnit: 1,
    suppliers: [
      { name: 'Smurfit Kappa', unitCost: 22.00, leadTimeDays: 10, moq:  50 },
      { name: 'WestRock',      unitCost: 20.50, leadTimeDays: 14, moq: 100 },
      { name: 'Multi-Color',   unitCost: 21.75, leadTimeDays: 12, moq:  75 },
    ],
  },

  // ── Cisco 8000 Router – System Board (C8K-SYB) ───────────────────────────
  {
    id: 'C8K-911', kpn: 'C8K-911',
    description: 'PCB – System Board 20-Layer HDI',
    category: 'PCB', appliesTo: 'C8K-SYB', uom: 'EA', qtyPerUnit: 1,
    suppliers: [
      { name: 'TTM Technologies',  unitCost: 480.00, leadTimeDays: 35, moq:  5 },
      { name: 'Sanmina',           unitCost: 455.00, leadTimeDays: 42, moq:  5 },
      { name: 'Tripod Technology', unitCost: 420.00, leadTimeDays: 45, moq: 10 },
    ],
  },
  {
    id: 'C8K-912', kpn: 'C8K-912',
    description: 'Cisco Silicon One G100 ASIC (TSMC N7)',
    category: 'ASIC', appliesTo: 'C8K-SYB', uom: 'EA', qtyPerUnit: 1,
    suppliers: [
      { name: 'TSMC (Direct)',     unitCost:  950.00, leadTimeDays: 120, moq: 1 },
      { name: 'Arrow Electronics', unitCost: 1050.00, leadTimeDays:  60, moq: 1 },
    ],
  },
  {
    id: 'C8K-913', kpn: 'C8K-913',
    description: 'Intel Xeon D-1736T Processor',
    category: 'CPU', appliesTo: 'C8K-SYB', uom: 'EA', qtyPerUnit: 1,
    suppliers: [
      { name: 'Intel (Direct)',    unitCost: 380.00, leadTimeDays: 14, moq:  1 },
      { name: 'Arrow Electronics', unitCost: 395.00, leadTimeDays:  7, moq:  1 },
      { name: 'Avnet',             unitCost: 390.00, leadTimeDays: 10, moq:  1 },
    ],
  },
  {
    id: 'C8K-914', kpn: 'C8K-914',
    description: 'DDR5 RDIMM 32GB 4800MHz ECC',
    category: 'Memory', appliesTo: 'C8K-SYB', uom: 'EA', qtyPerUnit: 4,
    suppliers: [
      { name: 'Samsung',  unitCost: 138.00, leadTimeDays: 10, moq: 10 },
      { name: 'Micron',   unitCost: 132.00, leadTimeDays: 14, moq: 10 },
      { name: 'SK Hynix', unitCost: 135.00, leadTimeDays: 12, moq: 10 },
    ],
  },
  {
    id: 'C8K-915', kpn: 'C8K-915',
    description: 'PMIC – Multi-Phase VRM (12V → 0.85V, 200A)',
    category: 'IC', appliesTo: 'C8K-SYB', uom: 'EA', qtyPerUnit: 3,
    suppliers: [
      { name: 'Texas Instruments', unitCost: 32.50, leadTimeDays: 16, moq:  50 },
      { name: 'Renesas',           unitCost: 35.00, leadTimeDays: 14, moq:  25 },
      { name: 'MPS Group',         unitCost: 30.75, leadTimeDays: 21, moq: 100 },
    ],
  },
  {
    id: 'C8K-916', kpn: 'C8K-916',
    description: 'QSFP-DD Cage + Backplane Connector Set',
    category: 'Connector', appliesTo: 'C8K-SYB', uom: 'EA', qtyPerUnit: 1,
    suppliers: [
      { name: 'Molex',           unitCost: 28.00, leadTimeDays: 14, moq: 50 },
      { name: 'TE Connectivity', unitCost: 30.50, leadTimeDays: 10, moq: 25 },
      { name: 'Amphenol',        unitCost: 26.75, leadTimeDays: 18, moq: 50 },
    ],
  },
  {
    id: 'C8K-917', kpn: 'C8K-917',
    description: 'Capacitors – Bulk Electrolytic + Decoupling (0805/0402)',
    category: 'Passive', appliesTo: 'C8K-SYB', uom: 'EA', qtyPerUnit: 350,
    suppliers: [
      { name: 'KEMET',  unitCost: 0.04, leadTimeDays: 10, moq:  5000 },
      { name: 'Murata', unitCost: 0.05, leadTimeDays:  8, moq: 10000 },
      { name: 'TDK',    unitCost: 0.04, leadTimeDays: 12, moq:  5000 },
    ],
  },
  {
    id: 'C8K-918', kpn: 'C8K-918',
    description: 'Resistors – SMD 0402 / 0201',
    category: 'Passive', appliesTo: 'C8K-SYB', uom: 'EA', qtyPerUnit: 620,
    suppliers: [
      { name: 'Yageo',     unitCost: 0.005, leadTimeDays:  7, moq: 20000 },
      { name: 'Vishay',    unitCost: 0.007, leadTimeDays: 10, moq: 10000 },
      { name: 'Panasonic', unitCost: 0.006, leadTimeDays: 14, moq: 10000 },
    ],
  },
  {
    id: 'C8K-919', kpn: 'C8K-919',
    description: 'Signal Integrity ICs – Retimer, Clock Buffer, Temp Sensor',
    category: 'IC', appliesTo: 'C8K-SYB', uom: 'EA', qtyPerUnit: 6,
    suppliers: [
      { name: 'Broadcom',          unitCost: 18.50, leadTimeDays: 14, moq:  50 },
      { name: 'Skyworks',          unitCost: 12.75, leadTimeDays: 18, moq: 100 },
      { name: 'Texas Instruments', unitCost:  9.50, leadTimeDays: 10, moq: 200 },
    ],
  },
]
