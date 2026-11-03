'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import {
  rp,
  lotFmt,
  money,
  HOLDINGS,
  norm,
  cfgOf,
  unitOf,
  symKey,
  planImport,
  buildHoldings,
  buildRealized,
  priceFmt,
  signed,
  pctFmt,
  tone,
  buildRows,
  toCsv,
} from '../../lib/portfolio'

const COLORS = [
  '#0c6b61',
  '#d97706',
  '#4338ca',
  '#be123c',
  '#65a30d',
  '#0891b2',
  '#a21caf',
  '#475569',
]

const group = (list, key, field = 'value') =>
  Object.entries(
    list.reduce((acc, item) => {
      // Nama aset digabung tanpa memandang huruf besar/kecil (mpmx = MPMX).
      const name = key === 'symbol' ? symKey(item[key]) : item[key]
      acc[name] = (acc[name] || 0) + Number(item[field] || 0)
      return acc
    }, {})
  ).map(([name, value]) => ({ name, value }))

const send = (url, method, body) =>
  fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })

function Chart({ title, data }) {
  return (
    <section className="card">
      <h3>{title}</h3>

      {data.length ? (
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius={55}
              outerRadius={100}
              paddingAngle={2}
              label={({ percent }) => `${(percent * 100).toFixed(1)}%`}
            >
              {data.map((item, index) => (
                <Cell key={item.name} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>

            <Tooltip formatter={rp} />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      ) : (
        <p className="muted empty">
          Belum ada data. Tambahkan investasi pertama Anda.
        </p>
      )}
    </section>
  )
}

function ConfirmDialog({ dialog, onClose }) {
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!dialog) return

    const onKey = (e) => {
      if (e.key === 'Escape' && !busy) onClose()
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dialog, busy, onClose])

  if (!dialog) return null

  async function run() {
    setBusy(true)

    try {
      await dialog.onConfirm()
    } finally {
      setBusy(false)
      onClose()
    }
  }

  return (
    <div className="modal-backdrop" onClick={() => !busy && onClose()}>
      <div
        className="modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-desc"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="confirm-title">{dialog.title}</h3>
        <p id="confirm-desc" className="muted">
          {dialog.message}
        </p>

        <div className="modal-actions">
          <button
            type="button"
            className="ghost"
            autoFocus
            onClick={onClose}
            disabled={busy}
          >
            Batal
          </button>

          <button
            type="button"
            className={dialog.danger ? 'danger-solid' : ''}
            onClick={run}
            disabled={busy}
          >
            {busy ? 'Memproses...' : dialog.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

function SellDialog({ holding, rate, onClose, onDone }) {
  const cfg = cfgOf(holding.category)
  const [lots, setLots] = useState('')
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState(
    holding.price?.currency || cfg?.priceCurrency || 'IDR'
  )
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && !busy) onClose()
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onClose])

  const unit = unitOf(holding.category)
  const n = Number(lots)
  const proceeds = Number(amount) * (currency === 'USD' ? rate : 1)
  const valid =
    n > 0 && n <= holding.lots + 1e-8 && amount !== '' && Number(amount) >= 0
  // Perkiraan untung/rugi terealisasi: hasil jual dikurangi modal rata-rata.
  const costOut =
    holding.lots > 0 ? holding.cost * Math.min(1, n / holding.lots) : 0
  const realized = valid ? proceeds - costOut : null

  async function submit(e) {
    e.preventDefault()
    setErr('')
    setBusy(true)

    try {
      const response = await send('/api/investments', 'POST', {
        type: 'SELL',
        symbol: holding.symbol,
        category: holding.category,
        currency,
        lots: lots,
        amount: amount,
      })
      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        setErr(data.error || 'Gagal mencatat penjualan.')
        return
      }

      await onDone()
    } catch (error) {
      console.error('Sell error:', error)
      setErr('Terjadi kesalahan saat mencatat penjualan.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={() => !busy && onClose()}>
      <form
        className="modal modal-wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sell-title"
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
      >
        <h3 id="sell-title">Jual {holding.symbol}</h3>
        <p className="muted">
          Dimiliki {lotFmt(holding.lots)} {unit}. Modal rata-rata{' '}
          {rp(holding.cost / holding.lots)} per {unit}.
        </p>

        <div className="field-grid">
          <label>
            <span>Jumlah dijual{unit ? ` (${unit})` : ''}</span>
            <input
              type="number"
              min="0"
              step="any"
              autoFocus
              value={lots}
              onChange={(e) => setLots(e.target.value)}
              required
            />
          </label>

          <label>
            <span>Mata uang hasil jual</span>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
            >
              <option value="IDR">IDR (Rp)</option>
              <option value="USD">USD ($)</option>
            </select>
          </label>

          <label className="wide">
            <span>Total hasil jual ({currency})</span>
            <input
              type="number"
              min="0"
              step="any"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </label>
        </div>

        <p className="sell-line">
          <button
            type="button"
            className="link"
            onClick={() => setLots(String(holding.lots))}
          >
            Jual semua
          </button>
          {realized !== null && (
            <span className={tone(realized)}>
              {' '}
              Perkiraan {realized >= 0 ? 'untung' : 'rugi'} terealisasi{' '}
              {signed(realized)}
            </span>
          )}
        </p>

        {n > holding.lots + 1e-8 && (
          <p className="err">Jumlah melebihi yang dimiliki.</p>
        )}

        {err && <p className="err">{err}</p>}

        <div className="modal-actions">
          <button
            type="button"
            className="ghost"
            onClick={onClose}
            disabled={busy}
          >
            Batal
          </button>

          <button type="submit" disabled={busy || !valid}>
            {busy ? 'Menyimpan...' : 'Catat penjualan'}
          </button>
        </div>
      </form>
    </div>
  )
}

function ImportDialog({ plan, onClose, onDone }) {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)

  useEffect(() => {
    if (!plan) return

    const onKey = (e) => {
      if (e.key === 'Escape' && !busy) onClose()
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [plan, busy, onClose])

  if (!plan) return null

  // BELI diproses lebih dulu supaya JUAL tidak ditolak karena stok belum ada.
  const ok = plan.items
    .filter((item) => item.status === 'ok')
    .sort((a, b) => (a.data.type === 'SELL') - (b.data.type === 'SELL'))
  const dup = plan.items.filter((item) => item.status === 'duplicate')
  const bad = plan.items.filter((item) => item.status === 'error')

  async function run() {
    setBusy(true)

    let saved = 0
    const failed = []

    for (const item of ok) {
      try {
        const response = await send('/api/investments', 'POST', item.data)

        if (response.ok) saved++
        else failed.push(item.line)
      } catch {
        failed.push(item.line)
      }
    }

    setResult({ saved, failed })
    setBusy(false)
    onDone()
  }

  return (
    <div className="modal-backdrop" onClick={() => !busy && onClose()}>
      <div
        className="modal modal-wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="import-title">Impor CSV</h3>

        {plan.fatal ? (
          <p className="muted">{plan.fatal}</p>
        ) : result ? (
          <p className="muted">
            {result.saved} investasi berhasil diimpor.
            {result.failed.length > 0 &&
              ` Gagal disimpan di baris: ${result.failed.join(', ')}.`}
          </p>
        ) : (
          <>
            <p className="muted">
              {ok.length} baris akan diimpor
              {dup.length > 0 && `, ${dup.length} dilewati karena sudah ada`}
              {bad.length > 0 && `, ${bad.length} bermasalah`}. Tanggal dibuat
              akan menjadi hari ini.
            </p>

            <div className="table-scroll import-list">
              <table className="pnl-table">
                <thead>
                  <tr>
                    <th>Baris</th>
                    <th>Aset</th>
                    <th>Jumlah</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.items.map((item) => (
                    <tr key={item.line}>
                      <td>{item.line}</td>
                      <td>{item.data ? item.data.symbol : '—'}</td>
                      <td>
                        {item.data
                          ? `${lotFmt(item.data.lots)} ${unitOf(item.data.category)}`
                          : '—'}
                      </td>
                      <td
                        className={
                          item.status === 'ok'
                            ? 'pos'
                            : item.status === 'error'
                              ? 'neg'
                              : 'muted'
                        }
                      >
                        {item.status === 'ok' ? 'Akan diimpor' : item.reason}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        <div className="modal-actions">
          <button
            type="button"
            className="ghost"
            autoFocus
            onClick={onClose}
            disabled={busy}
          >
            {result || plan.fatal ? 'Tutup' : 'Batal'}
          </button>

          {!result && !plan.fatal && (
            <button type="button" onClick={run} disabled={busy || !ok.length}>
              {busy ? 'Mengimpor...' : `Impor ${ok.length} baris`}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// Kategori yang kartunya tidak menampilkan angka total (hanya rincian per aset).
const HIDE_CATEGORY_TOTAL = new Set(['id stocks', 'us etf', 'gold', 'crypto'])

const empty = {
  symbol: '',
  category: '',
  currency: 'IDR',
  lots: '',
  amount: '',
}

export default function Dashboard() {
  const router = useRouter()

  const [list, setList] = useState([])
  const [cats, setCats] = useState([])
  const [rate, setRate] = useState(16000)
  const [rateInfo, setRateInfo] = useState({ date: null, stale: false })
  const [form, setForm] = useState(empty)

  const [err, setErr] = useState('')
  const [catName, setCatName] = useState('')
  const [catErr, setCatErr] = useState('')
  const [showCatForm, setShowCatForm] = useState(false)
  const [loading, setLoading] = useState(true)
  const [dialog, setDialog] = useState(null)
  const [importPlan, setImportPlan] = useState(null)
  const [sellTarget, setSellTarget] = useState(null)
  const fileInput = useRef(null)

  const [prices, setPrices] = useState({})
  const [priceInfo, setPriceInfo] = useState({
    loading: false,
    at: null,
    errors: {},
    failed: false,
  })
  const [manual, setManual] = useState({})
  const [priceEditId, setPriceEditId] = useState(null)
  const [priceEditVal, setPriceEditVal] = useState('')

  async function load() {
    try {
      const [investmentsResponse, categoriesResponse, rateResponse] =
        await Promise.all([
          fetch('/api/investments'),
          fetch('/api/categories'),
          fetch('/api/rate'),
        ])

      if (
        investmentsResponse.status === 401 ||
        categoriesResponse.status === 401
      ) {
        router.push('/login')
        return
      }

      if (!investmentsResponse.ok || !categoriesResponse.ok) {
        throw new Error('Gagal memuat data dashboard.')
      }

      setList(await investmentsResponse.json())
      setCats(await categoriesResponse.json())

      if (rateResponse.ok) {
        const info = await rateResponse.json()
        setRate(Number(info.usdRate))
        setRateInfo({ date: info.date, stale: info.stale })
      }
    } catch (error) {
      console.error('Dashboard load error:', error)
      setErr('Gagal memuat data. Silakan coba lagi.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  // Harga manual disimpan di browser ini (localStorage).
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('manualPrices') || '{}')
      if (saved && typeof saved === 'object') setManual(saved)
    } catch {}
  }, [])

  function persistManual(next) {
    setManual(next)

    try {
      localStorage.setItem('manualPrices', JSON.stringify(next))
    } catch {}
  }

  // Daftar aset yang punya sumber harga otomatis, misalnya "idx:BBCA,us:VOO".
  const priceKey = [
    ...new Set(
      list
        .map((investment) => {
          const cfg = cfgOf(investment.category)
          return cfg ? `${cfg.source}:${symKey(investment.symbol)}` : null
        })
        .filter(Boolean)
    ),
  ]
    .sort()
    .join(',')

  async function loadPrices() {
    if (!priceKey) {
      setPrices({})
      return
    }

    setPriceInfo((previous) => ({ ...previous, loading: true }))

    try {
      const items = priceKey.split(',').map((entry) => {
        const index = entry.indexOf(':')
        return { source: entry.slice(0, index), symbol: entry.slice(index + 1) }
      })

      const response = await send('/api/prices', 'POST', { items })

      if (!response.ok) throw new Error(`HTTP ${response.status}`)

      const data = await response.json()

      setPrices((previous) => ({ ...previous, ...(data.prices || {}) }))
      setPriceInfo({
        loading: false,
        at: new Date(),
        errors: data.errors || {},
        failed: false,
      })
    } catch (error) {
      console.error('Price load error:', error)
      setPriceInfo((previous) => ({
        ...previous,
        loading: false,
        failed: true,
      }))
    }
  }

  useEffect(() => {
    loadPrices()

    const timer = setInterval(loadPrices, 5 * 60 * 1000)
    return () => clearInterval(timer)
  }, [priceKey])

  async function save(e) {
    e.preventDefault()
    setErr('')

    try {
      const response = await send('/api/investments', 'POST', {
        ...form,
        symbol: symKey(form.symbol),
      })

      const data = await response.json()

      if (!response.ok) {
        setErr(data.error || 'Gagal menyimpan investasi.')
        return
      }

      setForm(empty)
      await load()
    } catch (error) {
      console.error('Save investment error:', error)
      setErr('Terjadi kesalahan saat menyimpan investasi.')
    }
  }

  function del(holding) {
    const n = holding.ids.length

    setDialog({
      title: `Hapus ${holding.symbol}?`,
      message:
        n > 1
          ? `Seluruh ${n} catatan transaksi ${holding.symbol} akan dihapus permanen dan tidak bisa dikembalikan. Untuk menghapus satu catatan saja, buka halaman Transaksi.`
          : `Catatan ${holding.symbol} akan dihapus permanen dan tidak bisa dikembalikan.`,
      confirmLabel: 'Hapus',
      danger: true,
      onConfirm: () => doDelete(holding.ids),
    })
  }

  async function doDelete(ids) {
    setErr('')

    try {
      let failed = 0

      // Terbaru dulu, supaya catatan jual terhapus sebelum catatan beli.
      for (const id of [...ids].reverse()) {
        const response = await fetch(`/api/investments/${id}`, {
          method: 'DELETE',
        })

        if (!response.ok) failed++
      }

      if (failed) setErr(`${failed} catatan gagal dihapus. Coba lagi.`)

      await load()
    } catch (error) {
      console.error('Delete investment error:', error)
      setErr('Terjadi kesalahan saat menghapus investasi.')
    }
  }

  async function addCat(e) {
    e.preventDefault()
    setCatErr('')

    const name = catName.trim()

    if (!name) {
      setCatErr('Nama kategori wajib diisi.')
      return
    }

    try {
      const response = await send('/api/categories', 'POST', { name })
      const data = await response.json()

      if (!response.ok) {
        setCatErr(data.error || 'Gagal menambahkan kategori.')
        return
      }

      setCatName('')
      setShowCatForm(false)
      await load()
    } catch (error) {
      console.error('Add category error:', error)
      setCatErr('Terjadi kesalahan saat menambahkan kategori.')
    }
  }

  function delCat(category) {
    setDialog({
      title: 'Hapus kategori?',
      message: `Kategori "${category.name}" akan dihapus.`,
      confirmLabel: 'Hapus',
      danger: true,
      onConfirm: () => doDeleteCat(category),
    })
  }

  async function doDeleteCat(category) {
    setCatErr('')

    try {
      const response = await fetch(`/api/categories/${category.id}`, {
        method: 'DELETE',
      })

      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        setCatErr(data.error || 'Gagal menghapus kategori.')
        return
      }

      setForm((previous) => ({
        ...previous,
        category: previous.category === category.name ? '' : previous.category,
      }))

      await load()
    } catch (error) {
      console.error('Delete category error:', error)
      setCatErr('Terjadi kesalahan saat menghapus kategori.')
    }
  }

  function logout() {
    setDialog({
      title: 'Keluar dari akun?',
      message: 'Anda perlu masuk lagi untuk melihat portofolio.',
      confirmLabel: 'Keluar',
      danger: false,
      onConfirm: doLogout,
    })
  }

  async function doLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
    router.refresh()
  }

  const setField = (key) => (e) => setForm({ ...form, [key]: e.target.value })

  const rows = buildRows({ list, rate, prices, manual })
  const active = buildHoldings(rows, rate)
  const realized = buildRealized(rows)

  // Kartu ringkasan, donat, dan tabel sama-sama dihitung dari kepemilikan aktif.
  const total = active.reduce((sum, row) => sum + row.value, 0)
  const totalCost = active.reduce((sum, row) => sum + row.cost, 0)
  const priced = active.filter((row) => row.market !== null)
  const pnlTotal = priced.reduce((sum, row) => sum + row.pnl, 0)
  const pricedCost = priced.reduce((sum, row) => sum + row.cost, 0)
  const pnlTotalPct = pricedCost > 0 ? (pnlTotal / pricedCost) * 100 : null
  const unpriced = active.length - priced.length

  // Unduh seluruh investasi (beserta harga, nilai, dan PnL saat ini) sebagai CSV.
  // BOM di depan supaya Excel membaca huruf dengan benar.
  function exportCsv() {
    const blob = new Blob(['\ufeff' + toCsv(rows)], {
      type: 'text/csv;charset=utf-8',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')

    link.href = url
    link.download = `portofolio-${new Date().toLocaleDateString('sv-SE')}.csv`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  // Membaca file CSV yang dipilih lalu menampilkan pratinjau sebelum disimpan.
  async function pickCsv(e) {
    const file = e.target.files?.[0]

    e.target.value = ''

    if (!file) return

    if (file.size > 2 * 1024 * 1024) {
      setImportPlan({
        items: [],
        fatal: 'Ukuran file terlalu besar (maksimal 2 MB).',
      })
      return
    }

    setImportPlan(
      planImport(await file.text(), {
        categories: cats.map((category) => category.name),
        existing: list,
      })
    )
  }

  function startPrice(row) {
    const current = manual[symKey(row.symbol)]

    setPriceEditId(row.key)
    setPriceEditVal(current ? String(current.price) : '')
  }

  function savePrice(row) {
    const key = symKey(row.symbol)
    const next = { ...manual }
    const text = priceEditVal.trim()
    const value = Number(text)

    if (!text) {
      delete next[key]
    } else if (Number.isFinite(value) && value > 0) {
      next[key] = {
        price: value,
        currency:
          row.price?.currency || cfgOf(row.category)?.priceCurrency || 'IDR',
      }
    } else {
      return
    }

    persistManual(next)
    setPriceEditId(null)
  }
  const assetCount = active.length

  const holdings = HOLDINGS.map((cfg) => {
    const items = group(
      active.filter((row) => norm(row.category) === norm(cfg.category)),
      'symbol',
      'lots'
    )
    const sum = items.reduce((acc, item) => acc + item.value, 0)
    return { ...cfg, items, sum }
  })

  const options = [
    ...new Set([
      ...cats.map((category) => category.name),
      ...(form.category ? [form.category] : []),
    ]),
  ]

  return (
    <main className="wrap">
      <header>
        <div>
          <h1>Total portofolio</h1>
          <p className="total">{rp(total)}</p>

          {priced.length > 0 && (
            <p className="pnl">
              <span className={tone(pnlTotal)}>
                PnL {signed(pnlTotal)}
                {pnlTotalPct !== null && ` (${pctFmt(pnlTotalPct)})`}
              </span>
              <span className="muted"> · Modal {rp(totalCost)}</span>
              {unpriced > 0 && (
                <span className="muted">
                  {' '}
                  · {unpriced} aset belum ada harga
                </span>
              )}
            </p>
          )}

          {realized.count > 0 && (
            <p className="pnl">
              <span className="muted">Terealisasi dari penjualan </span>
              <span className={tone(realized.total)}>
                {signed(realized.total)}
              </span>
            </p>
          )}
        </div>

        <div className="header-actions">
          <Link href="/transaksi" className="btn-link">
            Transaksi
          </Link>

          <Link href="/pnl" className="btn-link">
            PnL
          </Link>

          <button className="ghost" onClick={logout}>
            Keluar
          </button>
        </div>
      </header>

      <section className="stats">
        <div className="stat">
          <span>Jumlah aset</span>
          <b>{assetCount}</b>
        </div>

        {holdings.map((h) => {
          // Kartu ini hanya menampilkan rincian per aset (tanpa angka total).
          const totalHidden = HIDE_CATEGORY_TOTAL.has(norm(h.category))

          return (
            <div className="stat" key={h.category}>
              <span>{h.label}</span>
              {!totalHidden && (
                <b>
                  <span className="num">{lotFmt(h.sum)}</span>
                  <span className="unit">{h.unit}</span>
                </b>
              )}
              <small className="detail">
                {h.items.length
                  ? h.items.map((item) => (
                      <span className="detail-row" key={item.name}>
                        <span>{item.name}</span>
                        <span>
                          {lotFmt(item.value)}
                          {totalHidden && ` ${h.unit}`}
                        </span>
                      </span>
                    ))
                  : 'Belum ada'}
              </small>
            </div>
          )
        })}

        <div className="stat">
          <span>Kurs USD/IDR</span>
          <b>{rp(rate)}</b>
          <small>
            {rateInfo.stale
              ? 'Kurs terbaru gagal dimuat, memakai kurs tersimpan'
              : rateInfo.date
                ? `Otomatis, kurs ECB ${rateInfo.date}`
                : 'Memuat kurs...'}
          </small>
        </div>
      </section>

      <div className="grid">
        <Chart title="Berdasarkan aset" data={group(active, 'symbol')} />

        <Chart title="Berdasarkan kategori" data={group(active, 'category')} />
      </div>

      <section className="card">
        <h3>Tambah investasi</h3>

        <form onSubmit={save} className="row">
          <input
            placeholder="Aset (VOO, BBCA, BTC)"
            value={form.symbol}
            onChange={setField('symbol')}
            required
          />

          <select
            value={form.category}
            onChange={setField('category')}
            required
          >
            <option value="">Pilih kategori</option>

            {options.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>

          <button
            type="button"
            className="ghost"
            onClick={() => {
              setShowCatForm((previous) => !previous)
              setCatErr('')
            }}
          >
            {showCatForm ? 'Tutup kategori' : '+ Kategori'}
          </button>

          <select value={form.currency} onChange={setField('currency')}>
            <option value="IDR">IDR (Rp)</option>
            <option value="USD">USD (US$)</option>
          </select>

          <input
            type="number"
            min="0"
            step="any"
            placeholder={
              unitOf(form.category)
                ? `Jumlah (${unitOf(form.category)})`
                : 'Jumlah'
            }
            value={form.lots}
            onChange={setField('lots')}
            required
          />

          <input
            type="number"
            min="0"
            step="any"
            placeholder="Nilai total investasi"
            value={form.amount}
            onChange={setField('amount')}
            required
          />

          <button type="submit">Tambah investasi</button>

          <button
            type="button"
            className="ghost"
            onClick={() => fileInput.current?.click()}
            disabled={!cats.length}
          >
            Impor CSV
          </button>

          <input
            ref={fileInput}
            type="file"
            accept=".csv,text/csv"
            style={{ display: 'none' }}
            onChange={pickCsv}
          />
        </form>

        {err && <p className="err">{err}</p>}

        {showCatForm && (
          <div className="category-manager">
            <h4>Kelola kategori</h4>

            <form onSubmit={addCat} className="row">
              <input
                placeholder="Nama kategori baru"
                maxLength={30}
                value={catName}
                onChange={(e) => setCatName(e.target.value)}
                required
              />

              <button type="submit">Tambah kategori</button>
            </form>

            {catErr && <p className="err">{catErr}</p>}

            {cats.length > 0 ? (
              <ul className="chips">
                {cats.map((category) => (
                  <li className="chip" key={category.id}>
                    <span>{category.name}</span>

                    <small>
                      {
                        list.filter(
                          (investment) => investment.category === category.name
                        ).length
                      }
                    </small>

                    <button
                      type="button"
                      className="x"
                      aria-label={`Hapus kategori ${category.name}`}
                      onClick={() => delCat(category)}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted empty">
                Belum ada kategori. Tambahkan kategori pertama.
              </p>
            )}
          </div>
        )}
      </section>

      <section className="card">
        <h3>
          Kepemilikan aktif
          <span className="price-meta">
            {priceInfo.at && (
              <small className="muted">
                Harga{' '}
                {priceInfo.at.toLocaleTimeString('id-ID', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </small>
            )}

            <button
              type="button"
              className="ghost"
              onClick={loadPrices}
              disabled={priceInfo.loading}
            >
              {priceInfo.loading ? 'Memuat...' : 'Perbarui harga'}
            </button>

            <button
              type="button"
              className="ghost"
              onClick={exportCsv}
              disabled={!rows.length}
            >
              Ekspor CSV
            </button>
          </span>
        </h3>

        {loading ? (
          <p className="muted">Memuat data...</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Aset</th>
                <th>Kategori</th>
                <th className="r">Jumlah</th>
                <th className="r">Modal</th>
                <th className="r">Harga</th>
                <th className="r">Nilai</th>
                <th className="r">PnL</th>
                <th className="r">Porsi</th>
                <th>Aksi</th>
              </tr>
            </thead>

            <tbody>
              {active.map((row) => (
                <tr key={row.key}>
                  <td>
                    <b>{symKey(row.symbol)}</b>
                  </td>

                  <td>
                    <span className="pill">{row.category}</span>
                  </td>

                  <td className="r">
                    {lotFmt(row.lots)}
                    {unitOf(row.category) && (
                      <small className="sub">{unitOf(row.category)}</small>
                    )}
                  </td>

                  <td className="r">{rp(row.cost)}</td>

                  <td className="r">
                    {priceEditId === row.key ? (
                      <div className="price-edit">
                        <input
                          type="number"
                          min="0"
                          step="any"
                          autoFocus
                          value={priceEditVal}
                          placeholder={`Harga ${
                            row.price?.currency ||
                            cfgOf(row.category)?.priceCurrency ||
                            'IDR'
                          }`}
                          onChange={(e) => setPriceEditVal(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              savePrice(row)
                            }

                            if (e.key === 'Escape') setPriceEditId(null)
                          }}
                        />

                        <button
                          type="button"
                          className="ghost"
                          onClick={() => savePrice(row)}
                        >
                          Simpan
                        </button>
                      </div>
                    ) : (
                      <>
                        {row.price ? (
                          priceFmt(row.price.price, row.price.currency)
                        ) : (
                          <span className="muted">—</span>
                        )}

                        <small className="sub">
                          {cfgOf(row.category)?.priceUnit
                            ? `/${cfgOf(row.category).priceUnit}`
                            : ''}
                          {row.price?.manual ? ' · manual' : ''}{' '}
                          <button
                            type="button"
                            className="link"
                            onClick={() => startPrice(row)}
                          >
                            ubah
                          </button>
                        </small>
                      </>
                    )}
                  </td>

                  <td className="r">
                    {row.market !== null ? (
                      rp(row.market)
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>

                  <td className="r">
                    {row.pnl !== null ? (
                      <>
                        <span className={tone(row.pnl)}>{signed(row.pnl)}</span>
                        {row.pnlPct !== null && (
                          <small className={`sub ${tone(row.pnl)}`}>
                            {pctFmt(row.pnlPct)}
                          </small>
                        )}
                      </>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>

                  <td className="r muted">
                    {total ? ((row.value / total) * 100).toFixed(1) : '0.0'}%
                  </td>

                  <td className="r">
                    <button
                      className="ghost"
                      onClick={() => setSellTarget(row)}
                    >
                      Jual
                    </button>{' '}
                    <button
                      className="ghost"
                      onClick={() =>
                        router.push(
                          `/transaksi?aset=${encodeURIComponent(row.symbol)}`
                        )
                      }
                    >
                      Edit
                    </button>{' '}
                    <button className="ghost danger" onClick={() => del(row)}>
                      Hapus
                    </button>
                  </td>
                </tr>
              ))}

              {!active.length && (
                <tr>
                  <td colSpan="9" className="muted">
                    Belum ada aset yang dipegang.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}

        {(priceInfo.failed || Object.keys(priceInfo.errors).length > 0) && (
          <p className="err">
            Sebagian harga gagal dimuat
            {Object.keys(priceInfo.errors).length > 0 &&
              ` (${Object.keys(priceInfo.errors).join(', ')})`}
            . Coba perbarui, atau isi harga manual lewat tombol
            &quot;ubah&quot;.
          </p>
        )}

        <p className="muted note">
          Harga dari Yahoo Finance dan CoinGecko, bisa tertunda. Emas memakai
          harga spot internasional, jadi isi manual kalau Anda ingin harga Antam
          atau Pegadaian. 1 lot saham ID dihitung 100 saham. Modal dan jumlah
          adalah gabungan semua transaksi aset yang sama; rinciannya ada di
          halaman Transaksi.
        </p>
      </section>

      <ConfirmDialog dialog={dialog} onClose={() => setDialog(null)} />
      {sellTarget && (
        <SellDialog
          key={sellTarget.key}
          holding={sellTarget}
          rate={rate}
          onClose={() => setSellTarget(null)}
          onDone={async () => {
            setSellTarget(null)
            await load()
          }}
        />
      )}
      <ImportDialog
        key={importPlan ? 'open' : 'closed'}
        plan={importPlan}
        onClose={() => setImportPlan(null)}
        onDone={load}
      />
    </main>
  )
}
