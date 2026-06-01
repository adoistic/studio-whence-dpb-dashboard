export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-8 px-6">
      <div className="flex items-center gap-3">
        <span aria-hidden className="inline-block w-7 h-px bg-brand-gold" />
        <span className="text-xs uppercase tracking-eyebrow font-sans font-medium text-brand-lavender">
          Brand smoke test
        </span>
      </div>
      <h1 className="text-5xl font-serif font-light text-brand-indigo">
        Stories in <em className="italic font-medium">becoming.</em>
      </h1>
      <p className="text-brand-umber font-serif max-w-prose text-center">
        If you can read this in Cormorant Garamond on Pale Dusk, the brand layer is live.
      </p>
    </main>
  )
}
