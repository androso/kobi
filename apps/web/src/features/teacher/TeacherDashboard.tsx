import { useState } from "react";
import { LayoutGrid, List, Plus, Leaf, Sigma, PenLine } from "lucide-react";
import { Sidebar } from "./components/Sidebar";
import { Header } from "./components/Header";
import { ClassCard } from "./components/ClassCard";

const teacherClasses = [
  {
    title: "Ciencia 4to - Seccion A",
    focus: "Ecosistemas y energia",
    students: "24 estudiantes activos",
    topics: ["Fotosintesis", "Cadenas alimentarias", "Niveles troficos"],
    accent: "text-emerald-700",
    tone: "from-[#2d6bf3] via-[#5f83f4] to-[#8b5cf6]",
    badge: "LECCION ACTIVA",
    icon: Leaf
  },
  {
    title: "Matematicas 5to - Algebra basica",
    focus: "Matematicas",
    students: "22 estudiantes activos",
    topics: ["Variables", "Ecuaciones", "Orden de operaciones"],
    accent: "text-blue-700",
    tone: "from-[#17b26a] via-[#0f9d77] to-[#0b7d5d]",
    badge: "NUEVO BLOQUE",
    icon: Sigma
  },
  {
    title: "Lengua 6to - Escritura creativa",
    focus: "Lengua y artes",
    students: "28 estudiantes activos",
    topics: ["Metaforas", "Estructura narrativa", "Voz"],
    accent: "text-violet-700",
    tone: "from-[#d4b4ff] via-[#b784ff] to-[#9f5af8]",
    badge: "ESCRITURA",
    icon: PenLine
  }
] as const;

export function TeacherDashboard() {
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  return (
    <main className="min-h-screen bg-[#eef3fb] p-3 text-foreground sm:p-4 lg:p-5">
      <div className="mx-auto grid min-h-[calc(100vh-1.5rem)] max-w-[1520px] overflow-hidden rounded-[30px] border border-slate-200/80 bg-[#f7f9fe] shadow-[0_30px_90px_-40px_rgba(15,23,42,0.45)] lg:grid-cols-[15.5rem_minmax(0,1fr)]">
        <Sidebar />
        <div className="flex min-w-0 flex-col">
          <Header />
          <div className="flex-1 px-3 py-5 sm:px-4 lg:px-6 lg:py-6">
            <section className="mb-8 lg:mb-10">
              <h2 className="max-w-4xl text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl lg:text-[3.4rem] lg:leading-[1.02]">
                Bienvenida de nuevo, Sra. Henderson
              </h2>
              <p className="mt-3 max-w-3xl text-base leading-7 text-slate-600 sm:text-[1.05rem]">
                Tienes 2 clases proximas hoy y 46 estudiantes activos para acompañar.
              </p>
            </section>

            <section>
              <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
                <h3 className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">Tus clases</h3>
                <div className="inline-flex rounded-2xl bg-[#e5eefc] p-1">
                  <button
                    className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
                      viewMode === "grid" ? "bg-white text-[#1557d4] shadow-sm" : "text-slate-600 hover:text-slate-900"
                    }`}
                    onClick={() => setViewMode("grid")}
                    type="button"
                  >
                    <LayoutGrid className="h-4 w-4" />
                    Cuadricula
                  </button>
                  <button
                    className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
                      viewMode === "list" ? "bg-white text-[#1557d4] shadow-sm" : "text-slate-600 hover:text-slate-900"
                    }`}
                    onClick={() => setViewMode("list")}
                    type="button"
                  >
                    <List className="h-4 w-4" />
                    Lista
                  </button>
                </div>
              </div>

              <button className="group mb-5 flex min-h-32 w-full items-center justify-center rounded-[28px] border-2 border-dashed border-slate-300 bg-[#f4f7fd] px-5 py-6 text-slate-600 transition hover:border-[#b6ccf7] hover:bg-[#f7faff]" type="button">
                <div className="flex flex-col items-center gap-4">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#eadcff] text-[#321f7a] transition group-hover:bg-[#dcc8ff]">
                    <Plus className="h-8 w-8" />
                  </div>
                  <p className="text-xl font-semibold tracking-tight text-slate-700 sm:text-2xl">Crear nueva clase</p>
                </div>
              </button>

              <div className={viewMode === "grid" ? "grid gap-6 xl:grid-cols-3" : "grid gap-4"}>
                {teacherClasses.map((item) => (
                  <ClassCard item={item} key={item.title} viewMode={viewMode} />
                ))}
              </div>
            </section>
          </div>
        </div>
      </div>

      <button className="fixed bottom-6 right-6 flex h-16 w-16 items-center justify-center rounded-full bg-[#0b57d0] text-3xl text-white shadow-[0_16px_40px_-14px_rgba(11,87,208,0.7)] transition hover:bg-[#094fbf]" type="button">
        <Plus className="h-8 w-8" />
      </button>
    </main>
  );
}
