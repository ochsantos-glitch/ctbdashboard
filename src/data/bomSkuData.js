// ── bomSkuData.js ─────────────────────────────────────────────────────────────
// BOM format: Level (0-3), PN, REV, Description, Usage, MFR, MPN
// Parts with multiple suppliers generate extra rows (Level/PN/REV/Desc/Usage blank)
// PN scheme:
//   SKU00001  → L0 Finished Good
//   41-XXXXX  → L1 Top-Level Assembly
//   21-XXXXX  → L2 Sub-Assembly
//   30-XXXXX  → L2 Purchased / Mechanical Part
//   20-XXXXX  → L3 PCB
//   12-XXXXX  → L3 Electronic Component
// ─────────────────────────────────────────────────────────────────────────────

function genBOM() {
  const rows = []

  // addPart creates one primary row + one alt row per additional supplier
  function addPart(level, pn, rev, description, usage, suppliers) {
    rows.push({
      id:          `P${String(rows.length + 1).padStart(5, '0')}`,
      rowType:     'part',
      level,
      pn,
      rev,
      description,
      usage,
      mfr:         suppliers.length ? suppliers[0].mfr : '',
      mpn:         suppliers.length ? suppliers[0].mpn : '',
      _primaryPN:  pn,
    })
    for (let s = 1; s < suppliers.length; s++) {
      rows.push({
        id:         `A${String(rows.length + 1).padStart(5, '0')}`,
        rowType:    'alt',
        level:      null,
        pn:         null,
        rev:        null,
        description:null,
        usage:      null,
        mfr:        suppliers[s].mfr,
        mpn:        suppliers[s].mpn,
        _primaryPN: pn,
      })
    }
  }

  const pick = (arr, i) => arr[Math.abs(i) % arr.length]
  const znpn = (pfx, n)  => `${pfx}-${String(n).padStart(5, '0')}`
  const revs = ['00','01','02','03','01','02']
  const rev  = i => pick(revs, i)

  // ── Supplier pools ────────────────────────────────────────────────────────
  const CM = ['CM1','CM2','CM3']

  const MECH = ['SUPPLIER1','SUPPLIER2','SUPPLIER3','SUPPLIER4','SUPPLIER5',
                'SUPPLIER6','SUPPLIER7','SUPPLIER8','SUPPLIER9',
                'Precision Parts Inc','Global Mfg Co','Tech Supply Ltd',
                'Asia Manufacturing','Pacific Parts Co','EuroParts GmbH']

  const PASSIVE = [
    { n:'Yageo',                    a:'YAG' },
    { n:'Murata',                   a:'MUR' },
    { n:'TDK',                      a:'TDK' },
    { n:'Taiyo Yuden',              a:'TYU' },
    { n:'Panasonic',                a:'PAN' },
    { n:'ROHM',                     a:'ROH' },
    { n:'Samsung Electro-Mechanics',a:'SEM' },
    { n:'Vishay',                   a:'VIS' },
    { n:'KEMET',                    a:'KEM' },
    { n:'Würth Elektronik',         a:'WUR' },
  ]

  const IC = [
    { n:'Texas Instruments',  a:'TI'  },
    { n:'Analog Devices',     a:'ADI' },
    { n:'Microchip',          a:'MCP' },
    { n:'ON Semiconductor',   a:'ONS' },
    { n:'STMicroelectronics', a:'STM' },
    { n:'Infineon',           a:'INF' },
    { n:'NXP',                a:'NXP' },
    { n:'Renesas',            a:'RNS' },
    { n:'Maxim',              a:'MAX' },
    { n:'Monolithic Power',   a:'MPS' },
  ]

  const RF = [
    { n:'Qorvo',    a:'QRV' },
    { n:'Skyworks', a:'SKY' },
    { n:'Broadcom', a:'BCM' },
    { n:'Murata',   a:'MUR' },
    { n:'TDK',      a:'TDK' },
  ]

  const MEM = [
    { n:'Samsung Semiconductor', a:'SAM' },
    { n:'SK Hynix',              a:'SKH' },
    { n:'Micron',                a:'MCR' },
    { n:'Kioxia',                a:'KIO' },
  ]

  const CON = [
    { n:'Molex',           a:'MLX' },
    { n:'TE Connectivity', a:'TEC' },
    { n:'Amphenol',        a:'AMP' },
    { n:'Hirose',          a:'HIR' },
    { n:'JST',             a:'JST' },
  ]

  const PCB_M = [
    { n:'TTM Technologies',  a:'TTM' },
    { n:'Tripod Technology', a:'TRP' },
    { n:'Unimicron',         a:'UNI' },
    { n:'Ibiden',            a:'IBI' },
  ]

  const PKG_M = [
    { n:'DS Smith',         a:'DSS' },
    { n:'WestRock',         a:'WRK' },
    { n:'UFP Technologies', a:'UFP' },
    { n:'CCL Industries',   a:'CCL' },
    { n:'Avery Dennison',   a:'AVD' },
  ]

  // ── L0: SKU (1) ──────────────────────────────────────────────────────────
  addPart(0, 'SKU00001', '01', 'SKU BOM1 DEVICE', 1,
    [{ mfr: 'CM1', mpn: 'SKU00001' }])

  // ── L1: Top-Level Assemblies (5) — 41-XXXXX ──────────────────────────────
  const L1 = [
    { pn:'41-00001', d:'ASSY,TOP LEVEL,MAIN'      },
    { pn:'41-00002', d:'ASSY,TOP LEVEL,RF MODULE'  },
    { pn:'41-00003', d:'ASSY,TOP LEVEL,ANTENNA'    },
    { pn:'41-00004', d:'ASSY,TOP LEVEL,POWER'      },
    { pn:'41-00005', d:'ASSY,TOP LEVEL,PACKAGING'  },
  ]
  L1.forEach((x, i) =>
    addPart(1, x.pn, rev(i), x.d, 1, [{ mfr: pick(CM, i), mpn: x.pn }])
  )

  // ── L2: Sub-Assemblies (50) — 21-XXXXX ───────────────────────────────────
  const SA_DESCS = [
    'ASSY,MLB,01','ASSY,MLB,02','ASSY,MLB,03','ASSY,MLB,04','ASSY,MLB,05',
    'ASSY,RF,01', 'ASSY,RF,02', 'ASSY,RF,03', 'ASSY,RF,04', 'ASSY,RF,05',
    'ASSY,BB,01', 'ASSY,BB,02', 'ASSY,BB,03', 'ASSY,BB,04',
    'ASSY,PWR,01','ASSY,PWR,02','ASSY,PWR,03','ASSY,PWR,04',
    'ASSY,ANT,01','ASSY,ANT,02','ASSY,ANT,03','ASSY,ANT,04',
    'ASSY,AUDIO,01','ASSY,AUDIO,02','ASSY,AUDIO,03',
    'ASSY,CAM,01', 'ASSY,CAM,02', 'ASSY,CAM,03',
    'ASSY,DISP,01','ASSY,DISP,02','ASSY,DISP,03',
    'ASSY,MEM,01', 'ASSY,MEM,02', 'ASSY,MEM,03',
    'ASSY,CON,01', 'ASSY,CON,02', 'ASSY,CON,03',
    'ASSY,EMI,01', 'ASSY,EMI,02', 'ASSY,EMI,03',
    'ASSY,THERM,01','ASSY,THERM,02','ASSY,THERM,03',
    'ASSY,DEBUG,01','ASSY,DBG,02',
    'ASSY,CLK,01', 'ASSY,CLK,02',
    'ASSY,MISC,01','ASSY,MISC,02','ASSY,MISC,03',
  ]
  for (let i = 0; i < 50; i++) {
    const pn  = znpn('21', i + 1)
    const cnt = i % 3 === 0 ? 2 : i % 7 === 0 ? 3 : 1
    addPart(2, pn, rev(i), pick(SA_DESCS, i), 1,
      Array.from({ length: cnt }, (_, s) => ({ mfr: pick(CM, i + s), mpn: pn })))
  }

  // ── L2: Purchased / Mechanical Parts (150) — 30-XXXXX ────────────────────
  const PURCH_DESCS = [
    'HSG,TOP','HSG,BOTTOM','HSG,BLUE','HSG,BLACK','HSG,WHITE',
    'RADOME','RADOME,BLUE','RADOME,WHITE','RADOME,BLACK',
    'PSA','PSA,THERMAL','PSA,DOUBLE SIDED',
    'SCREW,M2X3','SCREW,M2X5','SCREW,M3X6','SCREW,M2.5X4','SCREW,M2X8',
    'THERMAL PAD,1MM','THERMAL PAD,2MM','THERMAL,PAD,0.5MM',
    'GPS,BLUE','GPS,BLACK','GPS,WHITE',
    'BRACKET,PCB','BRACKET,ANTENNA','BRACKET,RF','BRACKET,CAM',
    'GASKET,IP67','GASKET,EMI','GASKET,SIM',
    'CABLE,RF,100MM','CABLE,RF,200MM','CABLE,FFC,30P','CABLE,FFC,20P',
    'LABEL,SN','LABEL,REG','LABEL,FCC','LABEL,COO','LABEL,ENERGY',
    'FOAM,INSERT,TOP','FOAM,INSERT,BTM','FOAM,INSERT,SIDE',
    'BOX,RETAIL','BOX,INNER','BOX,SHIPPER',
    'WARRANTY,CARD','QSG,PRINTED','SAFETY,SHEET','COMP,DOC',
    'HEATSINK,AL','HEATSINK,CU','HEATSINK,EXTRUDE',
    'STANDOFF,M2X5','STANDOFF,M2X3','STANDOFF,M2.5X10',
    'NUT,M2','NUT,M2.5','NUT,M3,NYLON','WASHER,M2','WASHER,M3',
    'SPRING,CLIP','SNAP,CLIP','RETENTION,CLIP',
    'ORING,SIM','SEAL,IP68','SEAL,WATERPROOF',
    'DESICCANT,2G','ANTISTATIC,BAG','ESD,BAG','MBB,BARRIER',
    'SHRINK,WRAP','BUBBLE,WRAP','STRETCH,FILM','KRAFT,PAPER',
    'USB-C,CBL,1M','ADAPTER,USB,5V','SIM,EJECTOR','SCREEN,PROT',
    'SIM,TRAY','SD,HOLDER','CARD,HOLDER',
    'LENS,CAM,MAIN','LENS,CAM,WIDE','BEZEL,FRONT','BEZEL,REAR',
    'BUTTON,VOL,UP','BUTTON,VOL,DN','BUTTON,POWER','BUTTON,HOME',
    'SPEAKER,GRILLE','MIC,MESH','VIBRATOR,LRA','VIBRATOR,ERM',
    'BATTERY,4500MAH','BATTERY,5000MAH','BATT,CONNECTOR,4P',
    'DISPLAY,ASSY,6IN','TOUCH,PANEL,6IN','FPC,DISP,30P','FPC,CAM,20P',
    'HINGE,ASSY','PIVOT,PIN,2MM','FERRITE,CLAMP',
    'SHIELD,CAN,MLB','SHIELD,CAN,RF','SHIELD,CAN,PWR',
    'GRAPHITE,SHEET,0.1','TIM,PHASE,CHANGE','VAPOR,CHAMBER,40X40',
    'STIFFENER,FR4,0.5','SPACER,NYLON,3MM',
    'CLIP,GRND','STRAP,GRND,100MM',
    'TAPE,3M9080','TAPE,FOAM,1MM',
    'POGO,PIN,4P','POGO,PIN,8P',
    'CAM,MODULE,48MP','CAM,MODULE,12MP','CAM,MODULE,TOF',
    'LED,FLASH,MODULE','PROX,SENSOR,MODULE',
    'FINGERPRINT,MODULE','NFC,ANTENNA,MODULE',
    'COIL,WIRELESS,CHG','SPEAKER,8OHM,MODULE','RECEIVER,AUDIO,MODULE',
    'CARTON,SEAL,TAPE','PACKING,LIST,SLEEVE',
    'REEL,TAPE,8MM,7IN','JEDEC,TRAY,A','PCB,BAG,ESD,200X150',
    'HIC,HUMIDITY,CARD','TUBE,DIP14','SILICA,GEL,1G',
    'RETURN,LABEL','HAZMAT,LBL,CL9','RUBBER,FOOT,4P',
    'GROMMET,VIB,6MM','DOWEL,2MM,SS','RIVET,AL,3MM',
    'HEAT,SET,M2','PRESSNUT,M2,SS','COIN,CELL,HOLDER',
    'ALS,SENSOR,MODULE','BARO,SENSOR,MODULE','GYRO,MODULE,6AXIS',
    'LORA,MODULE','GNSS,MODULE','UWB,MODULE',
    'COAX,RG178,SMA,200','HARNESS,2P,JST,200','HARNESS,4P,300MM',
    'HDMI,SHORT,200MM','RJ45,MAGJACK,1G',
  ]
  for (let i = 0; i < 150; i++) {
    const pn  = znpn('30', i + 1)
    const cnt = i % 4 === 0 ? 3 : i % 2 === 0 ? 2 : 1
    const pool = i < 100 ? MECH : PKG_M
    addPart(2, pn, rev(i), pick(PURCH_DESCS, i),
      pick([1,1,1,2,3,4,6,8,10,14,25,100], i),
      Array.from({ length: cnt }, (_, s) => ({
        mfr: pick(pool, i + s * 3),
        mpn: pn,
      })))
  }

  // ── L3: PCBs (50) — 20-XXXXX ─────────────────────────────────────────────
  const PCB_DESCS = [
    'PCB,01','PCB,02','PCB,MLB,8L,1.0MM','PCB,ANT,4L,0.8MM',
    'PCB,FATP,6L','PCB,PWR,4L','PCB,DBG,2L','PCB,RF,6L',
    'PCB,BB,8L','PCB,CAM,4L','PCB,FLEX,01','PCB,FLEX,02',
    'PCB,RIGID,FLEX','PCB,MEM,4L','PCB,CON,2L','PCB,EMI,4L',
    'PCB,TEST,4L','PCB,CARRIER,FPGA','PCB,MINI,ANT','PCB,PWR,FILTER',
  ]
  for (let i = 0; i < 50; i++) {
    const pn = znpn('20', i + 1)
    const m1 = pick(PCB_M, i)
    const m2 = pick(PCB_M, i + 2)
    const cnt = i % 3 === 0 ? 2 : 1
    addPart(3, pn, rev(i), pick(PCB_DESCS, i), 1,
      cnt === 2
        ? [{ mfr: m1.n, mpn: `${m1.a}-E2-${String(i+1).padStart(3,'0')}-REVA` },
           { mfr: m2.n, mpn: `${m2.a}-E2-${String(i+1).padStart(3,'0')}-REVA` }]
        : [{ mfr: m1.n, mpn: `${m1.a}-E2-${String(i+1).padStart(3,'0')}-REVA` }])
  }

  // ── L3: Resistors (400) — 12-00001 to 12-00400 ───────────────────────────
  const R_VALS = [
    '4.7 ohms','10 ohms','22 ohms','47 ohms','100 ohms','150 ohms',
    '220 ohms','330 ohms','470 ohms','680 ohms','1K ohms','2.2K ohms',
    '4.7K ohms','10K ohms','22K ohms','47K ohms','100K ohms','220K ohms',
    '470K ohms','1M ohms','0 ohms','33 ohms','68 ohms','10M ohms',
  ]
  const R_PKG = ['0201','0402','0402','0603','0603','0805']
  const R_TOL = ['1%','1%','5%','0.1%','0.5%']
  for (let i = 0; i < 400; i++) {
    const pn  = znpn('12', i + 1)
    const val = pick(R_VALS, i)
    const pkg = pick(R_PKG, i + 3)
    const tol = pick(R_TOL, i + 7)
    const m1  = pick(PASSIVE, i)
    const m2  = pick(PASSIVE, i + 5)
    const cnt = i % 3 === 0 ? 2 : 1
    addPart(3, pn, rev(i), `Resistor ${val} ${tol} ${pkg}`,
      pick([1,1,2,2,4,4,6,8,14,25,100], i),
      cnt === 2
        ? [{ mfr: m1.n, mpn: `${m1.a}R${pkg}-${val.replace(/ /g,'').replace('.','p')}-${i+1}` },
           { mfr: m2.n, mpn: `${m2.a}R-${i+1}` }]
        : [{ mfr: m1.n, mpn: `${m1.a}R${pkg}-${val.replace(/ /g,'').replace('.','p')}-${i+1}` }])
  }

  // ── L3: Capacitors (400) — 12-00401 to 12-00800 ──────────────────────────
  const C_VALS = [
    '1 pF','2.2 pF','4.7 pF','10 pF','22 pF','47 pF','100 pF','220 pF',
    '1 nF','10 nF','100 nF','1 uF','2.2 uF','4.7 uF','10 uF','22 uF',
    '47 uF','100 uF','220 uF','470 uF','1000 uF','100 F',
  ]
  const C_TYPE = ['MLCC','MLCC','MLCC','Tantalum','Electrolytic']
  const C_PKG  = ['0201','0402','0402','0603','0603','0805','1206']
  for (let i = 0; i < 400; i++) {
    const pn   = znpn('12', i + 401)
    const val  = pick(C_VALS, i)
    const type = pick(C_TYPE, i + 2)
    const pkg  = type === 'Electrolytic' ? 'THT' : pick(C_PKG, i + 1)
    const m1   = pick(PASSIVE, i + 2)
    const m2   = pick(PASSIVE, i + 7)
    const cnt  = i % 4 === 0 ? 2 : 1
    addPart(3, pn, rev(i), `Capacitor ${val} ${type} ${pkg}`,
      pick([1,2,2,4,4,6,8,15,100], i),
      cnt === 2
        ? [{ mfr: m1.n, mpn: `${m1.a}C${pkg}-${val.replace(/ /g,'')}-${i+1}` },
           { mfr: m2.n, mpn: `${m2.a}C-${i+1}` }]
        : [{ mfr: m1.n, mpn: `${m1.a}C${pkg}-${val.replace(/ /g,'')}-${i+1}` }])
  }

  // ── L3: Inductors/Ferrites/Chokes (150) — 12-00801 to 12-00950 ───────────
  const L_VALS = [
    '1 nH','4.7 nH','10 nH','22 nH','47 nH','100 nH','220 nH','470 nH',
    '1 uH','2.2 uH','4.7 uH','10 uH','22 uH','47 uH','100 uH',
  ]
  const L_TYPE = ['IND','IND','FERRITE','CMC','PWR IND']
  for (let i = 0; i < 150; i++) {
    const pn  = znpn('12', i + 801)
    const val = pick(L_VALS, i)
    const typ = pick(L_TYPE, i + 1)
    const pkg = pick(['0402','0603','0805','1210'], i)
    const m1  = pick(PASSIVE, i + 3)
    addPart(3, pn, rev(i),
      `${typ},${val.replace(/ /g,',')},${pkg}`,
      pick([1,1,2,2,4], i),
      [{ mfr: m1.n, mpn: `${m1.a}L${pkg}-${val.replace(/ /g,'')}-${i+1}` }])
  }

  // ── L3: ICs / Memory (350) — 12-00951 to 12-01300 ────────────────────────
  const IC_DESCS = [
    'IC,USB,HUB,3.1','IC,I2C,GPIO,16B','IC,SPI,UART,BRIDGE','IC,USBC,PD,CTRL',
    'IC,PCIE,RETIMER','IC,AUDIO,CODEC','IC,MIPI,DSI,BRIDGE','IC,ETH,PHY,1G',
    'IC,CAN,FD,CTRL','IC,RTC,32KHZ','IC,MCU,CORTEXM4','IC,FPGA,ICE40UP5K',
    'IC,LVL,SHIFT,8CH','IC,EEPROM,1MBIT','IC,WDT,TIMER',
    'IC,PWR,SEQUENCER','IC,TEMP,SENSOR','IC,6AXIS,IMU','IC,GYRO,3AXIS',
    'IC,BARO,SENSOR','IC,ALS,SENSOR','IC,PROX,IR,SENSOR',
    'IC,BACKLIGHT,DRV','IC,HAPTIC,LRA,DRV','IC,NFC,CTRL',
    'IC,BT,5.3,CTRL','IC,WIFI,6E,PHY','IC,UWB,XCVR','IC,HALL,EFFECT',
    'IC,TOUCH,CTRL,CAP',
    'IC,OPAMP,RTR,SNGL','IC,COMP,HIGHSPEED','IC,INAMP','IC,VGA',
    'IC,ADC,12BIT,SNGL','IC,ADC,16BIT,DIFF','IC,DAC,12BIT','IC,DAC,16BIT',
    'IC,VREF,2.5V','IC,VREF,4.096V','IC,RS485,XCVR','IC,CAN,XCVR',
    'IC,LIN,XCVR','IC,DIFF,RX','IC,ISO,AMP',
    'IC,BUCK,CONV,3A','IC,BUCK,CONV,5A','IC,BOOST,CONV,2A',
    'IC,BUCK,BOOST,CONV','IC,LDO,150MA','IC,LDO,300MA','IC,LDO,500MA',
    'IC,LDO,1A','IC,LDO,2A','IC,PMIC,MULTIRAIL',
    'IC,BATT,CHG,LIION','IC,FUEL,GAUGE','IC,USB,PD,CTRL',
    'IC,WC,RX,IC','IC,PWR,MUX','IC,HOTSWAP,CTRL','IC,CURR,LIM',
    'IC,IDEAL,DIODE','IC,LDSW,2A','IC,LDSW,5A',
    'IC,HSD,DRV','IC,LSD,DRV','IC,LED,DRV,CC','IC,MTR,DRV,HBDG',
    'IC,RF,PA,BAND1','IC,RF,PA,BAND3','IC,RF,PA,BAND7','IC,RF,PA,B41',
    'IC,LNA,0.5DB,NF','IC,RF,SW,SP4T','IC,DUP,BAND1/3',
    'IC,SAW,FILT,850MHZ','IC,SAW,FILT,1.9GHZ','IC,BAW,FILT,1.7GHZ',
    'IC,WIFI,XCVR,6E','IC,GPS,FRONTEND','IC,BT,RF,5.3',
    'IC,PLL,2.4GHZ','IC,VCO,5GHZ',
    'IC,SOC,MODEM,5G','IC,BB,PROCESSOR','IC,APP,PROCESSOR',
    'IC,GNSS,RECEIVER','IC,SECURE,ELEMENT',
    'LPDDR4X,RAM,4GB','LPDDR4X,RAM,8GB','LPDDR5,RAM,12GB',
    'EMMC,FLASH,32GB','EMMC,FLASH,64GB','EMMC,FLASH,128GB',
    'UFS,3.1,NAND,256GB','UFS,3.1,NAND,512GB',
    'NOR,FLASH,64MBIT','NOR,FLASH,128MBIT','EEPROM,1MBIT,I2C',
    'NAND,FLASH,1GBIT','SRAM,4MBIT','SRAM,512KBIT',
  ]
  for (let i = 0; i < 350; i++) {
    const pn   = znpn('12', i + 951)
    const pool = i < 150 ? IC : i < 250 ? RF : MEM
    const m1   = pick(pool, i)
    const m2   = pick(pool, i + 4)
    const cnt  = i % 5 === 0 ? 2 : 1
    addPart(3, pn, rev(i), pick(IC_DESCS, i),
      pick([1,1,1,2], i),
      cnt === 2
        ? [{ mfr: m1.n, mpn: `${m1.a}${String(i*17+1001).padStart(6,'0')}` },
           { mfr: m2.n, mpn: `${m2.a}${String(i*13+2001).padStart(6,'0')}` }]
        : [{ mfr: m1.n, mpn: `${m1.a}${String(i*17+1001).padStart(6,'0')}` }])
  }

  // ── L3: Connectors (200) — 12-01301 to 12-01500 ──────────────────────────
  const CON_DESCS = [
    'CONN,B2B,0.5MM,20P','CONN,B2B,0.5MM,40P','CONN,B2B,0.8MM,30P',
    'CONN,FPC,1MM,30P','CONN,FPC,0.5MM,20P','CONN,FPC,0.5MM,30P',
    'CONN,USBC,24P,RECEPT','CONN,USBMICROB','CONN,SMA,FEMALE',
    'CONN,SMA,MALE','CONN,MMCX','CONN,UFL,IPEX','CONN,MHF4,ANT',
    'CONN,HDMI,TYPEA','CONN,DISPPORT','CONN,RJ45,MAGJACK,1G',
    'CONN,MICROSD,HOLDER','CONN,NANOSIM,HOLDER','CONN,M2,KEYE,2230',
    'CONN,PCIE,X4,EDGE','CONN,SATA,7PIN,DATA','CONN,DC,2.1MM,JACK',
    'CONN,BATT,JST,2P','CONN,DBG,10P,0.05IN','CONN,JTAG,20P',
    'CONN,TACT,SMD,6X6','CONN,SLIDE,SW','CONN,RESET,BTN,SMD',
    'CONN,DIP,SW,8POS','CONN,POGO,4P','CONN,CARD,EDGE,30P,GOLD',
    'CONN,BLIND,MATE,RF','CONN,HDR,2.54MM,2X5','CONN,FPC,1MM,20P',
  ]
  for (let i = 0; i < 200; i++) {
    const pn = znpn('12', i + 1301)
    const m1 = pick(CON, i)
    const m2 = pick(CON, i + 2)
    const cnt = i % 3 === 0 ? 2 : 1
    addPart(3, pn, rev(i), pick(CON_DESCS, i),
      pick([1,1,2,4], i),
      cnt === 2
        ? [{ mfr: m1.n, mpn: `${m1.a}${String(i*43+10001).padStart(7,'0')}` },
           { mfr: m2.n, mpn: `${m2.a}${String(i*47+10501).padStart(7,'0')}` }]
        : [{ mfr: m1.n, mpn: `${m1.a}${String(i*43+10001).padStart(7,'0')}` }])
  }

  // ── L3: Misc (244) — 12-01501 to 12-01744 ────────────────────────────────
  // Crystal/Osc × 30, Diode/ESD × 50, Thermal × 30, Cable × 50, Mech × 84
  const MISC_DESCS = [
    // Crystals & Oscillators
    'XTAL,26MHZ,SMD','XTAL,38.4MHZ,SMD','XTAL,32.768KHZ','XTAL,19.2MHZ',
    'TCXO,26MHZ,SMD','TCXO,38.4MHZ','OSC,48MHZ,SMD','OSC,24MHZ',
    'OSC,19.2MHZ','OSC,27MHZ','XTAL,13MHZ','XTAL,40MHZ',
    'TCXO,13MHZ','OSC,52MHZ','XTAL,24MHZ','OSC,40MHZ',
    'XTAL,48MHZ','TCXO,19.2MHZ','OSC,38.4MHZ','XTAL,27MHZ',
    'OSC,13MHZ','TCXO,48MHZ','XTAL,52MHZ','OSC,26MHZ',
    'TCXO,52MHZ','XTAL,50MHZ','OSC,50MHZ','TCXO,50MHZ',
    'XTAL,12MHZ','OSC,12MHZ',
    // Diodes / ESD
    'DIODE,ESD,TVS,3V3','DIODE,ESD,TVS,5V','DIODE,ESD,ARR,4CH',
    'DIODE,ESD,ARR,8CH','DIODE,TVS,15V','DIODE,TVS,24V',
    'DIODE,SCHOTTKY,DUAL,30V','DIODE,SCHOTTKY,1A,40V',
    'DIODE,ZENER,3.6V','DIODE,ZENER,5.1V','DIODE,ZENER,6.2V',
    'DIODE,RECT,1A,200V','DIODE,RECT,2A,400V',
    'LED,GREEN,0402','LED,RED,0402','LED,BLUE,0402','LED,WHITE,0402',
    'LED,AMBER,0402','LED,IR,0402','LED,RGB,0603',
    'VARISTOR,MOV,14MM','VARISTOR,MOV,7MM',
    'FUSE,PTC,500MA','FUSE,PTC,1A','FUSE,SMD,1A,125V','FUSE,SMD,2A,125V',
    'TP,SMD,1MM','TP,SMD,2MM','JUMPER,0R,0402','JUMPER,0R,0603',
    'DNP,PLACEHOLDER,0402','THERMAL,FUSE,120C','ESD,ARRAY,USB',
    'MOV,TRANSIENT,SUPP','ZENER,ARRAY,4CH','SCHOTTKY,ARRAY,4CH',
    'TVS,BIDIRECT,5V','TVS,BIDIRECT,12V',
    'THERM,NTCR,10K','THERM,PTCR,100R',
    'PHOTO,DIODE,850NM','PHOTO,TRANS,940NM','IR,EMITTER,940NM',
    // Thermal
    'THERMAL,PAD,1MM,100X100','THERMAL,PAD,2MM,50X50',
    'TIM,1.5W,MK','THERMAL,GREASE,8W','PHASE,CHG,TIM,40X40',
    'GRAPHITE,SHEET,0.1MM','THERMAL,TAPE,1.5W','PYR,GRAPHITE,SHEET',
    'VAPOR,CHAMBER,40X40','GAP,FILLER,3MM',
    'TIM,SYRINGE,1G','INDIUM,FOIL,0.1MM',
    'THERMAL,PAD,0.5MM,50X50','THERMAL,PAD,3MM,30X30',
    'PHASE,CHG,TIM,30X30','TIM,2.0W,MK','THERMAL,GREASE,3W',
    'GRAPHITE,SHEET,0.2MM','TIM,PASTE,1G','TIM,SYRINGE,3G',
    'GAP,FILLER,1MM','GAP,FILLER,2MM',
    'PHASE,CHG,TIM,20X20','TIM,0.5W,MK',
    'THERMAL,PAD,1.5MM','TIM,4.0W,MK','THERMAL,TAPE,3W',
    'GRAPHITE,SHEET,0.05MM','VAPOR,CHAMBER,20X20','HEAT,PIPE,3MM',
    // Cables
    'CBL,COAX,RG178,UFL,100MM','CBL,COAX,RG178,SMA,200MM',
    'CBL,COAX,RG316,MMCX,150MM','CBL,COAX,IPEX,SMA,50MM',
    'CBL,FFC,30P,1MM,150MM','CBL,FFC,20P,0.5MM,100MM',
    'CBL,HARNESS,2P,JST,200MM','CBL,HARNESS,4P,300MM',
    'CBL,USBC,TYPEA,500MM','CBL,HDMI,SHORT,200MM',
    'CBL,PWR,18AWG,300MM','CBL,GRND,BRAID,100MM',
    'CBL,RIBBON,10C,100MM','CBL,TIE,100MM,NYLON',
    'CBL,HOOKLOOP,20MM','CBL,SPIRAL,WRAP,6MM',
    'CBL,BRAIDED,SLEEVE,8MM','CBL,HEATSHRINK,2:1,3MM',
    'CBL,HEATSHRINK,2:1,6MM','CBL,LOOM,SLEEVE,10MM',
    'CBL,COAX,IPEX,100MM','CBL,FFC,40P,1MM,200MM',
    'CBL,HARNESS,6P,400MM','CBL,RIBBON,20C,150MM',
    'CBL,COAX,RG178,MMCX,80MM','CBL,HEATSHRINK,3:1,6MM',
    'CBL,SPIRAL,WRAP,10MM','CBL,BRAIDED,SLEEVE,12MM',
    'CBL,COAX,IPEX,200MM','CBL,FFC,50P,0.5MM,150MM',
    'CBL,HARNESS,8P,500MM','CBL,RIBBON,30C,200MM',
    'CBL,COAX,RG316,SMA,300MM','CBL,COAX,IPEX,300MM',
    'CBL,TIE,200MM,NYLON','CBL,TIE,300MM,NYLON',
    'CBL,HOOKLOOP,30MM','CBL,LOOM,SLEEVE,6MM',
    'CBL,COAX,RG178,SMA,100MM','CBL,FFC,30P,0.5MM,80MM',
    'CBL,HARNESS,2P,JST,100MM','CBL,HARNESS,4P,150MM',
    'CBL,RIBBON,10C,200MM','CBL,HEATSHRINK,2:1,4MM',
    'CBL,COAX,RG316,UFL,100MM','CBL,FFC,20P,1MM,100MM',
    // Mechanical misc
    'MCH,HEATSINK,AL,EXTD','MCH,SPREADER,CU,40X40',
    'MCH,SHIELD,CAN,MLB','MCH,SHIELD,CAN,RF','MCH,SHIELD,CAN,PWR',
    'MCH,BRACKET,PCB,L','MCH,BRACKET,ANT','MCH,STIFFENER,FR4',
    'MCH,SPACER,NYLON,3MM','MCH,CLIP,GRND,SMT',
    'MCH,STRAP,GRND,100','MCH,HEATSINK,STAMP,AL',
    'MCH,SPREADER,GRAPHITE','MCH,SPREADER,AL',
    'MCH,SHIELD,CAN,AUDIO','MCH,SHIELD,CAN,MEM',
    'MCH,BRACKET,BATT','MCH,BRACKET,CAM',
    'MCH,SPACER,NYLON,5MM','MCH,CLIP,SPRING',
    'MCH,CLIP,RETENTION','MCH,SNAP,CLIP,4MM',
    'MCH,ANCHOR,NUT,M2','MCH,STANDOFF,HEX,M2',
    'MCH,PLATE,DISPLAY','MCH,PLATE,BATT',
    'MCH,HINGE,TORQUE','MCH,PIVOT,BRACKET',
    'MCH,BUMPER,CORNER','MCH,BUMPER,EDGE',
    'MCH,GASKET,CAM','MCH,GASKET,SPEAKER',
    'MCH,DUST,MESH,MIC','MCH,DUST,MESH,SPK',
    'MCH,LENS,CAMERA','MCH,BEZEL,CAM',
    'MCH,COVER,PORTS','MCH,CAP,USB',
    'MCH,GRILLE,FRONT','MCH,GRILLE,REAR',
    'MCH,GUIDE,CABLE','MCH,CLAMP,CABLE',
    'MCH,ANCHOR,DISPLAY','MCH,FRAME,INNER',
    'MCH,COVER,PCB','MCH,DOOR,SIM',
    'MCH,INSERT,BRASS,M2','MCH,RIVET,SS,3MM',
    'MCH,PIN,HINGE,2MM','MCH,DOWEL,SS,1.5MM',
    'MCH,WASHER,SPLIT,M2','MCH,NUT,NYLON,M2',
    'MCH,SCREW,TORX,M1.6','MCH,SCREW,PH,M1.2',
  ]
  for (let i = 0; i < 244; i++) {
    const pn   = znpn('12', i + 1501)
    const pool = i < 30 ? PASSIVE : i < 80 ? PASSIVE : i < 110 ? PASSIVE : i < 160 ? CON : IC
    const m1   = pick(pool, i)
    addPart(3, pn, rev(i), pick(MISC_DESCS, i),
      pick([1,1,2,4], i),
      [{ mfr: m1.n, mpn: `${m1.a}M${String(i+1).padStart(4,'0')}` }])
  }

  return rows
}

export const bomSkuData = genBOM()

// Unique-part rows only (for stats)
export const bomPartsOnly  = bomSkuData.filter(r => r.rowType === 'part')

export const BOM_LEVELS    = [0, 1, 2, 3]
export const BOM_CATEGORIES = []   // not used in this format
export const BOM_REGIONS   = []    // not used in this format
