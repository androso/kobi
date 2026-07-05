import React, { useState } from "react";
import { X } from "lucide-react";
import { useClassStore } from "../../../lib/store";

interface CreateClassModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CreateClassModal({ isOpen, onClose }: CreateClassModalProps) {
  const addClass = useClassStore((state) => state.addClass);

  const [title, setTitle] = useState("");
  const [focus, setFocus] = useState("");
  const [studentCount, setStudentCount] = useState<number>(20);
  const [topicsInput, setTopicsInput] = useState("");
  const [subjectType, setSubjectType] = useState<"ciencias" | "matematicas" | "lengua" | "otro">("ciencias");

  if (!isOpen) return null;

  const subjectOptions = [
    { value: "ciencias", label: "Ciencias" },
    { value: "matematicas", label: "Matemáticas" },
    { value: "lengua", label: "Lengua" },
    { value: "otro", label: "Otro" }
  ] as const;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !focus.trim()) return;

    const topics = topicsInput
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    addClass({
      title,
      focus,
      studentCount,
      topics: topics.length > 0 ? topics : ["General"],
      subjectType,
    });

    // Reset form and close
    setTitle("");
    setFocus("");
    setStudentCount(20);
    setTopicsInput("");
    setSubjectType("ciencias");
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Glassmorphic Backdrop */}
      <div 
        className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm transition-opacity duration-300"
        onClick={onClose}
      />
      
      {/* Modal Container */}
      <div className="relative w-full max-w-4xl bg-white rounded-[32px] shadow-2xl border border-slate-100 overflow-hidden transform transition-all duration-300 scale-100 grid md:grid-cols-2 z-10 animate-in fade-in zoom-in-95 duration-200 min-h-[500px]">
        
        {/* Close Button */}
        <button 
          onClick={onClose}
          className="absolute right-4 top-4 w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition z-20"
          type="button"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Left Column (Illustration & Heading) */}
        <div className="p-10 flex flex-col justify-between bg-white border-r border-slate-100">
          <div>
            <h2 className="text-4xl font-bold tracking-tight text-slate-900 font-sans leading-[1.1] mb-4">
              Hagamos que el aprendizaje fluya.
            </h2>
            <p className="text-sm text-slate-500 leading-relaxed max-w-md">
              Crea una clase para comenzar a generar actividades curriculares personalizadas en tiempo real con inteligencia artificial.
            </p>
            <div className="mt-8 flex justify-center">
              <img 
                src="/class_creation_illustration.jpg" 
                alt="Creación de clase" 
                className="w-full max-w-[280px] h-auto object-contain"
              />
            </div>
          </div>

          {/* Footer info (mocking the contact info at the bottom of the screenshot) */}
          <div className="grid grid-cols-2 gap-4 pt-6 border-t border-slate-100 text-[11px] text-slate-400">
            <div>
              <p className="font-semibold text-slate-500">¿Necesitas ayuda?</p>
              <p className="mt-0.5">soporte@kobi.ai</p>
            </div>
            <div>
              <p className="font-semibold text-slate-500">Contacto</p>
              <p className="mt-0.5">hola@kobi.ai</p>
            </div>
          </div>
        </div>

        {/* Right Column (Form Body) */}
        <div className="bg-[#f8f9fc] p-10 flex flex-col justify-center">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Nombre de la clase */}
            <div className="relative border-b border-slate-200 focus-within:border-[#004ac6] transition-colors pb-1">
              <label htmlFor="class-title" className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">
                Nombre de la clase *
              </label>
              <input
                id="class-title"
                type="text"
                required
                className="w-full bg-transparent border-none outline-none py-1.5 text-base text-slate-800 placeholder:text-slate-400 placeholder:italic font-serif italic"
                placeholder="Ej. Ciencia 4to - Sección B"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            {/* Enfoque principal */}
            <div className="relative border-b border-slate-200 focus-within:border-[#004ac6] transition-colors pb-1">
              <label htmlFor="class-focus" className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">
                Enfoque o tema principal *
              </label>
              <input
                id="class-focus"
                type="text"
                required
                className="w-full bg-transparent border-none outline-none py-1.5 text-base text-slate-800 placeholder:text-slate-400 placeholder:italic font-serif italic"
                placeholder="Ej. Ecosistemas y energía"
                value={focus}
                onChange={(e) => setFocus(e.target.value)}
              />
            </div>

            {/* Materia / Categoría Chips */}
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2.5">
                Materia / Categoría *
              </label>
              <div className="flex flex-wrap gap-2">
                {subjectOptions.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setSubjectType(opt.value)}
                    className={`px-4 py-2 text-xs font-semibold rounded-lg border transition active:scale-95 ${
                      subjectType === opt.value
                        ? "bg-slate-900 text-white border-slate-900"
                        : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Cantidad de Estudiantes */}
            <div className="relative border-b border-slate-200 focus-within:border-[#004ac6] transition-colors pb-1">
              <label htmlFor="class-students" className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">
                N° de Estudiantes *
              </label>
              <input
                id="class-students"
                type="number"
                min={1}
                max={100}
                required
                className="w-full bg-transparent border-none outline-none py-1.5 text-base text-slate-800 font-serif italic"
                value={studentCount}
                onChange={(e) => setStudentCount(Number(e.target.value))}
              />
            </div>

            {/* Temas (Separados por coma) */}
            <div className="relative border-b border-slate-200 focus-within:border-[#004ac6] transition-colors pb-1">
              <label htmlFor="class-topics" className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5 flex items-center justify-between">
                <span>Temas clave</span>
                <span className="text-[9px] lowercase font-normal text-slate-400">Separados por coma</span>
              </label>
              <textarea
                id="class-topics"
                rows={2}
                className="w-full bg-transparent border-none outline-none py-1.5 text-base text-slate-800 placeholder:text-slate-400 placeholder:italic font-serif italic resize-none"
                placeholder="Ej. Cadenas alimenticias, Fotosintesis"
                value={topicsInput}
                onChange={(e) => setTopicsInput(e.target.value)}
              />
            </div>

            {/* Footer Actions */}
            <div className="pt-4 flex items-center justify-between gap-3 bg-transparent">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-bold text-slate-500 hover:bg-slate-100 rounded-xl transition"
                type="button"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-6 py-2.5 text-sm font-semibold text-white bg-[#10b981] hover:bg-[#059669] rounded-xl transition shadow-md shadow-emerald-500/10 flex items-center gap-1.5 active:scale-95"
              >
                <span>Crear clase</span>
                <span className="text-base font-semibold">↗</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
