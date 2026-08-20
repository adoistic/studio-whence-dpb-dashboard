'use client'

import type { Comic } from '@/types/content'

export interface ComicLanguage {
  code: string
  label: string
  draftKey: string
  isOriginal: boolean
}

const LABELS: Record<string, string> = { en: 'English', hi: 'हिंदी' }

/** Native-name label for a language code; an unknown code shows as its code so
 *  a newly published language is visibly unlabelled rather than blank. */
export function languageLabel(code: string): string {
  return LABELS[code] ?? code.toUpperCase()
}

/**
 * The languages a comic's script is readable in, original first.
 *
 * Falls back to a single entry when the publish pipeline has not written a
 * manifest — which is every comic that has no translation. The fallback honours
 * `originalLanguage` and only then defaults to English, because the master is
 * NOT always English (legacy/rajyog is a Hindi original with an English
 * translation, as are the other two legacy Yogi books).
 */
export function comicLanguages(comic: Comic): ComicLanguage[] {
  if (comic.languages && comic.languages.length > 0) return comic.languages
  const code = comic.originalLanguage ?? 'en'
  return [{
    code,
    label: languageLabel(code),
    draftKey: `drafts/${comic.line}/${comic.slug}.html`,
    isOriginal: true,
  }]
}

/** The draft key for one language. An unknown code falls back to the original,
 *  so a stale URL or a removed language degrades to a readable page. */
export function draftKeyFor(comic: Comic, code: string): string {
  const langs = comicLanguages(comic)
  return (langs.find((l) => l.code === code) ?? langs[0]).draftKey
}
