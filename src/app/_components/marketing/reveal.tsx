"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Scroll-reveal wrapper ported from the mockup's `data-reveal` behavior:
 * fades/slides a section in once it enters the viewport.
 *
 * Defaults to fully visible — both the server-rendered markup and a
 * visitor with JavaScript disabled must see real content, not a
 * permanently-opacity:0 section (the mockup's own inline `style="opacity:0"`
 * has exactly this flaw, since it depends entirely on its own JS to ever
 * reveal anything). The reveal/hide animation is opt-in, applied only once
 * an effect confirms JS actually ran, and `prefers-reduced-motion: reduce`
 * skips the hide step entirely. A safety-net timer also guarantees a
 * section can never stay hidden if the observer never fires.
 */
export function Reveal({
  children,
  delayMs = 0,
}: {
  children: React.ReactNode;
  delayMs?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    // eslint-disable-next-line react-hooks/set-state-in-effect -- opt into the hide-then-reveal animation only once JS is confirmed to have mounted
    setVisible(false);

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setTimeout(() => setVisible(true), delayMs);
            observer.disconnect();
          }
        }
      },
      { threshold: 0.06 },
    );
    observer.observe(node);

    const safetyNet = setTimeout(() => setVisible(true), 2200);

    return () => {
      observer.disconnect();
      clearTimeout(safetyNet);
    };
  }, [delayMs]);

  return (
    <div
      ref={ref}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "none" : "translateY(22px)",
        transition: "opacity .7s cubic-bezier(.2,.7,.2,1), transform .7s cubic-bezier(.2,.7,.2,1)",
      }}
    >
      {children}
    </div>
  );
}
