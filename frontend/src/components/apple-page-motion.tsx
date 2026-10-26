"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import gsap from "gsap";

export function ApplePageMotion({ children }: { children: ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    if (!containerRef.current) return;
    const prefersReduced = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) return;

    const ctx = gsap.context(() => {
      gsap.fromTo(
        containerRef.current,
        { opacity: 0, y: 8 },
        { opacity: 1, y: 0, duration: 0.38, ease: "power3.out" }
      );

      const cards = containerRef.current?.querySelectorAll(".stat-card, .card, .page-heading");
      if (cards && cards.length > 0) {
        gsap.fromTo(
          cards,
          { opacity: 0, y: 12 },
          {
            opacity: 1,
            y: 0,
            duration: 0.44,
            stagger: 0.04,
            ease: "power2.out",
            delay: 0.02,
          }
        );
      }
    }, containerRef);

    return () => ctx.revert();
  }, [pathname]);

  return (
    <div ref={containerRef} className="apple-motion-stage" style={{ minWidth: 0, width: "100%" }}>
      {children}
    </div>
  );
}
