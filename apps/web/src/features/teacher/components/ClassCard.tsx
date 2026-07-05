import { ChevronRight, Users, type LucideIcon } from "lucide-react";

interface ClassItem {
  title: string;
  focus: string;
  students: string;
  topics: readonly string[];
  accent: string;
  tone: string;
  badge?: string;
  icon: LucideIcon;
  image?: string;
}

export function ClassCard({ item, viewMode }: { item: ClassItem; viewMode: "grid" | "list" }) {
  const Icon = item.icon;
  const isList = viewMode === "list";

  return (
    <article className={`overflow-hidden rounded-3xl border border-slate-200/60 bg-white shadow-sm hover:shadow-md transition-all flex flex-col group ${isList ? "grid md:grid-cols-[16rem_minmax(0,1fr)]" : ""}`}>
      <div className={`relative overflow-hidden ${isList ? "min-h-48" : "h-40"}`}>
        <div className={`absolute inset-0 bg-gradient-to-br ${item.tone}`} />
        {item.image && (
          <img
            src={item.image}
            alt={item.title}
            className="w-full h-full object-cover mix-blend-overlay opacity-65 group-hover:scale-105 transition-transform duration-500"
          />
        )}
        <div className="absolute inset-0 opacity-15 [background-image:radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.65)_1px,transparent_0)] [background-size:24px_24px]" />
        
        {item.badge && (
          <div className="absolute left-4 top-4 rounded-full border border-white/20 bg-white/20 px-3 py-1 text-[10px] font-bold tracking-widest text-white backdrop-blur-sm uppercase">
            {item.badge}
          </div>
        )}
        <Icon className="absolute right-4 top-4 h-12 w-12 text-white/20" />
        
        <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-white/80 uppercase tracking-wider">Portal docente</p>
            <p className="mt-0.5 line-clamp-1 text-lg font-bold leading-tight text-white/95">{item.focus}</p>
          </div>
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-sm hover:bg-white/25 transition">
            <ChevronRight className="h-4 w-4" />
          </div>
        </div>
      </div>

      <div className="p-6 flex-1 flex flex-col justify-between">
        <div>
          <h4 className="text-lg font-bold tracking-tight text-slate-900 group-hover:text-[#004ac6] transition-colors">{item.title}</h4>
          <p className={`mt-1 text-xs font-semibold uppercase tracking-wider ${item.accent}`}>{item.focus}</p>
          <div className="mt-4 flex items-center gap-2 text-xs text-slate-500">
            <Users className="h-4 w-4" />
            <span>{item.students}</span>
          </div>
        </div>

        <div className="mt-6">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Temas</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {item.topics.map((topic) => (
              <span className="rounded-lg bg-slate-50 border border-slate-100 px-2 py-1 text-[11px] font-medium text-slate-600" key={topic}>
                {topic}
              </span>
            ))}
          </div>
        </div>
      </div>
    </article>
  );
}
