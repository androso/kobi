import { GraduationCap, FolderOpen, BarChart3, Plus, CircleHelp, BookOpen, LogOut, type LucideIcon } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "../../../components/ui/button";
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
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#0b5ed7] text-white shadow-lg shadow-blue-600/25">
            <GraduationCap className="h-6 w-6" />
          </div>
          <div className="pt-1">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#1557d4]">Portal docente</p>
            <p className="mt-1 text-sm text-slate-600">Organizacion del aula</p>
          </div>
        </div>

        <nav className="space-y-3">
          {teacherNavItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                className={`flex w-full items-center gap-4 rounded-2xl px-4 py-4 text-left text-sm font-semibold transition ${
                  item.active
                    ? "bg-[#2f6ff2] text-white shadow-[0_14px_30px_-18px_rgba(47,111,242,0.85)]"
                    : "text-slate-600 hover:bg-white hover:text-slate-900"
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

      <div className="space-y-4">
        <Button className="h-12 w-full rounded-2xl bg-[#0b57d0] px-4 text-sm shadow-[0_12px_30px_-12px_rgba(11,87,208,0.55)] hover:bg-[#094fbf]" type="button">
          <Plus className="mr-2 h-4 w-4" />
          Nueva clase
        </Button>
        <div className="h-px bg-slate-200" />
        <div className="space-y-2">
          <SidebarAction icon={CircleHelp} label="Ayuda" />
          <SidebarAction icon={BookOpen} label="Soporte" />
          <button className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-sm font-medium text-slate-500 transition hover:bg-white hover:text-slate-900" onClick={handleLogout} type="button">
            <LogOut className="h-5 w-5" />
            <span>Salir</span>
          </button>
        </div>
      </div>
    </aside>
  );
}
