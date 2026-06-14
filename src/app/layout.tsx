import './globals.css'
import type { Metadata, Viewport } from 'next'

const TITLE = 'Studio Whence · Stories in becoming.'
const DESCRIPTION =
  'The editorial and production platform for the Diamond Pocket Books & Diamond Toons comic lines.'
const SITE_URL = 'https://dpb.studiowhence.com'

export const metadata: Metadata = {
  // Absolute base so og:image / canonical resolve against the custom domain —
  // the URL that actually gets shared — even though files also serve from
  // studio-whence-dpb.web.app.
  metadataBase: new URL(SITE_URL),
  title: { default: TITLE, template: '%s · Studio Whence' },
  description: DESCRIPTION,
  applicationName: 'Studio Whence',
  // Private, access-gated tool — keep it out of search indexes. Link-unfurl
  // crawlers (WhatsApp, LinkedIn, iMessage, Slack, X) ignore robots noindex,
  // so social previews still render; only search engines are discouraged.
  robots: { index: false, follow: false },
  // SVG for modern browsers, the brand .ico is auto-served from app/favicon.ico
  // (legacy/bookmarks), apple-touch-icon for iOS home-screen / iMessage.
  icons: {
    icon: '/brand/favicon.svg',
    shortcut: '/brand/favicon.svg',
    apple: '/brand/apple-touch-icon.png',
  },
  openGraph: {
    type: 'website',
    siteName: 'Studio Whence',
    title: TITLE,
    description: DESCRIPTION,
    url: SITE_URL,
    locale: 'en_US',
    images: [
      {
        url: '/brand/og-image.jpg',
        width: 1200,
        height: 630,
        type: 'image/jpeg',
        alt: 'Studio Whence — Stories in becoming. Produced for Diamond Books.',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
    images: ['/brand/og-image.jpg'],
  },
}

export const viewport: Viewport = {
  themeColor: '#1E1A3A',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;1,300;1,400;1,500&family=Instrument+Sans:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  )
}
