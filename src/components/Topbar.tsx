'use client'

import { useEffect, useId, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { signOut } from 'firebase/auth'
import { BrandLockup } from '@/components/BrandLockup'
import { auth } from '@/lib/firebase'
import { useUser, useAllowStatus, canModerate } from '@/lib/auth'
import { useLines } from '@/lib/catalog'

const HOME_LINK = { label: 'Home', href: '/' }
const METHODOLOGY_LINK = { label: 'Methodology', href: '/methodology' }
const REVIEWS_LINK = { label: 'Reviews', href: '/reviews' }
const ADMIN_LINK = { label: 'Admin', href: '/admin' }

function isActive(href: string, pathname: string): boolean {
  if (href === '/') return pathname === '/'
  return pathname === href || pathname.startsWith(href + '/')
}

function MenuItem({
  label,
  href,
  active,
  onNavigate,
}: {
  label: string
  href: string
  active: boolean
  onNavigate: () => void
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={`relative flex items-center rounded-md px-3 py-2 font-sans text-[0.7rem] uppercase tracking-label transition-colors duration-200 ${
        active
          ? 'bg-brand-indigo/5 text-brand-indigo'
          : 'text-brand-slate hover:bg-brand-indigo/5 hover:text-brand-indigo'
      }`}
    >
      {active && (
        <span
          aria-hidden="true"
          className="absolute left-0 top-1/2 inline-block h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-brand-gold"
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
  const canMod = canModerate(allowStatus)
  const { data: lines } = useLines()

  const [open, setOpen] = useState(false)
  const menuId = useId()
  const containerRef = useRef<HTMLDivElement>(null)

  async function handleSignOut() {
    setOpen(false)
    await signOut(auth)
    router.replace('/login')
  }

  // Close on Escape and on outside click while the menu is open.
  useEffect(() => {
    if (!open) return

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    function onPointerDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }

    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('mousedown', onPointerDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('mousedown', onPointerDown)
    }
  }, [open])

  const closeMenu = () => setOpen(false)

  return (
    <header className="sticky top-0 z-40 w-full border-b border-brand-pale-dusk bg-brand-pale-dusk/85 backdrop-blur-md">
      <div
        ref={containerRef}
        className="relative mx-auto flex max-w-[1320px] items-center justify-between px-6 py-3.5"
      >
        <Link href="/" className="flex shrink-0 items-center">
          <BrandLockup size="sm" />
        </Link>

        <button
          type="button"
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
          aria-controls={menuId}
          onClick={() => setOpen((v) => !v)}
          className="inline-flex h-9 w-9 items-center justify-center rounded-md text-brand-slate transition-colors hover:bg-brand-indigo/5 hover:text-brand-indigo"
        >
          <span className="relative block h-3.5 w-5" aria-hidden="true">
            <span
              className={`absolute left-0 block h-0.5 w-5 rounded-full bg-current transition-all duration-200 ${
                open ? 'top-1/2 -translate-y-1/2 rotate-45' : 'top-0'
              }`}
            />
            <span
              className={`absolute left-0 top-1/2 block h-0.5 w-5 -translate-y-1/2 rounded-full bg-current transition-opacity duration-200 ${
                open ? 'opacity-0' : 'opacity-100'
              }`}
            />
            <span
              className={`absolute left-0 block h-0.5 w-5 rounded-full bg-current transition-all duration-200 ${
                open ? 'top-1/2 -translate-y-1/2 -rotate-45' : 'bottom-0'
              }`}
            />
          </span>
        </button>

        {open && (
          <nav
            id={menuId}
            aria-label="Main navigation"
            className="absolute right-6 top-full z-50 mt-2 flex w-60 flex-col gap-1 rounded-xl border border-brand-pale-dusk bg-brand-pale-dusk/95 p-2 shadow-lg backdrop-blur-md"
          >
            <MenuItem
              label={HOME_LINK.label}
              href={HOME_LINK.href}
              active={isActive(HOME_LINK.href, pathname)}
              onNavigate={closeMenu}
            />
            {/* Methodology — the pipeline playbook; visible to any authed user. */}
            <MenuItem
              label={METHODOLOGY_LINK.label}
              href={METHODOLOGY_LINK.href}
              active={isActive(METHODOLOGY_LINK.href, pathname)}
              onNavigate={closeMenu}
            />
            {/* Reviews is the cross-comic moderation queue — moderators only.
                Members comment per-comic on their allocated comic pages. */}
            {canMod && (
              <MenuItem
                label={REVIEWS_LINK.label}
                href={REVIEWS_LINK.href}
                active={isActive(REVIEWS_LINK.href, pathname)}
                onNavigate={closeMenu}
              />
            )}
            {(lines ?? []).map((line) => (
              <MenuItem
                key={line.slug}
                label={line.title}
                href={`/${line.slug}`}
                active={isActive(`/${line.slug}`, pathname)}
                onNavigate={closeMenu}
              />
            ))}
            {allowStatus === 'admin' && (
              <MenuItem
                label={ADMIN_LINK.label}
                href={ADMIN_LINK.href}
                active={isActive(ADMIN_LINK.href, pathname)}
                onNavigate={closeMenu}
              />
            )}

            {!loading && user && (
              <>
                <div className="my-1 h-px bg-brand-pale-dusk" aria-hidden="true" />
                <span className="flex items-center gap-1.5 px-3 py-1.5 font-sans text-[0.7rem] text-brand-slate">
                  <span
                    aria-hidden="true"
                    className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-brand-gold"
                  />
                  {user.email}
                </span>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="rounded-md px-3 py-2 text-left font-sans text-[0.7rem] uppercase tracking-label text-brand-slate transition-colors hover:bg-brand-indigo/5 hover:text-brand-indigo"
                >
                  Sign out
                </button>
              </>
            )}
          </nav>
        )}
      </div>
    </header>
  )
}
