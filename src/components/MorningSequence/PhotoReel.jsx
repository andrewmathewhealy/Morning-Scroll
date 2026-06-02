import { useState, useEffect } from "react";

// Today's entrance photos. Swap this for the daily Firebase content later.
const PHOTOS = [
  "/assets/test/tokyo-1.jpg",
  "/assets/test/tokyo-2.jpg",
  "/assets/test/tokyo-3.jpg",
];

export default function PhotoReel({ onComplete }) {
  const [index, setIndex] = useState(0);
  const [loaded, setLoaded] = useState(false);

  // Preload all photos so taps swap instantly
  useEffect(() => {
    let count = 0;
    PHOTOS.forEach((src) => {
      const img = new Image();
      img.onload = () => {
        count++;
        if (count === PHOTOS.length) setLoaded(true);
      };
      img.src = src;
    });
  }, []);

  const handleTap = () => {
    if (index < PHOTOS.length - 1) {
      setIndex((i) => i + 1);
    } else {
      onComplete();
    }
  };

  return (
    <div className="photo-reel" onClick={handleTap}>
      {/* key={index} restarts the fade-in each time the photo changes */}
      <div
        key={index}
        className="reel-photo"
        style={{ backgroundImage: loaded ? `url(${PHOTOS[index]})` : "none" }}
      />
    </div>
  );
}
