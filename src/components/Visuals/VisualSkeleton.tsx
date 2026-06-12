interface VisualSkeletonProps {
  type?: string
}

const chartTypes = new Set(['line_chart', 'bar_chart', 'pie_chart'])

const VisualSkeleton: React.FC<VisualSkeletonProps> = ({ type }) => {
  if (type === 'weather_card') {
    return (
      <div className="rendered-surface mx-auto my-4 max-w-sm animate-pulse rounded-md p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="space-y-2">
            <div className="h-5 w-24 rounded rendered-soft-surface" />
            <div className="h-3 w-16 rounded rendered-soft-surface" />
          </div>
          <div className="h-12 w-12 rounded-md rendered-soft-surface" />
        </div>
        <div className="mb-4 flex items-end gap-3">
          <div className="h-12 w-20 rounded rendered-soft-surface" />
          <div className="mb-2 h-3 w-16 rounded rendered-soft-surface" />
        </div>
        <div className="mb-4 flex gap-4">
          <div className="h-4 w-14 rounded rendered-soft-surface" />
          <div className="h-4 w-16 rounded rendered-soft-surface" />
        </div>
        <div className="grid grid-cols-4 gap-3 border-t border-border pt-3">
          {[0, 1, 2, 3].map((item) => (
            <div key={item} className="space-y-2">
              <div className="mx-auto h-3 w-10 rounded rendered-soft-surface" />
              <div className="mx-auto h-6 w-6 rounded-md rendered-soft-surface" />
              <div className="mx-auto h-3 w-12 rounded rendered-soft-surface" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (type && chartTypes.has(type)) {
    return (
      <div className="rendered-surface my-4 animate-pulse rounded-md p-4">
        <div className="mx-auto mb-6 h-4 w-32 rounded rendered-soft-surface" />
        <div className="flex h-64 items-end gap-3 border-b border-l border-border px-3 pb-3">
          {[45, 60, 36, 72, 54, 84, 64, 78].map((height, index) => (
            <div key={index} className="flex flex-1 items-end">
              <div className="w-full rounded-t bg-primary/20" style={{ height: `${height}%` }} />
            </div>
          ))}
        </div>
        <div className="mt-3 flex justify-between">
          {[0, 1, 2, 3, 4].map((item) => (
            <div key={item} className="h-3 w-10 rounded rendered-soft-surface" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="rendered-surface my-4 animate-pulse rounded-md p-4">
      <div className="mb-3 h-4 w-28 rounded rendered-soft-surface" />
      <div className="space-y-2">
        <div className="h-3 w-full rounded rendered-soft-surface" />
        <div className="h-3 w-5/6 rounded rendered-soft-surface" />
        <div className="h-3 w-2/3 rounded rendered-soft-surface" />
      </div>
    </div>
  )
}

export default VisualSkeleton
