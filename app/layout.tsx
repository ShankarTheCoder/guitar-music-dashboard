import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'

import './globals.css'

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://playtube.vercel.app'

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'PlayTube — Search and Play Music Online',
    template: '%s | PlayTube',
  },
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
    url: '/',
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
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'WebSite',
              name: 'PlayTube',
              url: siteUrl,
              description: 'Search YouTube songs and play full-length music online in one focused dashboard.',
              potentialAction: {
                '@type': 'SearchAction',
                target: `${siteUrl}/?q={search_term_string}`,
                'query-input': 'required name=search_term_string',
              },
            }),
          }}
        />
        {children}
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
