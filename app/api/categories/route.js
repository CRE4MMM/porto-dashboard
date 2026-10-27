import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getUserId } from '@/lib/auth'

export async function GET() {
  const uid = await getUserId()
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json(
    await prisma.category.findMany({
      where: { userId: uid },
      orderBy: { name: 'asc' },
    })
  )
}

export async function POST(req) {
  const uid = await getUserId()
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const name = ((await req.json()).name || '').trim()
  if (!name || name.length > 30)
    return NextResponse.json(
      { error: 'Nama kategori harus 1-30 karakter' },
      { status: 400 }
    )
  try {
    return NextResponse.json(
      await prisma.category.create({ data: { userId: uid, name } })
    )
  } catch (e) {
    if (e.code === 'P2002')
      return NextResponse.json({ error: 'Kategori sudah ada' }, { status: 409 })
    throw e
  }
}
