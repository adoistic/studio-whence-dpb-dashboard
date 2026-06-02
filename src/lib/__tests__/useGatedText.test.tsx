import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { useGatedText } from '../useGatedText'
import { readMarkdown } from '@/lib/dataApi'

vi.mock('@/lib/dataApi', () => ({ readMarkdown: vi.fn() }))
const mockedRead = vi.mocked(readMarkdown)
beforeEach(() => vi.clearAllMocks())

describe('useGatedText', () => {
  test('a null key does not fetch and is idle', () => {
    const { result } = renderHook(() => useGatedText(null))
    expect(result.current).toEqual({ text: null, loading: false })
    expect(mockedRead).not.toHaveBeenCalled()
  })
  test('resolves the text for a key', async () => {
    mockedRead.mockResolvedValue('# Hello')
    const { result } = renderHook(() => useGatedText('research/x.md'))
    expect(result.current.loading).toBe(true)
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.text).toBe('# Hello')
    expect(result.current.error).toBeUndefined()
    expect(mockedRead).toHaveBeenCalledWith('research/x.md')
  })
  test('a rejected fetch (e.g. 404) ends in an error state, no throw', async () => {
    mockedRead.mockRejectedValue(new Error('read failed: 404'))
    const { result } = renderHook(() => useGatedText('research/missing.md'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.text).toBeNull()
    expect(result.current.error).toBeInstanceOf(Error)
  })
})
