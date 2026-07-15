import { CircleHelp, LogOut, type LucideIcon } from "lucide-react";
import { PortalAction, PortalBrand, PortalNavLink } from "../../../components/portal/PortalChrome";

export interface StudentSidebarNavItem {
  label: string;
  path: string;
  icon: LucideIcon;
}

interface StudentSidebarProps {
  studentName: string;
  classCode: string;
  onLogout: () => void;
  onHelp: () => void;
  navItems: readonly StudentSidebarNavItem[];
}

export function StudentSidebar({
  studentName,
  classCode,
  onLogout,
  onHelp,
  navItems,
}: StudentSidebarProps) {
  return (
    <>
      <header className="student-portal-header flex items-center justify-between border-b border-slate-200/70 bg-[#f8f9fc] px-4 py-3 lg:hidden">
        <PortalBrand portalLabel="Portal estudiantil" />
        <div className="min-w-0 pl-3 text-right">
          <p className="truncate text-sm font-bold text-slate-900">{studentName}</p>
          <p className="text-[10px] font-bold uppercase tracking-wider text-[#004ac6]">Clase {classCode}</p>
        </div>
      </header>

      <aside
        aria-label="Navegación estudiante"
        className="student-portal-sidebar fixed inset-x-0 bottom-0 z-40 flex h-[76px] items-center border-t border-slate-200 bg-[#f8f9fc]/95 px-3 shadow-[0_-8px_30px_rgba(15,23,42,0.08)] backdrop-blur lg:static lg:h-screen lg:w-[240px] lg:flex-col lg:items-stretch lg:border-r lg:border-t-0 lg:px-6 lg:py-6 lg:shadow-none"
      >
        <div className="hidden lg:block">
          <PortalBrand portalLabel="Portal estudiantil" />
          <div className="student-portal-profile mt-8 rounded-2xl border border-blue-100 bg-blue-50/70 px-4 py-3">
            <p className="truncate text-sm font-bold text-slate-900">{studentName}</p>
            <div className="mt-1 text-[10px] font-bold uppercase tracking-wider">
              <span className="text-[#004ac6]">Clase {classCode}</span>
            </div>
          </div>
        </div>

        <nav className="flex min-w-0 flex-1 items-center justify-around gap-1 lg:mt-7 lg:block lg:space-y-1" aria-label="Secciones del estudiante">
          {navItems.map((item) => (
            <PortalNavLink icon={item.icon} key={item.path} label={item.label} to={item.path} />
          ))}
        </nav>

        <div className="student-portal-footer flex items-center gap-1 border-l border-slate-200 pl-2 lg:mt-auto lg:block lg:space-y-1 lg:border-l-0 lg:border-t lg:pl-0 lg:pt-5">
          <div className="w-12 lg:w-auto">
            <PortalAction compactOnMobile icon={CircleHelp} label="Ayuda" onClick={onHelp} />
          </div>
          <div className="w-12 lg:w-auto">
            <PortalAction compactOnMobile icon={LogOut} label="Salir" onClick={onLogout} />
          </div>
        </div>
      </aside>
    </>
  );
}
