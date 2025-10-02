import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'GitLab CI/CD Enterprise Dashboard',
  description: 'Advanced GitLab CI/CD monitoring and management dashboard',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark">
      <body>{children}</body>
    </html>
  )
}
