import WeatherCard from './WeatherCard'
import LineChart from './LineChart'
import BarChart from './BarChart'
import PieChart from './PieChart'
import Terminal from './Terminal'

export const visualRegistry: Record<string, React.FC<any>> = {
  weather_card: WeatherCard,
  line_chart: LineChart,
  bar_chart: BarChart,
  pie_chart: PieChart,
  terminal: Terminal
}
