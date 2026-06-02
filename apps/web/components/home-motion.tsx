"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(useGSAP, ScrollTrigger);

export function HomeMotion() {
  useGSAP(() => {
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) return;

    gsap.from(".taste-hero-copy > *", {
      y: 34,
      opacity: 0,
      duration: 1.05,
      ease: "power3.out",
      stagger: 0.08,
    });


    gsap.utils.toArray<HTMLElement>(".taste-bento-card").forEach((card, index) => {
      gsap.from(card, {
        y: 48,
        opacity: 0,
        duration: 0.9,
        ease: "power3.out",
        scrollTrigger: {
          trigger: card,
          start: "top 86%",
        },
        delay: index * 0.035,
      });
    });


    gsap.utils.toArray<HTMLElement>(".taste-stack-card").forEach((card, index) => {
      gsap.fromTo(
        card,
        { scale: 0.96, opacity: 0.72, y: 36 },
        {
          scale: 1,
          opacity: 1,
          y: 0,
          ease: "power2.out",
          scrollTrigger: {
            trigger: card,
            start: "top 82%",
            end: "top 48%",
            scrub: true,
          },
        },
      );
      card.style.zIndex = String(index + 1);
    });
  }, []);

  return null;
}
