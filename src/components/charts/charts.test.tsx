import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BarChart } from './BarChart'
import { DonutChart } from './DonutChart'
import { ProgressList } from './ProgressList'
import { TrendChart } from './TrendChart'

describe('accessible chart primitives', () => {
  it('describes a trend and every plotted value', () => {
    render(
      <TrendChart
        title="Headcount growth"
        summary="Headcount increased from 18 to 22."
        data={[{ label: 'May', value: 18 }, { label: 'June', value: 22 }]}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Headcount growth' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /may 18.*june 22/i })).toBeInTheDocument()
    expect(screen.getByText('Headcount increased from 18 to 22.')).toBeInTheDocument()
  })

  it('renders an honest empty state when a bar series has no data', () => {
    render(<BarChart title="Monthly payroll" summary="Approved payroll runs by month." data={[]} />)

    expect(screen.getByText('No data available yet.')).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('keeps all-zero bar values visible to assistive technology', () => {
    render(
      <BarChart
        title="Leave utilisation"
        summary="Days used by leave type."
        data={[{ label: 'Annual', value: 0 }, { label: 'Sick', value: 0 }]}
      />,
    )

    expect(screen.getByRole('img', { name: /annual 0.*sick 0/i })).toBeInTheDocument()
  })

  it('provides labelled donut segments and a total', () => {
    render(
      <DonutChart
        title="Team distribution"
        summary="Employees by department."
        data={[{ label: 'Operations', value: 16 }, { label: 'Management', value: 2 }]}
      />,
    )

    expect(screen.getByText('18')).toBeInTheDocument()
    expect(screen.getByText('Operations')).toBeInTheDocument()
    expect(screen.getByText('16 (89%)')).toBeInTheDocument()
  })

  it('shows progress using text as well as colour', () => {
    render(
      <ProgressList
        title="Project health"
        summary="Completion by active project."
        items={[{ label: 'Mbarara Site Upgrade', value: 75, total: 100 }]}
      />,
    )

    expect(screen.getByText('Mbarara Site Upgrade')).toBeInTheDocument()
    expect(screen.getByText('75%')).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: 'Mbarara Site Upgrade' })).toHaveAttribute('aria-valuenow', '75')
  })
})
