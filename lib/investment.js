export function parse(b) {
  const symbol = (b.symbol || '').trim().toUpperCase()
  const category = (b.category || '').trim()
  const currency = b.currency === 'USD' ? 'USD' : 'IDR'
  const quantity = Number(b.quantity)
  const buyPrice = Number(b.buyPrice)
  const currentPrice = Number(b.currentPrice)
  if (!symbol || !category || b.buyPrice === '' || b.currentPrice === '')
    return null
  if (!(quantity > 0) || !(buyPrice >= 0) || !(currentPrice >= 0)) return null
  return { symbol, category, currency, quantity, buyPrice, currentPrice }
}

export const toJson = (r) => ({
  ...r,
  quantity: Number(r.quantity),
  buyPrice: Number(r.buyPrice),
  currentPrice: Number(r.currentPrice),
})
