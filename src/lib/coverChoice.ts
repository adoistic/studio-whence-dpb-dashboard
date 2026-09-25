'use client'

import { useEffect, useState } from 'react'
import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { uploadCoverRef } from '@/lib/dataApi'
import type { CoverChoice } from '@/types/content'

export interface CoverChoiceAuthor {
  email: string
  name: string
}

/**
 * The `coverChoices` doc id for one language of a comic.
 *
 * The original language keeps the bare comicId, so every choice recorded before
 * covers had languages still reads as the book's cover. A translated edition
 * gets its own doc, `{comicId}__{lang}`: picking the Hindi cover must not
 * overwrite the English one, which is what a single doc per comic would do.
 */
export function coverChoiceDocId(comicId: string, lang?: string, originalLang = 'en'): string {
  return !lang || lang === originalLang ? comicId : `${comicId}__${lang}`
}

/** Live official-cover choice (`coverChoices/{docId}`, see `coverChoiceDocId`). */
export function useCoverChoice(docId: string): { choice: CoverChoice | null; loading: boolean } {
  const [state, setState] = useState<{ choice: CoverChoice | null; loading: boolean }>({
    choice: null,
    loading: true,
  })

  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, 'coverChoices', docId),
      (snap) => setState({
        choice: snap.exists() ? (snap.data() as CoverChoice) : null,
        loading: false,
      }),
      () => setState({ choice: null, loading: false }),
    )
    return unsub
  }, [docId])

  return state
}

/** Mark one of the comic's cover options as official. */
export function setOptionAsOfficial(
  docId: string,
  option: { key: string; label: string },
  author: CoverChoiceAuthor,
) {
  return setDoc(doc(db, 'coverChoices', docId), {
    source: 'option',
    key: option.key,
    label: option.label,
    setByEmail: author.email,
    setByName: author.name,
    setAt: serverTimestamp(),
  })
}

/** Upload a reference image and set it as the official cover. */
export async function uploadOfficialCover(
  docId: string,
  comic: { line: string; slug: string },
  file: File,
  author: CoverChoiceAuthor,
): Promise<void> {
  const key = await uploadCoverRef(comic.line, comic.slug, file)
  await setDoc(doc(db, 'coverChoices', docId), {
    source: 'upload',
    key,
    label: file.name,
    setByEmail: author.email,
    setByName: author.name,
    setAt: serverTimestamp(),
  })
}
