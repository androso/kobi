import { useCallback, useEffect, useRef, useState } from "react";
import { Calendar, ChevronLeft, ChevronRight, Clock, FolderOpen, X } from "lucide-react";
import { Sidebar } from "./components/Sidebar";
import { CreateClassModal } from "./components/CreateClassModal";
import { supabase } from "../../lib/supabase";
import { loadSessionReports, REPORT_PAGE_SIZE, type SessionReport } from "./sessionReports";

const percent = (value: number) => `${Math.round(value * 100)}%`;
const duration = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
const date = (value: string) => new Intl.DateTimeFormat("es-SV", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));

export function PreviousClasses() {
  const [reports, setReports] = useState<SessionReport[]>([]);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<SessionReport | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const latestPageRef = useRef(page);
  const latestRequestRef = useRef(0);
  latestPageRef.current = page;

  const load = useCallback(async () => {
    const requestId = latestRequestRef.current + 1;
    latestRequestRef.current = requestId;
    const requestedPage = page;
    if (!supabase) { setError("Supabase no está configurado."); setLoading(false); return; }
    setLoading(true); setError(null);
    try {
      const nextReports: SessionReport[] = await loadSessionReports(supabase, requestedPage);
      if (requestId === latestRequestRef.current && requestedPage === latestPageRef.current) {
        setReports(nextReports);
        setSelected((current) => current
          ? nextReports.find((report) => report.id === current.id) ?? current
          : null);
      }
    } catch (cause) {
      if (requestId === latestRequestRef.current && requestedPage === latestPageRef.current) {
        setError(cause instanceof Error ? cause.message : "No se pudo cargar el historial.");
      }
    } finally {
      if (requestId === latestRequestRef.current && requestedPage === latestPageRef.current) {
        setLoading(false);
      }
    }
  }, [page]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!supabase) return;
    const client = supabase;
    const channel = client.channel("teacher-session-reports")
      .on("postgres_changes", { event: "*", schema: "public", table: "sessions" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "segments" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "assignments" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "events" }, () => void load())
      .subscribe();
    return () => { void client.removeChannel(channel); };
  }, [load]);

  const total = reports[0]?.total_count ?? 0;
  return <main className="min-h-screen bg-[#eef3fb]">
    <div className="grid min-h-screen lg:grid-cols-[240px_minmax(0,1fr)]">
      <Sidebar onOpenCreateClass={() => setIsCreateModalOpen(true)} />
      <section className="p-5 lg:p-8">
        <div className="mx-auto max-w-5xl rounded-[30px] bg-[#f8f9ff] p-6 shadow-sm">
          <h1 className="text-2xl font-extrabold text-slate-900">Historial de sesiones</h1>
          <p className="mt-1 text-sm text-slate-500">Resultados guardados de los últimos 90 días.</p>
          {loading && <p className="py-12 text-center text-sm text-slate-500">Cargando sesiones…</p>}
          {error && <div className="my-6 rounded-2xl bg-red-50 p-4 text-sm text-red-700">{error} <button className="ml-2 font-bold" onClick={() => void load()}>Reintentar</button></div>}
          {!loading && !error && reports.length === 0 && <div className="my-8 rounded-3xl bg-white p-10 text-center"><FolderOpen className="mx-auto h-12 w-12 text-slate-300"/><p className="mt-3 font-bold text-slate-700">Todavía no hay sesiones guardadas</p></div>}
          <div className="mt-6 space-y-4">{reports.map(report => <article key={report.id} className="rounded-3xl bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-4"><div>
              <p className="text-xs font-bold uppercase tracking-wide text-blue-700">{report.subject}</p>
              <h2 className="font-bold text-slate-900">{report.class_name}</h2>
              <p className="text-sm text-slate-500">{report.topics.join(", ") || report.unit}</p>
              <div className="mt-2 flex gap-4 text-xs text-slate-500"><span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5"/>{date(report.started_at)}</span><span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5"/>{duration(report.duration_seconds)}</span></div>
            </div><div className="text-right"><p className="text-lg font-extrabold">{percent(report.completion_rate)}</p><p className="text-xs text-slate-500">{report.completed_count}/{report.assignment_count} completadas</p><button className="mt-2 rounded-xl bg-[#004ac6] px-4 py-2 text-xs font-bold text-white" onClick={() => setSelected(report)}>Ver detalles</button></div></div>
          </article>)}</div>
          {total > REPORT_PAGE_SIZE && <div className="mt-6 flex items-center justify-center gap-3"><button aria-label="Página anterior" disabled={page===0} onClick={() => setPage(value=>value-1)}><ChevronLeft/></button><span className="text-sm">Página {page+1}</span><button aria-label="Página siguiente" disabled={(page+1)*REPORT_PAGE_SIZE>=total} onClick={() => setPage(value=>value+1)}><ChevronRight/></button></div>}
        </div>
      </section>
    </div>
    <CreateClassModal isOpen={isCreateModalOpen} onClose={() => setIsCreateModalOpen(false)}/>
    {selected && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-4"><div className="max-h-[85vh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-white p-7">
      <button aria-label="Cerrar" className="float-right" onClick={() => setSelected(null)}><X/></button><h2 className="text-xl font-bold">Reporte de la sesión</h2><p className="mt-2 text-slate-600">{selected.objective || "Sin objetivo registrado"}</p>
      <div className="mt-6 grid gap-3 sm:grid-cols-3"><Metric label="Puntaje promedio" value={percent(selected.average_score)}/><Metric label="Pistas usadas" value={String(selected.hints)}/><Metric label="Completadas" value={`${selected.completed_count}/${selected.assignment_count}`}/></div>
      <h3 className="mt-6 font-bold">Distribución de puntajes</h3><p className="text-sm text-slate-600">Bajo: {selected.score_distribution.low} · Medio: {selected.score_distribution.middle} · Alto: {selected.score_distribution.high}</p>
      <h3 className="mt-6 font-bold">Resultados por ruta</h3>{Object.entries(selected.band_outcomes).map(([band, outcome]) => <p className="text-sm text-slate-600" key={band}>{band}: {outcome.completed}/{outcome.assigned} · {percent(outcome.average_score)}</p>)}
      <h3 className="mt-6 font-bold">Ítems difíciles</h3><p className="text-sm text-slate-600">{selected.difficult_items.length ? selected.difficult_items.map(item=>`${item.variant} #${item.item_index+1} (${item.incorrect_attempts})`).join(", ") : "Ninguno registrado"}</p>
    </div></div>}
  </main>;
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xl font-extrabold">{value}</p><p className="text-xs text-slate-500">{label}</p></div>; }
