import { describe, test, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ConversationAnalysis } from '../ConversationAnalysis'
import type { AiConversationAnalysis } from '@/types/aiConversation'

function anchor(line: number, resolved: boolean) {
  return { quote: `q${line}`, charStart: 0, charEnd: 1, line, resolved }
}

const sample: AiConversationAnalysis = {
  tldr: 'A conversation building the MediComics framework.',
  chapters: [
    { id: 'c1', title: 'Framing the world', summary: 'Aarogya Lok introduced.', anchor: anchor(12, true) },
    { id: 'c2', title: 'The villain', summary: 'Fearasur appears.', anchor: anchor(48, false) },
  ],
  keyOutputs: [
    { label: 'Nurse Muskaan', detail: 'the recurring guide character', anchor: anchor(60, true) },
  ],
  sources: [
    { label: 'Obesity in India (paper)', kind: 'paper' },
    { label: 'WHO fact sheet' },
  ],
}

describe('ConversationAnalysis', () => {
  test('renders the TL;DR text', () => {
    render(<ConversationAnalysis analysis={sample} onJump={() => {}} />)
    expect(screen.getByText(/building the MediComics framework/i)).toBeInTheDocument()
  })

  test('renders all chapter entries', () => {
    render(<ConversationAnalysis analysis={sample} onJump={() => {}} />)
    expect(screen.getByText('Framing the world')).toBeInTheDocument()
    expect(screen.getByText('The villain')).toBeInTheDocument()
    expect(screen.getByText(/Aarogya Lok introduced/i)).toBeInTheDocument()
  })

  test('renders a key-outputs section', () => {
    render(<ConversationAnalysis analysis={sample} onJump={() => {}} />)
    expect(screen.getByText('Key outputs')).toBeInTheDocument()
    expect(screen.getByText('Nurse Muskaan')).toBeInTheDocument()
    expect(screen.getByText(/the recurring guide character/i)).toBeInTheDocument()
  })

  test('renders a sources list with kind tags', () => {
    render(<ConversationAnalysis analysis={sample} onJump={() => {}} />)
    expect(screen.getByText('Sources')).toBeInTheDocument()
    expect(screen.getByText('Obesity in India (paper)')).toBeInTheDocument()
    expect(screen.getByText('paper')).toBeInTheDocument()
    expect(screen.getByText('WHO fact sheet')).toBeInTheDocument()
  })

  test('clicking a resolved chapter calls onJump with its line', () => {
    const onJump = vi.fn()
    render(<ConversationAnalysis analysis={sample} onJump={onJump} />)
    screen.getByRole('button', { name: /Framing the world/i }).click()
    expect(onJump).toHaveBeenCalledWith(12)
  })

  test('clicking a resolved key output calls onJump with its line', () => {
    const onJump = vi.fn()
    render(<ConversationAnalysis analysis={sample} onJump={onJump} />)
    screen.getByRole('button', { name: /Nurse Muskaan/i }).click()
    expect(onJump).toHaveBeenCalledWith(60)
  })

  test('an unresolved chapter renders but is not a button', () => {
    render(<ConversationAnalysis analysis={sample} onJump={() => {}} />)
    expect(screen.getByText('The villain')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /The villain/i })).not.toBeInTheDocument()
  })

  test('self-hides empty sections (no headings)', () => {
    const empty: AiConversationAnalysis = { tldr: 'Only a lead.', chapters: [], keyOutputs: [], sources: [] }
    render(<ConversationAnalysis analysis={empty} onJump={() => {}} />)
    expect(screen.queryByText('Chapters')).not.toBeInTheDocument()
    expect(screen.queryByText('Key outputs')).not.toBeInTheDocument()
    expect(screen.queryByText('Sources')).not.toBeInTheDocument()
  })
})
