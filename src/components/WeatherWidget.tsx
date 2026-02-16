import { useState, useEffect } from "react";
import { Droplets, CloudRain, Thermometer } from "lucide-react";

interface WidgetWeather {
  city: string;
  temp: number;
  tempMin: number;
  tempMax: number;
  humidity: number;
  rainChance: number;
  weatherCode: number;
}

const weatherIcons: Record<number, string> = {
  0: "☀️", 1: "🌤️", 2: "⛅", 3: "☁️",
  45: "🌫️", 48: "🌫️", 51: "🌦️", 53: "🌦️", 55: "🌧️",
  61: "🌧️", 63: "🌧️", 65: "🌧️", 71: "🌨️", 73: "🌨️", 75: "🌨️",
  80: "🌦️", 81: "🌧️", 82: "⛈️", 95: "⛈️", 96: "⛈️", 99: "⛈️",
};

const weatherLabels: Record<number, string> = {
  0: "Céu limpo", 1: "Parcialmente limpo", 2: "Parcialmente nublado", 3: "Nublado",
  45: "Neblina", 48: "Neblina", 51: "Garoa leve", 53: "Garoa", 55: "Garoa forte",
  61: "Chuva leve", 63: "Chuva moderada", 65: "Chuva forte",
  71: "Neve leve", 73: "Neve", 75: "Neve forte",
  80: "Pancadas leves", 81: "Pancadas", 82: "Pancadas fortes",
  95: "Tempestade", 96: "Tempestade com granizo", 99: "Tempestade severa",
};

function getIcon(code: number) {
  const closest = Object.keys(weatherIcons).map(Number)
    .reduce((prev, curr) => (Math.abs(curr - code) < Math.abs(prev - code) ? curr : prev));
  return weatherIcons[closest] || "🌡️";
}

function getLabel(code: number) {
  const closest = Object.keys(weatherLabels).map(Number)
    .reduce((prev, curr) => (Math.abs(curr - code) < Math.abs(prev - code) ? curr : prev));
  return weatherLabels[closest] || "Desconhecido";
}

const STORAGE_KEY = "masterview_last_city";

export default function WeatherWidget() {
  const [weather, setWeather] = useState<WidgetWeather | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return;

    const fetchData = async () => {
      try {
        const geoRes = await fetch(
          `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(saved)}&count=1&language=pt`
        );
        const geoData = await geoRes.json();
        if (!geoData.results?.length) return;

        const { latitude, longitude, name } = geoData.results[0];
        const wxRes = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,weather_code&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=1`
        );
        const wxData = await wxRes.json();

        setWeather({
          city: name,
          temp: Math.round(wxData.current.temperature_2m),
          tempMin: Math.round(wxData.daily.temperature_2m_min[0]),
          tempMax: Math.round(wxData.daily.temperature_2m_max[0]),
          humidity: wxData.current.relative_humidity_2m,
          rainChance: wxData.daily.precipitation_probability_max[0] ?? 0,
          weatherCode: wxData.current.weather_code,
        });
      } catch { /* silent */ }
    };

    fetchData();
    const interval = setInterval(fetchData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  if (!weather) {
    return (
      <div className="bg-muted rounded-xl p-4 border border-border text-muted-foreground">
        Nenhuma cidade pesquisada ainda. Vá em Previsão do Tempo para buscar.
      </div>
    );
  }

  return (
    <div className="bg-muted rounded-xl p-5 border border-border max-w-sm">
      <div className="flex items-center gap-3 mb-3">
        <span className="text-4xl">{getIcon(weather.weatherCode)}</span>
        <div>
          <p className="font-semibold text-foreground">{weather.city}</p>
          <p className="text-muted-foreground text-xs">{getLabel(weather.weatherCode)}</p>
        </div>
      </div>
      <p className="text-3xl font-light text-primary mb-3">{weather.temp}°C</p>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="flex items-center gap-1 text-muted-foreground">
          <Thermometer size={12} /> ↓{weather.tempMin}° / ↑{weather.tempMax}°
        </div>
        <div className="flex items-center gap-1 text-muted-foreground">
          <Droplets size={12} /> {weather.humidity}%
        </div>
        <div className="flex items-center gap-1 text-muted-foreground col-span-2">
          <CloudRain size={12} /> Chuva: {weather.rainChance}%
        </div>
      </div>
    </div>
  );
}
