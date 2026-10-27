import './globals.css'
export const metadata = { title: 'Portfolio Tracker' }
export default function RootLayout({ children }) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  )
}
