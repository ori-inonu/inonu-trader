"use client";

/** The quiet rain behind the command centre (lib/hud/rain.ts). Decorative: hidden from assistive technology, no pointer, and off for a person who asked the system for less motion (hud.css). */
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { rainColumn, rainColumnCount } from "@/lib/hud/rain";

export default function HudRain() {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const on = (): void => setWidth(window.innerWidth);
    on();
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  const count = rainColumnCount(width);
  // a column is made from its own index: a wider window only adds columns, the ones on screen are left as they are
  const columns = useMemo(() => Array.from({ length: count }, (_, i) => rainColumn(i)), [count]);
  return (
    <div className="hud-rain" aria-hidden="true">
      {columns.map((c, i) => (
        <span
          key={i}
          className="hud-rain-col"
          style={{ left: c.x, fontSize: c.sizePx, "--d": `${c.durationS}s`, "--delay": `${c.delayS}s`, "--o": c.opacity } as CSSProperties}
        >
          {c.glyphs}
        </span>
      ))}
    </div>
  );
}
