import {
  LayoutGrid,
  TrendingUp,
  FolderOpen,
  BarChart3,
  History,
  Plus,
  CircleHelp,
  BookOpen,
  LogOut,
  type LucideIcon
} from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuthStore, useClassStore } from "../../../lib/store";
import { KobiMascot } from "./KobiMascot";

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
  const monitoringClass = classes.find((c) => c.id === monitoringClassId) ?? null;

  function handleLogout() {
    logout();
    navigate("/");
  }

  function getHelpRoute() {
    if (location.pathname === "/teacher/monitor") return "/teacher/ayuda?from=monitor";
    if (location.pathname === "/teacher/repositories") return "/teacher/ayuda?from=repositories";
    if (location.pathname === "/teacher/analytics") return "/teacher/ayuda?from=analytics";
    return "/teacher/ayuda?from=dashboard";
  }

  return (
    <aside className="flex flex-col justify-between border-b border-slate-100 bg-[#f8f9fc] p-6 lg:border-b-0 lg:border-r lg:border-slate-100 w-[240px] shrink-0 h-screen select-none">
      <div className="space-y-8">
        {/* Header Branding */}
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-[18px] bg-[#fce7db] shadow-md shadow-orange-200/40">
            <KobiMascot className="h-8 w-8 text-slate-900" />
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

            // The monitor item only exists while a class is being monitored,
            // rendered as the live card on the explicit monitor route.
            if (item.path === "/teacher/monitor") {
              if (!monitoringClass || !active) return null;
              return (
                <button
                  key={item.label}
                  onClick={() => navigate("/teacher/monitor")}
                  className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl transition-colors text-left ${
                    active ? "bg-red-50" : "bg-red-50/60 hover:bg-red-50"
                  }`}
                  type="button"
                >
                  <span className="relative flex h-2.5 w-2.5 shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[9px] font-bold text-red-500 uppercase tracking-wider leading-none">
                      Monitoreo en vivo
                    </span>
                    <span className="block text-xs font-semibold text-slate-700 truncate leading-tight mt-0.5">
                      {monitoringClass.title}
                    </span>
                  </span>
                </button>
              );
            }

            return (
              <button
                className={`flex w-full items-center gap-3.5 px-4 py-3 rounded-xl text-left text-sm font-semibold transition-all duration-200 ${
                  active
                    ? "bg-[#e9f0fe] text-[#004ac6]"
                    : "text-slate-600 hover:bg-slate-100/50 hover:text-slate-900"
                }`}
                key={item.label}
                onClick={() => navigate(item.path)}
                type="button"
              >
                <Icon className={`h-5 w-5 shrink-0 ${active ? "text-[#004ac6]" : "text-slate-500"}`} />
                <span>{item.label}</span>
              </button>
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

              navigate(getHelpRoute());
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
