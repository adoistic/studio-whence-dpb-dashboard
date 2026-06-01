import { Eyebrow } from '@/components/Eyebrow'
import { Footer } from '@/components/Footer'

export default function Home() {
  return (
    <>
      <main className="min-h-screen flex flex-col items-center justify-center gap-8 px-6">
        <Eyebrow>Brand smoke test</Eyebrow>
        <h1 className="text-5xl font-serif font-light text-brand-indigo">
          Stories in <em className="italic font-medium">becoming.</em>
        </h1>
        <p className="text-brand-umber font-serif max-w-prose text-center">
          If you can read this in Cormorant Garamond on Pale Dusk, the brand layer is live.
        </p>
      </main>
      <Footer sha="abc1234" lastUpdate="just now" />
    </>
  )
}
