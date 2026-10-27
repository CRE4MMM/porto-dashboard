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
  BarChart,
  Bar,
  XAxis,
  YAxis,
  LabelList,
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

const rp = (n) => 'Rp ' + Math.round(Number(n || 0)).toLocaleString('id-ID')

const lotFmt = (n) =>
  Number(n || 0).toLocaleString('id-ID', { maximumFractionDigits: 8 })

const money = (n, currency) =>
  currency === 'USD'
    ? 'US$ ' +
      Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })
    : rp(n)

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

function LotChart({ data }) {
  const sorted = [...data].sort((a, b) => b.value - a.value)

  return (
    <section className="card">
      <h3>Jumlah lot per aset</h3>

      {sorted.length ? (
        <ResponsiveContainer
          width="100%"
          height={Math.max(200, sorted.length * 52)}
        >
          <BarChart
            data={sorted}
            layout="vertical"
            margin={{ top: 4, right: 80, bottom: 4, left: 0 }}
          >
            <XAxis type="number" hide domain={[0, 'dataMax']} />
            <YAxis
              type="category"
              dataKey="name"
              width={64}
              axisLine={false}
              tickLine={false}
              tick={{ fontWeight: 600, fontSize: 13 }}
            />
            <Tooltip
              cursor={{ fill: 'rgba(0,0,0,0.04)' }}
              formatter={(value) => [`${lotFmt(value)} lot`, 'Jumlah']}
            />
            <Bar
              dataKey="value"
              radius={[0, 8, 8, 0]}
              maxBarSize={26}
              background={{ fill: '#f1f5f9', radius: 8 }}
            >
              {sorted.map((item, index) => (
                <Cell key={item.name} fill={COLORS[index % COLORS.length]} />
              ))}
              <LabelList
                dataKey="value"
                position="right"
                formatter={(value) => `${lotFmt(value)} lot`}
                style={{ fontSize: 13, fontWeight: 600 }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <p className="muted empty">Belum ada data lot.</p>
      )}
    </section>
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

  const rows = list.map((investment) => ({
    ...investment,
    value:
      Number(investment.amount || 0) *
      (investment.currency === 'USD' ? rate : 1),
  }))

  const total = rows.reduce((sum, row) => sum + row.value, 0)
  const assetCount = new Set(rows.map((row) => row.symbol)).size

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
          <span>Jumlah aset</span>
          <b>{assetCount}</b>
        </div>

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

      <LotChart data={group(rows, 'symbol', 'lots')} />

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
            placeholder="Jumlah lot"
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
        <h3>Daftar investasi</h3>

        {loading ? (
          <p className="muted">Memuat data...</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Aset</th>
                <th>Kategori</th>
                <th className="r">Lot</th>
                <th className="r">Nilai</th>
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

                  <td className="r">{lotFmt(row.lots)}</td>

                  <td className="r">
                    {money(row.amount, row.currency)}
                    {row.currency === 'USD' && (
                      <small className="sub">≈ {rp(row.value)}</small>
                    )}
                  </td>

                  <td className="r muted">
                    {total ? ((row.value / total) * 100).toFixed(1) : '0.0'}%
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
                  <td colSpan="6" className="muted">
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
