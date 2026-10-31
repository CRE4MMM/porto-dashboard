'use client'

import { useEffect, useState } from 'react'
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
  priceFmt,
  signed,
  pctFmt,
  tone,
  buildRows,
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
      const name = item[key]
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
  const [editId, setEditId] = useState(null)

  const [err, setErr] = useState('')
  const [catName, setCatName] = useState('')
  const [catErr, setCatErr] = useState('')
  const [showCatForm, setShowCatForm] = useState(false)
  const [loading, setLoading] = useState(true)
  const [dialog, setDialog] = useState(null)

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
      const response = await send(
        editId ? `/api/investments/${editId}` : '/api/investments',
        editId ? 'PUT' : 'POST',
        form
      )

      const data = await response.json()

      if (!response.ok) {
        setErr(data.error || 'Gagal menyimpan investasi.')
        return
      }

      setForm(empty)
      setEditId(null)
      await load()
    } catch (error) {
      console.error('Save investment error:', error)
      setErr('Terjadi kesalahan saat menyimpan investasi.')
    }
  }

  function del(investment) {
    setDialog({
      title: 'Hapus investasi?',
      message: `Investasi ${investment.symbol} akan dihapus permanen dan tidak bisa dikembalikan.`,
      confirmLabel: 'Hapus',
      danger: true,
      onConfirm: () => doDelete(investment.id),
    })
  }

  async function doDelete(id) {
    setErr('')

    try {
      const response = await fetch(`/api/investments/${id}`, {
        method: 'DELETE',
      })

      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        setErr(data.error || 'Gagal menghapus investasi.')
        return
      }

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

  function startEdit(investment) {
    setEditId(investment.id)
    setForm({
      symbol: investment.symbol,
      category: investment.category,
      currency: investment.currency || 'IDR',
      lots: String(investment.lots),
      amount: String(investment.amount),
    })

    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    })
  }

  function cancelEdit() {
    setEditId(null)
    setForm(empty)
    setErr('')
  }

  const setField = (key) => (e) => setForm({ ...form, [key]: e.target.value })

  const rows = buildRows({ list, rate, prices, manual })

  const total = rows.reduce((sum, row) => sum + row.value, 0)
  const totalCost = rows.reduce((sum, row) => sum + row.cost, 0)
  const priced = rows.filter((row) => row.market !== null)
  const pnlTotal = priced.reduce((sum, row) => sum + row.pnl, 0)
  const pricedCost = priced.reduce((sum, row) => sum + row.cost, 0)
  const pnlTotalPct = pricedCost > 0 ? (pnlTotal / pricedCost) * 100 : null
  const unpriced = rows.length - priced.length

  function startPrice(row) {
    const current = manual[symKey(row.symbol)]

    setPriceEditId(row.id)
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
  const assetCount = new Set(rows.map((row) => row.symbol)).size

  const holdings = HOLDINGS.map((cfg) => {
    const items = group(
      rows.filter((row) => norm(row.category) === norm(cfg.category)),
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
        </div>

        <div className="header-actions">
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

        {holdings.map((h) => (
          <div className="stat" key={h.category}>
            <span>{h.label}</span>
            <b>
              <span className="num">{lotFmt(h.sum)}</span>
              <span className="unit">{h.unit}</span>
            </b>
            <small
              className="detail"
              title={h.items
                .map((item) => `${item.name} ${lotFmt(item.value)}`)
                .join(', ')}
            >
              {h.items.length
                ? h.items
                    .map((item) => `${item.name} ${lotFmt(item.value)}`)
                    .join(' · ')
                : 'Belum ada'}
            </small>
          </div>
        ))}

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
        <Chart title="Berdasarkan aset" data={group(rows, 'symbol')} />

        <Chart title="Berdasarkan kategori" data={group(rows, 'category')} />
      </div>

      <section className="card">
        <h3>{editId ? 'Edit investasi' : 'Tambah investasi'}</h3>

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

          <button type="submit">
            {editId ? 'Simpan perubahan' : 'Tambah investasi'}
          </button>

          {editId && (
            <button type="button" className="ghost" onClick={cancelEdit}>
              Batal edit
            </button>
          )}
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
          Daftar investasi
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
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <b>{row.symbol}</b>
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

                  <td className="r">
                    {money(row.amount, row.currency)}
                    {row.currency === 'USD' && (
                      <small className="sub">≈ {rp(row.cost)}</small>
                    )}
                  </td>

                  <td className="r">
                    {priceEditId === row.id ? (
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
                    <button className="ghost" onClick={() => startEdit(row)}>
                      Edit
                    </button>{' '}
                    <button className="ghost danger" onClick={() => del(row)}>
                      Hapus
                    </button>
                  </td>
                </tr>
              ))}

              {!rows.length && (
                <tr>
                  <td colSpan="9" className="muted">
                    Belum ada investasi.
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
          atau Pegadaian. 1 lot saham ID dihitung 100 saham.
        </p>
      </section>

      <ConfirmDialog dialog={dialog} onClose={() => setDialog(null)} />
    </main>
  )
}
