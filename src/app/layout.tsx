import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'DPB Studio · Stories in becoming.',
  description: 'Studio Whence × Diamond Pocket Books · live state of the comic-production pipeline.',
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
        <link rel="icon" href="/brand/favicon.svg" type="image/svg+xml" />
      </head>
      <body>{children}</body>
    </html>
  )
}
