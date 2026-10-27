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

const rp = (n) => 'Rp ' + Number(n || 0).toLocaleString('id-ID')

const group = (list, key) =>
  Object.entries(
    list.reduce((acc, item) => {
      const name = item[key]
      acc[name] = (acc[name] || 0) + Number(item.amount || 0)
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
  amount: '',
}

export default function Dashboard() {
  const router = useRouter()

  const [list, setList] = useState([])
  const [cats, setCats] = useState([])
  const [form, setForm] = useState(empty)
  const [editId, setEditId] = useState(null)

  const [err, setErr] = useState('')
  const [catName, setCatName] = useState('')
  const [catErr, setCatErr] = useState('')
  const [showCatForm, setShowCatForm] = useState(false)
  const [loading, setLoading] = useState(true)

  async function load() {
    try {
      const [investmentsResponse, categoriesResponse] = await Promise.all([
        fetch('/api/investments'),
        fetch('/api/categories'),
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
        {
          ...form,
          amount: Number(form.amount),
        }
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

  const total = list.reduce(
    (sum, investment) => sum + Number(investment.amount || 0),
    0
  )

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

      <div className="grid">
        <Chart title="Berdasarkan aset" data={group(list, 'symbol')} />

        <Chart title="Berdasarkan kategori" data={group(list, 'category')} />
      </div>

      <section className="card">
        <h3>{editId ? 'Edit investasi' : 'Tambah investasi'}</h3>

        <form onSubmit={save} className="row">
          <input
            placeholder="Aset (VOO, BBCA, BTC)"
            value={form.symbol}
            onChange={(e) => setForm({ ...form, symbol: e.target.value })}
            required
          />

          <select
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
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

          <input
            type="number"
            min="1"
            step="any"
            placeholder="Nilai (Rp)"
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
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
                <th className="r">Nilai</th>
                <th className="r">Porsi</th>
                <th>Aksi</th>
              </tr>
            </thead>

            <tbody>
              {list.map((investment) => {
                const amount = Number(investment.amount || 0)

                return (
                  <tr key={investment.id}>
                    <td>
                      <b>{investment.symbol}</b>
                    </td>

                    <td>
                      <span className="pill">{investment.category}</span>
                    </td>

                    <td className="r">{rp(amount)}</td>

                    <td className="r muted">
                      {total ? ((amount / total) * 100).toFixed(1) : '0.0'}%
                    </td>

                    <td className="r">
                      <button
                        className="ghost"
                        onClick={() => startEdit(investment)}
                      >
                        Edit
                      </button>{' '}
                      <button
                        className="ghost danger"
                        onClick={() => del(investment.id)}
                      >
                        Hapus
                      </button>
                    </td>
                  </tr>
                )
              })}

              {!list.length && (
                <tr>
                  <td colSpan="5" className="muted">
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
