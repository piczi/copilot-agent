import React, { memo, useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import { areChartDataPointsEqual, ChartDataPoint, useChartTheme } from './chartUtils'

interface PieChartProps {
  title: string
  data: ChartDataPoint[]
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#84cc16', '#f97316']

const PieChart: React.FC<PieChartProps> = ({ title, data }) => {
  const theme = useChartTheme()
  const option = useMemo(
    () => ({
      backgroundColor: 'transparent',
      animationDuration: 720,
      animationEasing: 'cubicOut',
      title: {
        text: title,
        left: 'center',
        textStyle: { color: theme.foreground, fontSize: 14, fontWeight: 600 }
      },
      tooltip: {
        trigger: 'item',
        formatter: '{b}: {c} ({d}%)',
        backgroundColor: theme.card,
        borderColor: theme.border,
        textStyle: { color: theme.foreground }
      },
      legend: {
        bottom: '0%',
        left: 'center',
        itemWidth: 10,
        itemHeight: 10,
        textStyle: { color: theme.mutedForeground, fontSize: 11 }
      },
      series: [
        {
          type: 'pie',
          radius: ['40%', '65%'],
          center: ['50%', '45%'],
          avoidLabelOverlap: true,
          animationDelay: (index: number) => index * 45,
          itemStyle: {
            borderRadius: 6,
            borderColor: theme.card,
            borderWidth: 2
          },
          label: {
            show: true,
            formatter: '{b}\n{d}%',
            color: theme.foreground,
            fontSize: 11
          },
          emphasis: {
            label: {
              show: true,
              fontSize: 13,
              fontWeight: 'bold'
            }
          },
          data: data.map((item, i) => ({
            ...item,
            itemStyle: { color: COLORS[i % COLORS.length] }
          }))
        },
      ]
    }),
    [data, theme, title]
  )

  return (
    <div className="rendered-surface my-4 rounded-md p-4">
      <ReactECharts option={option} lazyUpdate style={{ height: 320 }} />
    </div>
  )
}

function arePieChartPropsEqual(prev: PieChartProps, next: PieChartProps) {
  return prev.title === next.title && areChartDataPointsEqual(prev.data, next.data)
}

export default memo(PieChart, arePieChartPropsEqual)
