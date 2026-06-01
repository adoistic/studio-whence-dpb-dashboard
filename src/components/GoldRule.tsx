export function GoldRule({ width = 'w-7' }: { width?: string }) {
  return <span aria-hidden className={`inline-block ${width} h-px bg-brand-gold`} />
}
