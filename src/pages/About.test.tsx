import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import About from './About'

describe('About page', () => {
  it('contains GPLv3 license mention and source code links', () => {
    render(
      <MemoryRouter>
        <About />
      </MemoryRouter>
    )

    expect(screen.getByText(/GPLv3/i)).toBeDefined()

    const links = screen.getAllByRole('link')
    const hrefs = links.map((l) => l.getAttribute('href'))
    expect(hrefs).toContain('https://github.com/FabricSoul/pyfa-phone')
    expect(hrefs).toContain('https://github.com/pyfa-org/Pyfa')
  })
})
