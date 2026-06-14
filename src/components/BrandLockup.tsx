import { BrandMark } from './BrandMark'

export function BrandLockup({
  size = 'md', onDark = false,
}: {
  size?: 'sm' | 'md' | 'lg' | 'xl'
  /** Light variant for dark surfaces (the footer) — the indigo mark + wordmark
   *  are barely visible on the deep-violet footer, so use the pale tone. */
  onDark?: boolean
}) {
  const text = { sm: 'text-lg', md: 'text-xl', lg: 'text-2xl', xl: 'text-3xl' }[size]
  return (
    <div className="flex items-center gap-3">
      <BrandMark size={size} color={onDark ? 'pale-dusk' : 'indigo'} />
      <span className={`font-serif font-normal ${onDark ? 'text-brand-pale-dusk' : 'text-brand-indigo'} ${text}`}>Studio Whence</span>
    </div>
  )
}
