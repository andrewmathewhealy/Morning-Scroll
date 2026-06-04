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
// Returns handlers to spread onto the globe's container element.
export function useGlobeTouch(globeRef, containerRef) {
  const scrollDrag = useRef(null);

  const onPointerDown = useCallback((e) => {
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
        scrollDrag.current = { id: e.pointerId, startY: e.clientY, startTop: scroller.scrollTop, scroller };
        el.setPointerCapture?.(e.pointerId);
      }
    }
  }, [globeRef, containerRef]);

  const onPointerMove = useCallback((e) => {
    const d = scrollDrag.current;
    if (!d || e.pointerId !== d.id) return;
    d.scroller.scrollTop = d.startTop - (e.clientY - d.startY);
  }, []);

  const endDrag = useCallback(() => {
    const controls = globeRef.current?.controls?.();
    if (controls) controls.enableRotate = true;
    const d = scrollDrag.current;
    if (d) {
      containerRef.current?.releasePointerCapture?.(d.id);
      scrollDrag.current = null;
    }
  }, [globeRef, containerRef]);

  return {
    onPointerDownCapture: onPointerDown,
    onPointerMove,
    onPointerUp: endDrag,
    onPointerCancel: endDrag,
  };
}
