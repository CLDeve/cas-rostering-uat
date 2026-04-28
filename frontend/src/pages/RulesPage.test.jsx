import { render, screen } from '@testing-library/react'
import RulesPage from './RulesPage'

describe('RulesPage', () => {
  it('renders key rostering rules', () => {
    render(<RulesPage />)

    expect(screen.getByText('Shift Status Definitions')).toBeInTheDocument()
    expect(screen.getByText('Forecasted Hours Formula')).toBeInTheDocument()
    expect(screen.getByText('Consecutive Working Day Rule')).toBeInTheDocument()
    expect(screen.getByText('Start Date Lock Rule')).toBeInTheDocument()
    expect(screen.getByText('OT Rules')).toBeInTheDocument()
  })
})
