import React, { memo, useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import { areChartDataPointsEqual, ChartDataPoint, useChartTheme } from './chartUtils'

interface BarChartProps {
  title: string
  xAxis: string
  yAxis: string
  data: ChartDataPoint[]
  seriesName: string
}

const BarChart: React.FC<BarChartProps> = ({ title, data, seriesName }) => {
  const theme = useChartTheme()
  const option = useMemo(
    () => ({
      backgroundColor: 'transparent',
      animationDuration: 700,
      animationEasing: 'cubicOut',
      animationDelay: (index: number) => index * 24,
      title: {
        text: title,
        left: 'center',
        textStyle: { color: theme.foreground, fontSize: 14, fontWeight: 600 }
      },
      tooltip: {
        trigger: 'axis',
        formatter: '{b}: {c}',
        backgroundColor: theme.card,
        borderColor: theme.border,
        textStyle: { color: theme.foreground }
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '3%',
        containLabel: true
      },
      xAxis: {
        type: 'category',
        data: data.map((d) => d.name),
        axisLabel: { color: theme.mutedForeground, fontSize: 11 },
        axisLine: { lineStyle: { color: theme.border } },
        axisTick: { lineStyle: { color: theme.border } }
      },
      yAxis: {
        type: 'value',
        axisLabel: { color: theme.mutedForeground, fontSize: 11 },
        splitLine: { lineStyle: { type: 'dashed', color: theme.border } }
      },
      series: [
        {
          name: seriesName,
          type: 'bar',
          data: data.map((d) => d.value),
          itemStyle: {
            color: {
              type: 'linear',
              x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: theme.primary },
                { offset: 1, color: 'rgba(129, 140, 248, 0.72)' }
              ]
            },
            borderRadius: [4, 4, 0, 0]
          },
        }
      ]
    }),
    [data, seriesName, theme, title]
  )

  return (
    <div className="rendered-surface my-4 rounded-md p-4">
      <ReactECharts option={option} lazyUpdate style={{ height: 300 }} />
    </div>
  )
}

function areBarChartPropsEqual(prev: BarChartProps, next: BarChartProps) {
  return (
    prev.title === next.title &&
    prev.xAxis === next.xAxis &&
    prev.yAxis === next.yAxis &&
    prev.seriesName === next.seriesName &&
    areChartDataPointsEqual(prev.data, next.data)
  )
}

export default memo(BarChart, areBarChartPropsEqual)
