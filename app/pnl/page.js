'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ReferenceDot,
} from 'recharts'
import {
  rp,
  signed,
  pctFmt,
  tone,
  symKey,
  priceItems,
  buildRows,
  buildHistory,
  periodChanges,
  pnlChange,
  DAY_MS,
} from '../../lib/portfolio'

// ---------- Warna & gaya chart ----------
// Untung/rugi dibedakan juga lewat posisi (di atas/bawah garis nol), tanda +/−,
// dan kata "Untung"/"Rugi" di tooltip, jadi tidak bergantung pada warna saja.
const POS = '#0c6b61' // untung
const NEG = '#b42318' // rugi
const MODAL = '#64748b' // modal / pembanding (abu-abu)
const INK = '#142238'
const MUTED = '#64748b'
const GRID = '#e6ebf0'
const AXIS = '#b8c3cf'
const SURFACE = '#ffffff'

const TICK = { fontSize: 12, fill: MUTED }
const CURSOR_LINE = { stroke: AXIS, strokeWidth: 1 }
const CURSOR_BAND = { fill: 'rgba(20, 34, 56, 0.04)' }

const RANGES = [
  { id: '1mo', label: '1B', days: 30 },
  { id: '3mo', label: '3B', days: 90 },
  { id: '6mo', label: '6B', days: 180 },
  { id: '1y', label: '1T', days: 365 },
  { id: '5y', label: 'Semua', days: 1825 },
]

const MODES = [
  { id: 'week', label: 'Minggu' },
  { id: 'month', label: 'Bulan' },
]

const compactFmt = new Intl.NumberFormat('id-ID', {
  notation: 'compact',
  maximumFractionDigits: 1,
})

const compactRp = (n) => {
  const v = Number(n) || 0
  return (v < 0 ? '−' : '') + compactFmt.format(Math.abs(v))
}

// "+Rp 450 rb" / "−Rp 1,2 jt" untuk label di ujung bar
const signedShort = (n) => {
  const r = Math.round(n)
  return (r > 0 ? '+' : r < 0 ? '−' : '') + 'Rp ' + compactFmt.format(Math.abs(r))
}

const dayShort = new Intl.DateTimeFormat('id-ID', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
})

const dayLong = new Intl.DateTimeFormat('id-ID', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
})

const monthShort = new Intl.DateTimeFormat('id-ID', {
  month: 'short',
  year: '2-digit',
  timeZone: 'UTC',
})

const monthLong = new Intl.DateTimeFormat('id-ID', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
})

const verdict = (n) => {
  const r = Math.round(n)
  return r > 0 ? 'Untung' : r < 0 ? 'Rugi' : 'Impas'
}

const colorOf = (n) => (n >= 0 ? POS : NEG)

// Kurangi jumlah titik supaya grafik tetap ringan.
const thin = (items, max = 400) => {
  if (items.length <= max) return items

  const step = Math.ceil(items.length / max)
  const out = items.filter((_, index) => index % step === 0)
  const last = items[items.length - 1]

  if (out[out.length - 1] !== last) out.push(last)

  return out
}

// Posisi garis nol di gradien area (atas nol hijau, bawah nol merah).
const zeroOffset = (data, key) => {
  if (!data.length) return 0

  const values = data.map((item) => item[key])
  const max = Math.max(...values)
  const min = Math.min(...values)

  if (max <= 0) return 0
  if (min >= 0) return 1

  return max / (max - min)
}

// Untuk tabel: kalau titiknya banyak, tampilkan per minggu (terbaru di atas).
const sampleRows = (points) => {
  const rows = points.length > 90 ? points.filter((_, i) => (points.length - 1 - i) % 7 === 0) : points

  return { rows: [...rows].reverse(), sampled: points.length > 90 }
}

const send = (url, body) =>
  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

// ---------- Ringkasan kalimat di bawah judul chart ----------

const valueSummary = (points) => {
  if (!points.length) return ''

  const last = points[points.length - 1]

  return `Per ${dayLong.format(last.t)}: nilai ${rp(last.value)}, modal ${rp(last.cost)}. ${verdict(
    last.pnl
  )} ${rp(Math.abs(last.pnl))}.`
}

const trendSummary = (points) => {
  if (points.length < 2) return ''

  const first = points[0]
  const last = points[points.length - 1]
  const diff = last.pnl - first.pnl
  let high = first
  let low = first

  for (const p of points) {
    if (p.pnl > high.pnl) high = p
    if (p.pnl < low.pnl) low = p
  }

  const head =
    Math.round(diff) === 0
      ? 'PnL hampir tidak berubah'
      : `PnL ${diff > 0 ? 'naik' : 'turun'} ${rp(Math.abs(diff))}`

  return `${head} sejak ${dayShort.format(first.t)}. Tertinggi ${signed(high.pnl)} (${dayShort.format(
    high.t
  )}), terendah ${signed(low.pnl)} (${dayShort.format(low.t)}).`
}

const periodSummary = (periods, mode) => {
  if (periods.length < 2) return ''

  let best = periods[0]
  let worst = periods[0]

  for (const p of periods) {
    if (p.change > best.change) best = p
    if (p.change < worst.change) worst = p
  }

  const word = mode === 'week' ? 'Minggu' : 'Bulan'

  return `${word} terbaik: ${best.label} (${signed(best.change)}). ${word} terburuk: ${
    worst.label
  } (${signed(worst.change)}).`
}

const assetSummary = (sorted) => {
  if (!sorted.length) return ''

  const best = sorted[0]
  const worst = sorted[sorted.length - 1]
  const parts = []

  if (Math.round(best.pnl) > 0) {
    parts.push(`${best.symbol} paling untung (${signed(best.pnl)})`)
  }

  if (sorted.length > 1 && Math.round(worst.pnl) < 0) {
    parts.push(`${worst.symbol} paling rugi (${signed(worst.pnl)})`)
  }

  return parts.length ? parts.join(', ') + '.' : 'PnL semua aset masih nol.'
}

// ---------- Bar dengan ujung membulat ----------
// Pangkal bar (di garis nol) rata, hanya ujung data yang membulat 4px.
function roundedBarPath({ x, y, width, height, value, horizontal }) {
  const x0 = Math.min(x, x + width)
  const x1 = Math.max(x, x + width)
  const y0 = Math.min(y, y + height)
  const y1 = Math.max(y, y + height)
  const w = x1 - x0
  const h = y1 - y0

  if (!(w > 0) || !(h > 0)) return ''

  const positive = value >= 0

  if (horizontal) {
    const r = Math.min(4, w, h / 2)

    return positive
      ? `M${x0},${y0}H${x1 - r}Q${x1},${y0} ${x1},${y0 + r}V${y1 - r}Q${x1},${y1} ${x1 - r},${y1}H${x0}Z`
      : `M${x1},${y0}H${x0 + r}Q${x0},${y0} ${x0},${y0 + r}V${y1 - r}Q${x0},${y1} ${x0 + r},${y1}H${x1}Z`
  }

  const r = Math.min(4, w / 2, h)

  return positive
    ? `M${x0},${y1}V${y0 + r}Q${x0},${y0} ${x0 + r},${y0}H${x1 - r}Q${x1},${y0} ${x1},${y0 + r}V${y1}Z`
    : `M${x0},${y0}V${y1 - r}Q${x0},${y1} ${x0 + r},${y1}H${x1 - r}Q${x1},${y1} ${x1},${y1 - r}V${y0}Z`
}

function RoundedBar({ fill, fillOpacity, ...rest }) {
  const d = roundedBarPath(rest)

  return d ? <path d={d} fill={fill} fillOpacity={fillOpacity} /> : null
}

// Label nilai di ujung bar horizontal (kanan kalau untung, kiri kalau rugi).
function BarTipLabel({ x, y, width, height, value, index, data }) {
  const item = data[index]

  if (!item || ![x, y, width, height].every(Number.isFinite)) return null

  const x0 = Math.min(x, x + width)
  const x1 = Math.max(x, x + width)
  const positive = item.pnl >= 0

  return (
    <text
      x={positive ? x1 + 8 : x0 - 8}
      y={y + height / 2}
      dy="0.35em"
      textAnchor={positive ? 'start' : 'end'}
      fontSize="12"
      fontWeight="600"
      fill={INK}
    >
      {signedShort(item.pnl)}
    </text>
  )
}

// ---------- Tooltip ----------
// Nilai di depan (tebal), nama di belakang (kecil). Satu tooltip untuk semua seri.
function ChartTip({ active, payload, build }) {
  if (!active || !payload || !payload.length) return null

  const info = build(payload[0].payload)

  if (!info) return null

  return (
    <div className="tip">
      <div className="tip-title">{info.title}</div>

      {info.rows.map((row) => (
        <div className="tip-row" key={row.name}>
          <i className={`key ${row.shape}`} style={{ background: row.color }} />
          <b className="tip-val">{row.value}</b>
          <span className="tip-name">{row.name}</span>
        </div>
      ))}

      {info.note && <div className="tip-note">{info.note}</div>}
    </div>
  )
}

const valueTip = (d) => ({
  title: dayLong.format(d.t),
  rows: [
    { name: 'Nilai', value: rp(d.value), color: POS, shape: 'line' },
    { name: 'Modal', value: rp(d.cost), color: MODAL, shape: 'line' },
  ],
  note: `${verdict(d.pnl)} ${rp(Math.abs(d.pnl))} (${pctFmt(d.pct)})`,
})

const trendTip = (d) => ({
  title: dayLong.format(d.t),
  rows: [
    {
      name: verdict(d.pnl),
      value: `${signed(d.pnl)} (${pctFmt(d.pct)})`,
      color: colorOf(d.pnl),
      shape: 'line',
    },
  ],
  note: `Modal ${rp(d.cost)} · Nilai ${rp(d.value)}`,
})

const assetTip = (d) => ({
  title: d.symbol,
  rows: [
    {
      name: verdict(d.pnl),
      value: `${signed(d.pnl)}${d.pct !== null ? ` (${pctFmt(d.pct)})` : ''}`,
      color: colorOf(d.pnl),
      shape: 'rect',
    },
  ],
  note: `Modal ${rp(d.cost)} → Nilai ${rp(d.market)}`,
})

// ---------- Potongan tampilan ----------

function Segmented({ value, onChange, options, label }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          className={option.id === value ? 'on' : ''}
          aria-pressed={option.id === value}
          onClick={() => onChange(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

function Keys({ items }) {
  return (
    <ul className="keys">
      {items.map((item) => (
        <li key={item.label}>
          <i className={`key ${item.shape}`} style={{ background: item.color }} />
          {item.label}
        </li>
      ))}
    </ul>
  )
}

function DataTable({ columns, rows, note }) {
  return (
    <>
      <div className="table-scroll">
        <table className="pnl-table">
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.label} className={column.right ? 'r' : ''}>
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {rows.map((row, index) => (
              <tr key={index}>
                {columns.map((column) => (
                  <td key={column.label} className={column.right ? 'r' : ''}>
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {note && <p className="muted note">{note}</p>}
    </>
  )
}

// Kartu chart: judul + ringkasan kalimat, legenda, dan tombol tabel/grafik.
function ChartCard({ title, summary, keys, table, busy, children }) {
  const [asTable, setAsTable] = useState(false)

  return (
    <section className="card chart-card">
      <div className="chart-head">
        <div>
          <h3>{title}</h3>
          {summary && <p className="chart-sub">{summary}</p>}
        </div>

        <div className="chart-tools">
          {keys}

          {table && (
            <button
              type="button"
              className="link"
              onClick={() => setAsTable((previous) => !previous)}
            >
              {asTable ? 'Lihat grafik' : 'Lihat tabel'}
            </button>
          )}
        </div>
      </div>

      <div className={`chart-body${busy ? ' dim' : ''}`}>
        {asTable && table ? table : children}
      </div>
    </section>
  )
}

// ---------- Chart ----------

function ValueChart({ data }) {
  const last = data[data.length - 1]

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data} margin={{ top: 12, right: 16, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis
          dataKey="t"
          type="number"
          scale="time"
          domain={['dataMin', 'dataMax']}
          tickFormatter={(t) => dayShort.format(t)}
          minTickGap={56}
          tickLine={false}
          axisLine={{ stroke: AXIS }}
          tick={TICK}
        />
        <YAxis
          tickFormatter={compactRp}
          tickCount={5}
          width={56}
          tickLine={false}
          axisLine={false}
          tick={TICK}
          domain={['auto', 'auto']}
        />
        <Tooltip
          cursor={CURSOR_LINE}
          content={<ChartTip build={valueTip} />}
        />
        <Line
          type="stepAfter"
          dataKey="cost"
          name="Modal"
          stroke={MODAL}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          dot={false}
          activeDot={{ r: 4, fill: MODAL, stroke: SURFACE, strokeWidth: 2 }}
          isAnimationActive={false}
        />
        <Line
          type="monotone"
          dataKey="value"
          name="Nilai"
          stroke={POS}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          dot={false}
          activeDot={{ r: 5, fill: POS, stroke: SURFACE, strokeWidth: 2 }}
          isAnimationActive={false}
        />
        {last && (
          <ReferenceDot
            x={last.t}
            y={last.value}
            r={5}
            fill={POS}
            stroke={SURFACE}
            strokeWidth={2}
            ifOverflow="visible"
          />
        )}
      </LineChart>
    </ResponsiveContainer>
  )
}

function TrendChart({ data }) {
  const last = data[data.length - 1]
  const offset = zeroOffset(data, 'pnl')

  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={data} margin={{ top: 28, right: 56, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="pnlFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset={offset} stopColor={POS} stopOpacity={0.12} />
            <stop offset={offset} stopColor={NEG} stopOpacity={0.12} />
          </linearGradient>
          <linearGradient id="pnlStroke" x1="0" y1="0" x2="0" y2="1">
            <stop offset={offset} stopColor={POS} />
            <stop offset={offset} stopColor={NEG} />
          </linearGradient>
        </defs>

        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis
          dataKey="t"
          type="number"
          scale="time"
          domain={['dataMin', 'dataMax']}
          tickFormatter={(t) => dayShort.format(t)}
          minTickGap={56}
          tickLine={false}
          axisLine={false}
          tick={TICK}
        />
        <YAxis
          tickFormatter={compactRp}
          tickCount={5}
          width={56}
          tickLine={false}
          axisLine={false}
          tick={TICK}
        />
        <ReferenceLine y={0} stroke={AXIS} />
        <Tooltip
          cursor={CURSOR_LINE}
          content={<ChartTip build={trendTip} />}
        />
        <Area
          type="monotone"
          dataKey="pnl"
          stroke="url(#pnlStroke)"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="url(#pnlFill)"
          dot={false}
          activeDot={(props) => (
            <circle
              cx={props.cx}
              cy={props.cy}
              r={5}
              fill={colorOf(props.payload.pnl)}
              stroke={SURFACE}
              strokeWidth={2}
            />
          )}
          isAnimationActive={false}
        />
        {last && (
          <ReferenceDot
            x={last.t}
            y={last.pnl}
            r={5}
            fill={colorOf(last.pnl)}
            stroke={SURFACE}
            strokeWidth={2}
            ifOverflow="visible"
            label={{
              value: signedShort(last.pnl),
              position: 'top',
              fill: INK,
              fontSize: 12,
              fontWeight: 700,
            }}
          />
        )}
      </AreaChart>
    </ResponsiveContainer>
  )
}

function PeriodChart({ data, mode }) {
  const [hover, setHover] = useState(null)

  const tip = (d) => ({
    title:
      mode === 'week'
        ? `Minggu ${dayShort.format(d.t)} – ${dayShort.format(d.t + 6 * DAY_MS)}`
        : monthLong.format(d.t),
    rows: [
      {
        name: verdict(d.change),
        value: signed(d.change),
        color: colorOf(d.change),
        shape: 'rect',
      },
    ],
    note: `PnL di akhir periode ${signed(d.end)}`,
  })

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart
        data={data}
        margin={{ top: 12, right: 16, bottom: 0, left: 0 }}
        barCategoryGap="28%"
      >
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          minTickGap={14}
          tick={TICK}
        />
        <YAxis
          tickFormatter={compactRp}
          tickCount={5}
          width={56}
          tickLine={false}
          axisLine={false}
          tick={TICK}
        />
        <ReferenceLine y={0} stroke={AXIS} />
        <Tooltip cursor={CURSOR_BAND} content={<ChartTip build={tip} />} />
        <Bar
          dataKey="change"
          maxBarSize={24}
          shape={(props) => (
            <RoundedBar {...props} value={props.payload.change} />
          )}
          onMouseEnter={(_, index) => setHover(index)}
          onMouseLeave={() => setHover(null)}
          isAnimationActive={false}
        >
          {data.map((item, index) => (
            <Cell
              key={item.key}
              fill={colorOf(item.change)}
              fillOpacity={hover === null || hover === index ? 1 : 0.5}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

function AssetChart({ data }) {
  const [hover, setHover] = useState(null)

  // Lebar label nama aset menyesuaikan nama terpanjang (maks 140px).
  const labelWidth = Math.min(
    140,
    Math.max(56, Math.max(...data.map((item) => String(item.symbol).length)) * 9 + 12)
  )

  // Ruang di kiri/kanan bar untuk label nilai (px), hanya di sisi yang dipakai.
  const hasNegative = data.some((item) => item.pnl < 0)
  const hasPositive = data.some((item) => item.pnl > 0)

  return (
    <ResponsiveContainer width="100%" height={Math.max(150, data.length * 44 + 16)}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 4, right: 8, bottom: 4, left: 0 }}
        barCategoryGap="30%"
      >
        <XAxis
          type="number"
          hide
          domain={[(min) => (min < 0 ? min : 0), (max) => (max > 0 ? max : 1)]}
          padding={{ left: hasNegative ? 84 : 8, right: hasPositive ? 84 : 8 }}
        />
        <YAxis
          type="category"
          dataKey="symbol"
          width={labelWidth}
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 13, fontWeight: 600, fill: INK }}
        />
        <ReferenceLine x={0} stroke={AXIS} />
        <Tooltip cursor={CURSOR_BAND} content={<ChartTip build={assetTip} />} />
        <Bar
          dataKey="pnl"
          maxBarSize={20}
          shape={(props) => (
            <RoundedBar {...props} value={props.payload.pnl} horizontal />
          )}
          onMouseEnter={(_, index) => setHover(index)}
          onMouseLeave={() => setHover(null)}
          label={(props) => <BarTipLabel {...props} data={data} />}
          isAnimationActive={false}
        >
          {data.map((item, index) => (
            <Cell
              key={item.symbol}
              fill={colorOf(item.pnl)}
              fillOpacity={hover === null || hover === index ? 1 : 0.5}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

// ---------- Halaman ----------

export default function PnlPage() {
  const router = useRouter()

  const [list, setList] = useState([])
  const [rate, setRate] = useState(16000)
  const [prices, setPrices] = useState({})
  const [manual, setManual] = useState({})
  const [series, setSeries] = useState({})
  const [seriesRange, setSeriesRange] = useState('6mo')
  const [histErrors, setHistErrors] = useState({})
  const [histLoading, setHistLoading] = useState(false)
  const [range, setRange] = useState('6mo')
  const [mode, setMode] = useState('week')
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  // Data investasi dan kurs
  useEffect(() => {
    let alive = true

    async function init() {
      try {
        const [investments, rateResponse] = await Promise.all([
          fetch('/api/investments'),
          fetch('/api/rate'),
        ])

        if (investments.status === 401) {
          router.push('/login')
          return
        }

        if (!investments.ok) throw new Error('Gagal memuat investasi.')

        const data = await investments.json()

        if (!alive) return

        setList(data)

        if (rateResponse.ok) {
          const info = await rateResponse.json()

          if (alive) setRate(Number(info.usdRate))
        }
      } catch (error) {
        console.error('PnL load error:', error)

        if (alive) setErr('Gagal memuat data. Silakan coba lagi.')
      } finally {
        if (alive) setLoading(false)
      }
    }

    init()

    return () => {
      alive = false
    }
  }, [])

  // Harga manual yang diisi di dashboard (disimpan di browser ini)
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('manualPrices') || '{}')

      if (saved && typeof saved === 'object') setManual(saved)
    } catch {}
  }, [])

  const items = priceItems(list)
  const priceKey = items.map((item) => `${item.source}:${item.symbol}`).join(',')

  // Harga terkini
  useEffect(() => {
    if (!items.length) return

    let alive = true

    send('/api/prices', { items })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (alive && data) {
          setPrices((previous) => ({ ...previous, ...(data.prices || {}) }))
        }
      })
      .catch((error) => console.error('Price load error:', error))

    return () => {
      alive = false
    }
  }, [priceKey])

  // Riwayat harga untuk grafik. Selama memuat, grafik lama tetap tampil
  // (agak pudar) supaya layout tidak melompat.
  useEffect(() => {
    if (!items.length) {
      setSeries({})
      return
    }

    let alive = true

    setHistLoading(true)

    send('/api/history', { items, range })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        return response.json()
      })
      .then((data) => {
        if (!alive) return

        setSeries(data.series || {})
        setSeriesRange(data.range || range)
        setHistErrors(data.errors || {})
      })
      .catch((error) => {
        console.error('History load error:', error)

        if (alive) {
          setSeries({})
          setHistErrors({ _all: 'Gagal memuat data historis' })
        }
      })
      .finally(() => {
        if (alive) setHistLoading(false)
      })

    return () => {
      alive = false
    }
  }, [priceKey, range])

  const rows = useMemo(
    () => buildRows({ list, rate, prices, manual }),
    [list, rate, prices, manual]
  )

  // Dihitung dengan rentang milik data yang sudah dimuat (seriesRange),
  // bukan rentang yang baru dipilih, agar grafik tidak berubah setengah jalan.
  const history = useMemo(() => {
    const days = RANGES.find((item) => item.id === seriesRange)?.days || 180
    const now = Date.now()

    return buildHistory({
      rows,
      series,
      rate,
      startMs: now - days * DAY_MS,
      endMs: now,
    })
  }, [rows, series, rate, seriesRange])

  // ----- Ringkasan PnL saat ini (dari harga terkini) -----
  const priced = rows.filter((row) => row.market !== null)
  const pricedCost = priced.reduce((sum, row) => sum + row.cost, 0)
  const pricedValue = priced.reduce((sum, row) => sum + row.market, 0)
  const pnlTotal = pricedValue - pricedCost
  const pnlPct = pricedCost > 0 ? (pnlTotal / pricedCost) * 100 : null

  // ----- PnL per aset (baris dengan simbol sama digabung) -----
  const assets = useMemo(() => {
    const bySymbol = new Map()

    for (const row of rows) {
      const key = symKey(row.symbol)

      if (!bySymbol.has(key)) {
        bySymbol.set(key, { symbol: row.symbol, category: row.category, rows: [] })
      }

      bySymbol.get(key).rows.push(row)
    }

    return [...bySymbol.values()].map((asset) => {
      const ok = asset.rows.filter((row) => row.market !== null)
      const cost = ok.reduce((sum, row) => sum + row.cost, 0)
      const market = ok.reduce((sum, row) => sum + row.market, 0)

      return {
        symbol: asset.symbol,
        category: asset.category,
        priced: ok.length > 0,
        cost,
        market,
        pnl: market - cost,
        pct: cost > 0 ? ((market - cost) / cost) * 100 : null,
      }
    })
  }, [rows])

  const pricedAssets = assets.filter((asset) => asset.priced)
  const sortedAssets = [...pricedAssets].sort((a, b) => b.pnl - a.pnl)
  const best = sortedAssets[0]
  const worst = sortedAssets.length > 1 ? sortedAssets[sortedAssets.length - 1] : null

  // ----- Data grafik -----
  const points = history.points
  const chartData = thin(points)
  const periods = periodChanges(points, mode)
    .slice(mode === 'week' ? -26 : -24)
    .map((item) => ({
      ...item,
      label:
        mode === 'week' ? dayShort.format(item.t) : monthShort.format(item.t),
    }))

  const change7 = pnlChange(points, 7)
  const change30 = pnlChange(points, 30)

  const noDates = list.length > 0 && list.every((item) => !item.createdAt)
  const failedSymbols = Object.keys(histErrors).filter((key) => key !== '_all')
  const histFailed = histErrors._all || failedSymbols.length > 0

  const busy = histLoading && points.length > 0
  const sampled = sampleRows(points)

  // Tempat kosong dengan tinggi tetap, supaya halaman tidak melompat.
  const placeholder = (text) => <div className="chart-empty">{text}</div>

  const chartOr = (node) => {
    if (loading || (histLoading && !points.length)) {
      return placeholder('Memuat grafik...')
    }

    if (!points.length) {
      return placeholder(
        histErrors._all
          ? 'Data historis belum bisa dimuat. Coba muat ulang halaman.'
          : 'Belum ada data historis untuk rentang ini.'
      )
    }

    return node
  }

  const hasPoints = points.length > 0

  return (
    <main className="wrap">
      <header>
        <div>
          <h1>Profit &amp; loss</h1>

          <p className={`total ${priced.length ? tone(pnlTotal) : ''}`}>
            {priced.length ? signed(pnlTotal) : '—'}
          </p>

          {pnlPct !== null && (
            <p className="pnl">
              <span className={tone(pnlTotal)}>{pctFmt(pnlPct)}</span>
              <span className="muted">
                {' '}
                · Modal {rp(pricedCost)} · Nilai {rp(pricedValue)}
              </span>
            </p>
          )}
        </div>

        <div className="header-actions">
          <Link href="/dashboard" className="btn-link">
            ← Dashboard
          </Link>
        </div>
      </header>

      {err && <p className="err">{err}</p>}

      {!loading && !list.length && !err && (
        <section className="card">
          <p className="muted empty">
            Belum ada investasi. Tambahkan dulu di{' '}
            <Link href="/dashboard">dashboard</Link>.
          </p>
        </section>
      )}

      {list.length > 0 && (
        <>
          <section className="stats">
            <div className="stat">
              <span>PnL 7 hari</span>
              <b className={change7 === null ? 'muted' : tone(change7)}>
                {change7 === null ? '—' : signed(change7)}
              </b>
              <small>
                {change7 === null ? 'Riwayat belum cukup' : 'Dibanding 7 hari lalu'}
              </small>
            </div>

            <div className="stat">
              <span>PnL 30 hari</span>
              <b className={change30 === null ? 'muted' : tone(change30)}>
                {change30 === null ? '—' : signed(change30)}
              </b>
              <small>
                {change30 === null
                  ? 'Pilih rentang 3B atau lebih'
                  : 'Dibanding 30 hari lalu'}
              </small>
            </div>

            <div className="stat">
              <span>Aset terbaik</span>
              <b className={best ? tone(best.pnl) : 'muted'}>
                {best ? best.symbol : '—'}
              </b>
              <small>
                {best
                  ? `${signed(best.pnl)}${
                      best.pct !== null ? ` (${pctFmt(best.pct)})` : ''
                    }`
                  : 'Belum ada harga'}
              </small>
            </div>

            <div className="stat">
              <span>Aset terburuk</span>
              <b className={worst ? tone(worst.pnl) : 'muted'}>
                {worst ? worst.symbol : '—'}
              </b>
              <small>
                {worst
                  ? `${signed(worst.pnl)}${
                      worst.pct !== null ? ` (${pctFmt(worst.pct)})` : ''
                    }`
                  : 'Perlu minimal 2 aset'}
              </small>
            </div>
          </section>

          {/* Satu baris filter di atas semua grafik */}
          <div className="toolbar">
            <div className="toolbar-group">
              <span className="toolbar-label">Rentang</span>
              <Segmented
                label="Rentang waktu"
                value={range}
                onChange={setRange}
                options={RANGES}
              />
            </div>

            <div className="toolbar-group">
              <span className="toolbar-label">Batang per</span>
              <Segmented
                label="Periode batang"
                value={mode}
                onChange={setMode}
                options={MODES}
              />
            </div>
          </div>

          <ChartCard
            title="Nilai vs modal"
            summary={valueSummary(points)}
            busy={busy}
            keys={
              hasPoints && (
                <Keys
                  items={[
                    { label: 'Nilai', color: POS, shape: 'line' },
                    { label: 'Modal', color: MODAL, shape: 'line' },
                  ]}
                />
              )
            }
            table={
              hasPoints && (
                <DataTable
                  columns={[
                    { label: 'Tanggal', render: (p) => dayLong.format(p.t) },
                    { label: 'Nilai', right: true, render: (p) => rp(p.value) },
                    { label: 'Modal', right: true, render: (p) => rp(p.cost) },
                    {
                      label: 'PnL',
                      right: true,
                      render: (p) => (
                        <span className={tone(p.pnl)}>{signed(p.pnl)}</span>
                      ),
                    },
                  ]}
                  rows={sampled.rows}
                  note={sampled.sampled ? 'Ditampilkan per minggu.' : null}
                />
              )
            }
          >
            {chartOr(<ValueChart data={chartData} />)}
          </ChartCard>

          <ChartCard
            title="PnL dari waktu ke waktu"
            summary={trendSummary(points)}
            busy={busy}
            table={
              hasPoints && (
                <DataTable
                  columns={[
                    { label: 'Tanggal', render: (p) => dayLong.format(p.t) },
                    {
                      label: 'PnL',
                      right: true,
                      render: (p) => (
                        <span className={tone(p.pnl)}>{signed(p.pnl)}</span>
                      ),
                    },
                    {
                      label: 'Persen',
                      right: true,
                      render: (p) => (
                        <span className={tone(p.pnl)}>{pctFmt(p.pct)}</span>
                      ),
                    },
                  ]}
                  rows={sampled.rows}
                  note={sampled.sampled ? 'Ditampilkan per minggu.' : null}
                />
              )
            }
          >
            {chartOr(<TrendChart data={chartData} />)}
          </ChartCard>

          <ChartCard
            title={
              mode === 'week'
                ? 'Perubahan PnL per minggu'
                : 'Perubahan PnL per bulan'
            }
            summary={periodSummary(periods, mode)}
            busy={busy}
            keys={
              hasPoints && (
                <Keys
                  items={[
                    { label: 'Untung', color: POS, shape: 'rect' },
                    { label: 'Rugi', color: NEG, shape: 'rect' },
                  ]}
                />
              )
            }
            table={
              hasPoints && (
                <DataTable
                  columns={[
                    {
                      label: mode === 'week' ? 'Minggu mulai' : 'Bulan',
                      render: (p) => p.label,
                    },
                    {
                      label: 'Perubahan',
                      right: true,
                      render: (p) => (
                        <span className={tone(p.change)}>{signed(p.change)}</span>
                      ),
                    },
                    {
                      label: 'PnL akhir',
                      right: true,
                      render: (p) => signed(p.end),
                    },
                  ]}
                  rows={[...periods].reverse()}
                />
              )
            }
          >
            {chartOr(<PeriodChart data={periods} mode={mode} />)}
          </ChartCard>

          <section className="card chart-card">
            <div className="chart-head">
              <div>
                <h3>PnL per aset</h3>
                {assetSummary(sortedAssets) && (
                  <p className="chart-sub">{assetSummary(sortedAssets)}</p>
                )}
              </div>

              {sortedAssets.length > 0 && (
                <div className="chart-tools">
                  <Keys
                    items={[
                      { label: 'Untung', color: POS, shape: 'rect' },
                      { label: 'Rugi', color: NEG, shape: 'rect' },
                    ]}
                  />
                </div>
              )}
            </div>

            {sortedAssets.length ? (
              <AssetChart data={sortedAssets} />
            ) : (
              <div className="chart-empty">Belum ada aset yang punya harga.</div>
            )}

            <div className="table-scroll">
              <table className="pnl-table">
                <thead>
                  <tr>
                    <th>Aset</th>
                    <th>Kategori</th>
                    <th className="r">Modal</th>
                    <th className="r">Nilai</th>
                    <th className="r">PnL</th>
                  </tr>
                </thead>

                <tbody>
                  {assets.map((asset) => (
                    <tr key={asset.symbol}>
                      <td>
                        <b>{asset.symbol}</b>
                      </td>

                      <td>
                        <span className="pill">{asset.category}</span>
                      </td>

                      {asset.priced ? (
                        <>
                          <td className="r">{rp(asset.cost)}</td>
                          <td className="r">{rp(asset.market)}</td>
                          <td className="r">
                            <span className={tone(asset.pnl)}>
                              {signed(asset.pnl)}
                            </span>

                            {asset.pct !== null && (
                              <small className={`sub ${tone(asset.pnl)}`}>
                                {pctFmt(asset.pct)}
                              </small>
                            )}
                          </td>
                        </>
                      ) : (
                        <td className="r muted" colSpan="3">
                          Harga belum tersedia
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {histFailed && (
            <p className="err">
              Sebagian riwayat harga gagal dimuat
              {failedSymbols.length > 0 && ` (${failedSymbols.join(', ')})`}
              . Aset itu tidak ikut dihitung di grafik.
            </p>
          )}

          {noDates && (
            <p className="err">
              Tanggal investasi tidak ikut dikirim oleh /api/investments, jadi
              grafik menganggap semua investasi sudah dimiliki sejak awal
              rentang.
            </p>
          )}

          {history.missing.length > 0 && hasPoints && !histLoading && (
            <p className="muted note">
              {history.missing.length} investasi tidak punya data historis dan
              tidak ikut di grafik waktu (tetap dihitung di ringkasan dan PnL
              per aset).
            </p>
          )}

          <p className="muted note">
            Grafik dihitung dari harga penutupan harian dengan anggapan setiap
            investasi dimiliki sejak tanggal dibuat, dengan jumlah dan modal
            seperti sekarang. Jadi kalau Anda mengubah jumlah atau modal di
            investasi lama, riwayatnya ikut berubah. Untuk pembelian baru,
            tambahkan sebagai investasi baru. Kurs USD/IDR memakai kurs hari
            ini. Emas memakai harga spot internasional, dan riwayat crypto
            dibatasi 1 tahun.
          </p>
        </>
      )}
    </main>
  )
}