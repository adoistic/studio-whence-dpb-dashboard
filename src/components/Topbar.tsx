'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { signOut } from 'firebase/auth'
import { BrandLockup } from '@/components/BrandLockup'
import { auth } from '@/lib/firebase'
import { useUser, useAllowStatus } from '@/lib/auth'

// ─── Nav link config ──────────────────────────────────────────────────────────

const NAV_LINKS = [
  { label: 'Home', href: '/' },
  { label: 'Biographies', href: '/biographies' },
  { label: 'Awareness', href: '/awareness' },
  { label: 'Indic', href: '/indic' },
  { label: 'Toddlers', href: '/toddlers' },
] as const

const ADMIN_LINK = { label: 'Admin', href: '/admin' }

// ─── Active route detection ───────────────────────────────────────────────────

function isActive(href: string, pathname: string): boolean {
  if (href === '/') return pathname === '/'
  return pathname === href || pathname.startsWith(href + '/')
}

// ─── Topbar ───────────────────────────────────────────────────────────────────

export function Topbar() {
  const pathname = usePathname()
  const router = useRouter()
  const { user, loading } = useUser()
  const allowStatus = useAllowStatus(user, loading)

  async function handleSignOut() {
    await signOut(auth)
    router.replace('/login')
  }

  return (
    <header className="w-full bg-brand-pale-dusk border-b border-brand-pale-dusk">
      <div className="mx-auto max-w-screen-xl px-6 py-3 flex flex-wrap items-center gap-6">

        {/* Left: brand lockup */}
        <Link href="/" className="shrink-0 flex items-center">
          <BrandLockup size="sm" />
        </Link>

        {/* Center/left: nav links */}
        <nav aria-label="Main navigation" className="flex flex-wrap items-center gap-5">
          {NAV_LINKS.map(({ label, href }) => {
            const active = isActive(href, pathname)
            return (
              <Link
                key={href}
                href={href}
                className={[
                  'font-sans text-xs uppercase tracking-label',
                  active ? 'text-brand-indigo' : 'text-brand-slate',
                ]
                  .filter(Boolean)
                  .join(' ')}
                aria-current={active ? 'page' : undefined}
              >
                {active && (
                  <span
                    aria-hidden="true"
                    className="inline-block w-2 h-2 rounded-full bg-brand-gold mr-1.5 align-middle"
                  />
                )}
                {label}
              </Link>
            )
          })}

          {/* Admin link — only shown to admins */}
          {allowStatus === 'admin' && (
            <Link
              href={ADMIN_LINK.href}
              className={[
                'font-sans text-xs uppercase tracking-label',
                isActive(ADMIN_LINK.href, pathname)
                  ? 'text-brand-indigo'
                  : 'text-brand-slate',
              ]
                .filter(Boolean)
                .join(' ')}
              aria-current={isActive(ADMIN_LINK.href, pathname) ? 'page' : undefined}
            >
              {isActive(ADMIN_LINK.href, pathname) && (
                <span
                  aria-hidden="true"
                  className="inline-block w-2 h-2 rounded-full bg-brand-gold mr-1.5 align-middle"
                />
              )}
              {ADMIN_LINK.label}
            </Link>
          )}
        </nav>

        {/* Right: user email + sign-out — only when user is resolved */}
        {!loading && user && (
          <div className="ml-auto flex items-center gap-4">
            <span className="font-sans text-xs text-brand-slate flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className="inline-block w-2 h-2 rounded-full bg-brand-gold shrink-0"
              />
              {user.email}
            </span>
            <button
              type="button"
              onClick={handleSignOut}
              className="font-sans text-xs uppercase tracking-label text-brand-slate hover:text-brand-indigo transition-colors"
            >
              Sign out
            </button>
          </div>
        )}
      </div>
    </header>
  )
}
