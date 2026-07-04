import { useEffect, useState } from "react";
import { BookOpen, GraduationCap, Lock, Mail, User } from "lucide-react";
import { Button } from "./components/ui/button";

const slides = [
  {
    title: "Clase en vivo",
    body: "Kobi escucha la clase y prepara actividades alineadas al tema.",
    image: "/auth/live-session.png"
  },
  {
    title: "Curriculo conectado",
    body: "Cada opcion muestra objetivo, evidencia y contenido reutilizable.",
    image: "/auth/curriculum.png"
  },
  {
    title: "Actividad para todos",
    body: "Los estudiantes reciben variantes simples: apoyo, base y reto.",
    image: "/auth/students.png"
  }
];

export function App() {
  const [activeSlide, setActiveSlide] = useState(0);
  const [role, setRole] = useState<"teacher" | "student">("teacher");

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setActiveSlide((current) => (current + 1) % slides.length);
    }, 4500);

    return () => window.clearInterval(intervalId);
  }, []);

  const slide = slides[activeSlide];

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#eef5fb] px-4 py-8 text-foreground sm:px-6">
      <div className="grid min-h-[42rem] w-full max-w-6xl overflow-hidden rounded-[2rem] bg-white shadow-2xl shadow-slate-200/80 lg:grid-cols-[1fr_0.9fr]">
        <section className="relative flex min-h-[34rem] overflow-hidden bg-[#1077e5] px-7 py-8 text-white sm:px-10 lg:min-h-full lg:px-12">
          <div className="pointer-events-none absolute -right-44 top-1/2 z-20 h-[115%] w-72 -translate-y-1/2 rounded-l-[100%] bg-white" />
          <div className="absolute inset-0 opacity-60">
            <div className="absolute left-[12%] top-[24%] h-4 w-28 rounded-full bg-white/20" />
            <div className="absolute left-[56%] top-[30%] h-5 w-36 rounded-full bg-white/20" />
            <div className="absolute left-[22%] top-[43%] h-4 w-60 rounded-full bg-white/15" />
            <div className="absolute bottom-[30%] left-[54%] h-5 w-24 rounded-full bg-white/20" />
          </div>

          <div className="relative z-10 flex w-full flex-col">
            <div className="flex flex-1 flex-col justify-center">
              <div className="relative mx-auto mb-8 aspect-[1.38] w-full max-w-md">
                {slides.map((item, index) => {
                  const isActive = index === activeSlide;

                  return (
                    <img
                      alt=""
                      aria-hidden={!isActive}
                      className={`absolute inset-0 h-full w-full object-contain transition-all duration-700 ease-out ${
                        isActive ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
                      }`}
                      key={item.title}
                      src={item.image}
                    />
                  );
                })}
              </div>

              <div className="min-h-36 max-w-xl transition-all duration-700" key={slide.title}>
                <h1 className="text-3xl font-semibold tracking-normal sm:text-4xl">{slide.title}</h1>
                <p className="mt-4 max-w-md text-base leading-7 text-white/85">{slide.body}</p>
              </div>

              <div className="mt-8 flex gap-4" aria-label="Cambiar panel informativo">
                {slides.map((item, index) => (
                  <button
                    aria-label={`Ver ${item.title}`}
                    aria-current={index === activeSlide}
                    className={`h-4 w-4 rounded-full border-2 border-white transition-all duration-300 ${
                      index === activeSlide ? "scale-110 bg-white" : "bg-transparent hover:bg-white/40"
                    }`}
                    key={item.title}
                    onClick={() => setActiveSlide(index)}
                    type="button"
                  />
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="flex items-center justify-center px-7 py-10 sm:px-10 lg:px-14">
          <div className="w-full max-w-md">
            <div className="mb-10">
              <p className="text-sm font-medium text-primary">Bienvenido a Kobi</p>
              <h2 className="mt-2 text-4xl font-semibold tracking-normal text-[#1077e5]">Iniciar sesion</h2>
              <p className="mt-4 text-sm leading-6 text-muted-foreground">
                Entra con calma. Kobi se encarga de convertir los ultimos minutos de clase en una actividad clara,
                rapida y lista para tus estudiantes.
              </p>
            </div>

            <div className="mb-5 grid grid-cols-2 gap-2 rounded-full bg-muted p-1.5">
              <button
                className={`rounded-full px-4 py-2.5 text-sm font-medium transition ${
                  role === "teacher" ? "bg-white text-[#1077e5] shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => setRole("teacher")}
                type="button"
              >
                Profesor
              </button>
              <button
                className={`rounded-full px-4 py-2.5 text-sm font-medium transition ${
                  role === "student" ? "bg-white text-[#1077e5] shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => setRole("student")}
                type="button"
              >
                Estudiante
              </button>
            </div>


            {role === "teacher" ? (
              <form className="space-y-7">
                <label className="group block">
                  <span className="sr-only">Correo electronico</span>
                  <div className="flex items-center rounded-xl border border-slate-200 px-4 py-3 transition hover:border-sky-200 hover:bg-sky-50/70 focus-within:border-[#1077e5] focus-within:bg-sky-50/80 focus-within:ring-4 focus-within:ring-sky-100">
                    <input
                      className="w-full bg-transparent text-base text-[#0f4f9e] caret-[#1077e5] outline-none placeholder:text-slate-300"
                      placeholder="Correo electronico"
                      type="email"
                    />
                    <Mail className="h-5 w-5 text-slate-300 transition group-hover:text-sky-400 group-focus-within:text-[#1077e5]" />
                  </div>
                </label>
                <label className="group block">
                  <span className="sr-only">Contrasena</span>
                  <div className="flex items-center rounded-xl border border-slate-200 px-4 py-3 transition hover:border-sky-200 hover:bg-sky-50/70 focus-within:border-[#1077e5] focus-within:bg-sky-50/80 focus-within:ring-4 focus-within:ring-sky-100">
                    <input
                      className="w-full bg-transparent text-base text-[#0f4f9e] caret-[#1077e5] outline-none placeholder:text-slate-300"
                      placeholder="Contrasena"
                      type="password"
                    />
                    <Lock className="h-5 w-5 text-slate-300 transition group-hover:text-sky-400 group-focus-within:text-[#1077e5]" />
                  </div>
                </label>

                <div className="flex flex-wrap items-center justify-between gap-4">
                  <Button type="button">Entrar</Button>
                  <label className="flex items-center gap-2 text-sm text-muted-foreground">
                    <input className="h-4 w-4 accent-[#1077e5]" type="checkbox" />
                    Recordarme
                  </label>
                </div>

                <button className="block text-sm font-medium text-[#1077e5]" type="button">
                  Olvidaste tu contrasena?
                </button>
              </form>
            ) : (
              <form className="space-y-7">
                <label className="group block">
                  <span className="sr-only">Codigo de clase</span>
                  <div className="flex items-center rounded-xl border border-slate-200 px-4 py-3 transition hover:border-sky-200 hover:bg-sky-50/70 focus-within:border-[#1077e5] focus-within:bg-sky-50/80 focus-within:ring-4 focus-within:ring-sky-100">
                    <input
                      className="w-full bg-transparent text-base uppercase text-[#0f4f9e] caret-[#1077e5] outline-none placeholder:normal-case placeholder:text-slate-300"
                      placeholder="Codigo de clase"
                      type="text"
                    />
                    <BookOpen className="h-5 w-5 text-slate-300 transition group-hover:text-sky-400 group-focus-within:text-[#1077e5]" />
                  </div>
                </label>
                <label className="group block">
                  <span className="sr-only">Nombre</span>
                  <div className="flex items-center rounded-xl border border-slate-200 px-4 py-3 transition hover:border-sky-200 hover:bg-sky-50/70 focus-within:border-[#1077e5] focus-within:bg-sky-50/80 focus-within:ring-4 focus-within:ring-sky-100">
                    <input
                      className="w-full bg-transparent text-base text-[#0f4f9e] caret-[#1077e5] outline-none placeholder:text-slate-300"
                      placeholder="Nombre"
                      type="text"
                    />
                    <User className="h-5 w-5 text-slate-300 transition group-hover:text-sky-400 group-focus-within:text-[#1077e5]" />
                  </div>
                </label>

                <Button type="button">Entrar a clase</Button>
              </form>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
