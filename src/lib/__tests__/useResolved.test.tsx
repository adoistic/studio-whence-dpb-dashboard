import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { resolveUrls } from '@/lib/dataApi'
import { useResolved, __clearResolvedCache } from '../useResolved'

vi.mock('@/lib/dataApi', () => ({ resolveUrls: vi.fn() }))

const mockedResolveUrls = vi.mocked(resolveUrls)

beforeEach(() => {
  // The cache is module-level and persists across tests — clear it so each
  // test starts cold and is independent.
  __clearResolvedCache()
  mockedResolveUrls.mockReset()
})

describe('useResolved', () => {
  test('resolves a single key, calls resolveUrls once, returns the presigned URL', async () => {
    mockedResolveUrls.mockResolvedValue({ 'images/a.jpg': 'https://signed/a' })

    const { result } = renderHook(() => useResolved(['images/a.jpg']))

    await waitFor(() => {
      expect(result.current).toEqual({ 'images/a.jpg': 'https://signed/a' })
    })

    expect(mockedResolveUrls).toHaveBeenCalledTimes(1)
    expect(mockedResolveUrls).toHaveBeenCalledWith(['images/a.jpg'])
  })

  test('cache hit: a second hook instance for the same key does not refetch', async () => {
    mockedResolveUrls.mockResolvedValue({ 'images/a.jpg': 'https://signed/a' })

    // First instance resolves and warms the cache.
    const first = renderHook(() => useResolved(['images/a.jpg']))
    await waitFor(() => {
      expect(first.result.current).toEqual({ 'images/a.jpg': 'https://signed/a' })
    })
    expect(mockedResolveUrls).toHaveBeenCalledTimes(1)

    // Second instance, same key — served from cache, no new fetch.
    const second = renderHook(() => useResolved(['images/a.jpg']))
    expect(second.result.current).toEqual({ 'images/a.jpg': 'https://signed/a' })
    expect(mockedResolveUrls).toHaveBeenCalledTimes(1)
  })

  test('empty input returns {} and never calls resolveUrls', async () => {
    const { result } = renderHook(() => useResolved([]))

    expect(result.current).toEqual({})
    // Give any stray effect a tick to (not) fire.
    await Promise.resolve()
    expect(mockedResolveUrls).not.toHaveBeenCalled()
  })

  test('partial resolution: server drops invalid keys, hook returns only resolved ones', async () => {
    mockedResolveUrls.mockResolvedValue({ 'images/a.jpg': 'https://signed/a' })

    const { result } = renderHook(() =>
      useResolved(['images/a.jpg', 'images/b.jpg']),
    )

    await waitFor(() => {
      expect(result.current).toEqual({ 'images/a.jpg': 'https://signed/a' })
    })
    expect(result.current['images/b.jpg']).toBeUndefined()
    expect(mockedResolveUrls).toHaveBeenCalledTimes(1)
  })

  test('stability: re-render with a new array literal of the same keys does not refetch', async () => {
    mockedResolveUrls.mockResolvedValue({ 'images/a.jpg': 'https://signed/a' })

    const { result, rerender } = renderHook(({ keys }) => useResolved(keys), {
      initialProps: { keys: ['images/a.jpg'] },
    })

    await waitFor(() => {
      expect(result.current).toEqual({ 'images/a.jpg': 'https://signed/a' })
    })
    expect(mockedResolveUrls).toHaveBeenCalledTimes(1)

    // New array literal, same contents — must not trigger a second resolve.
    rerender({ keys: ['images/a.jpg'] })
    await Promise.resolve()
    expect(mockedResolveUrls).toHaveBeenCalledTimes(1)
  })
})
