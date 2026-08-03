'use client'

import { useState } from 'react'
import { useUser, useAllowStatus } from '@/lib/auth'
import { formatRelative } from '@/lib/dates'
import { toMillis } from '@/lib/feedbackTypes'
import {
  usePendingRequests, useMembers, useSuspended,
  approveRequest, denyRequest, addMember, setMemberRole,
  removeMember, suspendEmail, reinstate,
  type AccessRequest, type Member, type SuspendedEntry,
} from '@/lib/admin'
import { AllocationsSection } from '@/components/admin/AllocationsSection'
import { PricingPanel } from '@/components/admin/PricingPanel'
import { usePricing } from '@/lib/pricing'
import { useLines } from '@/lib/catalog'
import { useVisibleComics } from '@/lib/visibleCatalog'

// ── Helpers ────────────────────────────────────────────────────────────────────

function timeLabel(v: unknown): string {
  const ms = toMillis(v)
  return ms ? formatRelative(new Date(ms).toISOString()) : ''
}

function isPlausibleEmail(e: string): boolean {
  const t = e.trim()
  return t.includes('@') && t.includes('.') && !/\s/.test(t)
}

// ── Small UI atoms ───────────────────────────────────────────────────────────────

function Pill({
  children, onClick, tone = 'neutral', label,
}: {
  children: React.ReactNode
  onClick: () => void
  tone?: 'neutral' | 'primary' | 'danger'
  label: string
}) {
  const tones = {
    neutral: 'border-brand-pale-dusk bg-brand-pale-dusk/30 text-brand-umber hover:border-brand-indigo/50 hover:bg-brand-pale-dusk/60',
    primary: 'border-brand-indigo bg-brand-indigo text-brand-cream hover:bg-brand-indigo/90',
    danger: 'border-brand-gold/60 bg-brand-gold/10 text-brand-umber hover:border-brand-gold hover:bg-brand-gold/20',
  }[tone]
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={`inline-flex items-center rounded-full border px-3 py-1 font-sans text-[0.7rem] uppercase tracking-label transition-colors ${tones}`}
    >
      {children}
    </button>
  )
}

/**
 * Two-step inline confirm. The trigger first shows `label`; on click it swaps to
 * "Confirm" + "Cancel" inline. Confirming runs `onConfirm`. No window.confirm, so
 * it is jsdom-testable. Confirm state is local to this button instance.
 */
function ConfirmButton({
  label, confirmLabel, onConfirm, tone = 'danger',
}: {
  label: string
  confirmLabel: string
  onConfirm: () => void
  tone?: 'neutral' | 'primary' | 'danger'
}) {
  const [armed, setArmed] = useState(false)
  if (!armed) {
    return <Pill tone={tone} label={label} onClick={() => setArmed(true)}>{label}</Pill>
  }
  return (
    <span className="inline-flex items-center gap-1">
      <Pill tone="primary" label={confirmLabel} onClick={() => { setArmed(false); onConfirm() }}>
        Confirm
      </Pill>
      <Pill tone="neutral" label="Cancel" onClick={() => setArmed(false)}>
        Cancel
      </Pill>
    </span>
  )
}

function RoleChip({ role }: { role: 'sub_admin' | 'member' }) {
  return (
    <span
      className={[
        'inline-flex items-center rounded-full border px-2 py-0.5 font-sans text-[0.6rem] uppercase tracking-label',
        role === 'sub_admin'
          ? 'border-brand-indigo bg-brand-indigo/10 text-brand-indigo'
          : 'border-brand-pale-dusk bg-brand-pale-dusk/40 text-brand-slate',
      ].join(' ')}
    >
      {role === 'sub_admin' ? 'Sub-admin' : 'Member'}
    </span>
  )
}

function SectionHeading({ title, count }: { title: string; count?: number }) {
  return (
    <div className="mb-4 flex items-baseline gap-3">
      <h2 className="font-serif font-light text-brand-umber text-[1.4rem]">{title}</h2>
      {typeof count === 'number' && (
        <span className="font-sans text-[0.7rem] uppercase tracking-label text-brand-slate">{count}</span>
      )}
    </div>
  )
}

function Row({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex flex-wrap items-center gap-2 rounded-lg border border-brand-pale-dusk bg-brand-pale-dusk/20 px-4 py-3">
      {children}
    </li>
  )
}

function Empty({ text }: { text: string }) {
  return <p className="rounded-lg border border-dashed border-brand-pale-dusk px-4 py-6 text-center font-sans text-sm text-brand-slate">{text}</p>
}

// ── Main component ───────────────────────────────────────────────────────────────

export function AdminPanel() {
  const { user, loading: authLoading } = useUser()
  const status = useAllowStatus(user ?? null, authLoading)
  const adminEmail = user?.email ?? ''

  // Bumped after every mutation to force the one-shot hooks to reload.
  const [refreshKey, setRefreshKey] = useState(0)
  const bump = () => setRefreshKey((k) => k + 1)

  // A single inline failure note surfaced near the top of the panel.
  const [errMsg, setErrMsg] = useState<string | null>(null)

  // Run a mutation, then refresh the lists; surface failures inline.
  const run = async (fn: () => Promise<void>) => {
    setErrMsg(null)
    try {
      await fn()
      bump()
    } catch {
      setErrMsg('Couldn’t apply change.')
    }
  }

  // Pricing needs the full catalog: an admin prices every line and can override
  // any single comic, so it reads with moderator scope rather than allocation scope.
  const pricing = usePricing(refreshKey)
  const { data: allLines } = useLines()
  const { data: allComics } = useVisibleComics(true, adminEmail || null)

  const requests = usePendingRequests(refreshKey)
  const members = useMembers(refreshKey)
  const suspended = useSuspended(refreshKey)

  // ── Gate ──────────────────────────────────────────────────────────────────────
  if (status === 'loading') {
    return (
      <div className="mx-auto max-w-[900px] px-6 py-16">
        <p className="font-sans text-sm text-brand-slate">Loading…</p>
      </div>
    )
  }
  if (status !== 'admin') {
    return (
      <div className="mx-auto max-w-[640px] px-6 py-24">
        <div className="rounded-lg border border-brand-pale-dusk bg-brand-pale-dusk/30 px-6 py-8 text-center">
          <h1 className="font-serif font-light text-brand-umber text-[1.6rem]">Not authorized</h1>
          <p className="mt-2 font-serif text-brand-umber/70">
            This area is for the administrator.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-[900px] px-6 pb-24 pt-12">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="mb-10">
        <span className="flex items-center gap-3">
          <span aria-hidden className="block h-px w-7 bg-brand-gold" />
          <span className="font-sans text-[0.7rem] uppercase tracking-label text-brand-gold">
            Administration
          </span>
        </span>
        <h1 className="mt-4 font-serif font-light leading-tight text-brand-umber text-[2rem] md:text-[2.8rem]">
          Access &amp; roles
        </h1>
        <p className="mt-2 max-w-xl font-serif text-brand-umber/70 leading-relaxed">
          Approve access requests, manage members and sub-admins, and suspend or reinstate accounts.
        </p>
      </div>

      {errMsg && (
        <p role="alert" className="mb-6 rounded-md border border-brand-gold/60 bg-brand-gold/10 px-4 py-2 font-sans text-sm text-brand-umber">
          {errMsg}
        </p>
      )}

      <div className="flex flex-col gap-12">
        {/* ── 1. Access requests ─────────────────────────────────────── */}
        <section>
          <SectionHeading title="Access requests" count={requests.data?.length} />
          {requests.loading ? (
            <p className="font-sans text-sm text-brand-slate">Loading…</p>
          ) : (requests.data?.length ?? 0) === 0 ? (
            <Empty text="No pending requests." />
          ) : (
            <ul className="flex flex-col gap-2">
              {requests.data!.map((r: AccessRequest) => (
                <Row key={r.email}>
                  <span className="font-serif text-sm text-brand-umber">{r.email}</span>
                  {timeLabel(r.requested_at) && (
                    <span className="font-sans text-[0.65rem] text-brand-slate">
                      {timeLabel(r.requested_at)}
                    </span>
                  )}
                  <span className="ml-auto inline-flex flex-wrap items-center gap-1">
                    <Pill
                      tone="primary"
                      label={`Approve ${r.email} as member`}
                      onClick={() => run(() => approveRequest(r.email, { asSubAdmin: false, adminEmail }))}
                    >
                      Approve
                    </Pill>
                    <Pill
                      tone="neutral"
                      label={`Approve ${r.email} as sub-admin`}
                      onClick={() => run(() => approveRequest(r.email, { asSubAdmin: true, adminEmail }))}
                    >
                      Approve as sub-admin
                    </Pill>
                    <ConfirmButton
                      label={`Deny ${r.email}`}
                      confirmLabel={`Confirm deny ${r.email}`}
                      onConfirm={() => run(() => denyRequest(r.email))}
                    />
                  </span>
                </Row>
              ))}
            </ul>
          )}
        </section>

        {/* ── 2. Members ─────────────────────────────────────────────── */}
        <section>
          <SectionHeading title="Members" count={members.data?.length} />
          {members.loading ? (
            <p className="font-sans text-sm text-brand-slate">Loading…</p>
          ) : (members.data?.length ?? 0) === 0 ? (
            <Empty text="No members yet." />
          ) : (
            <ul className="flex flex-col gap-2">
              {members.data!.map((m: Member) => (
                <Row key={m.email}>
                  <span className="font-serif text-sm text-brand-umber">{m.email}</span>
                  <RoleChip role={m.role} />
                  <span className="ml-auto inline-flex flex-wrap items-center gap-1">
                    {m.role === 'sub_admin' ? (
                      <Pill
                        tone="neutral"
                        label={`Make ${m.email} a member`}
                        onClick={() => run(() => setMemberRole(m.email, 'member', { adminEmail }))}
                      >
                        Make member
                      </Pill>
                    ) : (
                      <Pill
                        tone="neutral"
                        label={`Make ${m.email} a sub-admin`}
                        onClick={() => run(() => setMemberRole(m.email, 'sub_admin', { adminEmail }))}
                      >
                        Make sub-admin
                      </Pill>
                    )}
                    <ConfirmButton
                      label={`Suspend ${m.email}`}
                      confirmLabel={`Confirm suspend ${m.email}`}
                      onConfirm={() => run(() => suspendEmail(m.email, { adminEmail }))}
                    />
                    <ConfirmButton
                      label={`Remove ${m.email}`}
                      confirmLabel={`Confirm remove ${m.email}`}
                      onConfirm={() => run(() => removeMember(m.email))}
                    />
                  </span>
                </Row>
              ))}
            </ul>
          )}
        </section>

        {/* ── 3. Suspended ───────────────────────────────────────────── */}
        <section>
          <SectionHeading title="Suspended" count={suspended.data?.length} />
          {suspended.loading ? (
            <p className="font-sans text-sm text-brand-slate">Loading…</p>
          ) : (suspended.data?.length ?? 0) === 0 ? (
            <Empty text="No suspended accounts." />
          ) : (
            <ul className="flex flex-col gap-2">
              {suspended.data!.map((s: SuspendedEntry) => (
                <Row key={s.email}>
                  <span className="font-serif text-sm text-brand-umber">{s.email}</span>
                  <span className="ml-auto">
                    <Pill
                      tone="primary"
                      label={`Reinstate ${s.email}`}
                      onClick={() => run(() => reinstate(s.email))}
                    >
                      Reinstate
                    </Pill>
                  </span>
                </Row>
              ))}
            </ul>
          )}
        </section>

        {/* ── 4. Add by email ────────────────────────────────────────── */}
        <AddByEmail
          onAddMember={(email, asSubAdmin) => run(() => addMember(email, { asSubAdmin, adminEmail }))}
          onSuspend={(email) => run(() => suspendEmail(email, { adminEmail }))}
        />

        {/* ── 5. Allocations ─────────────────────────────────────────── */}
        <AllocationsSection adminEmail={adminEmail} />

        {/* ── 6. Pricing ─────────────────────────────────────────────── */}
        <PricingPanel
          pricing={pricing.data}
          lines={allLines}
          comics={allComics ?? []}
          email={adminEmail}
          onSaved={bump}
        />
      </div>
    </div>
  )
}

// ── Add-by-email forms ───────────────────────────────────────────────────────────

function AddByEmail({
  onAddMember, onSuspend,
}: {
  onAddMember: (email: string, asSubAdmin: boolean) => void
  onSuspend: (email: string) => void
}) {
  const [addValue, setAddValue] = useState('')
  const [addError, setAddError] = useState<string | null>(null)
  const [suspendValue, setSuspendValue] = useState('')
  const [suspendError, setSuspendError] = useState<string | null>(null)

  const submitAdd = (asSubAdmin: boolean) => {
    if (!isPlausibleEmail(addValue)) { setAddError('Enter a valid email address.'); return }
    setAddError(null)
    onAddMember(addValue, asSubAdmin)
    setAddValue('')
  }
  const submitSuspend = () => {
    if (!isPlausibleEmail(suspendValue)) { setSuspendError('Enter a valid email address.'); return }
    setSuspendError(null)
    onSuspend(suspendValue)
    setSuspendValue('')
  }

  return (
    <section>
      <SectionHeading title="Add by email" />
      <div className="flex flex-col gap-6">
        {/* Add member / sub-admin */}
        <div>
          <label htmlFor="admin-add-email" className="mb-1 block font-sans text-[0.7rem] uppercase tracking-label text-brand-slate">
            Add a member by email
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <input
              id="admin-add-email"
              type="email"
              value={addValue}
              onChange={(e) => { setAddValue(e.target.value); setAddError(null) }}
              placeholder="name@example.com"
              className="flex-1 min-w-[14rem] rounded-md border border-brand-pale-dusk bg-brand-cream px-3 py-2 font-sans text-sm text-brand-umber placeholder:text-brand-slate/60 focus:border-brand-indigo focus:outline-none"
            />
            <Pill tone="primary" label="Add member" onClick={() => submitAdd(false)}>Add member</Pill>
            <Pill tone="neutral" label="Add sub-admin" onClick={() => submitAdd(true)}>Add sub-admin</Pill>
          </div>
          {addError && <p role="alert" className="mt-1 font-sans text-xs text-brand-gold">{addError}</p>}
        </div>

        {/* Suspend an email (incl. domain users with no allowlist doc) */}
        <div>
          <label htmlFor="admin-suspend-email" className="mb-1 block font-sans text-[0.7rem] uppercase tracking-label text-brand-slate">
            Suspend an email
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <input
              id="admin-suspend-email"
              type="email"
              value={suspendValue}
              onChange={(e) => { setSuspendValue(e.target.value); setSuspendError(null) }}
              placeholder="name@dpb.in"
              className="flex-1 min-w-[14rem] rounded-md border border-brand-pale-dusk bg-brand-cream px-3 py-2 font-sans text-sm text-brand-umber placeholder:text-brand-slate/60 focus:border-brand-indigo focus:outline-none"
            />
            <Pill tone="danger" label="Suspend email" onClick={submitSuspend}>Suspend</Pill>
          </div>
          {suspendError && <p role="alert" className="mt-1 font-sans text-xs text-brand-gold">{suspendError}</p>}
        </div>
      </div>
    </section>
  )
}
