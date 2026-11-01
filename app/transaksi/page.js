'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  rp,
  lotFmt,
  money,
  priceFmt,
  symKey,
  cfgOf,
  unitOf,
  txType,
  unitPrice,
  filterTransactions,
} from '../../lib/portfolio'

const send = (url, method, body) =>
  fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })

const emptyFilter = { from: '', to: '', query: '', type: '' }

// ---------- Dialog konfirmasi ----------

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
            className="danger-solid"
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

// ---------- Dialog edit transaksi ----------

function EditDialog({ row, cats, onClose, onSaved }) {
  const [form, setForm] = useState(() => ({
    symbol: symKey(row.symbol),
    category: row.category,
    currency: row.currency || 'IDR',
    lots: String(row.lots),
    amount: String(row.amount),
  }))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && !busy) onClose()
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onClose])

  const names = cats.includes(row.category) ? cats : [row.category, ...cats]
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value })

  async function submit(e) {
    e.preventDefault()
    setErr('')
    setBusy(true)

    try {
      const response = await send(`/api/investments/${row.id}`, 'PUT', {
        ...form,
        symbol: symKey(form.symbol),
      })
      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        setErr(data.error || 'Gagal menyimpan perubahan.')
        return
      }

      await onSaved()
    } catch (error) {
      console.error('Edit transaction error:', error)
      setErr('Terjadi kesalahan saat menyimpan.')
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
        aria-labelledby="edit-title"
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
      >
        <h3 id="edit-title">Edit transaksi</h3>

        <div className="field-grid">
          <label>
            <span>Aset</span>
            <input value={form.symbol} onChange={set('symbol')} required />
          </label>

          <label>
            <span>Kategori</span>
            <select value={form.category} onChange={set('category')} required>
              {names.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Mata uang</span>
            <select value={form.currency} onChange={set('currency')}>
              <option value="IDR">IDR (Rp)</option>
              <option value="USD">USD ($)</option>
            </select>
          </label>

          <label>
            <span>
              Jumlah{unitOf(form.category) ? ` (${unitOf(form.category)})` : ''}
            </span>
            <input
              type="number"
              min="0"
              step="any"
              value={form.lots}
              onChange={set('lots')}
              required
            />
          </label>

          <label className="wide">
            <span>Nilai total ({form.currency})</span>
            <input
              type="number"
              min="0"
              step="any"
              value={form.amount}
              onChange={set('amount')}
              required
            />
          </label>
        </div>

        {err && <p className="err">{err}</p>}

        <p className="muted note">
          Tanggal transaksi tidak bisa diubah. Hapus lalu catat ulang kalau
          tanggalnya salah.
        </p>

        <div className="modal-actions">
          <button
            type="button"
            className="ghost"
            onClick={onClose}
            disabled={busy}
          >
            Batal
          </button>

          <button type="submit" disabled={busy}>
            {busy ? 'Menyimpan...' : 'Simpan perubahan'}
          </button>
        </div>
      </form>
    </div>
  )
}

// ---------- Halaman ----------

export default function Transaksi() {
  const router = useRouter()
  const [list, setList] = useState([])
  const [cats, setCats] = useState([])
  const [rate, setRate] = useState(16000)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [filter, setFilter] = useState(emptyFilter)
  const [dialog, setDialog] = useState(null)
  const [editing, setEditing] = useState(null)

  async function load() {
    try {
      const [investments, categories, rateResponse] = await Promise.all([
        fetch('/api/investments'),
        fetch('/api/categories'),
        fetch('/api/rate'),
      ])

      if (investments.status === 401 || categories.status === 401) {
        router.push('/login')
        return
      }

      if (!investments.ok) throw new Error('Gagal memuat transaksi.')

      setList(await investments.json())

      if (categories.ok) {
        setCats((await categories.json()).map((category) => category.name))
      }

      if (rateResponse.ok) {
        const info = await rateResponse.json()

        if (Number(info.usdRate) > 0) setRate(Number(info.usdRate))
      }

      setErr('')
    } catch (error) {
      console.error('Transactions load error:', error)
      setErr('Gagal memuat data. Silakan coba lagi.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()

    // Dari dashboard: /transaksi?aset=BTC langsung memfilter aset itu.
    try {
      const aset = new URLSearchParams(window.location.search).get('aset')

      if (aset) setFilter((f) => ({ ...f, query: aset }))
    } catch {}
  }, [])

  const set = (key) => (e) => setFilter({ ...filter, [key]: e.target.value })
  const shown = filterTransactions(list, filter)
  const active = Object.values(filter).some(Boolean)
  const toIdr = (row) =>
    Number(row.amount || 0) * (row.currency === 'USD' ? rate : 1)
  const totalOf = (type) =>
    shown
      .filter((row) => txType(row) === type)
      .reduce((sum, row) => sum + toIdr(row), 0)

  function del(row) {
    setDialog({
      title: 'Hapus transaksi?',
      message: `Catatan ${txType(row) === 'SELL' ? 'JUAL' : 'BELI'} ${symKey(row.symbol)} akan dihapus permanen dan tidak bisa dikembalikan.`,
      confirmLabel: 'Hapus',
      onConfirm: async () => {
        try {
          const response = await fetch(`/api/investments/${row.id}`, {
            method: 'DELETE',
          })

          if (!response.ok) {
            const data = await response.json().catch(() => ({}))

            setErr(data.error || 'Gagal menghapus transaksi.')
            return
          }

          await load()
        } catch (error) {
          console.error('Delete transaction error:', error)
          setErr('Terjadi kesalahan saat menghapus transaksi.')
        }
      },
    })
  }

  return (
    <main className="wrap">
      <header>
        <div>
          <h1>Riwayat transaksi</h1>
          <p className="total">{loading ? '—' : list.length}</p>

          <p className="pnl">
            <span className="muted">transaksi tercatat</span>
          </p>
        </div>

        <div className="header-actions">
          <Link href="/pnl" className="btn-link">
            PnL
          </Link>

          <Link href="/dashboard" className="btn-link">
            ← Dashboard
          </Link>
        </div>
      </header>

      {err && <p className="err">{err}</p>}

      <section className="card">
        <div className="tx-filters">
          <label>
            <span>Dari tanggal</span>
            <input
              type="date"
              value={filter.from}
              max={filter.to || undefined}
              onChange={set('from')}
            />
          </label>

          <label>
            <span>Sampai tanggal</span>
            <input
              type="date"
              value={filter.to}
              min={filter.from || undefined}
              onChange={set('to')}
            />
          </label>

          <label>
            <span>Cari aset</span>
            <input
              type="search"
              placeholder="Ticker, mis. BBCA"
              value={filter.query}
              onChange={set('query')}
            />
          </label>

          {/* <label>
            <span>Jenis</span>
            <select value={filter.type} onChange={set('type')}>
              <option value="">Semua</option>
              <option value="BUY">Beli</option>
              <option value="SELL">Jual</option>
            </select>
          </label> */}

          <button
            type="button"
            className="ghost"
            onClick={() => setFilter(emptyFilter)}
            disabled={!active}
          >
            Reset
          </button>
        </div>
      </section>

      <section className="card">
        <h3>
          Transaksi
          <span className="price-meta">
            <small className="muted">
              {shown.length} dari {list.length}
              {shown.length > 0 && ` · Beli ${rp(totalOf('BUY'))}`}
              {totalOf('SELL') > 0 && ` · Jual ${rp(totalOf('SELL'))}`}
            </small>
          </span>
        </h3>

        {loading ? (
          <p className="muted">Memuat data...</p>
        ) : (
          <div className="table-scroll">
            <table className="tx-table">
              <thead>
                <tr>
                  <th>Tanggal</th>
                  <th>Jenis</th>
                  <th>Aset</th>
                  <th>Kategori</th>
                  <th className="r">Jumlah</th>
                  <th className="r">Harga satuan</th>
                  <th className="r">Total nominal</th>
                  {/* <th>Aksi</th> */}
                </tr>
              </thead>

              <tbody>
                {shown.map((row) => {
                  const date = new Date(row.createdAt)
                  const valid = !Number.isNaN(date.getTime())
                  const sell = txType(row) === 'SELL'
                  const price = unitPrice(row)
                  const unit = cfgOf(row.category)?.priceUnit

                  return (
                    <tr key={row.id}>
                      <td>
                        {valid
                          ? date.toLocaleDateString('id-ID', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                            })
                          : '—'}
                        {valid && (
                          <small className="sub">
                            {date.toLocaleTimeString('id-ID', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </small>
                        )}
                      </td>

                      <td>
                        <span className={`badge ${sell ? 'sell' : 'buy'}`}>
                          {sell ? 'JUAL' : 'BELI'}
                        </span>
                      </td>

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

                      <td className="r">
                        {price !== null ? (
                          <>
                            {priceFmt(price, row.currency)}
                            {unit && <small className="sub">/{unit}</small>}
                          </>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>

                      <td className="r">
                        {money(row.amount, row.currency)}
                        {row.currency === 'USD' && (
                          <small className="sub">≈ {rp(toIdr(row))}</small>
                        )}
                      </td>

                      <td className="r">
                        <button
                          className="ghost"
                          onClick={() => setEditing(row)}
                        >
                          Edit
                        </button>{' '}
                        <button
                          className="ghost danger"
                          onClick={() => del(row)}
                        >
                          Hapus
                        </button>
                      </td>
                    </tr>
                  )
                })}

                {!shown.length && (
                  <tr>
                    <td colSpan="8" className="muted">
                      {list.length
                        ? 'Tidak ada transaksi yang cocok dengan filter.'
                        : 'Belum ada transaksi. Tambahkan di dashboard.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        <p className="muted note">
          Setiap investasi yang ditambahkan di dashboard tercatat sebagai
          transaksi BELI. Harga satuan dihitung dari total nominal dibagi jumlah
          (1 lot saham ID = 100 saham).
        </p>
      </section>

      <ConfirmDialog dialog={dialog} onClose={() => setDialog(null)} />

      {editing && (
        <EditDialog
          key={editing.id}
          row={editing}
          cats={cats}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null)
            await load()
          }}
        />
      )}
    </main>
  )
}
