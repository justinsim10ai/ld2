// MLB team ID (from statsapi.mlb.com) → OG.com URL city slug.
// Used to discover OG.com market pages from the sitemap, since the URL slugs
// disambiguate teams that share a city ("chicago-c" = Cubs, "chicago-w" = White Sox).

export const OG_CITY_SLUG_BY_TEAM_ID: Record<number, string> = {
  108: "los-angeles-a",   // Angels
  109: "arizona",         // Diamondbacks
  110: "baltimore",       // Orioles
  111: "boston",          // Red Sox
  112: "chicago-c",       // Cubs
  113: "cincinnati",      // Reds
  114: "cleveland",       // Guardians
  115: "colorado",        // Rockies
  116: "detroit",         // Tigers
  117: "houston",         // Astros
  118: "kansas-city",     // Royals
  119: "los-angeles-d",   // Dodgers
  120: "washington",      // Nationals
  121: "new-york-m",      // Mets
  133: "athletics",       // Athletics (formerly OAK)
  134: "pittsburgh",      // Pirates
  135: "san-diego",       // Padres
  136: "seattle",         // Mariners
  137: "san-francisco",   // Giants
  138: "st-louis",        // Cardinals
  139: "tampa-bay",       // Rays
  140: "texas",           // Rangers
  141: "toronto",         // Blue Jays
  142: "minnesota",       // Twins
  143: "philadelphia",    // Phillies
  144: "atlanta",         // Braves
  145: "chicago-w",       // White Sox
  146: "miami",           // Marlins
  147: "new-york-y",      // Yankees
  158: "milwaukee",       // Brewers
};

export function ogSlugForTeam(teamId: number): string | null {
  return OG_CITY_SLUG_BY_TEAM_ID[teamId] ?? null;
}
