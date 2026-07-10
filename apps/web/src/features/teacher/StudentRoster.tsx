import { useEffect, useState } from "react";
import { Eye, EyeOff, Printer } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { rosterApi, type RosterStudent } from "../../lib/rosterApi";
import { useClassStore } from "../../lib/store";

export function StudentRoster() {
  const { classId = "" } = useParams();
  const classItem = useClassStore((state) => state.classes.find((item) => item.id === classId));
  const [students, setStudents] = useState<RosterStudent[]>([]);
  const [name, setName] = useState(""); const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);

  async function load() { try { setStudents((await rosterApi.list(classId)).students); } catch (e) { setError(e instanceof Error ? e.message : "No se pudo cargar."); } }
  useEffect(() => { void load(); }, [classId]);
  async function create(event: React.FormEvent) { event.preventDefault(); if (password.length < 8) { setError("Usa una contraseña de al menos 8 caracteres."); return; }
    setBusy(true); setError(""); try { const result = await rosterApi.create(classId, name.trim(), password); setStudents((rows) => [...rows, result.student].sort((a,b) => a.display_name.localeCompare(b.display_name))); setName(""); setPassword(""); } catch (e) { setError(e instanceof Error ? e.message : "No se pudo crear."); } finally { setBusy(false); } }
  async function reset(student: RosterStudent) { const next = window.prompt(`Nueva contraseña para ${student.display_name} (mínimo 8 caracteres):`); if (!next) return; try { await rosterApi.resetPassword(classId, student.id, next); } catch (e) { setError(e instanceof Error ? e.message : "No se pudo restablecer."); } }
  async function toggle(student: RosterStudent) { try { await rosterApi.setActive(classId, student.id, !student.is_active); await load(); } catch (e) { setError(e instanceof Error ? e.message : "No se pudo actualizar."); } }
  return <main className="min-h-screen bg-[#eef5fb] p-5 text-slate-900"><div className="mx-auto max-w-5xl rounded-[28px] bg-white p-7 shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-4"><div><Link className="text-sm font-bold text-blue-700" to="/teacher">← Tus clases</Link><h1 className="mt-2 text-3xl font-black">Estudiantes · {classItem?.title ?? "Clase"}</h1><p className="mt-2 text-slate-500">Cuentas nuevas administradas por el docente. El historial anterior no se muestra aquí.</p></div><button className="print:hidden rounded-xl border px-4 py-2 font-bold" onClick={() => window.print()}><Printer className="mr-2 inline h-4 w-4"/>Imprimir credenciales</button></div>
    {error ? <p role="alert" className="mt-5 rounded-xl bg-red-50 p-3 text-red-700">{error}</p> : null}
    <form className="print:hidden mt-7 grid gap-3 rounded-2xl bg-slate-50 p-5 md:grid-cols-[1fr_1fr_auto]" onSubmit={create}><label><span className="text-sm font-bold">Nombre</span><input className="mt-1 h-12 w-full rounded-xl border px-3" required value={name} onChange={(e) => setName(e.target.value)} /></label><label><span className="text-sm font-bold">Contraseña inicial</span><div className="mt-1 flex h-12 rounded-xl border bg-white"><input className="min-w-0 flex-1 px-3 outline-none" minLength={8} required type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} /><button className="px-3" type="button" aria-label="Mostrar contraseña" onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff/> : <Eye/>}</button></div></label><button disabled={busy} className="self-end h-12 rounded-xl bg-blue-700 px-5 font-bold text-white">{busy ? "Creando…" : "Crear estudiante"}</button></form>
    <div className="mt-7 space-y-3">{students.map((student) => <article className="grid gap-3 rounded-2xl border p-4 md:grid-cols-[1fr_1fr_auto] md:items-center" key={student.id}><div><strong>{student.display_name}</strong><p className="text-sm text-slate-500">{student.is_active ? "Cuenta activa" : "Cuenta desactivada"}</p></div><div><span className="text-xs uppercase text-slate-400">Usuario</span><p className="font-mono text-lg font-bold">{student.username}</p><p className="hidden print:block text-sm">Contraseña: __________________</p></div><div className="print:hidden flex gap-2"><button className="rounded-lg border px-3 py-2 text-sm font-bold" onClick={() => void reset(student)}>Cambiar contraseña</button><button className="rounded-lg border px-3 py-2 text-sm font-bold" onClick={() => void toggle(student)}>{student.is_active ? "Desactivar" : "Reactivar"}</button></div></article>)}</div>
  </div></main>;
}
