import { BrandMark } from './BrandMark'

export function BrandLockup({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  const text = { sm: 'text-lg', md: 'text-xl', lg: 'text-2xl', xl: 'text-3xl' }[size]
  return (
    <div className="flex items-center gap-3">
      <BrandMark size={size} />
      <span className={`font-serif font-normal text-brand-indigo ${text}`}>Studio Whence</span>
    </div>
  )
}
