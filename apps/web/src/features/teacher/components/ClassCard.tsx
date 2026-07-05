import { ChevronRight, Users, type LucideIcon } from "lucide-react";

interface ClassItem {
  title: string;
  focus: string;
  students: string;
  topics: readonly string[];
  accent: string;
  tone: string;
  badge: string;
  icon: LucideIcon;
}

export function ClassCard({ item, viewMode }: { item: ClassItem; viewMode: "grid" | "list" }) {
  const Icon = item.icon;
  const isList = viewMode === "list";

  return (
    <article className={`overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm ${isList ? "grid md:grid-cols-[16rem_minmax(0,1fr)]" : ""}`}>
      <div className={`relative overflow-hidden ${isList ? "min-h-48" : "min-h-52 sm:min-h-56"}`}>
        <div className={`absolute inset-0 bg-gradient-to-br ${item.tone}`} />
        <div className="absolute inset-0 opacity-25 [background-image:radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.65)_1px,transparent_0)] [background-size:24px_24px]" />
        <div className="absolute left-5 top-5 rounded-full border border-white/20 bg-white/20 px-3 py-1 text-[11px] font-semibold tracking-[0.22em] text-white backdrop-blur-sm">
          {item.badge}
        </div>
        <Icon className="absolute right-5 top-5 h-14 w-14 text-white/20 sm:h-16 sm:w-16" />
        <div className="absolute bottom-5 left-5 right-5 flex items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-white/80">Panel docente</p>
            <p className="mt-1 line-clamp-2 text-xl font-semibold leading-tight text-white/95 sm:text-2xl">{item.focus}</p>
          </div>
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-sm">
            <ChevronRight className="h-5 w-5" />
          </div>
        </div>
      </div>

      <div className="p-5 sm:p-6">
        <h4 className="text-xl font-semibold tracking-tight text-slate-950 sm:text-2xl">{item.title}</h4>
        <p className={`mt-2 text-base font-semibold ${item.accent}`}>{item.focus}</p>
        <div className="mt-5 flex items-center gap-2 text-sm text-slate-600">
          <Users className="h-4 w-4" />
          <span>{item.students}</span>
        </div>
        <div className="mt-6">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">Temas</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {item.topics.map((topic) => (
              <span className="rounded-full bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700" key={topic}>
                {topic}
              </span>
            ))}
          </div>
        </div>
      </div>
    </article>
  );
}
