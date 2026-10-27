import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { createSession } from '@/lib/auth'

export async function POST(req) {
  try {
    const { name, email, password } = await req.json()

    if (!name?.trim() || !email?.trim() || !password || password.length < 6) {
      return NextResponse.json(
        { error: 'Data tidak valid (password minimal 6 karakter)' },
        { status: 400 }
      )
    }

    const e = email.toLowerCase().trim()

    const existingUser = await prisma.user.findUnique({
      where: { email: e },
    })

    if (existingUser) {
      return NextResponse.json(
        { error: 'Email sudah terdaftar' },
        { status: 409 }
      )
    }

    const user = await prisma.user.create({
      data: {
        name: name.trim(),
        email: e,
        password: await bcrypt.hash(password, 10),
      },
    })

    await createSession(user.id)

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Register error:', error)

    return NextResponse.json(
      { error: 'Registrasi gagal. Silakan coba lagi.' },
      { status: 500 }
    )
  }
}
