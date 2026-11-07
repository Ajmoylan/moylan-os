import { agents } from "~/agents/registry";

/**
 * Static NEX emblem: the non-WebGL fallback poster (ARCHITECTURE §9, tier 0).
 * Pure, deterministic SVG (identical on prerender and hydration), no animation, no inline styles.
 * The interactive particle core replaces it visually in Milestone 3 but this remains the fallback.
 */

const CX = 200;
const CY = 200;
const R = 138;

// Stacked orbital rings (the PDF's NEX motif): latitude slices of a sphere seen slightly from above.
const rings = Array.from({ length: 11 }, (_, index) => {
  const t = (index - 5) / 6; // -0.83 … 0.83
  const rx = R * Math.sqrt(1 - t * t);
  return {
    cy: (CY + t * R * 0.62).toFixed(1),
    rx: rx.toFixed(1),
    ry: (rx * 0.2).toFixed(1),
    opacity: (0.22 + 0.5 * (1 - Math.abs(t))).toFixed(2),
  };
});

// Great-circle filaments wrapping the sphere (the blueprint's NEX motif).
const filaments = [-28, 24, 72].map((angle) => ({ angle }));

// Deterministic particle scatter on a golden-angle spiral.
const particles = Array.from({ length: 46 }, (_, index) => {
  const angle = index * 2.399963;
  const radius = 24 + ((index * 37) % 168);
  return {
    x: (CX + Math.cos(angle) * radius).toFixed(1),
    y: (CY + Math.sin(angle) * radius * 0.92).toFixed(1),
    r: (index % 7 === 0 ? 2.2 : index % 3 === 0 ? 1.5 : 1).toFixed(1),
    opacity: (0.25 + ((index * 13) % 10) / 16).toFixed(2),
  };
});

export function NexEmblem({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 400 400"
      role="img"
      aria-label={agents.nex.visualDescription}
      className={`text-nex ${className}`}
    >
      <defs>
        <radialGradient id="nex-core" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.9" />
          <stop offset="35%" stopColor="currentColor" stopOpacity="0.35" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="nex-halo" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.14" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </radialGradient>
      </defs>

      <circle cx={CX} cy={CY} r="196" fill="url(#nex-halo)" />
      <circle
        cx={CX}
        cy={CY}
        r="182"
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.16"
        strokeWidth="0.75"
      />
      <circle
        cx={CX}
        cy={CY}
        r="192"
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.1"
        strokeWidth="0.75"
        strokeDasharray="2 6"
      />

      <g fill="none" stroke="currentColor" strokeWidth="0.9">
        {filaments.map(({ angle }) => (
          <ellipse
            key={angle}
            cx={CX}
            cy={CY}
            rx={R + 10}
            ry="46"
            strokeOpacity="0.28"
            transform={`rotate(${angle} ${CX} ${CY})`}
          />
        ))}
        {rings.map((ring) => (
          <ellipse
            key={ring.cy}
            cx={CX}
            cy={ring.cy}
            rx={ring.rx}
            ry={ring.ry}
            strokeOpacity={ring.opacity}
          />
        ))}
      </g>

      <g fill="currentColor">
        {particles.map((particle, index) => (
          <circle
            key={index}
            cx={particle.x}
            cy={particle.y}
            r={particle.r}
            fillOpacity={particle.opacity}
          />
        ))}
      </g>

      <circle cx={CX} cy={CY} r="58" fill="url(#nex-core)" />
      <circle cx={CX} cy={CY} r="5" fill="#e6f0f3" />
    </svg>
  );
}
