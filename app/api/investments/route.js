import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getUserId } from '@/lib/auth'

export async function GET() {
  const uid = await getUserId()
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const rows = await prisma.investment.findMany({
    where: { userId: uid },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json(
    rows.map((r) => ({ ...r, amount: Number(r.amount) }))
  )
}

export async function POST(req) {
  const uid = await getUserId()
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { symbol, category, amount } = await req.json()
  if (!symbol?.trim() || !category?.trim() || !(Number(amount) > 0))
    return NextResponse.json({ error: 'Data tidak valid' }, { status: 400 })
  const r = await prisma.investment.create({
    data: {
      userId: uid,
      symbol: symbol.trim().toUpperCase(),
      category: category.trim(),
      amount: Number(amount),
    },
  })
  return NextResponse.json({ ...r, amount: Number(r.amount) })
}
