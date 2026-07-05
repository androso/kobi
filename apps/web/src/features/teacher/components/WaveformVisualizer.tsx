import { useEffect, useRef } from "react";

const COLS = 60;
const ROWS = 13; // odd → a true center row
const CENTER = (ROWS - 1) / 2;

// From the amplitude core outward: deep red → orange → tan tips
const WAVE_COLORS = [
  "#8A0000", // core
  "#BA1A1A",
  "#D8391A",
  "#E8641A",
  "#F0871E",
  "#E9C07D", // tips
];
const BG_COLOR = "#D9D2CC";
const BG_ALPHA = 0.55;

/**
 * Live audio-style waveform: each column is an amplitude bar of dots mirrored
 * around the center row. The envelope animates so peaks drift like real speech.
 * When the transcription backend lands, drive `amplitude` from real audio RMS.
 */
export function WaveformVisualizer({ active = true }: { active?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const activeRef = useRef(active);
  activeRef.current = active;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    function resize() {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas!.getBoundingClientRect();
      canvas!.width = rect.width * dpr;
      canvas!.height = rect.height * dpr;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();

    function draw() {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas!.width / dpr;
      const h = canvas!.height / dpr;
      ctx!.clearRect(0, 0, w, h);

      const cellW = w / COLS;
      const cellH = h / ROWS;
      const radius = Math.min(cellW, cellH) * 0.3;
      const t = Date.now() / 1000;
      const isActive = activeRef.current;

      for (let col = 0; col < COLS; col++) {
        // Layered sines → organic, drifting speech-like envelope.
        // When idle, collapse to a flat baseline of quiet dots.
        const a =
          Math.sin(col * 0.5 + t * 3.0) * 0.5 +
          Math.sin(col * 0.23 - t * 1.7) * 0.3 +
          Math.sin(col * 0.11 + t * 0.9) * 0.2;
        const amp = isActive ? (Math.abs(a) * 0.9 + 0.08) * CENTER : 0.05 * CENTER;

        for (let row = 0; row < ROWS; row++) {
          const dist = Math.abs(row - CENTER);
          const cx = col * cellW + cellW / 2;
          const cy = row * cellH + cellH / 2;

          ctx!.beginPath();
          ctx!.arc(cx, cy, radius, 0, Math.PI * 2);

          if (dist <= amp) {
            const norm = dist / CENTER; // 0 core → 1 tip
            const idx = Math.min(
              Math.floor(norm * WAVE_COLORS.length),
              WAVE_COLORS.length - 1
            );
            ctx!.globalAlpha = 1;
            ctx!.fillStyle = WAVE_COLORS[idx];
          } else {
            ctx!.globalAlpha = BG_ALPHA;
            ctx!.fillStyle = BG_COLOR;
          }
          ctx!.fill();
        }
      }

      ctx!.globalAlpha = 1;
      rafRef.current = requestAnimationFrame(draw);
    }

    draw();

    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
    };
  }, []);

  return <canvas ref={canvasRef} className="w-full h-full" />;
}
