import { formatRelative } from '@/lib/dates'

// All tests pass an explicit `now` so they are fully deterministic.
// Anchor: 2026-06-01T12:00:00Z  (noon UTC, no offset)
const NOW = new Date('2026-06-01T12:00:00Z')

test('just now — less than 60 seconds', () => {
  // 30 seconds before now
  const iso = '2026-06-01T11:59:30Z'
  expect(formatRelative(iso, NOW)).toBe('just now')
})

test('just now — exactly 0 seconds (same instant)', () => {
  expect(formatRelative('2026-06-01T12:00:00Z', NOW)).toBe('just now')
})

test('minutes ago — 5 minutes', () => {
  const iso = '2026-06-01T11:55:00Z'
  expect(formatRelative(iso, NOW)).toBe('5 min ago')
})

test('minutes ago — 59 minutes', () => {
  const iso = '2026-06-01T11:01:00Z'
  expect(formatRelative(iso, NOW)).toBe('59 min ago')
})

test('1 hour ago — singular', () => {
  const iso = '2026-06-01T11:00:00Z'
  expect(formatRelative(iso, NOW)).toBe('1 hour ago')
})

test('hours ago — plural (3 hours)', () => {
  const iso = '2026-06-01T09:00:00Z'
  expect(formatRelative(iso, NOW)).toBe('3 hours ago')
})

test('1 day ago — singular', () => {
  // Exactly 24h before now
  const iso = '2026-05-31T12:00:00Z'
  expect(formatRelative(iso, NOW)).toBe('1 day ago')
})

test('days ago — plural (3 days)', () => {
  const iso = '2026-05-29T12:00:00Z'
  expect(formatRelative(iso, NOW)).toBe('3 days ago')
})

test('6 days ago — still within 7-day window', () => {
  const iso = '2026-05-26T12:00:00Z'
  expect(formatRelative(iso, NOW)).toBe('6 days ago')
})

test('absolute date — 7 days or more', () => {
  // Exactly 7 days before
  const iso = '2026-05-25T12:00:00Z'
  expect(formatRelative(iso, NOW)).toBe('25 May 2026')
})

test('absolute date — well in the past', () => {
  const iso = '2026-01-15T08:00:00Z'
  expect(formatRelative(iso, NOW)).toBe('15 Jan 2026')
})

test('handles ISO string with timezone offset correctly', () => {
  // 2026-06-01T17:30:00+05:30 == 2026-06-01T12:00:00Z — same instant as NOW
  expect(formatRelative('2026-06-01T17:30:00+05:30', NOW)).toBe('just now')
})
