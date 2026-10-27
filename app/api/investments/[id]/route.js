import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getUserId } from '@/lib/auth'

export async function PUT(req, { params }) {
  const uid = await getUserId()
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { symbol, category, amount } = await req.json()
  if (!symbol?.trim() || !category?.trim() || !(Number(amount) > 0))
    return NextResponse.json({ error: 'Data tidak valid' }, { status: 400 })
  const r = await prisma.investment.updateMany({
    where: { id: Number(params.id), userId: uid },
    data: {
      symbol: symbol.trim().toUpperCase(),
      category: category.trim(),
      amount: Number(amount),
    },
  })
  return r.count
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ error: 'Tidak ditemukan' }, { status: 404 })
}

export async function DELETE(_req, { params }) {
  const uid = await getUserId()
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  await prisma.investment.deleteMany({
    where: { id: Number(params.id), userId: uid },
  })
  return NextResponse.json({ ok: true })
}
