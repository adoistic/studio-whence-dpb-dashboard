import { describe, test, expect } from 'vitest'
import { parseQuery } from '../query'

const t = (text: string, exact = false) => ({ text, exact })

describe('parseQuery', () => {
  test('a bare word is one required term', () => {
    expect(parseQuery('ambani')).toEqual([[t('ambani')]])
  })

  test('spaces mean AND', () => {
    expect(parseQuery('ambani textile')).toEqual([[t('ambani')], [t('textile')]])
  })

  test('commas mean AND', () => {
    expect(parseQuery('ambani, textile')).toEqual([[t('ambani')], [t('textile')]])
  })

  test('a quoted phrase is one exact term, spaces intact', () => {
    expect(parseQuery('"polyester prince"')).toEqual([[t('polyester prince', true)]])
  })

  test('a quoted phrase survives beside a comma', () => {
    expect(parseQuery('"polyester prince", mill'))
      .toEqual([[t('polyester prince', true)], [t('mill')]])
  })

  test('pipe means OR and binds tighter than the comma', () => {
    expect(parseQuery('ambani, mill | textile'))
      .toEqual([[t('ambani')], [t('mill'), t('textile')]])
  })

  test('the word OR is a synonym for pipe', () => {
    expect(parseQuery('mill OR textile')).toEqual([[t('mill'), t('textile')]])
  })

  test('the word AND is a synonym for the comma', () => {
    expect(parseQuery('mill AND textile')).toEqual([[t('mill')], [t('textile')]])
  })

  test('lowercases terms, quoted or not', () => {
    expect(parseQuery('Ambani "The Polyester Prince"'))
      .toEqual([[t('ambani')], [t('the polyester prince', true)]])
  })

  test('empty and punctuation-only input yields no query', () => {
    expect(parseQuery('')).toEqual([])
    expect(parseQuery('   ,  | ')).toEqual([])
  })

  test('an unclosed quote is treated as a phrase to the end of input', () => {
    expect(parseQuery('"polyester prince')).toEqual([[t('polyester prince', true)]])
  })

  test('three OR alternatives in one group', () => {
    expect(parseQuery('a | b | c')).toEqual([[t('a'), t('b'), t('c')]])
  })

  test('Devanagari terms survive tokenizing', () => {
    expect(parseQuery('मुख्यमंत्री, योग')).toEqual([[t('मुख्यमंत्री')], [t('योग')]])
  })
})
