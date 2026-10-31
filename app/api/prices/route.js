// Harga terkini untuk dashboard.
//   idx    -> Yahoo Finance, ticker "<KODE>.JK" (harga per saham, IDR)
//   us     -> Yahoo Finance, ticker apa adanya (harga per lembar, USD)
//   gold   -> Yahoo Finance "GC=F" (spot internasional), dikonversi ke USD per gram
//   crypto -> CoinGecko (USD per coin)
//
// Catatan: Yahoo Finance dan CoinGecko adalah sumber gratis tanpa jaminan,
// jadi harga bisa tertunda atau sesekali gagal dimuat.

export const dynamic = 'force-dynamic'

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0 Safari/537.36'

const TROY_OUNCE_GRAMS = 31.1034768
const TTL_MS = 60_000
const MAX_ITEMS = 50

const SOURCES = new Set(['idx', 'us', 'gold', 'crypto'])
const SYMBOL_RE = /^[A-Za-z0-9.\-=^]{1,30}$/

// Simbol umum -> id CoinGecko. Simbol lain dicoba sebagai id (huruf kecil),
// misalnya "HYPERLIQUID" -> "hyperliquid".
const CRYPTO_IDS = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  SOL: 'solana',
  BNB: 'binancecoin',
  XRP: 'ripple',
  ADA: 'cardano',
  DOGE: 'dogecoin',
  TON: 'the-open-network',
  AVAX: 'avalanche-2',
  DOT: 'polkadot',
  LINK: 'chainlink',
  LTC: 'litecoin',
  TRX: 'tron',
  MATIC: 'matic-network',
  HYPE: 'hyperliquid',
  USDT: 'tether',
  USDC: 'usd-coin',
}

const cache = new Map()

async function cached(key, loader) {
  const hit = cache.get(key)

  if (hit && Date.now() - hit.at < TTL_MS) return hit.value

  const value = await loader()
  cache.set(key, { at: Date.now(), value })
  return value
}

async function getJson(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
    cache: 'no-store',
    signal: AbortSignal.timeout(8000),
  })

  if (!res.ok) throw new Error(`HTTP ${res.status}`)

  return res.json()
}

function yahoo(ticker) {
  return cached(`yahoo:${ticker}`, async () => {
    const json = await getJson(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
        ticker
      )}?interval=1d&range=1d`
    )

    const meta = json?.chart?.result?.[0]?.meta
    const price = Number(meta?.regularMarketPrice)

    if (!Number.isFinite(price) || price <= 0) {
      throw new Error('Harga tidak ditemukan')
    }

    return { price, currency: meta.currency || 'USD' }
  })
}

async function gold() {
  const { price } = await yahoo('GC=F')
  return { price: price / TROY_OUNCE_GRAMS, currency: 'USD' }
}

function coingeckoId(symbol) {
  const upper = symbol.toUpperCase()
  return CRYPTO_IDS[upper] || symbol.toLowerCase()
}

function coingecko(ids) {
  const key = [...ids].sort().join(',')

  return cached(`cg:${key}`, async () => {
    const json = await getJson(
      `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(
        key
      )}&vs_currencies=usd`
    )

    return json || {}
  })
}

export async function POST(request) {
  const body = await request.json().catch(() => null)
  const items = Array.isArray(body?.items) ? body.items.slice(0, MAX_ITEMS) : []

  const prices = {}
  const errors = {}

  const wanted = []

  for (const item of items) {
    const symbol = String(item?.symbol || '').trim()
    const source = String(item?.source || '')

    if (!SYMBOL_RE.test(symbol) || !SOURCES.has(source)) continue

    wanted.push({ symbol, source, key: symbol.toUpperCase() })
  }

  const cryptoItems = wanted.filter((item) => item.source === 'crypto')
  let cryptoData = null
  let cryptoError = null

  if (cryptoItems.length) {
    try {
      cryptoData = await coingecko(
        new Set(cryptoItems.map((item) => coingeckoId(item.symbol)))
      )
    } catch (error) {
      cryptoError = error.message
    }
  }

  await Promise.all(
    wanted.map(async ({ symbol, source, key }) => {
      try {
        if (source === 'crypto') {
          if (cryptoError) throw new Error(cryptoError)

          const price = Number(cryptoData?.[coingeckoId(symbol)]?.usd)

          if (!Number.isFinite(price) || price <= 0) {
            throw new Error('Koin tidak ditemukan')
          }

          prices[key] = { price, currency: 'USD' }
          return
        }

        if (source === 'gold') {
          prices[key] = await gold()
          return
        }

        const ticker = source === 'idx' ? `${key.replace(/\.JK$/, '')}.JK` : key

        prices[key] = await yahoo(ticker)
      } catch (error) {
        errors[key] = error.message || 'Gagal memuat harga'
      }
    })
  )

  return Response.json({ prices, errors, at: new Date().toISOString() })
}
