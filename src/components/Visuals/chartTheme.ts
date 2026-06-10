function cssHslVar(name: string, fallback: string) {
  if (typeof window === 'undefined') return fallback
  const value = window.getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value ? `hsl(${value})` : fallback
}

export function getChartTheme() {
  return {
    foreground: cssHslVar('--foreground', '#111827'),
    mutedForeground: cssHslVar('--muted-foreground', '#64748b'),
    border: cssHslVar('--border', '#e5e7eb'),
    card: cssHslVar('--card', '#ffffff'),
    primary: cssHslVar('--primary', '#4f46e5')
  }
}
