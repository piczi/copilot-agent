import { useEffect, useMemo, useState } from 'react'
import { getChartTheme } from './chartTheme'

export interface ChartDataPoint {
  name: string
  value: number
}

export function areChartDataPointsEqual(a: ChartDataPoint[], b: ChartDataPoint[]) {
  if (a === b) return true
  if (a.length !== b.length) return false

  for (let i = 0; i < a.length; i += 1) {
    if (a[i].name !== b[i].name || a[i].value !== b[i].value) {
      return false
    }
  }

  return true
}

export function useChartTheme() {
  const [themeKey, setThemeKey] = useState(() => {
    if (typeof document === 'undefined') return ''
    return document.documentElement.className
  })

  useEffect(() => {
    if (typeof MutationObserver === 'undefined') return

    const root = document.documentElement
    const observer = new MutationObserver(() => {
      setThemeKey(root.className)
    })

    observer.observe(root, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])

  return useMemo(() => getChartTheme(), [themeKey])
}
