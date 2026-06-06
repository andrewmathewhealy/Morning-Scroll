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
          lastY: e.clientY,
          lastT: e.timeStamp || performance.now(),
          velocity: 0, // scrollTop px per ms
        };
        el.setPointerCapture?.(e.pointerId);
      }
    }
  }, [globeRef, containerRef, stopInertia]);

  const onPointerMove = useCallback((e) => {
    const d = scrollDrag.current;
    if (!d || e.pointerId !== d.id) return;
    d.scroller.scrollTop = d.startTop - (e.clientY - d.startY);

    // Track velocity (scrollTop grows as the finger moves up). Exponential
    // smoothing keeps one noisy sample from dominating the fling.
    const now = e.timeStamp || performance.now();
    const dt = now - d.lastT;
    if (dt > 0) {
      const v = -(e.clientY - d.lastY) / dt;
      d.velocity = d.velocity * 0.6 + v * 0.4;
      d.lastY = e.clientY;
      d.lastT = now;
    }
  }, []);

  const endDrag = useCallback((e) => {
    const controls = globeRef.current?.controls?.();
    if (controls) controls.enableRotate = true;

    const d = scrollDrag.current;
    if (!d) return;
    containerRef.current?.releasePointerCapture?.(d.id);
    scrollDrag.current = null;

    // Only fling on an actual flick — if the finger paused before lifting,
    // honour that and stop (matches native behaviour).
    const now = (e && e.timeStamp) || performance.now();
    const fresh = now - d.lastT < 60;
    let perFrame = (fresh ? d.velocity : 0) * 16; // ≈ px per 16ms frame
    if (Math.abs(perFrame) < 0.8) return;

    const scroller = d.scroller;
    const friction = 0.95;
    const step = () => {
      scroller.scrollTop += perFrame;
      perFrame *= friction;
      const top = scroller.scrollTop;
      const maxTop = scroller.scrollHeight - scroller.clientHeight;
      if (Math.abs(perFrame) > 0.4 && top > 0 && top < maxTop) {
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
