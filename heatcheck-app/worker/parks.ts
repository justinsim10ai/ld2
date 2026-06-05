import type { ParkInfo } from "./types";

// MLB venue lookup. Values are publicly sourced approximations:
// - hrFactor / kFactor: rolling FanGraphs Park Factors (100 = neutral). Updated occasionally.
// - cfBearingDegrees: compass bearing from home plate toward center field (0 = N, 90 = E).
//   Used only for wind-carry math (cos of angle between wind direction and CF).
// - isDome: true means we ignore outdoor wind. Retractable roofs are flagged true and we
//   downweight wind regardless of forecast.
//
// Keyed by both venueId (from MLB Stats API schedule.venue.id) and a normalized name fallback.
// If a venue isn't matched, scoring falls back to neutral values.

const PARK_LIST: ParkInfo[] = [
  { venueId: 19, name: "Dodger Stadium", city: "Los Angeles, CA", lat: 34.0739, lon: -118.2400, hrFactor: 99, kFactor: 100, cfBearingDegrees: 25, isDome: false },
  { venueId: 1, name: "Tropicana Field", city: "St. Petersburg, FL", lat: 27.7682, lon: -82.6534, hrFactor: 95, kFactor: 99, cfBearingDegrees: 45, isDome: true },
  { venueId: 2392, name: "Fenway Park", city: "Boston, MA", lat: 42.3467, lon: -71.0972, hrFactor: 102, kFactor: 100, cfBearingDegrees: 45, isDome: false },
  { venueId: 3313, name: "Yankee Stadium", city: "Bronx, NY", lat: 40.8296, lon: -73.9262, hrFactor: 110, kFactor: 100, cfBearingDegrees: 340, isDome: false },
  { venueId: 31, name: "PNC Park", city: "Pittsburgh, PA", lat: 40.4469, lon: -80.0058, hrFactor: 97, kFactor: 99, cfBearingDegrees: 75, isDome: false },
  { venueId: 17, name: "Wrigley Field", city: "Chicago, IL", lat: 41.9484, lon: -87.6553, hrFactor: 102, kFactor: 100, cfBearingDegrees: 33, isDome: false },
  { venueId: 4, name: "Guaranteed Rate Field", city: "Chicago, IL", lat: 41.8300, lon: -87.6338, hrFactor: 100, kFactor: 100, cfBearingDegrees: 25, isDome: false },
  { venueId: 7, name: "Rate Field", city: "Chicago, IL", lat: 41.8300, lon: -87.6338, hrFactor: 100, kFactor: 100, cfBearingDegrees: 25, isDome: false },
  { venueId: 5, name: "Progressive Field", city: "Cleveland, OH", lat: 41.4958, lon: -81.6852, hrFactor: 99, kFactor: 100, cfBearingDegrees: 35, isDome: false },
  { venueId: 2394, name: "Comerica Park", city: "Detroit, MI", lat: 42.3390, lon: -83.0485, hrFactor: 96, kFactor: 100, cfBearingDegrees: 75, isDome: false },
  { venueId: 7, name: "Kauffman Stadium", city: "Kansas City, MO", lat: 39.0517, lon: -94.4803, hrFactor: 95, kFactor: 100, cfBearingDegrees: 35, isDome: false },
  { venueId: 3289, name: "Target Field", city: "Minneapolis, MN", lat: 44.9817, lon: -93.2776, hrFactor: 98, kFactor: 100, cfBearingDegrees: 65, isDome: false },
  { venueId: 14, name: "Rogers Centre", city: "Toronto, ON", lat: 43.6414, lon: -79.3894, hrFactor: 98, kFactor: 100, cfBearingDegrees: 0, isDome: true },
  { venueId: 22, name: "Camden Yards", city: "Baltimore, MD", lat: 39.2839, lon: -76.6217, hrFactor: 103, kFactor: 100, cfBearingDegrees: 62, isDome: false },
  { venueId: 21, name: "Oriole Park at Camden Yards", city: "Baltimore, MD", lat: 39.2839, lon: -76.6217, hrFactor: 103, kFactor: 100, cfBearingDegrees: 62, isDome: false },
  { venueId: 32, name: "Globe Life Field", city: "Arlington, TX", lat: 32.7475, lon: -97.0815, hrFactor: 106, kFactor: 100, cfBearingDegrees: 0, isDome: true },
  { venueId: 2392, name: "Minute Maid Park", city: "Houston, TX", lat: 29.7574, lon: -95.3554, hrFactor: 101, kFactor: 100, cfBearingDegrees: 350, isDome: true },
  { venueId: 2395, name: "Daikin Park", city: "Houston, TX", lat: 29.7574, lon: -95.3554, hrFactor: 101, kFactor: 100, cfBearingDegrees: 350, isDome: true },
  { venueId: 2680, name: "Angel Stadium", city: "Anaheim, CA", lat: 33.8003, lon: -117.8827, hrFactor: 99, kFactor: 100, cfBearingDegrees: 70, isDome: false },
  { venueId: 2602, name: "Petco Park", city: "San Diego, CA", lat: 32.7073, lon: -117.1566, hrFactor: 92, kFactor: 101, cfBearingDegrees: 35, isDome: false },
  { venueId: 2395, name: "T-Mobile Park", city: "Seattle, WA", lat: 47.5914, lon: -122.3325, hrFactor: 94, kFactor: 101, cfBearingDegrees: 30, isDome: true },
  { venueId: 2737, name: "Oracle Park", city: "San Francisco, CA", lat: 37.7786, lon: -122.3893, hrFactor: 90, kFactor: 101, cfBearingDegrees: 95, isDome: false },
  { venueId: 2889, name: "Citi Field", city: "Queens, NY", lat: 40.7571, lon: -73.8458, hrFactor: 100, kFactor: 100, cfBearingDegrees: 7, isDome: false },
  { venueId: 3289, name: "Citizens Bank Park", city: "Philadelphia, PA", lat: 39.9061, lon: -75.1665, hrFactor: 107, kFactor: 100, cfBearingDegrees: 8, isDome: false },
  { venueId: 4705, name: "Truist Park", city: "Atlanta, GA", lat: 33.8908, lon: -84.4677, hrFactor: 105, kFactor: 100, cfBearingDegrees: 30, isDome: false },
  { venueId: 3309, name: "Nationals Park", city: "Washington, DC", lat: 38.8730, lon: -77.0074, hrFactor: 100, kFactor: 100, cfBearingDegrees: 25, isDome: false },
  { venueId: 4169, name: "loanDepot park", city: "Miami, FL", lat: 25.7782, lon: -80.2197, hrFactor: 94, kFactor: 100, cfBearingDegrees: 65, isDome: true },
  { venueId: 16, name: "American Family Field", city: "Milwaukee, WI", lat: 43.0280, lon: -87.9712, hrFactor: 102, kFactor: 100, cfBearingDegrees: 5, isDome: true },
  { venueId: 31, name: "Great American Ball Park", city: "Cincinnati, OH", lat: 39.0974, lon: -84.5081, hrFactor: 113, kFactor: 100, cfBearingDegrees: 12, isDome: false },
  { venueId: 96, name: "Coors Field", city: "Denver, CO", lat: 39.7559, lon: -104.9942, hrFactor: 119, kFactor: 99, cfBearingDegrees: 36, isDome: false },
  { venueId: 24, name: "Chase Field", city: "Phoenix, AZ", lat: 33.4453, lon: -112.0667, hrFactor: 100, kFactor: 100, cfBearingDegrees: 23, isDome: true },
  { venueId: 26, name: "Busch Stadium", city: "St. Louis, MO", lat: 38.6226, lon: -90.1928, hrFactor: 95, kFactor: 100, cfBearingDegrees: 65, isDome: false },
  { venueId: 2756, name: "Sutter Health Park", city: "Sacramento, CA", lat: 38.5807, lon: -121.5135, hrFactor: 100, kFactor: 100, cfBearingDegrees: 45, isDome: false },
  { venueId: 4666, name: "George M. Steinbrenner Field", city: "Tampa, FL", lat: 27.9801, lon: -82.5042, hrFactor: 100, kFactor: 100, cfBearingDegrees: 45, isDome: false },
];

function normalize(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

const byId = new Map<number, ParkInfo>();
const byName = new Map<string, ParkInfo>();
for (const park of PARK_LIST) {
  if (!byId.has(park.venueId)) byId.set(park.venueId, park);
  byName.set(normalize(park.name), park);
}

export const NEUTRAL_PARK: ParkInfo = {
  venueId: 0,
  name: "Unknown",
  city: "",
  lat: 0,
  lon: 0,
  hrFactor: 100,
  kFactor: 100,
  cfBearingDegrees: 0,
  isDome: false,
};

export function lookupPark(venueId: number, venueName?: string): ParkInfo {
  const byIdHit = byId.get(venueId);
  if (byIdHit) return byIdHit;
  if (venueName) {
    const byNameHit = byName.get(normalize(venueName));
    if (byNameHit) return byNameHit;
  }
  return { ...NEUTRAL_PARK, name: venueName ?? NEUTRAL_PARK.name };
}
