import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getUserId } from '@/lib/auth'
import { parse, toJson } from '@/lib/investment'

export async function GET() {
  const uid = await getUserId()
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const rows = await prisma.investment.findMany({
    where: { userId: uid },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json(rows.map(toJson))
}

export async function POST(req) {
  const uid = await getUserId()
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const d = parse(await req.json())
  if (!d)
    return NextResponse.json({ error: 'Data tidak valid' }, { status: 400 })
  const r = await prisma.investment.create({
    data: { userId: uid, ...d },
  })
  return NextResponse.json(toJson(r))
}
