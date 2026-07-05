import { Search, Settings2, Grid3X3, type LucideIcon } from "lucide-react";

function TopBarIcon({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <button className="flex h-11 w-11 items-center justify-center rounded-full text-slate-600 transition hover:bg-slate-100 hover:text-slate-900" type="button">
      <Icon className="h-6 w-6" />
    </button>
  );
}

export function Header() {
  return (
    <header className="flex flex-wrap items-center gap-3 border-b border-slate-200/80 bg-white/75 px-3 py-3 backdrop-blur sm:px-4 lg:px-6">
      <div className="min-w-0">
        <h1 className="truncate text-xl font-semibold tracking-tight text-slate-950 sm:text-2xl lg:text-3xl">
          Kobi Learning Labs
        </h1>
      </div>

      <div className="flex flex-1 justify-center">
        <label className="flex w-full max-w-xl items-center gap-3 rounded-full border border-slate-200 bg-white px-4 py-2.5 text-slate-500 shadow-sm transition focus-within:border-[#1077e5] focus-within:ring-4 focus-within:ring-sky-100">
          <Search className="h-4 w-4 shrink-0" />
          <input className="w-full bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400" placeholder="Buscar clases, estudiantes o recursos..." type="text" />
        </label>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        <TopBarIcon icon={Settings2} />
        <TopBarIcon icon={Grid3X3} />
        <button className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border-2 border-violet-300 bg-[linear-gradient(135deg,#c0d2ff_0%,#5a7df8_55%,#9b5cf6_100%)] text-xs font-semibold text-white shadow-sm sm:h-11 sm:w-11" type="button">
          MH
        </button>
      </div>
    </header>
  );
}
