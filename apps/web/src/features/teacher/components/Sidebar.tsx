import { GraduationCap, FolderOpen, BarChart3, Plus, CircleHelp, BookOpen, LogOut, type LucideIcon } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../../../lib/store";

const teacherNavItems: Array<{ label: string; icon: LucideIcon; active?: boolean }> = [
  { label: "Clases", icon: GraduationCap, active: true },
  { label: "Repositorios", icon: FolderOpen },
  { label: "Analitica", icon: BarChart3 }
];

function SidebarAction({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <button className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left text-sm font-medium text-slate-500 transition hover:bg-white hover:text-slate-900" type="button">
      <Icon className="h-5 w-5" />
      <span>{label}</span>
    </button>
  );
}

export function Sidebar() {
  const navigate = useNavigate();
  const logout = useAuthStore((state) => state.logout);

  function handleLogout() {
    logout();
    navigate("/");
  }

  return (
    <aside className="flex flex-col justify-between border-b border-slate-200/80 bg-[#eef3fb] p-3 sm:p-4 lg:border-b-0 lg:border-r">
      <div className="space-y-6">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#004ac6] text-white shadow-sm">
            <GraduationCap className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xs font-semibold uppercase tracking-widest text-[#004ac6]">Portal docente</h1>
            <p className="text-[11px] text-slate-500">Organización del aula</p>
          </div>
        </div>

        <nav className="space-y-2">
          {teacherNavItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                className={`flex w-full items-center gap-3 p-3 rounded-xl text-left text-xs font-bold uppercase tracking-wider transition ${
                  item.active
                    ? "bg-[#004ac6] text-white shadow-md shadow-blue-600/10"
                    : "text-slate-600 hover:bg-white/60 hover:text-slate-950"
                }`}
                key={item.label}
                type="button"
              >
                <Icon className="h-5 w-5 shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      <div className="space-y-4 px-2">
        <button className="mx-auto w-fit py-2.5 px-5 bg-[#004ac6] text-white rounded-xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-blue-600/10 hover:bg-[#003ea8] transition active:scale-95" type="button">
          <Plus className="h-4 w-4" />
          <span>Nueva clase</span>
        </button>
        <div className="h-px bg-slate-200" />
        <div className="space-y-1">
          <SidebarAction icon={CircleHelp} label="Ayuda" />
          <SidebarAction icon={BookOpen} label="Soporte" />
          <button className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-sm font-medium text-slate-500 transition hover:bg-white hover:text-slate-950" onClick={handleLogout} type="button">
            <LogOut className="h-5 w-5" />
            <span>Salir</span>
          </button>
        </div>
      </div>
    </aside>
  );
}
