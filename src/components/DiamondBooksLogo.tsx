/**
 * Diamond Books — the publisher this platform produces for. Studio Whence runs
 * the research-and-production pipeline for the Diamond Pocket Books / Diamond
 * Toons comic lines, so Diamond is co-branded as the publishing partner (the
 * footer on every authed page, and the login screen).
 *
 * Served as a static brand asset (`public/brand/diamond-books.png` — the
 * official wordmark on a transparent background). This sits alongside the
 * Studio Whence marks already in `public/brand/`; both are app brand chrome,
 * not gated comic/research data. The lettering is red + black, so on the
 * deep-violet footer the logo needs a light backing — `onDark` wraps it in a
 * white chip; on light surfaces it renders directly.
 *
 * Intrinsic size of the trimmed wordmark is 551×266.
 */
export function DiamondBooksLogo({
  width = 128,
  onDark = false,
  className = '',
}: {
  width?: number
  onDark?: boolean
  className?: string
}) {
  const img = (
    <img
      src="/brand/diamond-books.png"
      alt="Diamond Books"
      width={width}
      height={Math.round(width * (266 / 551))}
      className="block h-auto"
      style={{ width }}
    />
  )
  if (!onDark) return <span className={className}>{img}</span>
  return (
    <span className={`inline-flex items-center rounded-lg bg-white px-3 py-2 shadow-sm ${className}`}>
      {img}
    </span>
  )
}
