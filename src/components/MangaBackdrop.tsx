'use client'

/**
 * The manga surface's backdrop. Deliberately not the comics hero: no
 * photograph, no gold seasoning, no Tingaland palette. Manga reads as ink on
 * paper, so this is a high-contrast field of screentone dots and speed lines,
 * drawn in CSS so it costs nothing to serve and adapts to any viewport.
 *
 * Pure decoration — aria-hidden, pointer-events off, sits behind content.
 */
export function MangaBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Screentone: the halftone dot field that says "manga" before anything else. */}
      <div
        className="absolute inset-0 opacity-[0.22]"
        style={{
          backgroundImage: 'radial-gradient(currentColor 1px, transparent 1.15px)',
          backgroundSize: '7px 7px',
          color: '#12121a',
          maskImage: 'linear-gradient(160deg, #000 0%, transparent 62%)',
          WebkitMaskImage: 'linear-gradient(160deg, #000 0%, transparent 62%)',
        }}
      />
      {/* Speed lines, converging off the top-right corner. */}
      <div
        className="absolute -right-1/4 -top-1/2 h-[160%] w-[120%] opacity-[0.13]"
        style={{
          backgroundImage:
            'repeating-conic-gradient(from 205deg at 100% 0%, #12121a 0deg 0.55deg, transparent 0.55deg 3.2deg)',
        }}
      />
      {/* A single hard ink sweep, the one gesture that is not a texture. */}
      <div
        className="absolute -left-24 bottom-[-18%] h-[55%] w-[70%] -rotate-6 opacity-[0.07]"
        style={{ background: '#12121a', clipPath: 'polygon(0 62%, 100% 8%, 100% 30%, 0 100%)' }}
      />
    </div>
  )
}
