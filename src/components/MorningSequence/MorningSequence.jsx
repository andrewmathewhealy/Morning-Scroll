import { useState, useEffect, useCallback } from "react";
import { db } from "../../firebase.js";
import { doc, getDoc } from "firebase/firestore";
import DailyMoment from "./DailyMoment.jsx";
import PhotoReel from "./PhotoReel.jsx";
import "./morningSequence.css";

// Bundled placeholders, used until a day's content is set in the admin.
const FALLBACK_VIDEO = "/assets/test/morning-video.mp4";
const FALLBACK_PHOTOS = [
  "/assets/test/tokyo-1.jpg",
  "/assets/test/tokyo-2.jpg",
  "/assets/test/tokyo-3.jpg",
];

// Load today's entrance video + photos from morningSequence/{today}, with the
// same date + localStorage-cache convention the other daily widgets use.
// Returns null while resolving, then { video, photos } (falling back to the
// bundled assets when no content is scheduled).
function useEntranceContent() {
  const [content, setContent] = useState(null);

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    const cacheKey = `entrance-v1-${today}`;

    const resolve = (data) => setContent({
      video: data?.videoUrl || FALLBACK_VIDEO,
      photos: data?.photos?.length ? data.photos : FALLBACK_PHOTOS,
    });

    try {
      const cached = JSON.parse(localStorage.getItem(cacheKey));
      if (cached) { resolve(cached); return; }
    } catch { /* ignore a corrupt cache entry and fetch fresh */ }

    (async () => {
      try {
        const snap = await getDoc(doc(db, "morningSequence", today));
        if (snap.exists()) {
          localStorage.setItem(cacheKey, JSON.stringify(snap.data()));
          resolve(snap.data());
        } else {
          resolve(null);
        }
      } catch {
        resolve(null);
      }
    })();
  }, []);

  return content;
}

export default function MorningSequence({ onComplete }) {
  const content = useEntranceContent();
  const [screen, setScreen] = useState("moment");
  const [sequenceDone, setSequenceDone] = useState(false);

  const advanceToPhotos = useCallback(() => {
    setScreen("photos");
  }, []);

  const handleSequenceComplete = useCallback(() => {
    setSequenceDone(true);
    setTimeout(() => {
      const today = new Date().toISOString().split("T")[0];
      localStorage.setItem("morning_sequence_date", today);
      onComplete();
    }, 800);
  }, [onComplete]);

  // Hold on the black background until we know which assets to play, so the
  // right video starts from the first frame instead of swapping mid-play.
  if (!content) return <div className="morning-sequence" />;

  return (
    <div className={`morning-sequence${sequenceDone ? " fade-out" : ""}`}>
      {screen === "moment" && <DailyMoment onAdvance={advanceToPhotos} videoSrc={content.video} />}
      {screen === "photos" && <PhotoReel onComplete={handleSequenceComplete} photos={content.photos} />}
    </div>
  );
}

// Session gate: check if the sequence should show today
const ALWAYS_SHOW = false;
export function shouldShowMorningSequence() {
  if (ALWAYS_SHOW) return true;
  const today = new Date().toISOString().split("T")[0];
  const lastShown = localStorage.getItem("morning_sequence_date");
  return lastShown !== today;
}
