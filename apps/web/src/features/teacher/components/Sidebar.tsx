import {
  GraduationCap,
  LayoutGrid,
  TrendingUp,
  FolderOpen,
  BarChart3,
  History,
  Plus,
  CircleHelp,
  BookOpen,
  LogOut,
  X,
  type LucideIcon
} from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuthStore, useClassStore } from "../../../lib/store";

interface SidebarProps {
  onOpenCreateClass?: () => void;
  onOpenHelp?: () => void;
}

const teacherNavItems: Array<{ label: string; icon: LucideIcon; path: string }> = [
  { label: "Panel", icon: LayoutGrid, path: "/teacher" },
  { label: "Monitoreo en vivo", icon: TrendingUp, path: "/teacher/monitor" },
  { label: "Clases anteriores", icon: FolderOpen, path: "/teacher/repositories" },
  { label: "Analíticas", icon: BarChart3, path: "/teacher/analytics" },
  { label: "Actividades recientes", icon: History, path: "/teacher/recent" },
];

function SidebarAction({
  icon: Icon,
  label,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  onClick?: () => void;
}) {
  return (
    <button
      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
      onClick={onClick}
      type="button"
    >
      <Icon className="h-5 w-5 text-slate-500" />
      <span>{label}</span>
    </button>
  );
}

export function Sidebar({ onOpenCreateClass, onOpenHelp }: SidebarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const logout = useAuthStore((state) => state.logout);
  const monitoringClassId = useClassStore((state) => state.monitoringClassId);
  const classes = useClassStore((state) => state.classes);
  const stopMonitoring = useClassStore((state) => state.stopMonitoring);
  const monitoringClass = classes.find((c) => c.id === monitoringClassId) ?? null;

  function handleLogout() {
    logout();
    navigate("/");
  }

  return (
    <aside className="flex flex-col justify-between border-b border-slate-100 bg-[#f8f9fc] p-6 lg:border-b-0 lg:border-r lg:border-slate-100 w-[240px] shrink-0 h-screen select-none">
      <div className="space-y-8">
        {/* Header Branding */}
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-[18px] bg-[#004ac6] text-white shadow-md shadow-blue-600/15">
            <GraduationCap className="h-6 w-6" />
          </div>
          <div className="flex flex-col justify-center">
            <h1 className="text-[17px] font-bold text-slate-950 leading-tight">Kobi Labs</h1>
            <p className="text-[10px] font-bold text-slate-400 tracking-wider uppercase mt-0.5">PORTAL DOCENTE</p>
          </div>
        </div>

        {/* Navigation */}
        <nav className="space-y-1">
          {teacherNavItems.map((item) => {
            const Icon = item.icon;
            const active = location.pathname === item.path;
            const showLive = item.path === "/teacher/monitor" && monitoringClass;
            return (
              <div key={item.label}>
                <button
                  className={`flex w-full items-center gap-3.5 px-4 py-3 rounded-xl text-left text-sm font-semibold transition-all duration-200 ${
                    active
                      ? "bg-[#e9f0fe] text-[#004ac6]"
                      : "text-slate-600 hover:bg-slate-100/50 hover:text-slate-900"
                  }`}
                  onClick={() => navigate(item.path)}
                  type="button"
                >
                  <Icon className={`h-5 w-5 shrink-0 ${active ? "text-[#004ac6]" : "text-slate-500"}`} />
                  <span>{item.label}</span>
                </button>

                {/* Mini live session sub-section */}
                {showLive && (
                  <div className="ml-4 mt-1 flex items-stretch gap-1">
                    <button
                      onClick={() => navigate("/teacher/monitor")}
                      className="flex-1 min-w-0 flex items-center gap-2 pl-3 pr-2 py-2 rounded-lg border-l-2 border-red-300 bg-red-50/70 hover:bg-red-50 transition-colors text-left"
                      type="button"
                    >
                      <span className="relative flex h-2 w-2 shrink-0">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[9px] font-bold text-red-500 uppercase tracking-wider leading-none">En vivo</span>
                        <span className="block text-xs font-semibold text-slate-700 truncate leading-tight mt-0.5">
                          {monitoringClass.title}
                        </span>
                      </span>
                    </button>
                    <button
                      onClick={stopMonitoring}
                      className="shrink-0 w-7 flex items-center justify-center rounded-lg text-slate-400 hover:bg-red-100 hover:text-red-500 transition-colors"
                      title="Finalizar monitoreo"
                      type="button"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      </div>

      <div className="space-y-5">
        {/* Add Class CTA Button */}
        <button
          className="w-full py-3.5 px-6 bg-[#004ac6] text-white rounded-full font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-md shadow-blue-600/10 hover:bg-[#003ea8] transition duration-200 active:scale-95"
          onClick={onOpenCreateClass}
          type="button"
        >
          <Plus className="h-4 w-4 font-bold" />
          <span>Nueva clase</span>
        </button>

        <div className="h-px bg-slate-100" />

        {/* Footer Actions */}
        <div className="space-y-1">
          <SidebarAction
            icon={CircleHelp}
            label="Ayuda"
            onClick={() => {
              if (onOpenHelp) {
                onOpenHelp();
                return;
              }

              navigate("/teacher/ayuda");
            }}
          />
          <SidebarAction icon={BookOpen} label="Soporte" />
          <button
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-slate-500 hover:bg-slate-50 hover:text-slate-950 transition"
            onClick={handleLogout}
            type="button"
          >
            <LogOut className="h-5 w-5 text-slate-400" />
            <span>Salir</span>
          </button>
        </div>
      </div>
    </aside>
  );
}
