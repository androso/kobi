import { CircleHelp, GraduationCap, LogOut, type LucideIcon } from "lucide-react";
import { NavLink } from "react-router-dom";

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
  className?: string;
  navItems: readonly StudentSidebarNavItem[];
}

export function StudentSidebar({
  studentName,
  classCode,
  onLogout,
  onHelp,
  className,
  navItems,
}: StudentSidebarProps) {
  return (
    <aside
      aria-label="Navegación estudiante"
      className={[
        "flex h-full w-[6.5rem] flex-col items-center border-r border-[#ece8e1] bg-[#fdfcf9] px-2 py-7",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="flex flex-col items-center">
        <div className="flex h-11 w-11 items-center justify-center text-[#2f9e8f]">
          <GraduationCap className="h-9 w-9" strokeWidth={1.75} />
        </div>
        <h2 className="sr-only">{studentName}</h2>
        <p className="sr-only">Código de clase {classCode}</p>
      </div>

      <nav className="mt-16 flex w-full flex-1 flex-col items-center gap-10">
        {navItems.map((item) => {
          const Icon = item.icon;

          return (
            <NavLink
              className="group relative flex w-full flex-col items-center gap-1.5 text-center text-[#9aa1ac] transition hover:text-[#5b6270]"
              key={item.path}
              to={item.path}
            >
              {({ isActive }) => (
                <>
                  <span className={`flex h-8 w-8 items-center justify-center ${isActive ? "text-[#2f9e8f]" : ""}`}>
                    <Icon className="h-6 w-6" strokeWidth={1.75} />
                  </span>
                  <span className={`text-[0.8rem] font-medium leading-4 ${isActive ? "text-[#2f9e8f]" : ""}`}>
                    {item.label}
                  </span>
                  {isActive ? (
                    <span className="absolute left-[-0.5rem] top-0 h-11 w-[3px] rounded-full bg-[#2f9e8f]" />
                  ) : null}
                </>
              )}
            </NavLink>
          );
        })}
      </nav>

      <div className="mt-auto flex flex-col items-center gap-5">
        <button
          aria-label="Ayuda"
          className="flex h-11 w-11 items-center justify-center rounded-full bg-[#2f9e8f] text-white shadow-sm transition hover:bg-[#278577]"
          onClick={onHelp}
          type="button"
        >
          <CircleHelp className="h-5 w-5" strokeWidth={2} />
        </button>
        <button
          aria-label="Cambiar estudiante"
          title="Cambiar estudiante"
          className="flex min-h-10 items-center justify-center gap-2 rounded-full px-3 text-xs font-bold text-[#707782] transition hover:bg-[#f0ede7] hover:text-[#5b6270]"
          onClick={onLogout}
          type="button"
        >
          <LogOut className="h-5 w-5" strokeWidth={1.75} />
          <span>Cambiar estudiante</span>
        </button>
      </div>
    </aside>
  );
}
