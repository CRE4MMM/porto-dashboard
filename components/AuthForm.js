'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function AuthForm({ mode }) {
  const reg = mode === 'register'
  const router = useRouter()
  const [f, setF] = useState({ name: '', email: '', password: '' })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setErr('')
    const res = await fetch(`/api/auth/${mode}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(f),
    })
    const d = await res.json()
    if (!res.ok) {
      setErr(d.error)
      setBusy(false)
      return
    }
    router.push('/dashboard')
    router.refresh()
  }

  return (
    <main className="auth">
      <form onSubmit={submit} className="card">
        <h1>{reg ? 'Buat akun' : 'Masuk'}</h1>
        {reg && (
          <input
            placeholder="Nama"
            value={f.name}
            onChange={(e) => setF({ ...f, name: e.target.value })}
            required
          />
        )}
        <input
          type="email"
          placeholder="Email"
          value={f.email}
          onChange={(e) => setF({ ...f, email: e.target.value })}
          required
        />
        <input
          type="password"
          placeholder="Password"
          value={f.password}
          onChange={(e) => setF({ ...f, password: e.target.value })}
          required
        />
        {err && <p className="err">{err}</p>}
        <button disabled={busy}>{reg ? 'Daftar' : 'Masuk'}</button>
        <p className="muted">
          {reg ? (
            <>
              Sudah punya akun? <Link href="/login">Masuk</Link>
            </>
          ) : (
            <>
              Belum punya akun? <Link href="/register">Daftar</Link>
            </>
          )}
        </p>
      </form>
    </main>
  )
}
