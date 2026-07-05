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
  type LucideIcon 
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../../../lib/store";

interface SidebarProps {
  onOpenCreateClass?: () => void;
}

const teacherNavItems: Array<{ label: string; icon: LucideIcon; active?: boolean }> = [
  { label: "Panel", icon: LayoutGrid, active: true },
  { label: "Monitoreo en vivo", icon: TrendingUp },
  { label: "Repositorios", icon: FolderOpen },
  { label: "Analíticas", icon: BarChart3 },
  { label: "Actividades recientes", icon: History }
];

function SidebarAction({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <button className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-slate-600 transition hover:bg-slate-50 hover:text-slate-900" type="button">
      <Icon className="h-5 w-5 text-slate-500" />
      <span>{label}</span>
    </button>
  );
}

export function Sidebar({ onOpenCreateClass }: SidebarProps) {
  const navigate = useNavigate();
  const logout = useAuthStore((state) => state.logout);

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
            return (
              <button
                className={`flex w-full items-center gap-3.5 px-4 py-3 rounded-xl text-left text-sm font-semibold transition-all duration-200 ${
                  item.active
                    ? "bg-[#e9f0fe] text-[#004ac6]"
                    : "text-slate-600 hover:bg-slate-100/50 hover:text-slate-900"
                }`}
                key={item.label}
                type="button"
              >
                <Icon className={`h-5 w-5 shrink-0 ${item.active ? "text-[#004ac6]" : "text-slate-500"}`} />
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
          <SidebarAction icon={CircleHelp} label="Ayuda" />
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
