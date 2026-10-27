import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getUserId } from '@/lib/auth'

export async function DELETE(_req, { params }) {
  const uid = await getUserId()
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const c = await prisma.category.findFirst({
    where: { id: Number(params.id), userId: uid },
  })
  if (!c)
    return NextResponse.json({ error: 'Tidak ditemukan' }, { status: 404 })
  const used = await prisma.investment.count({
    where: { userId: uid, category: c.name },
  })
  if (used)
    return NextResponse.json(
      {
        error: `Kategori "${c.name}" masih dipakai ${used} investasi. Ubah atau hapus investasinya dulu.`,
      },
      { status: 409 }
    )
  await prisma.category.delete({ where: { id: c.id } })
  return NextResponse.json({ ok: true })
}
