import { useMemo, useState, useEffect } from "react";

// Compute subsolar point from current UTC time
// Reused from Globe.jsx lines 394-403
function getSubsolarPoint() {
  const now = new Date();
  const utcH = now.getUTCHours() + now.getUTCMinutes() / 60 + now.getUTCSeconds() / 3600;
  const dayOfYear = Math.floor((now - new Date(now.getUTCFullYear(), 0, 0)) / 86400000);
  const sunLatDeg = -23.45 * Math.cos((2 * Math.PI / 365) * (dayOfYear + 10));
  const sunLonDeg = (12 - utcH) * 15;
  return { lat: sunLatDeg, lng: sunLonDeg };
}

export function useGlobeData(selectedCoords, stations) {
  const [ringsData, setRingsData] = useState([]);

  // Station points
  const pointsData = useMemo(() => {
    if (!stations || !stations.length) return [];
    const maxClicks = Math.max(...stations.map(s => s.clickcount || 1));
    return stations.map(s => ({
      lat: parseFloat(s.geo_lat),
      lng: parseFloat(s.geo_long),
      size: 0.3 + (s.clickcount / maxClicks) * 0.5,
      color: "#F2B899",
      name: s.name,
    }));
  }, [stations]);

  // Tap ring animation
  useEffect(() => {
    if (!selectedCoords) {
      setRingsData([]);
      return;
    }
    setRingsData([{
      lat: selectedCoords.lat,
      lng: selectedCoords.lng,
      maxR: 6,
      propagationSpeed: 3,
      repeatPeriod: 1200,
    }]);
    const timer = setTimeout(() => setRingsData([]), 4000);
    return () => clearTimeout(timer);
  }, [selectedCoords]);

  // Solar terminator (recompute every 5 min)
  const [sunPos, setSunPos] = useState(getSubsolarPoint);
  useEffect(() => {
    const id = setInterval(() => setSunPos(getSubsolarPoint()), 5 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  return { pointsData, ringsData, sunPos };
}
