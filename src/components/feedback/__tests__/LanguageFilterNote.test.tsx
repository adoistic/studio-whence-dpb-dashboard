import { describe, test, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { LanguageFilterNote } from '@/components/feedback/LanguageFilterNote'

describe('LanguageFilterNote', () => {
  test('renders nothing when no other-language comments exist', () => {
    const { container } = render(
      <LanguageFilterNote activeLabel="हिंदी" otherCount={0} showingAll={false} onToggle={() => {}} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  test('names the language and counts what is filtered out', () => {
    render(
      <LanguageFilterNote activeLabel="हिंदी" otherCount={50} showingAll={false} onToggle={() => {}} />,
    )
    expect(screen.getByText(/showing हिंदी/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /50 more in other languages/i })).toBeInTheDocument()
  })

  test('offers a way back when showing everything', () => {
    render(
      <LanguageFilterNote activeLabel="हिंदी" otherCount={50} showingAll onToggle={() => {}} />,
    )
    expect(screen.getByRole('button', { name: /हिंदी only/i })).toBeInTheDocument()
  })

  test('toggles', () => {
    const onToggle = vi.fn()
    render(
      <LanguageFilterNote activeLabel="हिंदी" otherCount={50} showingAll={false} onToggle={onToggle} />,
    )
    fireEvent.click(screen.getByRole('button'))
    expect(onToggle).toHaveBeenCalled()
  })
})
