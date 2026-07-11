import {
  LayoutGrid,
  TrendingUp,
  FolderOpen,
  Plus,
  CircleHelp,
  LogOut,
  type LucideIcon
} from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuthStore, useClassStore } from "../../../lib/store";
import { PortalAction, PortalBrand, PortalNavButton } from "../../../components/portal/PortalChrome";

interface SidebarProps {
  onOpenCreateClass?: () => void;
  onOpenHelp?: () => void;
}

const teacherNavItems: Array<{ label: string; icon: LucideIcon; path: string }> = [
  { label: "Panel", icon: LayoutGrid, path: "/teacher" },
  { label: "Monitoreo en vivo", icon: TrendingUp, path: "/teacher/monitor" },
  { label: "Clases anteriores", icon: FolderOpen, path: "/teacher/repositories" },
];

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
    return "/teacher/ayuda?from=dashboard";
  }

  return (
    <aside className="flex flex-col justify-between border-b border-slate-100 bg-[#f8f9fc] p-6 lg:border-b-0 lg:border-r lg:border-slate-100 w-[240px] shrink-0 h-screen select-none">
      <div className="space-y-8">
        <PortalBrand portalLabel="Portal docente" />

        {/* Navigation */}
        <nav className="space-y-1">
          {teacherNavItems.map((item) => {
            const Icon = item.icon;
            const active = location.pathname === item.path;

            // The monitor item only exists while a class is being monitored,
            // rendered as the live card.
            if (item.path === "/teacher/monitor") {
              if (!monitoringClass) return null;
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
              <PortalNavButton
                active={active}
                icon={Icon}
                key={item.label}
                label={item.label}
                onClick={() => navigate(item.path)}
              />
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
          <PortalAction
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
