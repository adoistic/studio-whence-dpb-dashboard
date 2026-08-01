import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { resolveUrls } from '@/lib/dataApi'
import { refreshResolved, useResolved, __clearResolvedCache } from '../useResolved'

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

  describe('presign expiry', () => {
    afterEach(() => {
      vi.useRealTimers()
    })

    test('a stale entry is re-resolved by a later mount (presigns expire ~10min)', async () => {
      vi.useFakeTimers()
      mockedResolveUrls.mockResolvedValue({ 'images/a.jpg': 'https://signed/a-1' })
      const first = renderHook(() => useResolved(['images/a.jpg']))
      await act(async () => {
        await vi.runOnlyPendingTimersAsync()
      })
      expect(first.result.current).toEqual({ 'images/a.jpg': 'https://signed/a-1' })
      first.unmount()

      // Past the staleness horizon: a new mount must fetch a fresh URL.
      vi.advanceTimersByTime(9 * 60_000)
      mockedResolveUrls.mockResolvedValue({ 'images/a.jpg': 'https://signed/a-2' })
      const second = renderHook(() => useResolved(['images/a.jpg']))
      // The stale URL is still served while the refresh is in flight.
      expect(second.result.current).toEqual({ 'images/a.jpg': 'https://signed/a-1' })
      await act(async () => {
        await vi.runOnlyPendingTimersAsync()
      })
      expect(second.result.current).toEqual({ 'images/a.jpg': 'https://signed/a-2' })
      expect(mockedResolveUrls).toHaveBeenCalledTimes(2)
    })

    test('a mounted hook re-resolves stale keys on the periodic check', async () => {
      vi.useFakeTimers()
      mockedResolveUrls.mockResolvedValue({ 'images/a.jpg': 'https://signed/a-1' })
      const { result } = renderHook(() => useResolved(['images/a.jpg']))
      await act(async () => {
        await vi.runOnlyPendingTimersAsync()
      })
      expect(result.current).toEqual({ 'images/a.jpg': 'https://signed/a-1' })

      // Sit mounted past the staleness horizon; the interval must refresh.
      mockedResolveUrls.mockResolvedValue({ 'images/a.jpg': 'https://signed/a-2' })
      await act(async () => {
        await vi.advanceTimersByTimeAsync(9 * 60_000)
      })
      expect(result.current).toEqual({ 'images/a.jpg': 'https://signed/a-2' })
    })

    test('refreshResolved drops a key and re-resolves it (img onError recovery)', async () => {
      mockedResolveUrls.mockResolvedValue({ 'images/a.jpg': 'https://signed/a-1' })
      const { result } = renderHook(() => useResolved(['images/a.jpg']))
      await waitFor(() => {
        expect(result.current).toEqual({ 'images/a.jpg': 'https://signed/a-1' })
      })

      mockedResolveUrls.mockResolvedValue({ 'images/a.jpg': 'https://signed/a-2' })
      act(() => refreshResolved('images/a.jpg'))
      await waitFor(() => {
        expect(result.current).toEqual({ 'images/a.jpg': 'https://signed/a-2' })
      })
      expect(mockedResolveUrls).toHaveBeenCalledTimes(2)
    })

    test('concurrent instances requesting the same missing key resolve once', async () => {
      let release: (v: Record<string, string>) => void = () => {}
      mockedResolveUrls.mockReturnValue(
        new Promise((r) => {
          release = r
        }),
      )
      const first = renderHook(() => useResolved(['images/a.jpg']))
      const second = renderHook(() => useResolved(['images/a.jpg']))
      await act(async () => {
        release({ 'images/a.jpg': 'https://signed/a' })
      })
      // Both instances see the URL, off a single request.
      expect(first.result.current).toEqual({ 'images/a.jpg': 'https://signed/a' })
      expect(second.result.current).toEqual({ 'images/a.jpg': 'https://signed/a' })
      expect(mockedResolveUrls).toHaveBeenCalledTimes(1)
    })
  })
})
