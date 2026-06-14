import { useEffect, useMemo, useState } from 'react'
import { getChartTheme } from './chartTheme'

export interface ChartDataPoint {
  name: string
  value: number
}

interface RawChartItem {
  [key: string]: unknown
}

function normalizeChartItem(item: RawChartItem): ChartDataPoint {
  const name =
    typeof item.name === 'string'
      ? item.name
      : typeof item.date === 'string'
        ? item.date
        : typeof item.x === 'string'
          ? item.x
          : String(item.name ?? item.date ?? item.x ?? '')

  const rawValue = item.value ?? item.price ?? item.y ?? item.rate ?? item.count
  const value = typeof rawValue === 'number' && Number.isFinite(rawValue) ? rawValue : Number(rawValue) || 0

  return { name, value }
}

export function normalizeChartData(data: unknown): ChartDataPoint[] {
  if (!Array.isArray(data)) return []
  return data
    .filter((item): item is RawChartItem => item !== null && typeof item === 'object')
    .map(normalizeChartItem)
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
