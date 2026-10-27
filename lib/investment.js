export function parse(b) {
  const symbol = (b.symbol || '').trim().toUpperCase()
  const category = (b.category || '').trim()
  const currency = b.currency === 'USD' ? 'USD' : 'IDR'
  const lots = Number(b.lots)
  const amount = Number(b.amount)

  if (!symbol || !category || b.lots === '' || b.amount === '') return null
  if (!(lots > 0) || !(amount >= 0)) return null

  return { symbol, category, currency, lots, amount }
}

export const toJson = (r) => ({
  ...r,
  lots: Number(r.lots),
  amount: Number(r.amount),
})
