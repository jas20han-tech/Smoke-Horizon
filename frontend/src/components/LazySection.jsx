import React, { useRef, useState, useEffect, Suspense } from "react";

/**
 * LazySection — IntersectionObserver-based lazy loader.
 * Dynamically imports and mounts child sections when they are
 * ~200px from entering the viewport. Shows a skeleton placeholder
 * until the real content mounts.
 *
 * Usage:
 *   <LazySection loader={() => import("../sections/About")} id="about" />
 */
export default function LazySection({ loader, id, skeletonHeight = "320px" }) {
  const ref = useRef(null);
  const [LazyComponent, setLazyComponent] = useState(null);
  const [triggered, setTriggered] = useState(false);

  useEffect(() => {
    // Respect prefers-reduced-motion — still load the component, just skip
    // the IntersectionObserver delay and load immediately.
    const prefersReduced =
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (prefersReduced) {
      loader().then((mod) => setLazyComponent(() => mod.default));
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !triggered) {
          setTriggered(true);
          loader().then((mod) => setLazyComponent(() => mod.default));
          observer.disconnect();
        }
      },
      { rootMargin: "200px 0px" } // trigger 200px before visible
    );

    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [loader, triggered]);

  return (
    <section id={id} ref={ref} className="lazy-section">
      {LazyComponent ? (
        <Suspense fallback={<SectionSkeleton height={skeletonHeight} />}>
          <LazyComponent />
        </Suspense>
      ) : (
        <SectionSkeleton height={skeletonHeight} />
      )}
    </section>
  );
}

function SectionSkeleton({ height }) {
  return (
    <div className="section-skeleton" style={{ minHeight: height }} aria-hidden="true">
      <div className="skeleton-shimmer" />
    </div>
  );
}
