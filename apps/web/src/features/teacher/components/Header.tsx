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
    <header className="flex justify-between items-center w-full px-6 py-3 border-b border-slate-200 bg-white/75 backdrop-blur z-50 sticky top-0">
      <div className="flex items-center gap-8">
        <span className="text-xl font-bold text-slate-900 sm:text-2xl">Kobi Learning Labs</span>
        
        {/* NotebookLM-style Search Bar */}
        <div className="relative w-96 hidden md:block">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 h-5 w-5" />
          <input
            className="w-full bg-slate-50 border border-slate-200 rounded-full py-2 pl-10 pr-4 focus:ring-2 focus:ring-[#004ac6]/20 focus:border-[#004ac6] outline-none text-sm transition-all"
            placeholder="Buscar clases, estudiantes o recursos..."
            type="text"
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <TopBarIcon icon={Settings2} />
        <TopBarIcon icon={Grid3X3} />
        <div className="w-10 h-10 rounded-full bg-slate-100 border-2 border-violet-400 overflow-hidden ml-2 cursor-pointer transition-transform hover:scale-105">
          <img
            className="w-full h-full object-cover"
            alt="Avatar docente"
            src="https://lh3.googleusercontent.com/aida-public/AB6AXuDs478ot0CpNGzEtWurcO2ZF2eh8pmHnVpqMQ_Xs4901jkWVT_FEvUpFP6zSBHK6q4uYu2wEROfWipc9ZQYgejkJFJ5SM-9qPaua4CWlHsEnXOT5v-KfC9WsOaQsEUutF8GJmx9ZttjbwZnMuhQMYkzqg4sJ42OWyHyttQvuhE4ba_PvBPJrFnYr59lBGeGpxIuRD0gjpZpSuraalatHzVWJjbg9HOr-X36bBf59MDRmnJdjtnWU07jLcTx69pBS_1kfb1fE-c-HaU"
          />
        </div>
      </div>
    </header>
  );
}
