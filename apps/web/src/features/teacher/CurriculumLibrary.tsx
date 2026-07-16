import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  FileText,
  LoaderCircle,
  Search,
  Upload,
  X,
} from "lucide-react";
import { Sidebar } from "./components/Sidebar";
import { useAuthStore, useClassStore } from "../../lib/store";
import {
  curriculumApi,
  type CurriculumLibraryResponse,
  type CurriculumLibrarySource,
} from "../../lib/curriculumApi";

const MAX_FILE_BYTES = 50 * 1024 * 1024;
const MAX_BATCH_FILES = 10;

type LibraryTab = "all" | "selected" | "mine";
type UploadState = "queued" | "uploading" | "sent" | "failed";

interface UploadEntry {
  file: File;
  state: UploadState;
  error?: string;
}

function formatBytes(value: number) {
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function sourceStatus(source: CurriculumLibrarySource) {
  switch (source.status) {
    case "ready":
      return { label: "Disponible", className: "bg-emerald-50 text-emerald-700", icon: CheckCircle2 };
    case "failed":
      return { label: "No se pudo procesar", className: "bg-red-50 text-red-700", icon: AlertCircle };
    case "cleanup_pending":
      return { label: "Eliminando original", className: "bg-amber-50 text-amber-700", icon: LoaderCircle };
    default:
      return { label: "Procesando", className: "bg-blue-50 text-blue-700", icon: LoaderCircle };
  }
}

function UploadMaterialModal({
  className,
  classId,
  onClose,
  onUploaded,
}: {
  className: string;
  classId: string;
  onClose: () => void;
  onUploaded: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [entries, setEntries] = useState<UploadEntry[]>([]);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  function chooseFiles(files: FileList | null) {
    if (!files) return;
    const next = [...files];
    if (next.length > MAX_BATCH_FILES) {
      setValidationError(`Selecciona un maximo de ${MAX_BATCH_FILES} archivos.`);
      return;
    }
    const invalid = next.find(
      (file) => file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf"),
    );
    if (invalid) {
      setValidationError(`${invalid.name} no es un archivo PDF.`);
      return;
    }
    const oversized = next.find((file) => file.size > MAX_FILE_BYTES);
    if (oversized) {
      setValidationError(`${oversized.name} supera el limite de 50 MB.`);
      return;
    }
    setValidationError(null);
    setEntries(next.map((file) => ({ file, state: "queued" })));
  }

  function updateEntry(index: number, patch: Partial<UploadEntry>) {
    setEntries((current) =>
      current.map((entry, entryIndex) => (entryIndex === index ? { ...entry, ...patch } : entry)),
    );
  }

  async function startUpload() {
    setUploading(true);
    for (let index = 0; index < entries.length; index += 1) {
      updateEntry(index, { state: "uploading", error: undefined });
      try {
        await curriculumApi.uploadPdf(classId, entries[index]!.file);
        updateEntry(index, { state: "sent" });
      } catch (error) {
        updateEntry(index, {
          state: "failed",
          error: error instanceof Error ? error.message : "No se pudo subir el archivo.",
        });
      }
    }
    setUploading(false);
    onUploaded();
  }

  const finished = entries.length > 0 && entries.every((entry) => entry.state === "sent");

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <button
        aria-label="Cerrar"
        className="absolute inset-0 bg-slate-950/35 backdrop-blur-sm"
        disabled={uploading}
        onClick={onClose}
        type="button"
      />
      <section
        aria-labelledby="upload-material-title"
        aria-modal="true"
        className="relative z-10 max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-[28px] border border-slate-200 bg-white p-6 shadow-2xl sm:p-8"
        role="dialog"
      >
        <button
          aria-label="Cerrar"
          className="absolute right-5 top-5 flex h-9 w-9 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          disabled={uploading}
          onClick={onClose}
          type="button"
        >
          <X className="h-4 w-4" />
        </button>
        <p className="text-xs font-bold uppercase tracking-wider text-[#004ac6]">Agregar material</p>
        <h2 className="mt-2 pr-10 text-2xl font-bold text-slate-950" id="upload-material-title">
          Material para {className}
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          Los PDF se comparten en la biblioteca al terminar. El archivo original se elimina y solo
          se conservan sus fragmentos para busqueda.
        </p>

        <input
          accept="application/pdf,.pdf"
          className="sr-only"
          multiple
          onChange={(event) => chooseFiles(event.target.files)}
          ref={inputRef}
          type="file"
        />
        <button
          className="mt-6 flex min-h-40 w-full flex-col items-center justify-center border-2 border-dashed border-slate-200 bg-slate-50 px-6 py-8 text-center transition hover:border-blue-300 hover:bg-blue-50/50"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            chooseFiles(event.dataTransfer.files);
          }}
          type="button"
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-blue-100 text-[#004ac6]">
            <Upload className="h-5 w-5" />
          </span>
          <span className="mt-3 text-sm font-bold text-slate-900">Selecciona o arrastra tus PDF</span>
          <span className="mt-1 text-xs text-slate-500">Hasta 10 archivos, 50 MB por archivo</span>
        </button>

        {validationError ? (
          <p className="mt-4 flex items-center gap-2 text-sm font-semibold text-red-600">
            <AlertCircle className="h-4 w-4" />
            {validationError}
          </p>
        ) : null}

        {entries.length > 0 ? (
          <div className="mt-5 divide-y divide-slate-100 border-y border-slate-100">
            {entries.map((entry, index) => (
              <div className="flex items-center gap-3 py-3" key={`${entry.file.name}-${index}`}>
                <FileText className="h-5 w-5 shrink-0 text-red-500" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-800">{entry.file.name}</p>
                  <p className="text-xs text-slate-400">
                    {entry.error ?? formatBytes(entry.file.size)}
                  </p>
                </div>
                {entry.state === "uploading" ? (
                  <LoaderCircle className="h-4 w-4 animate-spin text-[#004ac6]" />
                ) : entry.state === "sent" ? (
                  <Check className="h-4 w-4 text-emerald-600" />
                ) : entry.state === "failed" ? (
                  <AlertCircle className="h-4 w-4 text-red-600" />
                ) : null}
              </div>
            ))}
          </div>
        ) : null}

        <div className="mt-6 flex justify-end gap-3">
          <button
            className="h-11 px-4 text-sm font-bold text-slate-600 hover:text-slate-950"
            disabled={uploading}
            onClick={onClose}
            type="button"
          >
            {finished ? "Cerrar" : "Cancelar"}
          </button>
          {!finished ? (
            <button
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#004ac6] px-5 text-sm font-bold text-white transition hover:bg-[#003ea8] disabled:cursor-not-allowed disabled:opacity-50"
              disabled={entries.length === 0 || uploading}
              onClick={() => void startUpload()}
              type="button"
            >
              {uploading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Subir materiales
            </button>
          ) : null}
        </div>
      </section>
    </div>
  );
}

export function CurriculumLibrary() {
  const user = useAuthStore((state) => state.user);
  const classes = useClassStore((state) => state.classes);
  const loadTeacherClasses = useClassStore((state) => state.loadTeacherClasses);
  const loadingClasses = useClassStore((state) => state.loadingClasses);
  const [classId, setClassId] = useState("");
  const [library, setLibrary] = useState<CurriculumLibraryResponse | null>(null);
  const [draftSelection, setDraftSelection] = useState<Set<string>>(new Set());
  const [savedSelection, setSavedSelection] = useState<Set<string>>(new Set());
  const [tab, setTab] = useState<LibraryTab>("all");
  const [search, setSearch] = useState("");
  const [unit, setUnit] = useState("all");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);

  useEffect(() => {
    if (user?.id) void loadTeacherClasses(user.id);
  }, [loadTeacherClasses, user?.id]);

  useEffect(() => {
    if (classes.length === 0) return;
    if (!classes.some((item) => item.id === classId)) setClassId(classes[0]!.id);
  }, [classId, classes]);

  const dirty = useMemo(() => {
    if (draftSelection.size !== savedSelection.size) return true;
    return [...draftSelection].some((id) => !savedSelection.has(id));
  }, [draftSelection, savedSelection]);

  async function loadLibrary(preserveDraft = false) {
    if (!classId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await curriculumApi.library(classId);
      const selected = new Set(response.selectedSourceIds);
      setLibrary(response);
      setSavedSelection(selected);
      if (!preserveDraft) setDraftSelection(selected);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "No se pudo cargar la biblioteca.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadLibrary();
  }, [classId]);

  const processing = library?.sources.some(
    (source) => !["ready", "failed", "superseded"].includes(source.status),
  );
  useEffect(() => {
    if (!processing || dirty) return;
    const timer = window.setInterval(() => void loadLibrary(), 4_000);
    return () => window.clearInterval(timer);
  }, [processing, dirty, classId]);

  const selectedClass = classes.find((item) => item.id === classId);
  const units = [...new Set((library?.sources ?? []).map((source) => source.unit))].sort();
  const visibleSources = (library?.sources ?? []).filter((source) => {
    if (tab === "selected" && !draftSelection.has(source.id)) return false;
    if (tab === "mine" && !source.isOwner) return false;
    if (unit !== "all" && source.unit !== unit) return false;
    return source.originalFilename.toLocaleLowerCase("es-SV").includes(search.trim().toLocaleLowerCase("es-SV"));
  });

  function toggleSource(source: CurriculumLibrarySource) {
    if (source.status !== "ready" && !draftSelection.has(source.id)) return;
    setSaved(false);
    setDraftSelection((current) => {
      const next = new Set(current);
      if (next.has(source.id)) next.delete(source.id);
      else if (next.size < 50) next.add(source.id);
      return next;
    });
  }

  async function saveSelections() {
    if (!classId) return;
    setSaving(true);
    setError(null);
    try {
      const result = await curriculumApi.replaceSelections(classId, [...draftSelection]);
      const next = new Set(result.selectedSourceIds);
      setSavedSelection(next);
      setDraftSelection(next);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1800);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "No se pudo guardar la seleccion.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen overflow-hidden bg-[#eef5fb] text-slate-900">
      <div className="grid min-h-screen w-full bg-[#eef5fb] lg:grid-cols-[240px_minmax(0,1fr)]">
        <Sidebar />
        <div className="flex h-screen flex-col p-3 sm:p-4 lg:p-5">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[30px] border border-slate-200/50 bg-[#f8f9ff] shadow-sm">
            <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col overflow-y-auto px-5 py-7 sm:px-7 lg:px-10 lg:py-9">
              <header className="flex flex-col justify-between gap-5 border-b border-slate-200/70 pb-7 sm:flex-row sm:items-end">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-[#004ac6]">Fuentes para Kobi</p>
                  <h2 className="mt-2 text-3xl font-bold text-slate-950 sm:text-4xl">Biblioteca de materiales</h2>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500 sm:text-base">
                    Elige las fuentes que Kobi usara para fundamentar las actividades de cada clase.
                  </p>
                </div>
                <button
                  className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#004ac6] px-5 text-sm font-bold text-white transition hover:bg-[#003ea8] disabled:opacity-50"
                  disabled={!classId}
                  onClick={() => setUploadOpen(true)}
                  type="button"
                >
                  <Upload className="h-4 w-4" />
                  Agregar material
                </button>
              </header>

              <section className="grid gap-4 border-b border-slate-200/70 py-5 md:grid-cols-[minmax(220px,1fr)_minmax(220px,1fr)_auto]">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Clase
                  <select
                    className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 outline-none focus:border-blue-400"
                    disabled={loadingClasses}
                    onChange={(event) => setClassId(event.target.value)}
                    value={classId}
                  >
                    {classes.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
                  </select>
                </label>
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Buscar
                  <span className="relative mt-2 block">
                    <Search className="absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
                    <input
                      className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 text-sm outline-none focus:border-blue-400"
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Nombre del material"
                      value={search}
                    />
                  </span>
                </label>
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Unidad
                  <select
                    className="mt-2 h-11 min-w-40 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold outline-none focus:border-blue-400"
                    onChange={(event) => setUnit(event.target.value)}
                    value={unit}
                  >
                    <option value="all">Todas</option>
                    {units.map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                </label>
              </section>

              <div className="flex flex-col justify-between gap-4 py-5 sm:flex-row sm:items-center">
                <div aria-label="Vista de materiales" className="inline-flex w-fit rounded-xl bg-slate-100 p-1" role="tablist">
                  {([
                    ["all", "Todos"],
                    ["selected", `Seleccionados (${draftSelection.size})`],
                    ["mine", "Mis cargas"],
                  ] as const).map(([value, label]) => (
                    <button
                      aria-selected={tab === value}
                      className={`rounded-lg px-3 py-2 text-xs font-bold transition ${tab === value ? "bg-white text-[#004ac6] shadow-sm" : "text-slate-500 hover:text-slate-900"}`}
                      key={value}
                      onClick={() => setTab(value)}
                      role="tab"
                      type="button"
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <button
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-bold text-white transition disabled:cursor-not-allowed disabled:opacity-40"
                  disabled={!dirty || saving}
                  onClick={() => void saveSelections()}
                  type="button"
                >
                  {saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : saved ? <Check className="h-4 w-4" /> : null}
                  {saved ? "Guardado" : "Guardar seleccion"}
                </button>
              </div>

              {error ? (
                <p className="mb-4 flex items-center gap-2 border-l-4 border-red-500 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                  <AlertCircle className="h-4 w-4" />
                  {error}
                </p>
              ) : null}

              <section aria-busy={loading}>
                <div className="hidden grid-cols-[48px_minmax(0,1fr)_120px_140px_130px] gap-4 border-b border-slate-200 px-3 pb-3 text-[10px] font-bold uppercase tracking-wider text-slate-400 md:grid">
                  <span />
                  <span>Material</span>
                  <span>Unidad</span>
                  <span>Contenido</span>
                  <span>Estado</span>
                </div>
                {loading && !library ? (
                  <p className="py-14 text-center text-sm text-slate-500">Cargando materiales...</p>
                ) : visibleSources.length === 0 ? (
                  <div className="border border-dashed border-slate-200 bg-white px-6 py-14 text-center">
                    <FileText className="mx-auto h-7 w-7 text-slate-300" />
                    <h3 className="mt-3 text-base font-bold text-slate-900">No hay materiales en esta vista</h3>
                    <p className="mt-1 text-sm text-slate-500">Ajusta los filtros o agrega un PDF.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100 border-b border-slate-200">
                    {visibleSources.map((source) => {
                      const status = sourceStatus(source);
                      const StatusIcon = status.icon;
                      const checked = draftSelection.has(source.id);
                      return (
                        <label
                          className={`grid min-h-20 gap-3 px-3 py-4 transition md:grid-cols-[48px_minmax(0,1fr)_120px_140px_130px] md:items-center ${source.status === "ready" ? "cursor-pointer hover:bg-white/80" : "cursor-default opacity-75"}`}
                          key={source.id}
                        >
                          <span className={`flex h-6 w-6 items-center justify-center rounded-md border ${checked ? "border-[#004ac6] bg-[#004ac6] text-white" : "border-slate-300 bg-white"}`}>
                            {checked ? <Check className="h-4 w-4" /> : null}
                            <input
                              checked={checked}
                              className="sr-only"
                              disabled={source.status !== "ready" && !checked}
                              onChange={() => toggleSource(source)}
                              type="checkbox"
                            />
                          </span>
                          <span className="flex min-w-0 items-center gap-3">
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-500">
                              <FileText className="h-5 w-5" />
                            </span>
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-bold text-slate-900">{source.originalFilename}</span>
                              <span className="mt-1 block text-xs text-slate-400">
                                {formatBytes(source.sizeBytes)} / {source.grade} / {source.subject}
                                {source.isOwner ? " / Tu material" : " / Compartido"}
                              </span>
                            </span>
                          </span>
                          <span className="text-sm font-semibold text-slate-600">{source.unit}</span>
                          <span className="text-xs font-semibold text-slate-500">
                            {source.pageCount ? `${source.pageCount} paginas` : "Analizando"}
                            {source.chunksBuilt ? ` / ${source.chunksBuilt} fragmentos` : ""}
                          </span>
                          <span className={`inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[10px] font-bold ${status.className}`}>
                            <StatusIcon className={`h-3.5 w-3.5 ${source.status !== "ready" && source.status !== "failed" ? "animate-spin" : ""}`} />
                            {status.label}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </section>
            </div>
          </div>
        </div>
      </div>

      {uploadOpen && selectedClass ? (
        <UploadMaterialModal
          classId={classId}
          className={selectedClass.title}
          onClose={() => setUploadOpen(false)}
          onUploaded={() => void loadLibrary()}
        />
      ) : null}
    </main>
  );
}
