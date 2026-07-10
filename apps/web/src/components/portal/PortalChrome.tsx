import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { NavLink } from "react-router-dom";

const SPIKES = 10;
const OUTER = 46;
const INNER = 33;
const CX = 50;
const CY = 52;

const bodyPoints = Array.from({ length: SPIKES * 2 }, (_, index) => {
  const radius = index % 2 === 0 ? OUTER : INNER;
  const angle = (Math.PI / SPIKES) * index - Math.PI / 2;
  return `${(CX + radius * Math.cos(angle)).toFixed(2)},${(CY + radius * Math.sin(angle)).toFixed(2)}`;
}).join(" ");

export function KobiMascot({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <polygon
        fill="currentColor"
        points={bodyPoints}
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="7"
      />
      <ellipse cx="43" cy="50" fill="#ffffff" rx="5" ry="9" />
      <ellipse cx="59" cy="50" fill="#ffffff" rx="5" ry="9" />
    </svg>
  );
}

export function PortalBrand({ portalLabel }: { portalLabel: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="teacher-brand-mark flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] bg-[#fce7db] shadow-md shadow-orange-200/40">
        <KobiMascot className="teacher-brand-mascot h-8 w-8 text-slate-900" />
      </div>
      <div className="min-w-0">
        <h1 className="truncate text-[17px] font-bold leading-tight text-slate-950">Kobi Labs</h1>
        <p className="mt-0.5 truncate text-[10px] font-bold uppercase tracking-wider text-slate-400">
          {portalLabel}
        </p>
      </div>
    </div>
  );
}

const navigationClassName = (active: boolean) =>
  [
    "flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition-all duration-200",
    active ? "bg-[#e9f0fe] text-[#004ac6]" : "text-slate-600 hover:bg-slate-100/60 hover:text-slate-900",
  ].join(" ");

export function PortalNavLink({ icon: Icon, label, to }: { icon: LucideIcon; label: string; to: string }) {
  return (
    <NavLink className={({ isActive }) => navigationClassName(isActive)} to={to}>
      {({ isActive }) => (
        <>
          <Icon className={`h-5 w-5 shrink-0 ${isActive ? "text-[#004ac6]" : "text-slate-500"}`} />
          <span>{label}</span>
        </>
      )}
    </NavLink>
  );
}

export function PortalNavButton({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: LucideIcon;
  label: string;
  onClick: () => void;
}) {
  return (
    <button className={`w-full text-left ${navigationClassName(active)}`} onClick={onClick} type="button">
      <Icon className={`h-5 w-5 shrink-0 ${active ? "text-[#004ac6]" : "text-slate-500"}`} />
      <span>{label}</span>
    </button>
  );
}

export function PortalAction({
  compactOnMobile = false,
  icon: Icon,
  label,
  onClick,
}: {
  compactOnMobile?: boolean;
  icon: LucideIcon;
  label: string;
  onClick?: () => void;
}) {
  return (
    <button
      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-slate-600 transition hover:bg-slate-100/60 hover:text-slate-900"
      onClick={onClick}
      type="button"
    >
      <Icon className="h-5 w-5 shrink-0 text-slate-500" />
      <span className={compactOnMobile ? "sr-only lg:not-sr-only" : undefined}>{label}</span>
    </button>
  );
}

export function PortalCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-[28px] border border-slate-200/70 bg-white shadow-sm ${className}`}>
      {children}
    </section>
  );
}
