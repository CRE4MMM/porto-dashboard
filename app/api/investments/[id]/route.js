import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getUserId } from '@/lib/auth'
import { parse } from '@/lib/investment'

export async function PUT(req, { params }) {
  const uid = await getUserId()
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const d = parse(await req.json())
  if (!d)
    return NextResponse.json({ error: 'Data tidak valid' }, { status: 400 })
  const r = await prisma.investment.updateMany({
    where: { id: Number(params.id), userId: uid },
    data: d,
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
