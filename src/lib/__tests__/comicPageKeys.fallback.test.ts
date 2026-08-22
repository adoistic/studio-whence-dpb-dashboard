import { describe, test, expect } from 'vitest'
import { pickPageUrls, webVariantKey } from '@/lib/comicPageKeys'

const masters = ['images/c/a/pages/page-01.jpg', 'images/c/a/pages/page-02.jpg']
const webs = masters.map(webVariantKey)

describe('pickPageUrls', () => {
  test('prefers the web variant when it resolved', () => {
    const urls = { [webs[0]]: 'W1', [webs[1]]: 'W2', [masters[0]]: 'M1', [masters[1]]: 'M2' }
    expect(pickPageUrls(masters, urls, true)).toEqual(['W1', 'W2'])
  })

  test('FALLS BACK to the master per page when the web variant is missing', () => {
    // 29 comics were published before web derivatives existed. Without this the
    // low-res download resolves nothing and dies with "Could not build the PDF".
    const urls = { [masters[0]]: 'M1', [masters[1]]: 'M2' }
    expect(pickPageUrls(masters, urls, true)).toEqual(['M1', 'M2'])
  })

  test('mixes per page — a partially derived comic still downloads in full', () => {
    const urls = { [webs[0]]: 'W1', [masters[0]]: 'M1', [masters[1]]: 'M2' }
    expect(pickPageUrls(masters, urls, true)).toEqual(['W1', 'M2'])
  })

  test('full-resolution ignores web variants even when they exist', () => {
    const urls = { [webs[0]]: 'W1', [webs[1]]: 'W2', [masters[0]]: 'M1', [masters[1]]: 'M2' }
    expect(pickPageUrls(masters, urls, false)).toEqual(['M1', 'M2'])
  })

  test('a page that resolved neither way is dropped, not left undefined', () => {
    const urls = { [masters[0]]: 'M1' }
    expect(pickPageUrls(masters, urls, true)).toEqual(['M1'])
  })

  test('no keys yields no urls', () => {
    expect(pickPageUrls([], {}, true)).toEqual([])
  })
})
