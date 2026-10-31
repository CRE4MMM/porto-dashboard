// Riwayat harga harian untuk grafik PnL.
//   idx    -> Yahoo Finance "<KODE>.JK" (IDR per saham)
//   us     -> Yahoo Finance (USD per lembar)
//   gold   -> Yahoo Finance "GC=F" (spot internasional), dikonversi ke USD per gram
//   crypto -> CoinGecko (USD per coin)
//
// Respons: { series: { SIMBOL: { currency, points: [[ms, harga], ...] } }, errors }
//
// Catatan: CoinGecko versi gratis hanya memberi riwayat maksimal 365 hari,
// jadi grafik crypto untuk rentang "Semua" dibatasi 1 tahun.

export const dynamic = 'force-dynamic'

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0 Safari/537.36'

const TROY_OUNCE_GRAMS = 31.1034768
const TTL_MS = 10 * 60_000
const MAX_ITEMS = 50

const SOURCES = new Set(['idx', 'us', 'gold', 'crypto'])
const SYMBOL_RE = /^[A-Za-z0-9.\-=^]{1,30}$/

// rentang Yahoo -> jumlah hari untuk CoinGecko (maks 365 di paket gratis)
const RANGES = { '1mo': 30, '3mo': 90, '6mo': 180, '1y': 365, '5y': 365 }

// Samakan dengan CRYPTO_IDS di app/api/prices/route.js.
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
    signal: AbortSignal.timeout(10000),
  })

  if (!res.ok) throw new Error(`HTTP ${res.status}`)

  return res.json()
}

function yahooHistory(ticker, range) {
  return cached(`yh:${ticker}:${range}`, async () => {
    const json = await getJson(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
        ticker
      )}?interval=1d&range=${range}`
    )

    const result = json?.chart?.result?.[0]
    const stamps = result?.timestamp
    const closes = result?.indicators?.quote?.[0]?.close

    if (!Array.isArray(stamps) || !Array.isArray(closes)) {
      throw new Error('Data historis tidak ditemukan')
    }

    const points = []

    for (let i = 0; i < stamps.length; i++) {
      const close = Number(closes[i])

      if (Number.isFinite(close) && close > 0) {
        points.push([stamps[i] * 1000, close])
      }
    }

    if (!points.length) throw new Error('Data historis kosong')

    return { currency: result.meta?.currency || 'USD', points }
  })
}

async function goldHistory(range) {
  const { points } = await yahooHistory('GC=F', range)

  return {
    currency: 'USD',
    points: points.map(([t, price]) => [t, price / TROY_OUNCE_GRAMS]),
  }
}

function coingeckoId(symbol) {
  return CRYPTO_IDS[symbol.toUpperCase()] || symbol.toLowerCase()
}

function cryptoHistory(symbol, days) {
  const id = coingeckoId(symbol)

  return cached(`cg:${id}:${days}`, async () => {
    const json = await getJson(
      `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(
        id
      )}/market_chart?vs_currency=usd&days=${days}&interval=daily`
    )

    const points = (json?.prices || [])
      .map(([t, price]) => [Number(t), Number(price)])
      .filter(([t, price]) => Number.isFinite(t) && price > 0)

    if (!points.length) throw new Error('Koin tidak ditemukan')

    return { currency: 'USD', points }
  })
}

export async function POST(request) {
  const body = await request.json().catch(() => null)
  const items = Array.isArray(body?.items) ? body.items.slice(0, MAX_ITEMS) : []
  const range = Object.hasOwn(RANGES, body?.range) ? body.range : '6mo'
  const days = RANGES[range]

  const series = {}
  const errors = {}

  await Promise.all(
    items.map(async (item) => {
      const symbol = String(item?.symbol || '').trim()
      const source = String(item?.source || '')

      if (!SYMBOL_RE.test(symbol) || !SOURCES.has(source)) return

      const key = symbol.toUpperCase()

      try {
        if (source === 'crypto') series[key] = await cryptoHistory(symbol, days)
        else if (source === 'gold') series[key] = await goldHistory(range)
        else {
          const ticker =
            source === 'idx' ? `${key.replace(/\.JK$/, '')}.JK` : key

          series[key] = await yahooHistory(ticker, range)
        }
      } catch (error) {
        errors[key] = error.message || 'Gagal memuat riwayat harga'
      }
    })
  )

  return Response.json({ range, series, errors })
}
