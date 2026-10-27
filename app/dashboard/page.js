'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'

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

const rp = (n) =>
  (n < 0 ? '-' : '') +
  'Rp ' +
  Math.abs(Math.round(Number(n || 0))).toLocaleString('id-ID')

const signed = (n) => (n > 0 ? '+' + rp(n) : rp(n))

const pct = (p) => (p > 0 ? '+' : '') + p.toFixed(2) + '%'

const price = (n, currency) =>
  currency === 'USD'
    ? 'US$ ' +
      Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 4 })
    : 'Rp ' +
      Number(n || 0).toLocaleString('id-ID', { maximumFractionDigits: 4 })

const group = (list, key) =>
  Object.entries(
    list.reduce((acc, item) => {
      const name = item[key]
      acc[name] = (acc[name] || 0) + Number(item.value || 0)
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

const empty = {
  symbol: '',
  category: '',
  currency: 'IDR',
  quantity: '',
  buyPrice: '',
  currentPrice: '',
}

export default function Dashboard() {
  const router = useRouter()

  const [list, setList] = useState([])
  const [cats, setCats] = useState([])
  const [rate, setRate] = useState(16000)
  const [rateInput, setRateInput] = useState('16000')
  const [form, setForm] = useState(empty)
  const [editId, setEditId] = useState(null)

  const [err, setErr] = useState('')
  const [catName, setCatName] = useState('')
  const [catErr, setCatErr] = useState('')
  const [showCatForm, setShowCatForm] = useState(false)
  const [loading, setLoading] = useState(true)

  async function load() {
    try {
      const [investmentsResponse, categoriesResponse, settingsResponse] =
        await Promise.all([
          fetch('/api/investments'),
          fetch('/api/categories'),
          fetch('/api/settings'),
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

      const investments = await investmentsResponse.json()
      const categories = await categoriesResponse.json()

      setList(investments)
      setCats(categories)

      if (settingsResponse.ok) {
        const settings = await settingsResponse.json()
        setRate(Number(settings.usdRate))
        setRateInput(String(settings.usdRate))
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

  async function del(id) {
    if (!confirm('Hapus investasi ini?')) return

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

  async function saveRate(e) {
    e.preventDefault()
    setErr('')

    try {
      const response = await send('/api/settings', 'PUT', {
        usdRate: rateInput,
      })

      if (!response.ok) {
        setErr('Kurs tidak valid.')
        return
      }

      setRate(Number(rateInput))
    } catch (error) {
      console.error('Save rate error:', error)
      setErr('Terjadi kesalahan saat menyimpan kurs.')
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
      const response = await send('/api/categories', 'POST', {
        name,
      })

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

  async function delCat(category) {
    if (!confirm(`Hapus kategori "${category.name}"?`)) return

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

  async function logout() {
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
      quantity: String(investment.quantity),
      buyPrice: String(investment.buyPrice),
      currentPrice: String(investment.currentPrice),
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

  const rows = list.map((investment) => {
    const fx = investment.currency === 'USD' ? rate : 1
    const value =
      Number(investment.quantity || 0) *
      Number(investment.currentPrice || 0) *
      fx
    const cost =
      Number(investment.quantity || 0) * Number(investment.buyPrice || 0) * fx

    return {
      ...investment,
      value,
      cost,
      pl: value - cost,
      pct: cost ? ((value - cost) / cost) * 100 : 0,
    }
  })

  const total = rows.reduce((sum, row) => sum + row.value, 0)
  const modal = rows.reduce((sum, row) => sum + row.cost, 0)
  const pl = total - modal

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
        </div>

        <button className="ghost" onClick={logout}>
          Keluar
        </button>
      </header>

      <section className="stats">
        <div className="stat">
          <span>Modal</span>
          <b>{rp(modal)}</b>
        </div>

        <div className={'stat ' + (pl >= 0 ? 'pos' : 'neg')}>
          <span>Untung / rugi</span>
          <b>{signed(pl)}</b>
        </div>

        <div className={'stat ' + (pl >= 0 ? 'pos' : 'neg')}>
          <span>Return</span>
          <b>{pct(modal ? (pl / modal) * 100 : 0)}</b>
        </div>

        <form onSubmit={saveRate} className="stat rate">
          <span>Kurs USD/IDR</span>

          <div>
            <input
              type="number"
              min="1"
              step="any"
              value={rateInput}
              onChange={(e) => setRateInput(e.target.value)}
              required
            />

            <button type="submit" className="ghost">
              Simpan
            </button>
          </div>
        </form>
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
            placeholder="Jumlah unit"
            value={form.quantity}
            onChange={setField('quantity')}
            required
          />

          <input
            type="number"
            min="0"
            step="any"
            placeholder="Harga beli / unit"
            value={form.buyPrice}
            onChange={setField('buyPrice')}
            required
          />

          <input
            type="number"
            min="0"
            step="any"
            placeholder="Harga sekarang / unit"
            value={form.currentPrice}
            onChange={setField('currentPrice')}
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
        <h3>Daftar investasi</h3>

        {loading ? (
          <p className="muted">Memuat data...</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Aset</th>
                <th>Kategori</th>
                <th className="r">Unit</th>
                <th className="r">Harga beli</th>
                <th className="r">Harga kini</th>
                <th className="r">Nilai</th>
                <th className="r">Porsi</th>
                <th className="r">Untung / rugi</th>
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
                    {Number(row.quantity).toLocaleString('id-ID', {
                      maximumFractionDigits: 8,
                    })}
                  </td>

                  <td className="r">{price(row.buyPrice, row.currency)}</td>

                  <td className="r">{price(row.currentPrice, row.currency)}</td>

                  <td className="r">{rp(row.value)}</td>

                  <td className="r muted">
                    {total ? ((row.value / total) * 100).toFixed(1) : '0.0'}%
                  </td>

                  <td className={'r ' + (row.pl >= 0 ? 'pos' : 'neg')}>
                    {signed(row.pl)}
                    <small className="sub">{pct(row.pct)}</small>
                  </td>

                  <td className="r">
                    <button className="ghost" onClick={() => startEdit(row)}>
                      Edit
                    </button>{' '}
                    <button
                      className="ghost danger"
                      onClick={() => del(row.id)}
                    >
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
      </section>
    </main>
  )
}
