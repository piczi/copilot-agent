import React, { memo, useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import { areChartDataPointsEqual, ChartDataPoint, useChartTheme } from './chartUtils'

interface LineChartProps {
  title: string
  xAxis: string
  yAxis: string
  data: ChartDataPoint[]
  seriesName: string
}

const LineChart: React.FC<LineChartProps> = ({ title, data, seriesName }) => {
  const theme = useChartTheme()
  const option = useMemo(
    () => ({
      backgroundColor: 'transparent',
      animationDuration: 800,
      animationEasing: 'quadraticOut',
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
        boundaryGap: false,
        data: data.map((d) => d.name),
        axisLabel: {
          rotate: data.length > 20 ? 45 : 0,
          color: theme.mutedForeground,
          fontSize: 10
        },
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
          type: 'line',
          smooth: true,
          symbol: 'circle',
          symbolSize: 4,
          animationDelay: (index: number) => index * 18,
          data: data.map((d) => d.value),
          lineStyle: { width: 2, color: theme.primary },
          itemStyle: { color: theme.primary },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: 'rgba(99, 102, 241, 0.3)' },
                { offset: 1, color: 'rgba(99, 102, 241, 0.01)' }
              ]
            }
          }
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

function areLineChartPropsEqual(prev: LineChartProps, next: LineChartProps) {
  return (
    prev.title === next.title &&
    prev.xAxis === next.xAxis &&
    prev.yAxis === next.yAxis &&
    prev.seriesName === next.seriesName &&
    areChartDataPointsEqual(prev.data, next.data)
  )
}

export default memo(LineChart, areLineChartPropsEqual)
