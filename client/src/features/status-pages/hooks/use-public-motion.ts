import { useEffect, useRef, useState } from "react";
import { countUpValue } from "../lib/public-motion";

const reducedQuery = "(prefers-reduced-motion: reduce)";

export const usePrefersReducedMotion = (): boolean => {
  const [reduced, setReduced] = useState(
    () => typeof window !== "undefined" && window.matchMedia(reducedQuery).matches,
  );
  useEffect(() => {
    const media = window.matchMedia(reducedQuery);
    const onChange = () => setReduced(media.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);
  return reduced;
};

export const useNow = (intervalMs = 30_000): number => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    const onVisible = () => {
      if (document.visibilityState === "visible") setNow(Date.now());
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [intervalMs]);
  return now;
};

export const useCountUp = (target: number | null, durationMs = 900): number | null => {
  const reduced = usePrefersReducedMotion();
  const [value, setValue] = useState<number | null>(target);
  const started = useRef(false);

  useEffect(() => {
    if (target === null) {
      setValue(null);
      return;
    }
    if (reduced || started.current) {
      setValue(target);
      return;
    }
    started.current = true;
    let frame = 0;
    const startTime = performance.now();
    const tick = (time: number) => {
      const progress = (time - startTime) / durationMs;
      setValue(countUpValue(target, progress));
      if (progress < 1) frame = requestAnimationFrame(tick);
      else setValue(target);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [durationMs, reduced, target]);

  return value;
};

export const useFlash = (key: string | number | null, durationMs = 1600): boolean => {
  const previous = useRef(key);
  const [active, setActive] = useState(false);
  useEffect(() => {
    if (previous.current === key) return;
    previous.current = key;
    setActive(true);
    const timer = window.setTimeout(() => setActive(false), durationMs);
    return () => window.clearTimeout(timer);
  }, [durationMs, key]);
  return active;
};

export const useFreshIds = (ids: string[]): Set<string> => {
  const known = useRef<Set<string> | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const signature = ids.join("|");
  useEffect(() => {
    if (known.current === null) {
      known.current = new Set(ids);
      return;
    }
    const added = ids.filter((id) => !known.current?.has(id));
    ids.forEach((id) => known.current?.add(id));
    if (added.length === 0) return;
    setFresh(new Set(added));
    const timer = window.setTimeout(() => setFresh(new Set()), 2400);
    return () => window.clearTimeout(timer);
  }, [signature]);
  return fresh;
};

export const useElementWidth = <T extends HTMLElement>() => {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    setWidth(node.clientWidth);
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setWidth(Math.round(entry.contentRect.width));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
};

export const useScrolled = (threshold = 8): boolean => {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > threshold);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [threshold]);
  return scrolled;
};
