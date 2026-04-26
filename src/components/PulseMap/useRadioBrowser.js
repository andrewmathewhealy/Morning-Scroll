import { useState, useCallback } from "react";

const RADIO_API = "https://de1.api.radio-browser.info";
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

function cacheKey(lat, lng) {
  return `radio-${lat.toFixed(0)}-${lng.toFixed(0)}`;
}

function getCached(lat, lng) {
  try {
    const raw = localStorage.getItem(cacheKey(lat, lng));
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL) return null;
    return data;
  } catch {
    return null;
  }
}

function setCache(lat, lng, data) {
  try {
    localStorage.setItem(cacheKey(lat, lng), JSON.stringify({ ts: Date.now(), data }));
  } catch {}
}

// Reverse geocode lat/lng to country code using free BigDataCloud API
async function getCountryCode(lat, lng) {
  try {
    const res = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`
    );
    if (!res.ok) return null;
    const data = await res.json();
    return {
      code: data.countryCode,      // e.g. "US", "JP", "BR"
      name: data.countryName,      // e.g. "United States", "Japan"
    };
  } catch {
    return null;
  }
}

export function useRadioBrowser() {
  const [stations, setStations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [country, setCountry] = useState(null);

  const fetchStations = useCallback(async (lat, lng) => {
    const cached = getCached(lat, lng);
    if (cached) {
      setStations(cached.stations);
      setCountry(cached.country);
      setError(cached.stations.length === 0 ? "No stations found nearby" : null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    setStations([]);
    setCountry(null);

    // Step 1: Reverse geocode to get the country
    const geo = await getCountryCode(lat, lng);

    if (!geo?.code) {
      // Ocean or unknown — try direct geo search as fallback
      try {
        const url = `${RADIO_API}/json/stations/search?geo_lat=${lat}&geo_long=${lng}&geo_dist=2000&limit=15&order=clickcount&reverse=true&lastcheckok=1&has_geo_info=true`;
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          const valid = data.filter(s => s.url_resolved);
          if (valid.length > 0) {
            setStations(valid);
            setCountry(null);
            setCache(lat, lng, { stations: valid, country: null });
            setLoading(false);
            return;
          }
        }
      } catch {}

      setStations([]);
      setError("No stations found here — try tapping on land");
      setCache(lat, lng, { stations: [], country: null });
      setLoading(false);
      return;
    }

    setCountry(geo.name);

    // Step 2: Search by country code — gives the best, most relevant results
    try {
      const url = `${RADIO_API}/json/stations/bycountrycodeexact/${geo.code}?limit=15&order=clickcount&reverse=true&lastcheckok=1`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        const valid = data.filter(s => s.url_resolved);
        if (valid.length > 0) {
          setStations(valid);
          setCache(lat, lng, { stations: valid, country: geo.name });
          setLoading(false);
          return;
        }
      }
    } catch {}

    // Step 3: Fallback — search by country name (looser match)
    try {
      const url = `${RADIO_API}/json/stations/search?country=${encodeURIComponent(geo.name)}&limit=15&order=clickcount&reverse=true&lastcheckok=1`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        const valid = data.filter(s => s.url_resolved);
        if (valid.length > 0) {
          setStations(valid);
          setCache(lat, lng, { stations: valid, country: geo.name });
          setLoading(false);
          return;
        }
      }
    } catch {}

    setStations([]);
    setError("No stations found nearby — try spinning somewhere new");
    setCache(lat, lng, { stations: [], country: geo.name });
    setLoading(false);
  }, []);

  return { stations, loading, error, country, fetchStations };
}
