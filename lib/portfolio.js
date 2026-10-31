// Helper bersama untuk halaman dashboard dan halaman PnL.
// Isinya fungsi murni (tanpa React), jadi aman dipakai di mana saja.

// ---------- Format ----------

export const rp = (n) =>
  'Rp ' + Math.round(Number(n || 0)).toLocaleString('id-ID')

export const lotFmt = (n) =>
  Number(n || 0).toLocaleString('id-ID', { maximumFractionDigits: 8 })

export const money = (n, currency) =>
  currency === 'USD'
    ? 'US$ ' +
      Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })
    : rp(n)

export const priceFmt = (price, currency) =>
  currency === 'USD'
    ? 'US$ ' +
      Number(price || 0).toLocaleString('en-US', {
        maximumFractionDigits: price < 1 ? 6 : 2,
      })
    : 'Rp ' +
      Number(price || 0).toLocaleString('id-ID', {
        maximumFractionDigits: price < 100 ? 2 : 0,
      })

export const sign = (n) => (n > 0 ? '+' : n < 0 ? '−' : '')

export const signed = (n) => {
  const r = Math.round(n)
  return sign(r) + rp(Math.abs(r))
}

export const pctFmt = (n) => {
  const r = Number(n.toFixed(2))
  return sign(r) + Math.abs(r).toFixed(2) + '%'
}

// Nama class warna: pos (hijau), neg (merah), muted (nol).
export const tone = (n) => {
  const r = Math.round(n)
  return r > 0 ? 'pos' : r < 0 ? 'neg' : 'muted'
}

// ---------- Konfigurasi kategori ----------

// `category` harus sama dengan nama kategori di aplikasi (huruf besar/kecil
// tidak berpengaruh). Ubah/tambah sesuai kebutuhan.
//   unit          : satuan jumlah yang Anda input
//   source        : sumber harga otomatis (idx | us | gold | crypto)
//   multiplier    : pengali jumlah ke satuan harga (1 lot saham ID = 100 saham)
//   priceUnit     : satuan harga yang ditampilkan
//   priceCurrency : mata uang harga manual kalau belum ada harga otomatis
export const HOLDINGS = [
  {
    label: 'Saham ID',
    category: 'ID Stocks',
    unit: 'lot',
    source: 'idx',
    multiplier: 100,
    priceUnit: 'saham',
    priceCurrency: 'IDR',
  },
  {
    label: 'US ETF',
    category: 'US ETF',
    unit: 'lembar',
    source: 'us',
    multiplier: 1,
    priceUnit: 'lembar',
    priceCurrency: 'USD',
  },
  {
    label: 'Emas',
    category: 'GOLD',
    unit: 'gram',
    source: 'gold',
    multiplier: 1,
    priceUnit: 'gram',
    priceCurrency: 'IDR',
  },
  {
    label: 'Crypto',
    category: 'CRYPTO',
    unit: 'coin',
    source: 'crypto',
    multiplier: 1,
    priceUnit: 'coin',
    priceCurrency: 'USD',
  },
]

export const norm = (s) =>
  String(s || '')
    .trim()
    .toLowerCase()

export const cfgOf = (category) =>
  HOLDINGS.find((h) => norm(h.category) === norm(category))

export const unitOf = (category) => cfgOf(category)?.unit || ''

export const symKey = (symbol) =>
  String(symbol || '')
    .trim()
    .toUpperCase()

// Aset yang punya sumber harga otomatis: [{ source, symbol }], unik dan terurut.
export function priceItems(list) {
  const seen = new Map()

  for (const investment of list) {
    const cfg = cfgOf(investment.category)

    if (!cfg) continue

    const symbol = symKey(investment.symbol)
    seen.set(`${cfg.source}:${symbol}`, { source: cfg.source, symbol })
  }

  return [...seen.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([, item]) => item)
}

// ---------- Baris investasi + PnL saat ini ----------

// Harga per satuan: manual (kalau diisi) lebih diutamakan dari harga otomatis.
export function priceOf(investment, { prices, manual, rate }) {
  const key = symKey(investment.symbol)
  const cfg = cfgOf(investment.category)
  const custom = manual?.[key]

  if (custom && Number(custom.price) > 0) {
    return {
      price: Number(custom.price),
      currency: custom.currency || cfg?.priceCurrency || 'IDR',
      manual: true,
    }
  }

  const fetched = prices?.[key]

  if (!fetched) return null

  // Emas dari server dalam USD per gram -> tampilkan dalam rupiah.
  if (cfg?.source === 'gold' && fetched.currency === 'USD') {
    return { price: fetched.price * rate, currency: 'IDR' }
  }

  return fetched
}

// cost   = modal (dalam rupiah)
// qty    = jumlah dalam satuan harga (lot x multiplier)
// market = nilai sekarang (qty x harga), null kalau harga belum ada
// value  = nilai yang dipakai chart dan porsi (nilai sekarang, atau modal)
export function buildRows({ list, rate, prices, manual }) {
  return list.map((investment) => {
    const cfg = cfgOf(investment.category)
    const cost =
      Number(investment.amount || 0) *
      (investment.currency === 'USD' ? rate : 1)
    const price = priceOf(investment, { prices, manual, rate })
    const qty = Number(investment.lots || 0) * (cfg?.multiplier || 1)
    const market = price
      ? qty * price.price * (price.currency === 'USD' ? rate : 1)
      : null
    const pnl = market === null ? null : market - cost
    const pnlPct = pnl !== null && cost > 0 ? (pnl / cost) * 100 : null

    return {
      ...investment,
      cost,
      qty,
      price,
      market,
      pnl,
      pnlPct,
      value: market ?? cost,
    }
  })
}

// ---------- Riwayat PnL ----------

export const DAY_MS = 86400000

const dayOf = (ms) => Math.floor(ms / DAY_MS)

// Menyusun nilai, modal, dan PnL per hari.
//
// Asumsi: tiap baris investasi dimiliki sejak tanggal dibuat (createdAt) dengan
// jumlah dan modal seperti sekarang, dan dinilai memakai harga penutupan harian
// (hari tanpa harga, misalnya akhir pekan untuk saham, memakai harga terakhir).
// Kurs USD/IDR memakai kurs hari ini supaya PnL murni dari pergerakan harga.
//
// series: { SIMBOL: { currency, points: [[ms, harga], ...] } }
export function buildHistory({ rows, series, rate, startMs, endMs }) {
  const assets = []
  const missing = []

  for (const row of rows) {
    const s = series?.[symKey(row.symbol)]

    if (!s || !Array.isArray(s.points) || !s.points.length) {
      missing.push(row)
      continue
    }

    const factor = s.currency === 'USD' ? rate : 1

    assets.push({
      row,
      pts: s.points.map(([t, p]) => [dayOf(t), p * factor]),
      created: row.createdAt
        ? dayOf(new Date(row.createdAt).getTime())
        : -Infinity,
      idx: 0,
    })
  }

  if (!assets.length) return { points: [], missing }

  const endDay = dayOf(endMs)
  const earliest = Math.min(...assets.map((a) => a.created))
  const startDay = Math.max(dayOf(startMs), earliest)
  const points = []

  for (let d = startDay; d <= endDay; d++) {
    let value = 0
    let cost = 0

    for (const a of assets) {
      if (a.created > d) continue

      while (a.idx + 1 < a.pts.length && a.pts[a.idx + 1][0] <= d) a.idx++

      // Belum ada harga pada hari ini: aset dilewati (modal juga tidak dihitung).
      if (a.pts[a.idx][0] > d) continue

      value += a.row.qty * a.pts[a.idx][1]
      cost += a.row.cost
    }

    if (cost > 0) {
      const pnl = value - cost

      points.push({ t: d * DAY_MS, value, cost, pnl, pct: (pnl / cost) * 100 })
    }
  }

  return { points, missing }
}

// Perubahan PnL per minggu (mode "week", mulai Senin) atau per bulan ("month").
export function periodChanges(points, mode) {
  if (!points.length) return []

  const keyOf = (t) => {
    if (mode === 'week') return Math.floor((dayOf(t) + 3) / 7)

    const date = new Date(t)
    return date.getUTCFullYear() * 12 + date.getUTCMonth()
  }

  const startOf = (key) =>
    mode === 'week'
      ? (key * 7 - 3) * DAY_MS
      : Date.UTC(Math.floor(key / 12), key % 12, 1)

  const buckets = []

  for (const p of points) {
    const key = keyOf(p.t)
    const last = buckets[buckets.length - 1]

    if (last && last.key === key) last.end = p.pnl
    else buckets.push({ key, end: p.pnl })
  }

  let prev = points[0].pnl

  return buckets.map((b) => {
    const change = b.end - prev
    prev = b.end

    return { key: b.key, t: startOf(b.key), change, end: b.end }
  })
}

// Selisih PnL antara hari terakhir dan `days` hari sebelumnya.
// null kalau riwayatnya belum cukup panjang.
export function pnlChange(points, days) {
  if (points.length < 2) return null

  const last = points[points.length - 1]
  const target = last.t - days * DAY_MS

  if (points[0].t > target) return null

  let base = points[0]

  for (const p of points) {
    if (p.t <= target) base = p
    else break
  }

  return last.pnl - base.pnl
}
