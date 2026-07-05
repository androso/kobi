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
  progressLabel: string;
  onLogout: () => void;
  className?: string;
  navItems: readonly StudentSidebarNavItem[];
}

export function StudentSidebar({ studentName, classCode, progressLabel, onLogout, className, navItems }: StudentSidebarProps) {
  return (
    <aside
      aria-label="Navegación estudiante"
      className={[
        "flex h-full w-[7.5rem] flex-col items-center border-r border-slate-100 bg-white px-3 py-7 shadow-sm",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="flex flex-col items-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-[1.4rem] bg-emerald-50 text-[#19b69b]">
          <GraduationCap className="h-10 w-10" />
        </div>
        <h2 className="sr-only">{studentName}</h2>
        <p className="sr-only">Código de clase {classCode}</p>
        <p className="sr-only">{progressLabel}</p>
      </div>

      <nav className="mt-20 flex w-full flex-1 flex-col items-center gap-11">
        {navItems.map((item) => {
          const Icon = item.icon;

          return (
            <NavLink
              className={({ isActive }) =>
                [
                  "group relative flex w-full flex-col items-center gap-2 text-center text-slate-400 transition hover:text-slate-600",
                  isActive ? "text-[#19b69b]" : "",
                ].join(" ")
              }
              key={item.path}
              to={item.path}
            >
              {({ isActive }) => (
                <>
                  <span className="flex h-9 w-9 items-center justify-center">
                    <Icon className="h-6 w-6 fill-current stroke-current" />
                  </span>
                  <span className="w-full text-[1.05rem] font-medium leading-5 tracking-normal">{item.label}</span>
                  {isActive ? <span className="absolute right-[-0.75rem] top-1 h-14 w-1 rounded-full bg-[#19b69b]" /> : null}
                </>
              )}
            </NavLink>
          );
        })}
      </nav>

      <div className="mt-auto flex flex-col items-center gap-6">
        <button
          aria-label="Ayuda"
          className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-[#19b69b] transition hover:bg-emerald-100"
          type="button"
        >
          <CircleHelp className="h-6 w-6 fill-current stroke-current" />
        </button>
        <button
          aria-label="Salir"
          className="flex h-11 w-11 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-50 hover:text-slate-600"
          onClick={onLogout}
          type="button"
        >
          <LogOut className="h-5 w-5" />
        </button>
      </div>
    </aside>
  );
}
