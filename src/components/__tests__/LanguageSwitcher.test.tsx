import { describe, test, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { LanguageSwitcher } from '@/components/LanguageSwitcher'

const LANGS = [
  { code: 'en', label: 'English', draftKey: 'a', isOriginal: true },
  { code: 'hi', label: 'हिंदी', draftKey: 'b', isOriginal: false },
]

describe('LanguageSwitcher', () => {
  test('renders nothing for a single-language comic', () => {
    const { container } = render(
      <LanguageSwitcher languages={[LANGS[0]]} active="en" onChange={() => {}} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  test('marks the active language as the selected tab', () => {
    render(<LanguageSwitcher languages={LANGS} active="hi" onChange={() => {}} />)
    expect(screen.getByRole('tab', { name: 'हिंदी' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'English' })).toHaveAttribute('aria-selected', 'false')
  })

  test('calls onChange with the clicked language code', () => {
    const onChange = vi.fn()
    render(<LanguageSwitcher languages={LANGS} active="en" onChange={onChange} />)
    fireEvent.click(screen.getByRole('tab', { name: 'हिंदी' }))
    expect(onChange).toHaveBeenCalledWith('hi')
  })
})
