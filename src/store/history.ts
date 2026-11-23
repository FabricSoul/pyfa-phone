const LIMIT = 50

export interface History<T> {
  past: T[]
  present: T
  future: T[]
}

export function createHistory<T>(present: T): History<T> {
  return { past: [], present, future: [] }
}

export function commit<T>(history: History<T>, present: T): History<T> {
  if (Object.is(present, history.present)) return history
  return { past: [...history.past, history.present].slice(-LIMIT), present, future: [] }
}

export function undo<T>(history: History<T>): History<T> {
  if (!history.past.length) return history
  const present = history.past[history.past.length - 1] as T
  return { past: history.past.slice(0, -1), present, future: [history.present, ...history.future] }
}

export function redo<T>(history: History<T>): History<T> {
  if (!history.future.length) return history
  const [present, ...future] = history.future
  return { past: [...history.past, history.present], present: present as T, future }
}
