import { useEffect, useState } from "react";
import { Check, Copy, LayoutGrid, List, Plus, X, Zap } from "lucide-react";
import { Sidebar } from "./components/Sidebar";
import { Header } from "./components/Header";
import { ClassCard } from "./components/ClassCard";
import { CreateClassModal } from "./components/CreateClassModal";
import { useAuthStore, useClassStore, type ClassItem } from "../../lib/store";

function getStudentJoinUrl() {
  return `${window.location.origin}/`;
}

function ShareClassCodeModal({
  classItem,
  onClose,
}: {
  classItem: ClassItem;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState<"code" | "message" | null>(null);
  const joinUrl = getStudentJoinUrl();
  const shareMessage = `Entra a Kobi: ${joinUrl}\nCodigo de clase: ${classItem.joinCode}`;

  async function copyToClipboard(value: string, kind: "code" | "message") {
    await navigator.clipboard?.writeText(value);
    setCopied(kind);
    window.setTimeout(() => setCopied(null), 1400);
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/35 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg rounded-[28px] border border-slate-100 bg-white p-7 shadow-2xl">
        <button
          aria-label="Cerrar"
          className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          onClick={onClose}
          type="button"
        >
          <X className="h-4 w-4" />
        </button>

        <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Compartir clase</p>
        <h2 className="mt-2 pr-8 text-2xl font-bold tracking-tight text-slate-950">{classItem.title}</h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          Pide a tus estudiantes entrar a Kobi, elegir Estudiante y escribir este codigo.
        </p>

        <div className="mt-6 rounded-2xl border border-blue-100 bg-blue-50 px-6 py-5 text-center">
          <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-blue-500">Codigo de clase</p>
          <div className="mt-2 font-mono text-5xl font-black tracking-[0.16em] text-[#004ac6]">{classItem.joinCode}</div>
        </div>

        <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Enlace para estudiantes</p>
          <p className="mt-1 break-all text-sm font-semibold text-slate-700">{joinUrl}</p>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#004ac6] px-4 text-sm font-bold text-white transition hover:bg-[#003ea8]"
            onClick={() => void copyToClipboard(classItem.joinCode, "code")}
            type="button"
          >
            {copied === "code" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            Copiar codigo
          </button>
          <button
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
            onClick={() => void copyToClipboard(shareMessage, "message")}
            type="button"
          >
            {copied === "message" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            Copiar invitacion
          </button>
        </div>
      </div>
    </div>
  );
}

export function TeacherDashboard() {
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [shareClass, setShareClass] = useState<ClassItem | null>(null);
  const user = useAuthStore((state) => state.user);
  const teacherId = user?.id;
  const classes = useClassStore((state) => state.classes);
  const sessions = useClassStore((state) => state.sessions);
  const loadingClasses = useClassStore((state) => state.loadingClasses);
  const classError = useClassStore((state) => state.classError);
  const loadTeacherClasses = useClassStore((state) => state.loadTeacherClasses);

  useEffect(() => {
    if (teacherId) void loadTeacherClasses(teacherId);
  }, [loadTeacherClasses, teacherId]);

  const teacherName = user?.displayName || user?.email?.split("@")[0] || "Docente";
  const classesCount = classes.length;
  const totalStudents = classes.reduce((sum, c) => sum + (c.studentCount || 0), 0);

  return (
    <main className="min-h-screen bg-[#eef5fb] text-foreground overflow-hidden">
      <div className="grid min-h-screen w-full lg:grid-cols-[240px_minmax(0,1fr)] bg-[#eef5fb]">
        <Sidebar onOpenCreateClass={() => setIsCreateModalOpen(true)} />
        <div className="flex flex-col p-3 sm:p-4 lg:p-5 h-screen">
          <div className="flex-1 flex flex-col bg-[#f8f9ff] rounded-[30px] border border-slate-200/50 overflow-hidden shadow-sm">
            <Header />
            <div className="flex-1 px-6 py-8 md:px-10 max-w-7xl w-full mx-auto overflow-y-auto">
            {/* Greeting Hero */}
            <section className="mb-10">
              <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl lg:text-[40px] leading-tight">
                Bienvenido(a) de nuevo, {teacherName}
              </h2>
              <p className="mt-2 text-slate-500 text-base sm:text-lg">
                {classesCount === 0
                  ? "Crea una clase para comenzar a trabajar con tus estudiantes."
                  : `Tienes ${classesCount} ${classesCount === 1 ? "clase próxima" : "clases próximas"} hoy y ${totalStudents} ${totalStudents === 1 ? "estudiante activo" : "estudiantes activos"} para acompañar.`}
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

              {classError ? (
                <p className="mb-5 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{classError}</p>
              ) : null}
              {loadingClasses ? <p className="mb-5 text-sm text-slate-500">Cargando clases...</p> : null}

              {/* Botón Crear nueva clase (Compacto, arriba de la cuadrícula) */}
              <div className="mb-6">
                <button 
                  onClick={() => setIsCreateModalOpen(true)}
                  className="group flex items-center gap-2 border-2 border-dashed border-slate-200 bg-slate-50/50 hover:bg-slate-100/50 hover:border-[#004ac6]/30 px-5 py-2.5 rounded-2xl cursor-pointer transition active:scale-95" 
                  type="button"
                >
                  <Plus className="h-4 w-4 text-[#004ac6]" />
                  <span className="text-xs font-bold text-slate-500 group-hover:text-[#004ac6] transition-colors">Crear nueva clase</span>
                </button>
              </div>

              {/* Grid de Clases */}
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {classes.map((item, index) => (
                  <ClassCard item={item} key={item.id} viewMode={viewMode} index={index} onShareCode={setShareClass} />
                ))}
              </div>
              {!loadingClasses && classes.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-10 text-center">
                  <h4 className="text-base font-bold text-slate-900">Todavia no tienes clases</h4>
                  <p className="mt-2 text-sm text-slate-500">Crea una clase para generar un codigo de acceso.</p>
                </div>
              ) : null}
            </section>

            {/* Bottom Quick Stats / Activity */}
            {sessions.length > 0 ? (
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
            ) : null}
          </div>
        </div>
      </div>
    </div>

      <button 
        onClick={() => setIsCreateModalOpen(true)}
        className="fixed bottom-6 right-6 flex h-14 w-14 items-center justify-center rounded-full bg-[#004ac6] text-white shadow-lg hover:rotate-90 transition-transform active:scale-95" 
        type="button"
      >
        <Plus className="h-6 w-6" />
      </button>

      <CreateClassModal isOpen={isCreateModalOpen} onClose={() => setIsCreateModalOpen(false)} />
      {shareClass ? <ShareClassCodeModal classItem={shareClass} onClose={() => setShareClass(null)} /> : null}
    </main>
  );
}
