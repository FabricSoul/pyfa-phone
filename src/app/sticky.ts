import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'

/**
 * 会话内记住的状态（sessionStorage）。
 * 读写都包 try/catch，在隐私模式或存储异常时安全降级回默认状态。
 */
const read = <T>(key: string, fallback: T): T => {
  try {
    if (typeof sessionStorage === 'undefined') return fallback
    const v = sessionStorage.getItem(key)
    return v == null || v === 'undefined' ? fallback : (JSON.parse(v) as T)
  } catch {
    return fallback
  }
}

export function useSticky<T>(key: string, initial: T): readonly [T, Dispatch<SetStateAction<T>>] {
  const [v, setV] = useState<T>(() => read(key, initial))

  useEffect(() => {
    try {
      if (typeof sessionStorage !== 'undefined') {
        if (v === undefined) {
          sessionStorage.removeItem(key)
        } else {
          sessionStorage.setItem(key, JSON.stringify(v))
        }
      }
    } catch {
      // 隐私模式或超配额写不进去，不影响当前页面正常使用
    }
  }, [key, v])

  return [v, setV] as const
}
