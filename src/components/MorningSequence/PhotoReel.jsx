import { useState, useEffect } from "react";

export default function PhotoReel({ onComplete, photos }) {
  const [index, setIndex] = useState(0);
  const [loaded, setLoaded] = useState(false);

  // Preload all photos so taps swap instantly
  useEffect(() => {
    let count = 0;
    photos.forEach((src) => {
      const img = new Image();
      img.onload = () => {
        count++;
        if (count === photos.length) setLoaded(true);
      };
      img.src = src;
    });
  }, [photos]);

  const handleTap = () => {
    if (index < photos.length - 1) {
      setIndex((i) => i + 1);
    } else {
      onComplete();
    }
  };

  return (
    <div className="photo-reel" data-haptic="light" onClick={handleTap}>
      {/* key={index} restarts the fade-in each time the photo changes */}
      <div
        key={index}
        className="reel-photo"
        style={{ backgroundImage: loaded ? `url(${photos[index]})` : "none" }}
      />
    </div>
  );
}
