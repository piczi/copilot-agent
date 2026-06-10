import { WeatherData } from '@/types'

const GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search'
const WEATHER_URL = 'https://api.open-meteo.com/v1/forecast'

interface GeocodingResult {
  results?: Array<{
    latitude: number
    longitude: number
    name: string
  }>
}

function getWeatherCondition(code: number): string {
  const codes: Record<number, string> = {
    0: '晴',
    1: '多云', 2: '多云', 3: '多云',
    45: '雾', 48: '雾',
    51: '毛毛雨', 53: '小雨', 55: '中雨',
    61: '小雨', 63: '中雨', 65: '大雨',
    71: '小雪', 73: '中雪', 75: '大雪',
    80: '阵雨', 81: '阵雨', 82: '暴雨',
    95: '雷暴', 96: '雷暴', 99: '雷暴'
  }
  return codes[code] || '未知'
}

export async function fetchWeather(city: string): Promise<WeatherData> {
  const geoRes = await fetch(`${GEOCODING_URL}?name=${encodeURIComponent(city)}&count=1&language=zh&format=json`)
  const geoData = (await geoRes.json()) as GeocodingResult

  if (!geoData.results || geoData.results.length === 0) {
    throw new Error(`未找到城市: ${city}`)
  }

  const { latitude, longitude, name } = geoData.results[0]

  const weatherRes = await fetch(
    `${WEATHER_URL}?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=7&language=zh`
  )
  const weatherData = await weatherRes.json()

  const current = weatherData.current
  const daily = weatherData.daily

  const forecast = daily.time.slice(1, 4).map((time: string, i: number) => ({
    day: time === daily.time[1] ? '明天' : time === daily.time[2] ? '后天' : '大后天',
    high: Math.round(daily.temperature_2m_max[i + 1]),
    low: Math.round(daily.temperature_2m_min[i + 1]),
    condition: getWeatherCondition(daily.weather_code[i + 1])
  }))

  return {
    city: name,
    temperature: Math.round(current.temperature_2m),
    feelsLike: Math.round(current.apparent_temperature),
    condition: getWeatherCondition(current.weather_code),
    humidity: current.relative_humidity_2m,
    windSpeed: Math.round(current.wind_speed_10m),
    forecast
  }
}
