import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { ItemIcon } from './ItemIcon'

afterEach(cleanup)

it('reserves its size, loads lazily and falls back to a placeholder block when the image fails', () => {
  const { container } = render(<ItemIcon src="/img/icons/1.png" size={32} />)
  const img = container.querySelector('img')!
  expect(img.getAttribute('width')).toBe('32')
  expect(img.getAttribute('height')).toBe('32')
  expect(img.getAttribute('loading')).toBe('lazy')
  expect(img.getAttribute('decoding')).toBe('async')
  fireEvent.error(img)
  expect(container.querySelector('img')).toBeNull()
  const block = container.querySelector('span.ic') as HTMLElement
  expect(block.style.width).toBe('32px')
  expect(block.style.height).toBe('32px')
})
