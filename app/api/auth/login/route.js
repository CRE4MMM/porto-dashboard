import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { createSession } from '@/lib/auth'

export async function POST(req) {
  const { email, password } = await req.json()
  const u = await prisma.user.findUnique({
    where: { email: (email || '').toLowerCase().trim() },
  })
  if (!u || !(await bcrypt.compare(password || '', u.password)))
    return NextResponse.json(
      { error: 'Email atau password salah' },
      { status: 401 }
    )
  await createSession(u.id)
  return NextResponse.json({ ok: true })
}
