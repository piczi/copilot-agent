export const VISUAL_TYPES = [
  'weather_card',
  'line_chart',
  'bar_chart',
  'pie_chart',
  'terminal'
] as const

export type VisualType = (typeof VISUAL_TYPES)[number]

export function isVisualType(value: string): value is VisualType {
  return (VISUAL_TYPES as readonly string[]).includes(value)
}
