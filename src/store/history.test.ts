import { describe, expect, it } from 'vitest'
import { createHistory, commit, redo, undo } from './history'

describe('fit history', () => {
  it('undoes 50 edits and redoes them in order', () => {
    let history = createHistory(0)
    for (let value = 1; value <= 50; value++) history = commit(history, value)
    for (let value = 49; value >= 0; value--) {
      history = undo(history)
      expect(history.present).toBe(value)
    }
    for (let value = 1; value <= 50; value++) {
      history = redo(history)
      expect(history.present).toBe(value)
    }
  })

  it('clears redo when editing after undo', () => {
    const history = commit(undo(commit(createHistory('A'), 'B')), 'C')
    expect(redo(history)).toBe(history)
    expect(undo(history).present).toBe('A')
  })
})
