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
  const rows = list.map((investment) => {
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

  // dQty / dCost: perubahan jumlah dan modal akibat baris ini (negatif untuk
  // JUAL). Dipakai untuk menyusun riwayat nilai harian.
  const { deltas } = runLedger(rows)

  for (const row of rows) {
    const d = deltas.get(row)

    row.dQty = d.dQty
    row.dCost = d.dCost
  }

  return rows
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

      value += (a.row.dQty ?? a.row.qty) * a.pts[a.idx][1]
      cost += a.row.dCost ?? a.row.cost
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

// ---------- Ekspor CSV ----------

// Satu sel CSV. Untuk teks yang diketik pengguna (guard = true), awalan
// = + - @ diberi tanda ' di depannya supaya tidak dijalankan sebagai rumus
// oleh Excel/Google Sheets. Angka (termasuk yang negatif) tidak diubah.
const csvCell = (value, guard = false) => {
  let text = value === null || value === undefined ? '' : String(value)

  if (guard && /^[=+\-@\t\r]/.test(text)) text = "'" + text

  return /[",\n\r]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text
}

const csvText = (value) => csvCell(value, true)

// Angka polos (tanpa pemisah ribuan, titik sebagai desimal), tanpa notasi 1e-7.
const csvNum = (n, digits) => {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return ''

  const text = Number(n).toFixed(digits)

  return text.includes('.') ? text.replace(/\.?0+$/, '') : text
}

// rows: hasil buildRows(). Mengembalikan teks CSV (tanpa BOM).
export function toCsv(rows) {
  const header = [
    'tanggal_dibuat',
    'jenis',
    'aset',
    'kategori',
    'mata_uang',
    'jumlah',
    'satuan',
    'modal',
    'modal_idr',
    'harga',
    'mata_uang_harga',
    'sumber_harga',
    'nilai_idr',
    'pnl_idr',
    'pnl_persen',
  ]

  const lines = rows.map((row) => {
    // Tanggal memakai zona waktu perangkat (bukan UTC), supaya input dini hari
    // WIB tidak tercatat sebagai hari sebelumnya.
    const createdDate = row.createdAt ? new Date(row.createdAt) : null
    const sell = row.type === 'SELL'
    const created =
      createdDate && !Number.isNaN(createdDate.getTime())
        ? createdDate.toLocaleDateString('sv-SE')
        : ''

    return [
      csvCell(created),
      csvCell(sell ? 'JUAL' : 'BELI'),
      csvText(symKey(row.symbol)),
      csvText(row.category),
      csvText(row.currency),
      csvCell(csvNum(row.lots, 8)),
      csvText(unitOf(row.category)),
      csvCell(csvNum(row.amount, 2)),
      csvCell(csvNum(row.cost, 2)),
      // Baris JUAL tidak punya harga/nilai/PnL berjalan.
      csvCell(!sell && row.price ? csvNum(row.price.price, 8) : ''),
      csvText(!sell && row.price ? row.price.currency : ''),
      csvText(
        !sell && row.price ? (row.price.manual ? 'manual' : 'otomatis') : ''
      ),
      csvCell(sell ? '' : csvNum(row.market, 2)),
      csvCell(sell ? '' : csvNum(row.pnl, 2)),
      csvCell(sell ? '' : csvNum(row.pnlPct, 2)),
    ].join(',')
  })

  return [header.join(','), ...lines].join('\r\n') + '\r\n'
}

// ---------- Impor CSV ----------

// Membaca teks CSV menjadi baris-baris sel. Mendukung tanda kutip, "" di dalam
// kutip, baris baru di dalam kutip, pemisah koma atau titik koma, dan BOM.
export function parseCsv(input) {
  const text = String(input || '').replace(/^﻿/, '')
  const firstLine = text.split(/\r?\n/)[0] || ''
  const delimiter =
    (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length
      ? ';'
      : ','
  const rows = []
  let row = []
  let cell = ''
  let quoted = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]

    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"'
        i++
      } else if (ch === '"') quoted = false
      else cell += ch
    } else if (ch === '"') quoted = true
    else if (ch === delimiter) {
      row.push(cell)
      cell = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += ch
  }

  if (cell !== '' || row.length) {
    row.push(cell)
    rows.push(row)
  }

  return rows.filter((r) => r.some((c) => c.trim() !== ''))
}

const IMPORT_REQUIRED = ['aset', 'kategori', 'mata_uang', 'jumlah', 'modal']
export const IMPORT_MAX_ROWS = 500

// Angka dari CSV: titik sebagai desimal (format hasil ekspor). Koma dipakai
// sebagai desimal hanya kalau tidak ada titik (misalnya "12,5").
const toNumber = (value) => {
  const text = String(value || '').trim()

  if (!text) return NaN

  return Number(text.includes('.') ? text : text.replace(',', '.'))
}

// Menyusun rencana impor dari teks CSV.
//   categories : daftar nama kategori yang ada di aplikasi
//   existing   : investasi yang sudah ada (untuk mendeteksi duplikat)
// Hasil: { items:[{line, status:'ok'|'duplicate'|'error', data, reason}], fatal }
export function planImport(text, { categories = [], existing = [] } = {}) {
  const table = parseCsv(text)

  if (table.length < 2) {
    return { items: [], fatal: 'File kosong atau tidak punya baris data.' }
  }

  const header = table[0].map((h) => h.trim().toLowerCase())
  const missing = IMPORT_REQUIRED.filter((name) => !header.includes(name))

  if (missing.length) {
    return {
      items: [],
      fatal: `Kolom wajib tidak ditemukan: ${missing.join(', ')}. Pakai file hasil Ekspor CSV.`,
    }
  }

  if (table.length - 1 > IMPORT_MAX_ROWS) {
    return {
      items: [],
      fatal: `Maksimal ${IMPORT_MAX_ROWS} baris per impor (file ini ${table.length - 1}).`,
    }
  }

  const col = (cells, name) => (cells[header.indexOf(name)] || '').trim()
  // Hapus tanda ' pelindung rumus yang ditambahkan saat ekspor.
  const clean = (v) => v.replace(/^'(?=[=+\-@\t\r])/, '')
  const keyOf = (d) =>
    [
      d.type || 'BUY',
      symKey(d.symbol),
      norm(d.category),
      d.currency,
      Number(d.lots),
      Number(d.amount),
    ].join('|')
  const seen = new Set(
    existing.map((inv) =>
      keyOf({
        type: inv.type === 'SELL' ? 'SELL' : 'BUY',
        symbol: inv.symbol,
        category: inv.category,
        currency: inv.currency,
        lots: inv.lots,
        amount: inv.amount,
      })
    )
  )

  const items = table.slice(1).map((cells, index) => {
    const line = index + 2
    const symbol = symKey(clean(col(cells, 'aset')))
    const catInput = clean(col(cells, 'kategori'))
    const category = categories.find((c) => norm(c) === norm(catInput))
    const currency = col(cells, 'mata_uang').toUpperCase()
    const jenis = col(cells, 'jenis').toUpperCase()
    const lots = toNumber(col(cells, 'jumlah'))
    const amount = toNumber(col(cells, 'modal'))
    const fail = (reason) => ({ line, status: 'error', reason, data: null })

    if (!/^[A-Za-z0-9.\-=^]{1,30}$/.test(symbol))
      return fail('Nama aset tidak valid')
    if (!category) return fail(`Kategori "${catInput}" belum ada di aplikasi`)
    if (jenis && !['BELI', 'JUAL', 'BUY', 'SELL'].includes(jenis))
      return fail('Jenis harus BELI atau JUAL')
    if (currency !== 'IDR' && currency !== 'USD')
      return fail('Mata uang harus IDR atau USD')
    if (!Number.isFinite(lots) || lots <= 0)
      return fail('Jumlah harus angka lebih dari 0')
    if (!Number.isFinite(amount) || amount <= 0)
      return fail('Modal harus angka lebih dari 0')

    const type = jenis === 'JUAL' || jenis === 'SELL' ? 'SELL' : 'BUY'
    const data = {
      type,
      symbol,
      category,
      currency,
      lots: String(lots),
      amount: String(amount),
    }
    const key = keyOf(data)

    if (seen.has(key))
      return { line, status: 'duplicate', reason: 'Sudah ada', data }

    seen.add(key)

    return { line, status: 'ok', reason: '', data }
  })

  return { items, fatal: '' }
}

// ---------- Kepemilikan aktif (Active Holdings) ----------

// Buku besar per aset (simbol + kategori), diproses berurutan menurut tanggal.
// BELI menambah jumlah dan modal. JUAL mengurangi jumlah, dan modal berkurang
// proporsional (metode biaya rata-rata). Hasil jual dikurangi modal yang
// keluar menjadi keuntungan terealisasi.
function runLedger(rows) {
  const map = new Map()
  const deltas = new Map()
  const ordered = [...rows].sort(
    (a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0)
  )

  for (const row of ordered) {
    const key = `${symKey(row.symbol)}|${norm(row.category)}`
    let h = map.get(key)

    if (!h) {
      h = {
        key,
        symbol: symKey(row.symbol),
        category: row.category,
        lots: 0,
        qty: 0,
        cost: 0,
        price: row.price,
        ids: [],
        realized: 0,
        sold: 0,
      }
      map.set(key, h)
    }

    h.ids.push(row.id)

    if (row.type === 'SELL') {
      const ratio = h.lots > 0 ? Math.min(1, Number(row.lots) / h.lots) : 1
      const removedCost = h.cost * ratio
      const removedQty = h.qty * ratio

      h.realized += row.cost - removedCost
      h.sold += 1
      h.cost -= removedCost
      h.qty -= removedQty
      h.lots -= Number(row.lots)
      deltas.set(row, { dQty: -removedQty, dCost: -removedCost })
    } else {
      h.lots += Number(row.lots || 0)
      h.qty += row.qty
      h.cost += row.cost
      deltas.set(row, { dQty: row.qty, dCost: row.cost })
    }
  }

  return { map, deltas }
}

// rows = hasil buildRows(). Hanya aset yang masih dipegang (jumlah > 0).
export function buildHoldings(rows, rate) {
  return [...runLedger(rows).map.values()]
    .filter((h) => h.lots > 1e-9)
    .map((h) => {
      const market = h.price
        ? h.qty * h.price.price * (h.price.currency === 'USD' ? rate : 1)
        : null
      const pnl = market === null ? null : market - h.cost

      return {
        ...h,
        market,
        pnl,
        pnlPct: pnl !== null && h.cost > 0 ? (pnl / h.cost) * 100 : null,
        value: market ?? h.cost,
      }
    })
    .sort((a, b) => b.value - a.value)
}

// Keuntungan terealisasi dari semua penjualan (termasuk aset yang sudah habis
// terjual). { total, count, items:[{symbol, category, realized}] }
export function buildRealized(rows) {
  const items = [...runLedger(rows).map.values()]
    .filter((h) => h.sold > 0)
    .map((h) => ({
      symbol: h.symbol,
      category: h.category,
      realized: h.realized,
    }))

  return {
    total: items.reduce((sum, item) => sum + item.realized, 0),
    count: rows.filter((row) => row.type === 'SELL').length,
    items,
  }
}

// ---------- Riwayat transaksi ----------

export const txType = (row) => (row.type === 'SELL' ? 'SELL' : 'BUY')

// Tanggal lokal (YYYY-MM-DD) dari waktu simpan.
export const localDay = (value) => {
  const d = new Date(value)

  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('sv-SE')
}

// Harga satuan per satuan harga (saham, lembar, gram, coin), dalam mata uang
// transaksi. 1 lot saham ID = 100 saham.
export function unitPrice(row) {
  const qty = Number(row.lots || 0) * (cfgOf(row.category)?.multiplier || 1)

  return qty > 0 ? Number(row.amount || 0) / qty : null
}

// Filter: from/to = 'YYYY-MM-DD' (boleh kosong, inklusif), query = bagian
// nama aset, type = '' | 'BUY' | 'SELL'. Hasil diurutkan dari yang terbaru.
export function filterTransactions(
  list,
  { from = '', to = '', query = '', type = '' } = {}
) {
  const q = symKey(query)

  return list
    .filter((row) => {
      const day = localDay(row.createdAt)

      if (from && (!day || day < from)) return false
      if (to && (!day || day > to)) return false
      if (q && !symKey(row.symbol).includes(q)) return false
      if (type && txType(row) !== type) return false

      return true
    })
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
}
