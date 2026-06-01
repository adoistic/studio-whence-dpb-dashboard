'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { signOut } from 'firebase/auth'
import { BrandLockup } from '@/components/BrandLockup'
import { auth } from '@/lib/firebase'
import { useUser, useAllowStatus } from '@/lib/auth'
import { useContent } from '@/lib/content'

const NAV_LINKS = [{ label: 'Home', href: '/' }] as const

const ADMIN_LINK = { label: 'Admin', href: '/admin' }

function isActive(href: string, pathname: string): boolean {
  if (href === '/') return pathname === '/'
  return pathname === href || pathname.startsWith(href + '/')
}

function NavItem({ label, href, active }: { label: string; href: string; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`relative font-sans text-[0.7rem] uppercase tracking-label transition-colors duration-200 ${
        active ? 'text-brand-indigo' : 'text-brand-slate hover:text-brand-indigo'
      }`}
    >
      {active && (
        <span
          aria-hidden="true"
          className="absolute -left-3 top-1/2 inline-block h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-brand-gold"
        />
      )}
      {label}
    </Link>
  )
}

export function Topbar() {
  const pathname = usePathname()
  const router = useRouter()
  const { user, loading } = useUser()
  const allowStatus = useAllowStatus(user, loading)
  const { content } = useContent()

  async function handleSignOut() {
    await signOut(auth)
    router.replace('/login')
  }

  return (
    <header className="sticky top-0 z-40 w-full border-b border-brand-pale-dusk bg-brand-pale-dusk/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-[1320px] flex-wrap items-center gap-x-8 gap-y-3 px-6 py-3.5">
        <Link href="/" className="flex shrink-0 items-center">
          <BrandLockup size="sm" />
        </Link>

        <nav aria-label="Main navigation" className="flex flex-wrap items-center gap-x-7 gap-y-2 pl-2">
          {NAV_LINKS.map(({ label, href }) => (
            <NavItem key={href} label={label} href={href} active={isActive(href, pathname)} />
          ))}
          {(content?.lines ?? []).map((line) => (
            <NavItem
              key={line.slug}
              label={line.title}
              href={`/${line.slug}`}
              active={isActive(`/${line.slug}`, pathname)}
            />
          ))}
          {allowStatus === 'admin' && (
            <NavItem label={ADMIN_LINK.label} href={ADMIN_LINK.href} active={isActive(ADMIN_LINK.href, pathname)} />
          )}
        </nav>

        {!loading && user && (
          <div className="ml-auto flex items-center gap-5">
            <span className="hidden items-center gap-1.5 font-sans text-[0.7rem] text-brand-slate sm:flex">
              <span aria-hidden="true" className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-brand-gold" />
              {user.email}
            </span>
            <button
              type="button"
              onClick={handleSignOut}
              className="font-sans text-[0.7rem] uppercase tracking-label text-brand-slate transition-colors hover:text-brand-indigo"
            >
              Sign out
            </button>
          </div>
        )}
      </div>
    </header>
  )
}
