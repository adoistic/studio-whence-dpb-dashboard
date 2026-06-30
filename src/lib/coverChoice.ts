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

/** Live official-cover choice for a comic (`coverChoices/{comicId}`). */
export function useCoverChoice(comicId: string): { choice: CoverChoice | null; loading: boolean } {
  const [state, setState] = useState<{ choice: CoverChoice | null; loading: boolean }>({
    choice: null,
    loading: true,
  })

  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, 'coverChoices', comicId),
      (snap) => setState({
        choice: snap.exists() ? (snap.data() as CoverChoice) : null,
        loading: false,
      }),
      () => setState({ choice: null, loading: false }),
    )
    return unsub
  }, [comicId])

  return state
}

/** Mark one of the comic's cover options as official. */
export function setOptionAsOfficial(
  comicId: string,
  option: { key: string; label: string },
  author: CoverChoiceAuthor,
) {
  return setDoc(doc(db, 'coverChoices', comicId), {
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
  comicId: string,
  comic: { line: string; slug: string },
  file: File,
  author: CoverChoiceAuthor,
): Promise<void> {
  const key = await uploadCoverRef(comic.line, comic.slug, file)
  await setDoc(doc(db, 'coverChoices', comicId), {
    source: 'upload',
    key,
    label: file.name,
    setByEmail: author.email,
    setByName: author.name,
    setAt: serverTimestamp(),
  })
}
