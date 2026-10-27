const { loadEnvConfig } = require('@next/env')

loadEnvConfig(process.cwd())

const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  const result = await prisma.$queryRaw`SELECT 1 AS connected`
  console.log('Koneksi database berhasil:', result)
}

main()
  .catch((error) => {
    console.error('Koneksi database gagal:', error.message)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
