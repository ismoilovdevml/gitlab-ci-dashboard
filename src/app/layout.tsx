import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'GitLab CI/CD Dashboard',
  description: 'Modern, real-time dashboard for monitoring and managing GitLab CI/CD pipelines',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'GitLab CI/CD Dashboard',
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: '/gitlab-logo-500-rgb.png', type: 'image/png', sizes: '32x32' },
      { url: '/gitlab-logo-500-rgb.png', type: 'image/png', sizes: '192x192' },
      { url: '/gitlab-logo-500-rgb.png', type: 'image/png', sizes: '512x512' },
      { url: '/favicon.svg', type: 'image/svg+xml' },
    ],
    apple: [
      { url: '/gitlab-logo-500-rgb.png', sizes: '180x180', type: 'image/png' },
    ],
    shortcut: '/gitlab-logo-500-rgb.png',
  },
}

export const viewport: Viewport = {
  themeColor: '#FC6D26',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  )
}
