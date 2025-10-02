import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'GitLab CI/CD Enterprise Dashboard',
  description: 'Advanced GitLab CI/CD monitoring and management dashboard',
  manifest: '/manifest.json',
  themeColor: '#FC6D26',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'GitLab Dashboard',
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/icon-192x192.png', type: 'image/png', sizes: '192x192' },
      { url: '/icon-512x512.png', type: 'image/png', sizes: '512x512' },
    ],
    apple: [
      { url: '/icon-192x192.png', sizes: '192x192', type: 'image/png' },
    ],
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5, user-scalable=yes" />
      </head>
      <body>{children}</body>
    </html>
  )
}
