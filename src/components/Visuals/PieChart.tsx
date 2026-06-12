import React from 'react'
import ReactECharts from 'echarts-for-react'
import { getChartTheme } from './chartTheme'

interface PieChartProps {
  title: string
  data: Array<{ name: string; value: number }>
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#84cc16', '#f97316']

const PieChart: React.FC<PieChartProps> = ({ title, data }) => {
  const theme = getChartTheme()
  const option = {
    backgroundColor: 'transparent',
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
      }
    ]
  }

  return (
    <div className="rendered-surface my-4 rounded-md p-4">
      <ReactECharts option={option} style={{ height: 320 }} />
    </div>
  )
}

export default PieChart
