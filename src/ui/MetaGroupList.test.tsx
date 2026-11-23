import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ItemGroup, ItemRow } from '../engine/types'
import { MetaGroupList } from './MetaGroupList'

afterEach(cleanup)

const item = (typeId: number, en: string, meta: ItemRow['meta'], keyValue: number): ItemRow => ({
  typeId, name: { en, zh: en }, iconId: null, meta, metaLevel: null, keyValue, keyLine: `${keyValue} dmg`,
})
const groups: ItemGroup[] = [
  { meta: 'tech2', best: 17.7, items: [item(1, 'Hail S', 'tech2', 17.7), item(2, 'Barrage S', 'tech2', 11)] },
  { meta: 'tech1', best: 12, items: [item(3, 'EMP S', 'tech1', 12)] },
  { meta: 'faction', best: 14, items: [item(4, 'Republic EMP S', 'faction', 14)] },
]

describe('MetaGroupList', () => {
  it('expands only the group holding the current item', () => {
    render(<MetaGroupList groups={groups} currentTypeId={4} />)
    expect(screen.getByText('Republic EMP S')).toBeTruthy()
    expect(screen.queryByText('Hail S')).toBeNull()
    expect(screen.queryByText('EMP S')).toBeNull()
  })

  it('expands the first group when there is no current item', () => {
    render(<MetaGroupList groups={groups} />)
    expect(screen.getByText('Hail S')).toBeTruthy()
    expect(screen.queryByText('EMP S')).toBeNull()
    expect(screen.queryByText('Republic EMP S')).toBeNull()
  })

  it('shows the count and the best value on collapsed groups, and expands on click', () => {
    render(<MetaGroupList groups={groups} />)
    const header = screen.getByRole('button', { name: /Tech I\b(?!I)/ })
    expect(header.getAttribute('aria-expanded')).toBe('false')
    expect(header.textContent).toContain('1')
    expect(header.textContent).toContain('12')
    fireEvent.click(header)
    expect(screen.getByText('EMP S')).toBeTruthy()
  })

  it('applies the default rule again when an async list goes from empty to loaded', () => {
    const { rerender } = render(<MetaGroupList groups={[]} />)
    rerender(<MetaGroupList groups={groups} />)
    expect(screen.getByText('Hail S')).toBeTruthy()
    expect(screen.queryByText('EMP S')).toBeNull()
  })

  it('re-initialises when the current item changes, keeps manual toggles otherwise', async () => {
    const { rerender } = render(<MetaGroupList groups={groups} currentTypeId={1} />)
    fireEvent.click(screen.getByRole('button', { name: /Tech I\b(?!I)/ })) // user opens Tech I
    rerender(<MetaGroupList groups={[...groups]} currentTypeId={1} />) // same object, new array identity
    expect(screen.getByText('EMP S')).toBeTruthy()
    expect(screen.getByText('Hail S')).toBeTruthy()
    rerender(<MetaGroupList groups={groups} currentTypeId={4} />) // current moved to Faction
    expect(screen.getByText('Republic EMP S')).toBeTruthy()
    // The groups that close leave after their 120 ms height animation.
    await waitFor(() => expect(screen.queryByText('Hail S')).toBeNull())
    await waitFor(() => expect(screen.queryByText('EMP S')).toBeNull())
  })

  it('supports controlled expanded and onToggleExpanded', () => {
    const onToggleExpanded = vi.fn()
    render(<MetaGroupList groups={groups} expanded={['tech1']} onToggleExpanded={onToggleExpanded} />)
    expect(screen.getByText('EMP S')).toBeTruthy()
    expect(screen.queryByText('Hail S')).toBeNull()

    const tech2Header = screen.getByRole('button', { name: /Tech II\b/ })
    fireEvent.click(tech2Header)
    expect(onToggleExpanded).toHaveBeenCalledWith('tech2')
  })

  it('uses singular "1 item" for single item and plural "2 items" for multiple items', () => {
    render(<MetaGroupList groups={groups} />)
    const tech1Header = screen.getByRole('button', { name: /Tech I\b(?!I)/ })
    expect(tech1Header.textContent).toContain('1 item')
    expect(tech1Header.textContent).not.toContain('1 items')

    const tech2Header = screen.getByRole('button', { name: /Tech II\b/ })
    expect(tech2Header.textContent).toContain('2 items')
  })
})
