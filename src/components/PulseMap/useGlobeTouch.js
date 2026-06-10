import { useCallback, useRef } from "react";
import { Raycaster, Sphere, Vector2, Vector3 } from "three";

// Touch behaviour for an inline react-globe.gl widget sitting inside a scroll
// view. The globe canvas sets touch-action: none, which otherwise swallows the
// touch and blocks page scrolling. So:
//   - touch ON the sphere   → let the globe rotate / handle the tap (no scroll)
//   - touch OFF the sphere  → we scroll the page ourselves (the corners/sides)
// This keeps on-sphere taps pure (they never scroll the page) while still
// letting you swipe past the widget by its edges.
//
// Because we drive scrollTop by hand, we also add our own momentum/inertia on
// release — otherwise the scroll stops dead the instant the finger lifts, which
// feels jagged compared with the native momentum scrolling everywhere else.
//
// Returns handlers to spread onto the globe's container element.
export function useGlobeTouch(globeRef, containerRef) {
  const scrollDrag = useRef(null);
  const inertiaRaf = useRef(0);

  const stopInertia = useCallback(() => {
    if (inertiaRaf.current) {
      cancelAnimationFrame(inertiaRaf.current);
      inertiaRaf.current = 0;
    }
  }, []);

  const onPointerDown = useCallback((e) => {
    stopInertia(); // a fresh touch cancels any in-flight fling
    const globe = globeRef.current;
    const el = containerRef.current;
    if (!globe || !el) return;
    const controls = globe.controls?.();
    if (!controls) return;

    const rect = el.getBoundingClientRect();
    const ndc = new Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    const ray = new Raycaster();
    ray.setFromCamera(ndc, globe.camera());
    const radius = globe.getGlobeRadius ? globe.getGlobeRadius() : 100;
    const onGlobe = ray.ray.intersectsSphere(new Sphere(new Vector3(0, 0, 0), radius));

    controls.enableRotate = onGlobe;

    if (!onGlobe) {
      const scroller = el.closest(".rubber-scroll, .screen");
      if (scroller) {
        scrollDrag.current = {
          id: e.pointerId,
          startY: e.clientY,
          startTop: scroller.scrollTop,
          scroller,
          // Ring buffer of recent {y, t} samples for accurate flick velocity.
          samples: [{ y: e.clientY, t: e.timeStamp || performance.now() }],
        };
        el.setPointerCapture?.(e.pointerId);
      }
    }
  }, [globeRef, containerRef, stopInertia]);

  const onPointerMove = useCallback((e) => {
    const d = scrollDrag.current;
    if (!d || e.pointerId !== d.id) return;
    d.scroller.scrollTop = d.startTop - (e.clientY - d.startY);

    const now = e.timeStamp || performance.now();
    d.samples.push({ y: e.clientY, t: now });
    // Keep only the last ~120ms of motion — that's the flick that matters.
    while (d.samples.length > 2 && now - d.samples[0].t > 120) d.samples.shift();
  }, []);

  const endDrag = useCallback((e) => {
    const controls = globeRef.current?.controls?.();
    if (controls) controls.enableRotate = true;

    const d = scrollDrag.current;
    if (!d) return;
    containerRef.current?.releasePointerCapture?.(d.id);
    scrollDrag.current = null;

    // Velocity from the oldest sample in the recent window to the newest, so a
    // genuine flick is measured accurately (no over-smoothing damping it).
    const now = (e && e.timeStamp) || performance.now();
    const last = d.samples[d.samples.length - 1];
    const first = d.samples[0];
    const span = last.t - first.t;
    // Only fling if the gesture was still moving when it lifted.
    const stale = now - last.t > 70;
    let perFrame = 0;
    if (!stale && span > 0) {
      const vel = -(last.y - first.y) / span; // scrollTop px per ms
      perFrame = vel * 16;                     // px per ~16ms frame
    }
    if (Math.abs(perFrame) < 0.6) return;
    // Cap absurd velocities but allow a strong, long fling.
    perFrame = Math.max(-90, Math.min(90, perFrame));

    const scroller = d.scroller;
    const friction = 0.975; // higher = longer glide (≈40× the per-frame step)
    const step = () => {
      scroller.scrollTop += perFrame;
      perFrame *= friction;
      const top = scroller.scrollTop;
      const maxTop = scroller.scrollHeight - scroller.clientHeight;
      if (Math.abs(perFrame) > 0.3 && top > 0 && top < maxTop) {
        inertiaRaf.current = requestAnimationFrame(step);
      } else {
        inertiaRaf.current = 0;
      }
    };
    inertiaRaf.current = requestAnimationFrame(step);
  }, [globeRef, containerRef]);

  return {
    onPointerDownCapture: onPointerDown,
    onPointerMove,
    onPointerUp: endDrag,
    onPointerCancel: endDrag,
  };
}
