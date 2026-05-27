import type { WeatherSnapshot } from "../types";
import { fetchJson } from "./http";

interface PointsResponse {
  properties: { forecastHourly: string };
}

interface HourlyForecastResponse {
  properties: {
    periods: Array<{
      startTime: string;
      endTime: string;
      temperature: number;
      temperatureUnit: string;
      windSpeed: string;
      windDirection: string;
      shortForecast: string;
    }>;
  };
}

const COMPASS_DEG: Record<string, number> = {
  N: 0, NNE: 22.5, NE: 45, ENE: 67.5,
  E: 90, ESE: 112.5, SE: 135, SSE: 157.5,
  S: 180, SSW: 202.5, SW: 225, WSW: 247.5,
  W: 270, WNW: 292.5, NW: 315, NNW: 337.5,
};

export async function fetchParkWeatherAt(
  lat: number,
  lon: number,
  targetIso: string,
): Promise<WeatherSnapshot | null> {
  if (lat === 0 && lon === 0) return null;
  try {
    const points = await fetchJson<PointsResponse>(
      `https://api.weather.gov/points/${lat.toFixed(4)},${lon.toFixed(4)}`,
      { timeoutMs: 6000 },
    );
    const hourlyUrl = points.properties?.forecastHourly;
    if (!hourlyUrl) return null;
    const hourly = await fetchJson<HourlyForecastResponse>(hourlyUrl, { timeoutMs: 6000 });
    const target = new Date(targetIso).getTime();
    const periods = hourly.properties?.periods ?? [];
    let best = periods[0];
    let bestDelta = Number.POSITIVE_INFINITY;
    for (const p of periods) {
      const delta = Math.abs(new Date(p.startTime).getTime() - target);
      if (delta < bestDelta) {
        best = p;
        bestDelta = delta;
      }
    }
    if (!best) return null;
    return {
      windSpeedMph: parseWindSpeed(best.windSpeed),
      windDirectionDegrees: COMPASS_DEG[best.windDirection] ?? 0,
      temperatureF: best.temperature ?? 72,
      shortForecast: best.shortForecast ?? "",
      startTimeIso: best.startTime,
    };
  } catch {
    return null;
  }
}

function parseWindSpeed(raw: string | undefined): number {
  if (!raw) return 0;
  // "10 mph" or "5 to 10 mph" -> take the high end
  const matches = raw.match(/\d+/g);
  if (!matches || matches.length === 0) return 0;
  return parseInt(matches[matches.length - 1], 10);
}
