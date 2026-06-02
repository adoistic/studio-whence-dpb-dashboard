import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { useDraftHtml } from '../useDraftHtml'
import { readMarkdown } from '@/lib/dataApi'

vi.mock('@/lib/dataApi', () => ({ readMarkdown: vi.fn() }))
const mockedRead = vi.mocked(readMarkdown)

beforeEach(() => vi.clearAllMocks())

describe('useDraftHtml', () => {
  test('a null key does not fetch and is idle', () => {
    const { result } = renderHook(() => useDraftHtml(null))
    expect(result.current).toEqual({ html: null, loading: false })
    expect(mockedRead).not.toHaveBeenCalled()
  })

  test('resolves the draft html for a key', async () => {
    mockedRead.mockResolvedValue('<h2>Page 1</h2>')
    const { result } = renderHook(() => useDraftHtml('drafts/biographies/x.html'))
    expect(result.current.loading).toBe(true)
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.html).toBe('<h2>Page 1</h2>')
    expect(result.current.error).toBeUndefined()
    expect(mockedRead).toHaveBeenCalledWith('drafts/biographies/x.html')
  })

  test('a rejected fetch (e.g. 404) ends in an error state, no throw', async () => {
    mockedRead.mockRejectedValue(new Error('read failed: 404'))
    const { result } = renderHook(() => useDraftHtml('drafts/biographies/missing.html'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.html).toBeNull()
    expect(result.current.error).toBeInstanceOf(Error)
  })
})
