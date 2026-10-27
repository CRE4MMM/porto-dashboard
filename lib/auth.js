import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'

const key = () => new TextEncoder().encode(process.env.JWT_SECRET)

export async function createSession(uid) {
  const token = await new SignJWT({ uid })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('7d')
    .sign(key())
  cookies().set('session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  })
}

export async function getUserId() {
  const t = cookies().get('session')?.value
  if (!t) return null
  try {
    return (await jwtVerify(t, key())).payload.uid
  } catch {
    return null
  }
}
