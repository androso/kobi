import { useState } from "react";
import { LayoutGrid, List, Plus, Leaf, Sigma, BookOpen, Zap } from "lucide-react";
import { Sidebar } from "./components/Sidebar";
import { Header } from "./components/Header";
import { ClassCard } from "./components/ClassCard";

const teacherClasses = [
  {
    title: "Ciencia 4to - Sección A",
    focus: "Ecosistemas y energía",
    students: "24 estudiantes activos",
    topics: ["Fotosintesis", "Cadenas alimentarias", "Niveles tróficos"],
    accent: "text-emerald-700",
    tone: "from-emerald-600 to-teal-500",
    badge: "Lección activa",
    icon: Leaf,
    image: "https://lh3.googleusercontent.com/aida-public/AB6AXuBCAwPsVw47e0Nv2o8f8sBJM_d_mY5O81AtCriMIujynK1Z4qFVr-U_1_BOLZz-c9WnkGdFLcIxY-pCddOH7FNrl4Nz3RJSepvcldBk9Hn-unZmUUahnjRaxJUfGgcqzcrtMmlDFp3i945BScZwFB8FpFCiY7l7hpZt_9Ac6FLAoZZcrdpnH05aRWNP5a3NlMK0drZNLJ05ejf9BogvXk_G02ZR5Gq8nCFjvbqq7-deOlmo_kbRavVCO0AbBkNsIOBOJN1NGhVDmOM"
  },
  {
    title: "Matemáticas 5to - Álgebra básica",
    focus: "Matemáticas",
    students: "22 estudiantes activos",
    topics: ["Variables", "Ecuaciones", "Orden de operaciones"],
    accent: "text-blue-700",
    tone: "from-blue-600 to-indigo-500",
    icon: Sigma,
    image: "https://lh3.googleusercontent.com/aida-public/AB6AXuA932KhbIrFuy-YeSLoezsXY1m5ssXcWSCC6nKu52j9iVzwAW0nbMgsKdzmvGZ-x1ZGA4YLqNnsEUuf0YbOjW3QTAaVw7AeJSd_HlaLZEYO49CWgi58UglcAAkhr5-GeZxDYNYJqtLwLnL2xl8gvQpmNmluT-yrr4iOuyjeJSoGn0jgZG5Y4gQjl0kaq9cxGKhtuOToJYeEkDpLt8KG6AeUI7yRUTLfqyF6MB4w0o2AGtWFJOCeN6Wh_eTS3RPoN6ml2gq0Y37Tr9w"
  },
  {
    title: "Lengua 8vo - Escritura creativa",
    focus: "Lengua y artes",
    students: "28 estudiantes activos",
    topics: ["Metáforas", "Estructura narrativa", "Voz"],
    accent: "text-violet-700",
    tone: "from-violet-600 to-purple-500",
    icon: BookOpen,
    image: "https://lh3.googleusercontent.com/aida-public/AB6AXuCpycvw0OTR6LZbzoWOMk7z3c-p9wMvTQoYyHII1w-4g5rUbzvB_0p33ESghjGNCfseRdj5ouhEUbTrXj52sIfJ9RMFn5JMtRfNXZ-v-KXEWkKpr1lMH23hOqgtEYhMsBcX4JD-tKQdkAq1X93KbzOX4BGFAvHo8O9E9_8IYAluDRxNGs-niCbr2pMnBUC3cFbqF6wlnSubrpUUrKu2hTKD8mzsjSdQRgJilvuO9f_lM7l_NZR1J3YxBJAprOGHte9ecoWntu4mMVY"
  }
] as const;

export function TeacherDashboard() {
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  return (
    <main className="min-h-screen bg-[#eef3fb] text-foreground overflow-hidden">
      <div className="grid min-h-screen w-full lg:grid-cols-[240px_minmax(0,1fr)] bg-[#eef3fb]">
        <Sidebar />
        <div className="flex flex-col p-3 sm:p-4 lg:p-5 h-screen">
          <div className="flex-1 flex flex-col bg-[#f8f9ff] rounded-[30px] border border-slate-200/50 overflow-hidden shadow-sm">
            <Header />
            <div className="flex-1 px-6 py-8 md:px-10 max-w-7xl w-full mx-auto overflow-y-auto">
            {/* Greeting Hero */}
            <section className="mb-10">
              <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl lg:text-[40px] leading-tight">
                Bienvenida de nuevo, Sra. Henderson
              </h2>
              <p className="mt-2 text-slate-500 text-base sm:text-lg">
                Tienes 2 clases próximas hoy y 46 estudiantes activos para acompañar.
              </p>
            </section>

            {/* Classes Section */}
            <section>
              <div className="mb-6 flex items-center justify-between">
                <h3 className="text-xl font-bold text-slate-900 sm:text-2xl">Tus clases</h3>
                <div className="inline-flex rounded-xl bg-slate-100 p-1">
                  <button
                    className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                      viewMode === "grid" ? "bg-white text-[#004ac6] shadow-sm" : "text-slate-500 hover:text-slate-900"
                    }`}
                    onClick={() => setViewMode("grid")}
                    type="button"
                  >
                    <LayoutGrid className="h-3.5 w-3.5" />
                    Cuadrícula
                  </button>
                  <button
                    className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                      viewMode === "list" ? "bg-white text-[#004ac6] shadow-sm" : "text-slate-500 hover:text-slate-900"
                    }`}
                    onClick={() => setViewMode("list")}
                    type="button"
                  >
                    <List className="h-3.5 w-3.5" />
                    Lista
                  </button>
                </div>
              </div>

              {/* Botón Crear nueva clase (Compacto, arriba de la cuadrícula) */}
              <div className="mb-6">
                <button className="group flex items-center gap-2 border-2 border-dashed border-slate-200 bg-slate-50/50 hover:bg-slate-100/50 hover:border-[#004ac6]/30 px-5 py-2.5 rounded-2xl cursor-pointer transition active:scale-95" type="button">
                  <Plus className="h-4 w-4 text-[#004ac6]" />
                  <span className="text-xs font-bold text-slate-500 group-hover:text-[#004ac6] transition-colors">Crear nueva clase</span>
                </button>
              </div>

              {/* Grid de Clases */}
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {teacherClasses.map((item) => (
                  <ClassCard item={item} key={item.title} viewMode={viewMode} />
                ))}
              </div>
            </section>

            {/* Bottom Quick Stats / Activity */}
            <section className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Engagement Insight Card */}
              <div className="md:col-span-2 bg-white border border-slate-100 rounded-3xl p-6 flex items-center gap-6 shadow-sm">
                <div className="w-14 h-14 shrink-0 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <Zap className="h-6 w-6 fill-emerald-600" />
                </div>
                <div>
                  <h5 className="text-base font-bold text-slate-900">La participación semanal subió un 12%</h5>
                  <p className="mt-1 text-sm text-slate-500 leading-relaxed">
                    Tus estudiantes están pasando más tiempo del esperado en la actividad de 'Cadenas alimentarias'. ¿Te gustaría agregar más recursos?
                  </p>
                </div>
              </div>

              {/* Next Session Card */}
              <div className="bg-[#004ac6] text-white rounded-3xl p-6 flex flex-col justify-center shadow-sm">
                <span className="text-[10px] font-bold uppercase tracking-wider text-blue-200">PRÓXIMA SESIÓN</span>
                <h5 className="mt-1 text-lg font-bold leading-snug">10:30 AM <br />Ciencia - Sec A</h5>
                <div className="mt-4 flex items-center -space-x-2">
                  <img className="w-8 h-8 rounded-full border-2 border-[#004ac6] object-cover" src="https://lh3.googleusercontent.com/aida-public/AB6AXuB2qFKoH54IyhZCFdjoIRSChvpUzEa_vrsh5NAv-DyIijb7VD0D3Ts0tkKuP2mH_cO9GLR7KfzZHuGKRUJ8Wh-3T5TuiCnBg2aHxKaUlFn-BnHz33uGetUa_hlSV3YGcfp7chx_L7PW2KHqYb9IRB6tWEpQil0SJTWpFLiO_5Dc0WDVP045Nimgm2MmVuTtA_WwE4cL-3OGefElcQymaB9BG3_F488z_R_M5ydtkfY1sN72R4ra4WEO5J9CMdei-Uk2pI0IE7sYsoA" alt="Estudiante" />
                  <img className="w-8 h-8 rounded-full border-2 border-[#004ac6] object-cover" src="https://lh3.googleusercontent.com/aida-public/AB6AXuDGPE9JjM4R0tsUzBo15GtbRB5rIOIkHgvTh9Kfy5gWTduE0VO329LroiLyCLzBYcbhPanU7a2FFp6mmQYKH9XNd1OaGRVbAViLSZIG85RkwslRmiGgx4LgcE5i5_SB4434YoD-ZlrzWBGDdPdf0hIRlyrJJkZfSM7vFHEUPKGiRsW6DrnOcgINZ6qu-_wE1zW_vahGv_R8hUT6-f7z1gvGfgzlzU1f9x3Wslg_0l2lwd0RBId9q4u-sx0jkCKZ99gJr_Jv_G9W-sE" alt="Estudiante" />
                  <img className="w-8 h-8 rounded-full border-2 border-[#004ac6] object-cover" src="https://lh3.googleusercontent.com/aida-public/AB6AXuBfY6NT0pkS-JKNNZptzFMV5Jq52lVumxB5CA5ALhMzcAEa-afk0aw05IJHWxv2BRp2Se165IMtu5jT6OYuLAW3AvH1xi_wyqK2dJiGknHtBrvN5RXlFTmW_WYgRGOClbS8hbXdWpjcvAFtfjNDFbSE1iSXZVRlvW1p1ooy7Nhe6niCbDjfT9nbTvYuBZxWGvyQm1ZhANgD1VzB9Sk-6cYtTpVZLD11GVuHKieqnGI-3K13SliHZYX2QIdXkHmo0218cVLrhUi66Xs" alt="Estudiante" />
                  <div className="w-8 h-8 rounded-full bg-[#2563eb] text-[10px] font-bold flex items-center justify-center border-2 border-[#004ac6]">
                    +21
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>

      <button className="fixed bottom-6 right-6 flex h-14 w-14 items-center justify-center rounded-full bg-[#004ac6] text-white shadow-lg hover:rotate-90 transition-transform active:scale-95" type="button">
        <Plus className="h-6 w-6" />
      </button>
    </main>
  );
}
