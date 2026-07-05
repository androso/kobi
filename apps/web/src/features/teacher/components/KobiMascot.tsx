// Kobi mascot — a black spiky blob creature with two white eyes.
// Rendered as an SVG so it stays crisp at any size. `currentColor` drives the body.

const SPIKES = 10;
const OUTER = 46;
const INNER = 33;
const CX = 50;
const CY = 52;

const bodyPoints = Array.from({ length: SPIKES * 2 }, (_, i) => {
  const r = i % 2 === 0 ? OUTER : INNER;
  const ang = (Math.PI / SPIKES) * i - Math.PI / 2;
  return `${(CX + r * Math.cos(ang)).toFixed(2)},${(CY + r * Math.sin(ang)).toFixed(2)}`;
}).join(" ");

export function KobiMascot({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* Spiky body — rounded stroke softens the star tips into blobby bumps */}
      <polygon
        points={bodyPoints}
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="7"
        strokeLinejoin="round"
      />
      {/* Eyes */}
      <ellipse cx="43" cy="50" rx="5" ry="9" fill="#ffffff" />
      <ellipse cx="59" cy="50" rx="5" ry="9" fill="#ffffff" />
    </svg>
  );
}
