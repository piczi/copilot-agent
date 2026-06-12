import React from 'react'
import {
  Cloud,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Droplets,
  Sun,
  Wind
} from 'lucide-react'

interface ForecastItem {
  day: string
  high: number
  low: number
  condition: string
}

interface WeatherCardProps {
  city: string
  temperature: number
  feelsLike: number
  condition: string
  humidity: number
  windSpeed: number
  forecast: ForecastItem[]
}

const WeatherCard: React.FC<WeatherCardProps> = ({
  city = '未知城市',
  temperature = 0,
  feelsLike = 0,
  condition = '未知',
  humidity = 0,
  windSpeed = 0,
  forecast = []
}) => {
  const getConditionIcon = (c: string) => {
    const map: Record<string, React.ElementType> = {
      '晴': Sun,
      '多云': CloudSun,
      '阴': Cloud,
      '小雨': CloudRain,
      '中雨': CloudRain,
      '大雨': CloudLightning,
      '毛毛雨': CloudRain,
      '阵雨': CloudRain,
      '小雪': CloudSnow,
      '中雪': CloudSnow,
      '大雪': CloudSnow,
      '雾': CloudFog,
      '雷暴': CloudLightning,
      '未知': CloudSun
    }
    return map[c] || CloudSun
  }

  const ConditionIcon = getConditionIcon(condition)

  return (
    <div className="rendered-surface relative mx-auto my-4 max-w-sm overflow-hidden rounded-md p-5">
      <div className="relative mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-foreground">{city}</h3>
          <p className="text-sm text-muted-foreground">{condition}</p>
        </div>
        <div className="rendered-soft-surface flex h-14 w-14 items-center justify-center rounded-md text-primary ring-1 ring-border/70">
          <ConditionIcon size={30} />
        </div>
      </div>

      <div className="relative mb-4 flex items-end gap-2">
        <span className="text-5xl font-bold tracking-tight text-foreground">{temperature}°</span>
        <span className="mb-2 text-sm text-muted-foreground">体感 {feelsLike}°</span>
      </div>

      <div className="relative mb-4 flex gap-3 text-sm text-muted-foreground">
        <div className="rendered-soft-surface flex items-center gap-1.5 rounded-md px-3 py-1.5 ring-1 ring-border/50">
          <Droplets size={14} className="text-primary" />
          <span>{humidity}%</span>
        </div>
        <div className="rendered-soft-surface flex items-center gap-1.5 rounded-md px-3 py-1.5 ring-1 ring-border/50">
          <Wind size={14} className="text-primary" />
          <span>{windSpeed} km/h</span>
        </div>
      </div>

      <div className="relative border-t border-border/70 pt-3">
        <div className="flex justify-between">
          {forecast.map((f, i) => {
            const ForecastIcon = getConditionIcon(f.condition)
            return (
              <div key={i} className="text-center">
                <p className="mb-1 text-xs text-muted-foreground">{f.day}</p>
                <ForecastIcon className="mx-auto mb-1 text-primary" size={18} />
                <p className="text-xs font-medium text-foreground">
                  {f.low}° / {f.high}°
                </p>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default WeatherCard
