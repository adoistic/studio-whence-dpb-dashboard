import { render, screen } from '@testing-library/react'
import { Eyebrow } from '../Eyebrow'

test('Eyebrow renders uppercase text with a gold rule prefix', () => {
  render(<Eyebrow>What&apos;s New</Eyebrow>)
  const text = screen.getByText("What's New")
  expect(text).toHaveClass('uppercase')
  expect(text).toHaveClass('tracking-eyebrow')
  expect(text.previousElementSibling).toHaveClass('bg-brand-gold')
})
