import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getUserId } from '@/lib/auth'

export async function GET() {
  const uid = await getUserId()
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const res = await fetch(
      'https://api.frankfurter.dev/v1/latest?base=USD&symbols=IDR',
      { next: { revalidate: 3600 }, signal: AbortSignal.timeout(5000) }
    )
    if (!res.ok) throw new Error('Kurs HTTP ' + res.status)

    const data = await res.json()
    const usdRate = Number(data.rates?.IDR)
    if (!(usdRate > 0)) throw new Error('Kurs kosong')

    await prisma.user.update({ where: { id: uid }, data: { usdRate } })
    return NextResponse.json({ usdRate, date: data.date, stale: false })
  } catch (error) {
    console.error('Rate fetch error:', error)
    const u = await prisma.user.findUnique({
      where: { id: uid },
      select: { usdRate: true },
    })
    return NextResponse.json({
      usdRate: Number(u?.usdRate ?? 16000),
      date: null,
      stale: true,
    })
  }
}
