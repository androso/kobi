import { ChevronRight, Users, Leaf, Sigma, BookOpen, PenLine } from "lucide-react";

interface ClassItem {
  id?: string;
  title: string;
  focus: string;
  students: string;
  topics: readonly string[];
  accent: string;
  tone: string;
  badge?: string;
  icon: "leaf" | "sigma" | "book" | "pen";
  image?: string;
}

const iconMap = {
  leaf: Leaf,
  sigma: Sigma,
  book: BookOpen,
  pen: PenLine,
};

const themeMap = {
  leaf: {
    bg: "bg-emerald-50 text-emerald-700 border-emerald-100",
    dot: "bg-emerald-500",
    avatarBg: [
      "bg-emerald-100 text-emerald-700 border-emerald-200",
      "bg-teal-100 text-teal-700 border-teal-200",
      "bg-lime-100 text-lime-700 border-lime-200"
    ]
  },
  sigma: {
    bg: "bg-blue-50 text-blue-700 border-blue-100",
    dot: "bg-blue-500",
    avatarBg: [
      "bg-blue-100 text-blue-700 border-blue-200",
      "bg-indigo-100 text-indigo-700 border-indigo-200",
      "bg-sky-100 text-sky-700 border-sky-200"
    ]
  },
  pen: {
    bg: "bg-purple-50 text-purple-700 border-purple-100",
    dot: "bg-purple-500",
    avatarBg: [
      "bg-purple-100 text-purple-700 border-purple-200",
      "bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200",
      "bg-violet-100 text-violet-700 border-violet-200"
    ]
  },
  book: {
    bg: "bg-amber-50 text-amber-700 border-amber-100",
    dot: "bg-amber-500",
    avatarBg: [
      "bg-amber-100 text-amber-700 border-amber-200",
      "bg-orange-100 text-orange-700 border-orange-200",
      "bg-yellow-100 text-yellow-700 border-yellow-200"
    ]
  }
};

export function ClassCard({ item, viewMode, index = 0 }: { item: ClassItem; viewMode: "grid" | "list"; index?: number }) {
  const Icon = iconMap[item.icon] || PenLine;
  const isList = viewMode === "list";
  const theme = themeMap[item.icon] || themeMap.pen;

  // Stagger animation delay classes
  const delayClass = 
    index === 1 ? "animation-delay-100" :
    index === 2 ? "animation-delay-200" :
    index >= 3 ? "animation-delay-300" : "";

  return (
    <article className={`overflow-hidden rounded-[28px] border border-slate-200/60 bg-white shadow-sm hover:shadow-xl hover:shadow-slate-100/50 hover:-translate-y-1 transition-all duration-300 flex flex-col group animate-fade-in-up ${delayClass} ${isList ? "grid md:grid-cols-[16rem_minmax(0,1fr)]" : ""}`}>
      
      {/* Banner Area */}
      <div className={`relative overflow-hidden shrink-0 ${isList ? "min-h-48" : "h-44"}`}>
        <div className={`absolute inset-0 bg-gradient-to-br ${item.tone} transition-transform duration-700 group-hover:scale-105`} />
        {item.image && (
          <img
            src={item.image}
            alt={item.title}
            className="w-full h-full object-cover mix-blend-overlay opacity-65 group-hover:scale-110 transition-transform duration-700"
          />
        )}
        
        {/* Decorative Grid Lines */}
        <div className="absolute inset-0 opacity-[0.06] [background-image:linear-gradient(rgba(255,255,255,0.4)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.4)_1px,transparent_1px)] [background-size:20px_20px]" />
        
        {item.badge && (
          <div className="absolute left-4 top-4 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[9px] font-extrabold tracking-widest text-white backdrop-blur-md uppercase">
            {item.badge}
          </div>
        )}
        

        
        <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[10px] font-bold text-white/70 uppercase tracking-widest">Portal docente</p>
            <p className="mt-0.5 line-clamp-1 text-base font-extrabold leading-tight text-white">{item.focus}</p>
          </div>
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-sm group-hover:bg-white group-hover:text-[#004ac6] transition-all duration-300 shadow-sm">
            <ChevronRight className="h-4.5 w-4.5 transition-transform duration-300 group-hover:translate-x-0.5" />
          </div>
        </div>
      </div>

      {/* Card Details Area */}
      <div className="p-6 flex-1 flex flex-col justify-between">
        <div>
          <h4 className="text-lg font-bold tracking-tight text-slate-900 group-hover:text-[#004ac6] transition-colors">{item.title}</h4>
          
          <div className="mt-1 flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full ${theme.dot}`} />
            <p className={`text-[11px] font-bold uppercase tracking-wider ${item.accent}`}>{item.focus}</p>
          </div>
        </div>

        {/* Topics List */}
        <div className="mt-5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2.5">Temas clave</p>
          <div className="flex flex-wrap gap-1.5">
            {item.topics.map((topic) => (
              <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors duration-300 ${theme.bg}`} key={topic}>
                {topic}
              </span>
            ))}
          </div>
        </div>

        {/* Card Footer: Users & Avatar stack */}
        <div className="mt-6 pt-4.5 border-t border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-slate-500 font-semibold">
            <Users className="h-4 w-4 text-slate-400" />
            <span>{item.students}</span>
          </div>
          
          {/* Avatar stack overlay */}
          <div className="flex -space-x-1.5 overflow-hidden">
            <span className={`inline-block h-6 w-6 rounded-full border border-white flex items-center justify-center text-[9px] font-bold ${theme.avatarBg[0]}`}>S</span>
            <span className={`inline-block h-6 w-6 rounded-full border border-white flex items-center justify-center text-[9px] font-bold ${theme.avatarBg[1]}`}>P</span>
            <span className={`inline-block h-6 w-6 rounded-full border border-white flex items-center justify-center text-[9px] font-bold ${theme.avatarBg[2]}`}>M</span>
            <span className="inline-block h-6 w-6 rounded-full border border-white bg-slate-100 flex items-center justify-center text-[8px] font-extrabold text-slate-500">+19</span>
          </div>
        </div>

      </div>
    </article>
  );
}
