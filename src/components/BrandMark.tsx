export function BrandMark({ size = 'md', color = 'indigo' }: { size?: 'sm' | 'md' | 'lg' | 'xl'; color?: 'indigo' | 'pale-dusk' }) {
  const px = { sm: 24, md: 32, lg: 48, xl: 64 }[size]
  const fill = color === 'indigo' ? '#3B3664' : '#E8E2F0'
  return (
    <svg width={px} height={px} viewBox="0 -40 140 140" xmlns="http://www.w3.org/2000/svg">
      <path
        fillRule="evenodd"
        fill={fill}
        d="M 15 15 L 85 15 L 85 85 L 15 85 Z M 85 -28 A 43 43 0 1 0 85 58 A 43 43 0 1 0 85 -28 Z"
      />
    </svg>
  )
}
