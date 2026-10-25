import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'PlayTube — Search and Play Music Online',
  description:
    'Search YouTube songs, discover full-length music, and play videos in a focused music dashboard built for everyday listening and practice.',
  keywords: [
    'search songs online',
    'YouTube music search',
    'play songs online',
    'full song player',
    'music practice dashboard',
    'PlayTube',
  ],
  applicationName: 'PlayTube',
  category: 'music',
  creator: 'PlayTube',
  publisher: 'PlayTube',
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    siteName: 'PlayTube',
    title: 'PlayTube — Search and Play Music Online',
    description:
      'Search YouTube songs, discover full-length music, and play videos in one focused music dashboard.',
  },
  twitter: {
    card: 'summary',
    title: 'PlayTube — Search and Play Music Online',
    description:
      'Search YouTube songs and play full-length music in one focused dashboard.',
  },
  generator: 'v0.app',
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/apple-icon.png',
  },
}

export const viewport: Viewport = {
  colorScheme: 'light dark',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: 'white' },
    { media: '(prefers-color-scheme: dark)', color: 'black' },
  ],
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
