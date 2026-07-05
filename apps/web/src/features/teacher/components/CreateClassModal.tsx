import React, { useState } from "react";
import { X, Plus, Sparkles } from "lucide-react";
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
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity duration-300"
        onClick={onClose}
      />
      
      {/* Modal Container */}
      <div className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden transform transition-all duration-300 scale-100 flex flex-col z-10 animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-[#004ac6] flex items-center justify-center">
              <Plus className="w-5 h-5 font-bold" />
            </div>
            <h3 className="text-lg font-bold text-slate-900">Crear Nueva Clase</h3>
          </div>
          <button 
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
            type="button"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 flex-1 overflow-y-auto">
          {/* Nombre de la clase */}
          <div>
            <label htmlFor="class-title" className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
              Nombre de la clase
            </label>
            <input
              id="class-title"
              type="text"
              required
              className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 focus:ring-2 focus:ring-[#004ac6]/20 focus:border-[#004ac6] outline-none text-sm transition-all text-slate-800 placeholder:text-slate-400"
              placeholder="Ej. Ciencia 4to - Sección B"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          {/* Enfoque principal */}
          <div>
            <label htmlFor="class-focus" className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
              Enfoque o tema principal
            </label>
            <input
              id="class-focus"
              type="text"
              required
              className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 focus:ring-2 focus:ring-[#004ac6]/20 focus:border-[#004ac6] outline-none text-sm transition-all text-slate-800 placeholder:text-slate-400"
              placeholder="Ej. Ecosistemas y energía"
              value={focus}
              onChange={(e) => setFocus(e.target.value)}
            />
          </div>

          {/* Fila de Categoría y Cantidad de Estudiantes */}
          <div className="grid grid-cols-2 gap-4">
            {/* Categoría */}
            <div>
              <label htmlFor="class-subject" className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                Materia / Categoría
              </label>
              <select
                id="class-subject"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 focus:ring-2 focus:ring-[#004ac6]/20 focus:border-[#004ac6] outline-none text-sm transition-all text-slate-700 font-medium"
                value={subjectType}
                onChange={(e) => setSubjectType(e.target.value as any)}
              >
                <option value="ciencias">Ciencias</option>
                <option value="matematicas">Matemáticas</option>
                <option value="lengua">Lengua y artes</option>
                <option value="otro">Otro</option>
              </select>
            </div>

            {/* Cantidad de Estudiantes */}
            <div>
              <label htmlFor="class-students" className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                N° de Estudiantes
              </label>
              <input
                id="class-students"
                type="number"
                min={1}
                max={100}
                required
                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 focus:ring-2 focus:ring-[#004ac6]/20 focus:border-[#004ac6] outline-none text-sm transition-all text-slate-800"
                value={studentCount}
                onChange={(e) => setStudentCount(Number(e.target.value))}
              />
            </div>
          </div>

          {/* Temas (Separados por coma) */}
          <div>
            <label htmlFor="class-topics" className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5 flex items-center justify-between">
              <span>Temas clave</span>
              <span className="text-[10px] lowercase font-normal text-slate-400">Separados por coma</span>
            </label>
            <textarea
              id="class-topics"
              rows={2}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 focus:ring-2 focus:ring-[#004ac6]/20 focus:border-[#004ac6] outline-none text-sm transition-all text-slate-800 placeholder:text-slate-400"
              placeholder="Ej. Cadenas alimenticias, Fotosíntesis, Energía"
              value={topicsInput}
              onChange={(e) => setTopicsInput(e.target.value)}
            />
          </div>

          {/* Footer Actions */}
          <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3 bg-white">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-bold text-slate-500 hover:bg-slate-50 rounded-xl transition"
              type="button"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-sm font-bold text-white bg-[#004ac6] hover:bg-[#003ea8] rounded-xl transition shadow-md shadow-blue-600/10 flex items-center gap-1.5 active:scale-95"
            >
              <Sparkles className="w-4 h-4" />
              Crear Clase
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
