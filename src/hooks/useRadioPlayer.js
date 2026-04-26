import { useState, useRef, useCallback, useEffect } from "react";

export function useRadioPlayer() {
  const audioRef = useRef(null);
  const [station, setStation] = useState(null);
  const [status, setStatus] = useState("idle"); // idle | loading | playing | paused | error

  const play = useCallback((newStation) => {
    // Stop current
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.removeAttribute("src");
      audioRef.current.load();
    }

    if (!newStation?.url_resolved) return;

    setStation(newStation);
    setStatus("loading");

    const audio = new Audio(newStation.url_resolved);
    audioRef.current = audio;

    audio.onplaying = () => setStatus("playing");
    audio.onwaiting = () => setStatus("loading");
    audio.onpause = () => {
      if (audio === audioRef.current) setStatus("paused");
    };
    audio.onerror = () => {
      if (audio === audioRef.current) setStatus("error");
    };

    audio.play().catch(() => setStatus("error"));
  }, []);

  const pause = useCallback(() => {
    if (audioRef.current && status === "playing") {
      audioRef.current.pause();
    }
  }, [status]);

  const resume = useCallback(() => {
    if (audioRef.current && status === "paused") {
      audioRef.current.play().catch(() => setStatus("error"));
    }
  }, [status]);

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.removeAttribute("src");
      audioRef.current.load();
      audioRef.current = null;
    }
    setStation(null);
    setStatus("idle");
  }, []);

  const togglePlay = useCallback(() => {
    if (status === "playing") pause();
    else if (status === "paused") resume();
  }, [status, pause, resume]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.removeAttribute("src");
        audioRef.current.load();
      }
    };
  }, []);

  return { station, status, play, pause, resume, stop, togglePlay };
}
