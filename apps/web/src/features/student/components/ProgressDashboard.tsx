import { useEffect, useMemo, useRef, useState } from "react";
import { Award, CheckCircle2, Flame, GraduationCap, HelpCircle, Star, Target } from "lucide-react";
import type { Artefacto, ArtefactoBand, ArtefactoSubmission } from "../../../lib/store";

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false;
}

/** Flips to true one frame after mount, so mount-gated CSS transitions run. */
function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);
  return mounted;
}

/** Eased count-up to `target`; jumps straight to the value under reduced motion. */
function useCountUp(target: number, duration = 900): number {
  const [value, setValue] = useState(0);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (prefersReducedMotion()) {
      setValue(target);
      return;
    }
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(target * eased));
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, duration]);

  return value;
}

interface ProgressDashboardProps {
  artefactos: Artefacto[];
  submissions: ArtefactoSubmission[];
  studentName: string;
}

// Fixed categorical order + hues (validated: light surface, CVD-safe with the
// always-present % labels as secondary encoding). Never cycled.
const BANDS: { key: ArtefactoBand; label: string; color: string }[] = [
  { key: "support", label: "Apoyo", color: "#5b8def" },
  { key: "core", label: "Base", color: "#2f9e8f" },
  { key: "challenge", label: "Reto", color: "#e0a54e" },
];

export function ProgressDashboard({ artefactos, submissions, studentName }: ProgressDashboardProps) {
  const mine = useMemo(
    () => submissions.filter((sub) => sub.studentName === studentName),
    [submissions, studentName],
  );

  const completedIds = useMemo(
    () => new Set(mine.filter((sub) => sub.status === "completed").map((sub) => sub.artefactoId)),
    [mine],
  );

  const completedCount = artefactos.filter((a) => completedIds.has(a.id)).length;
  const goal = artefactos.length ? Math.round((completedCount / artefactos.length) * 100) : 0;

  const earnedScore = mine.reduce((sum, sub) => sum + sub.score, 0);
  const answeredTotal = mine.reduce((sum, sub) => sum + sub.total, 0);
  const precision = answeredTotal ? Math.round((earnedScore / answeredTotal) * 100) : 0;
  const dominio = answeredTotal ? Math.round((earnedScore / answeredTotal) * 100) : 0;

  const totalAttempts = mine.reduce((sum, sub) => sum + sub.attempts, 0);
  const totalHints = mine.reduce((sum, sub) => sum + sub.hintsUsed, 0);
  const points = earnedScore * 50;

  const level = goal >= 100 ? "Experto" : goal >= 67 ? "Avanzado" : goal >= 34 ? "Intermedio" : "Principiante";
  const precisionTag = precision >= 80 ? "Excelente" : precision >= 50 ? "Bien" : "A mejorar";

  const mounted = useMounted();
  const goalDisplay = useCountUp(goal);
  const precisionDisplay = useCountUp(precision);
  const dominioDisplay = useCountUp(dominio);

  const bandStats = BANDS.map((band) => {
    const items = artefactos.filter((a) => a.band === band.key);
    const done = items.filter((a) => completedIds.has(a.id)).length;
    return { ...band, total: items.length, done, pct: items.length ? Math.round((done / items.length) * 100) : 0 };
  });

  const trend = useMemo(
    () =>
      [...mine]
        .sort((a, b) => a.submittedAt - b.submittedAt)
        .map((sub) => (sub.total ? Math.round((sub.score / sub.total) * 100) : 0)),
    [mine],
  );

  const recent = useMemo(() => {
    const last = [...mine].sort((a, b) => b.submittedAt - a.submittedAt)[0];
    if (!last) return null;
    const artefacto = artefactos.find((a) => a.id === last.artefactoId);
    return artefacto ? { artefacto, submission: last } : null;
  }, [mine, artefactos]);

  return (
    <div className="grid gap-5 xl:grid-cols-3">
      {/* Progress ring + per-band legend */}
      <section className="rounded-3xl bg-white p-6 shadow-[0_8px_30px_rgba(43,43,43,0.05)] duration-700 animate-in fade-in slide-in-from-bottom-3 fill-mode-both">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-[#2b2b2b]">Progreso</h2>
          <span className="rounded-full bg-[#f0ede7] px-3 py-1 text-xs font-semibold text-[#7c8189]">
            Esta clase
          </span>
        </div>

        <div className="mt-4 flex items-center gap-6">
          <ProgressRings stats={bandStats} centerPct={goal} mounted={mounted} />
          <div>
            <p className="text-3xl font-bold text-[#2b2b2b]">{goalDisplay}%</p>
            <p className="text-sm text-[#8a8f98]">Meta completada</p>
          </div>
        </div>

        <ul className="mt-6 space-y-4">
          {bandStats.map((band) => (
            <li key={band.key}>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm font-semibold text-[#2b2b2b]">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: band.color }} />
                  {band.label}
                </span>
                <span className="text-sm font-bold text-[#2b2b2b]">{band.pct}%</span>
              </div>
              <p className="mt-0.5 pl-[18px] text-xs text-[#8a8f98]">
                {band.done}/{band.total} actividades completadas
              </p>
            </li>
          ))}
        </ul>
      </section>

      {/* Precision (highlight) + Dominio meter */}
      <div className="flex flex-col gap-5">
        <section
          className="rounded-3xl bg-[#eaf3c9] p-6 duration-700 animate-in fade-in slide-in-from-bottom-3 fill-mode-both"
          style={{ animationDelay: "120ms" }}
        >
          <div className="flex items-center gap-2 text-[#3f4a1e]">
            <Target className="h-5 w-5" />
            <h2 className="text-base font-bold">Precisión</h2>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <p className="text-4xl font-bold text-[#2b2b2b]">{precisionDisplay}%</p>
            <span className="rounded-full bg-white px-3 py-1 text-sm font-semibold text-[#3f4a1e]">
              {precisionTag}
            </span>
          </div>
          <p className="mt-2 text-sm text-[#4a5327]">
            {answeredTotal
              ? `${earnedScore} de ${answeredTotal} respuestas correctas.`
              : "Aún no has respondido actividades."}
          </p>
          <Sparkline values={trend} mounted={mounted} />
        </section>

        <section
          className="rounded-3xl bg-[#dbe8fb] p-6 duration-700 animate-in fade-in slide-in-from-bottom-3 fill-mode-both"
          style={{ animationDelay: "220ms" }}
        >
          <div className="flex items-center gap-2 text-[#243b5e]">
            <Award className="h-5 w-5" />
            <h2 className="text-base font-bold">Dominio</h2>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <p className="text-4xl font-bold text-[#2b2b2b]">{dominioDisplay}%</p>
            <span className="rounded-full bg-white px-3 py-1 text-sm font-semibold text-[#243b5e]">
              {dominio >= 67 ? "Muy bien" : "En camino"}
            </span>
          </div>
          <SegmentedMeter pct={dominio} mounted={mounted} />
          <p className="mt-3 text-sm text-[#2f4468]">¡Sigue así, {studentName}!</p>
        </section>
      </div>

      {/* Profile + recent activity */}
      <div
        className="flex flex-col gap-5 duration-700 animate-in fade-in slide-in-from-bottom-3 fill-mode-both"
        style={{ animationDelay: "320ms" }}
      >
        <section className="rounded-3xl bg-white p-6 shadow-[0_8px_30px_rgba(43,43,43,0.05)]">
          <h2 className="text-lg font-bold text-[#2b2b2b]">Mi perfil</h2>
          <div className="mt-4 flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#e3f3ee] text-[#2f9e8f]">
              <GraduationCap className="h-9 w-9" strokeWidth={1.75} />
            </div>
            <div className="min-w-0">
              <p className="truncate text-xl font-bold text-[#2b2b2b]">{studentName}</p>
              <p className="mt-0.5 flex items-center gap-2 text-sm text-[#8a8f98]">
                <Star className="h-4 w-4 fill-[#2f9e8f] text-[#2f9e8f]" />
                {level}
                <span className="text-[#c2c6cd]">·</span>
                {points.toLocaleString("es")} pts
              </p>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-3 gap-2 rounded-2xl bg-[#f7f5f0] p-4 text-center">
            <ProfileStat icon={CheckCircle2} label="Completadas" value={`${completedCount}/${artefactos.length}`} />
            <ProfileStat icon={Target} label="Intentos" value={`${totalAttempts}`} />
            <ProfileStat icon={HelpCircle} label="Pistas" value={`${totalHints}`} />
          </div>
        </section>

        <section className="rounded-3xl bg-white p-6 shadow-[0_8px_30px_rgba(43,43,43,0.05)]">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-[#2b2b2b]">Actividad reciente</h2>
            <Flame className="h-5 w-5 text-[#e0a54e]" />
          </div>
          {recent ? (
            <div className="mt-4">
              <p className="text-sm font-bold text-[#2b2b2b]">{recent.artefacto.title}</p>
              <p className="text-xs text-[#8a8f98]">Objetivo {recent.artefacto.objective}</p>
              <dl className="mt-4 space-y-2.5 text-sm">
                <RecentRow label="Puntaje" value={`${recent.submission.score}/${recent.submission.total}`} />
                <RecentRow label="Intentos" value={`${recent.submission.attempts}`} />
                <RecentRow label="Pistas usadas" value={`${recent.submission.hintsUsed}`} />
                <RecentRow
                  label="Estado"
                  value={recent.submission.status === "completed" ? "Completada" : "Enviada"}
                />
              </dl>
            </div>
          ) : (
            <p className="mt-4 text-sm text-[#8a8f98]">
              Aún no has entregado actividades. ¡Empieza una para ver tu avance!
            </p>
          )}
        </section>
      </div>
    </div>
  );
}

function ProgressRings({
  stats,
  centerPct,
  mounted,
}: {
  stats: { color: string; pct: number }[];
  centerPct: number;
  mounted: boolean;
}) {
  const size = 132;
  const center = size / 2;
  const radii = [54, 42, 30];
  const stroke = 9;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${centerPct}% completado`}>
      {stats.map((band, index) => {
        const r = radii[index] ?? radii[radii.length - 1];
        const circumference = 2 * Math.PI * r;
        const target = (Math.min(100, Math.max(0, band.pct)) / 100) * circumference;
        const dash = mounted ? target : 0;

        return (
          <g key={index} transform={`rotate(-90 ${center} ${center})`}>
            <circle cx={center} cy={center} r={r} fill="none" stroke="#efece5" strokeWidth={stroke} />
            <circle
              cx={center}
              cy={center}
              r={r}
              fill="none"
              stroke={band.color}
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={`${dash} ${circumference}`}
              style={{ transition: "stroke-dasharray 1000ms cubic-bezier(0.22, 1, 0.36, 1)", transitionDelay: `${index * 120}ms` }}
            />
          </g>
        );
      })}
    </svg>
  );
}

function Sparkline({ values, mounted }: { values: number[]; mounted: boolean }) {
  const width = 220;
  const height = 48;
  if (values.length < 2) {
    return (
      <div className="mt-4 flex h-12 items-center text-xs text-[#6b7333]">
        Responde más actividades para ver tu tendencia.
      </div>
    );
  }

  const max = 100;
  const step = width / (values.length - 1);
  const points = values
    .map((v, i) => `${i * step},${height - (v / max) * (height - 6) - 3}`)
    .join(" ");

  return (
    <svg className="mt-4" width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      <polyline
        points={points}
        fill="none"
        stroke="#3f4a1e"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={1}
        strokeDasharray={1}
        strokeDashoffset={mounted ? 0 : 1}
        style={{ transition: "stroke-dashoffset 1100ms ease-out" }}
      />
    </svg>
  );
}

function SegmentedMeter({ pct, mounted }: { pct: number; mounted: boolean }) {
  const segments = 5;
  const filled = Math.round((pct / 100) * segments);

  return (
    <div className="mt-4 flex gap-1.5">
      {Array.from({ length: segments }).map((_, i) => {
        const isFilled = mounted && i < filled;
        return (
          <span
            key={i}
            className="h-2.5 flex-1 rounded-full"
            style={{
              backgroundColor: isFilled ? "#243b5e" : "#c2d3ee",
              transition: "background-color 400ms ease",
              transitionDelay: `${i * 90}ms`,
            }}
          />
        );
      })}
    </div>
  );
}

function ProfileStat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof CheckCircle2;
  label: string;
  value: string;
}) {
  return (
    <div>
      <Icon className="mx-auto h-4 w-4 text-[#2f9e8f]" />
      <p className="mt-1 text-base font-bold text-[#2b2b2b]">{value}</p>
      <p className="text-[11px] text-[#8a8f98]">{label}</p>
    </div>
  );
}

function RecentRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-[#8a8f98]">{label}</dt>
      <dd className="font-semibold text-[#2b2b2b]">{value}</dd>
    </div>
  );
}
