import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getUserId } from '@/lib/auth'

export async function GET() {
  const uid = await getUserId()
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const u = await prisma.user.findUnique({
    where: { id: uid },
    select: { usdRate: true },
  })
  return NextResponse.json({ usdRate: Number(u?.usdRate ?? 16000) })
}

export async function PUT(req) {
  const uid = await getUserId()
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const usdRate = Number((await req.json()).usdRate)
  if (!(usdRate > 0))
    return NextResponse.json({ error: 'Kurs tidak valid' }, { status: 400 })
  await prisma.user.update({ where: { id: uid }, data: { usdRate } })
  return NextResponse.json({ ok: true })
}
