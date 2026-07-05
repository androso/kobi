import { useEffect, useState } from "react";
import {
  BookOpen,
  CheckCircle2,
  Eye,
  EyeOff,
  GraduationCap,
  Lock,
  LogOut,
  Mail,
  User,
  Users,
  type LucideIcon
} from "lucide-react";
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

const DEMO_TEACHER = {
  email: "maestra@kobi.demo",
  password: "kobi123"
};

const DEMO_CLASS = {
  code: "KOBI7",
  studentName: "Ana"
};

export function App() {
  const [activeSlide, setActiveSlide] = useState(0);
  const [role, setRole] = useState<"teacher" | "student">("teacher");
  const [screen, setScreen] = useState<"login" | "teacher" | "student">("login");
  const [teacherEmail, setTeacherEmail] = useState("");
  const [teacherPassword, setTeacherPassword] = useState("");
  const [showTeacherPassword, setShowTeacherPassword] = useState(false);
  const [classCode, setClassCode] = useState("");
  const [studentName, setStudentName] = useState("");
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{
    email?: string;
    password?: string;
    code?: string;
    name?: string;
  }>({});

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setActiveSlide((current) => (current + 1) % slides.length);
    }, 4500);

    return () => window.clearInterval(intervalId);
  }, []);

  const slide = slides[activeSlide];

  function handleTeacherLogin() {
    const nextFieldErrors: { email?: string; password?: string } = {};
    const normalizedEmail = teacherEmail.trim().toLowerCase();
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!normalizedEmail) nextFieldErrors.email = "Ingresa tu correo.";
    else if (!emailPattern.test(normalizedEmail)) nextFieldErrors.email = "Escribe un correo valido.";
    if (!teacherPassword.trim()) nextFieldErrors.password = "Ingresa tu contrasena.";

    if (Object.keys(nextFieldErrors).length > 0) {
      setFieldErrors(nextFieldErrors);
      setError("");
      return;
    }

    if (normalizedEmail === DEMO_TEACHER.email && teacherPassword === DEMO_TEACHER.password) {
      setError("");
      setFieldErrors({});
      setScreen("teacher");
      return;
    }

    setFieldErrors({
      email: `Credencial demo: ${DEMO_TEACHER.email}`,
      password: `Credencial demo: ${DEMO_TEACHER.password}`
    });
    setError("Credenciales incorrectas. Revisa las credenciales demo que aparecen debajo.");
  }

  function handleStudentLogin() {
    const nextFieldErrors: { code?: string; name?: string } = {};
    const normalizedCode = classCode.trim().toUpperCase();
    const normalizedName = studentName.trim();

    if (!normalizedCode) nextFieldErrors.code = "Ingresa el codigo de clase.";
    else if (normalizedCode.length < 4) nextFieldErrors.code = "El codigo parece incompleto.";
    if (!normalizedName) nextFieldErrors.name = "Escribe tu nombre.";

    if (Object.keys(nextFieldErrors).length > 0) {
      setFieldErrors(nextFieldErrors);
      setError("");
      return;
    }

    if (normalizedCode === DEMO_CLASS.code) {
      setError("");
      setFieldErrors({});
      setScreen("student");
      return;
    }

    setFieldErrors({
      code: `Credencial demo: ${DEMO_CLASS.code}`,
      name: "Escribe cualquier nombre."
    });
    setError("Credenciales incorrectas. Revisa el codigo demo que aparece debajo.");
  }

  function handleLogout() {
    setScreen("login");
    setRole("teacher");
    setTeacherEmail("");
    setTeacherPassword("");
    setShowTeacherPassword(false);
    setClassCode("");
    setStudentName("");
    setError("");
    setFieldErrors({});
  }

  function clearLoginErrors() {
    setError("");
    setFieldErrors({});
  }

  if (screen === "teacher") {
    return <TeacherDashboard onLogout={handleLogout} />;
  }

  if (screen === "student") {
    return <StudentDashboard name={studentName || DEMO_CLASS.studentName} onLogout={handleLogout} />;
  }

  return (
    <main className="font-login flex min-h-screen items-center justify-center bg-[#eef5fb] px-4 py-8 text-foreground sm:px-6">
      <div className="grid min-h-[42rem] w-full max-w-6xl overflow-hidden rounded-[2rem] bg-white shadow-2xl shadow-slate-200/80 lg:grid-cols-[1fr_0.9fr]">
        <section className="relative flex min-h-[34rem] overflow-hidden bg-[#2f8ef7] px-7 py-8 text-white sm:px-10 lg:min-h-full lg:px-12">
          <div className="absolute inset-0 opacity-35">
            <div className="absolute left-[12%] top-[24%] h-4 w-28 rounded-full bg-white/20" />
            <div className="absolute left-[56%] top-[30%] h-5 w-36 rounded-full bg-white/15" />
            <div className="absolute left-[22%] top-[43%] h-4 w-60 rounded-full bg-white/10" />
            <div className="absolute bottom-[30%] left-[54%] h-5 w-24 rounded-full bg-white/15" />
          </div>

          <div className="pointer-events-none absolute -right-28 top-1/2 z-20 h-[115%] w-60 -translate-y-1/2 rounded-l-[100%] bg-white" />

          <div className="relative z-10 flex w-full flex-col pr-16 sm:pr-20 lg:pr-24">
            <div className="flex flex-1 flex-col justify-center">
              <div className="relative mx-auto mb-8 flex aspect-[1.38] w-full max-w-sm items-center justify-center">
                <img
                  alt=""
                  className="h-[78%] w-[78%] object-contain transition-all duration-700 ease-out"
                  key={slide.image}
                  src={slide.image}
                />
              </div>

              <div className="min-h-36 max-w-sm transition-all duration-700" key={slide.title}>
                <h1 className="text-3xl font-semibold tracking-normal sm:text-4xl">{slide.title}</h1>
                <p className="mt-4 text-base leading-7 text-white/85">{slide.body}</p>
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

        <section className="flex items-center justify-center bg-white px-7 py-10 sm:px-10 lg:px-14">
          <div className="w-full max-w-md">
            <div className="mb-10">
              <p className="text-sm font-medium text-primary">Bienvenido a Kobi</p>
              <h2 className="mt-2 text-4xl font-medium tracking-normal text-[#1077e5]">Iniciar sesion</h2>
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
                onClick={() => {
                  setRole("teacher");
                  clearLoginErrors();
                }}
                type="button"
              >
                Profesor
              </button>
              <button
                className={`rounded-full px-4 py-2.5 text-sm font-medium transition ${
                  role === "student" ? "bg-white text-[#1077e5] shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => {
                  setRole("student");
                  clearLoginErrors();
                }}
                type="button"
              >
                Estudiante
              </button>
            </div>


            {error ? <p className="mb-5 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p> : null}

            {role === "teacher" ? (
              <form className="space-y-7">
                <label className="group block">
                  <span className="sr-only">Correo electronico</span>
                  <div className="flex items-center rounded-xl border border-slate-200 px-4 py-3 transition hover:border-sky-200 hover:bg-sky-50/70 focus-within:border-[#1077e5] focus-within:bg-sky-50/80 focus-within:ring-4 focus-within:ring-sky-100">
                    <input
                      className="w-full bg-transparent text-base text-[#0f4f9e] caret-[#1077e5] outline-none placeholder:text-slate-300"
                      onChange={(event) => setTeacherEmail(event.target.value)}
                      placeholder="Correo electronico"
                      type="email"
                      value={teacherEmail}
                    />
                    <Mail className="h-5 w-5 text-slate-300 transition group-hover:text-sky-400 group-focus-within:text-[#1077e5]" />
                  </div>
                  {fieldErrors.email ? <p className="mt-2 text-xs text-[#1077e5]">{fieldErrors.email}</p> : null}
                </label>
                <label className="group block">
                  <span className="sr-only">Contrasena</span>
                  <div className="flex items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 transition hover:border-sky-200 hover:bg-sky-50/70 focus-within:border-[#1077e5] focus-within:bg-sky-50/80 focus-within:ring-4 focus-within:ring-sky-100">
                    <input
                      className="w-full bg-transparent text-base text-[#0f4f9e] caret-[#1077e5] outline-none placeholder:text-slate-300"
                      onChange={(event) => setTeacherPassword(event.target.value)}
                      placeholder="Contrasena"
                      type={showTeacherPassword ? "text" : "password"}
                      value={teacherPassword}
                    />
                    <button
                      aria-label={showTeacherPassword ? "Ocultar contrasena" : "Mostrar contrasena"}
                      className="shrink-0 text-slate-300 transition hover:text-sky-400 focus-visible:text-[#1077e5] focus-visible:outline-none"
                      onClick={() => setShowTeacherPassword((current) => !current)}
                      type="button"
                    >
                      {showTeacherPassword ? (
                        <EyeOff className="h-5 w-5" />
                      ) : (
                        <Eye className="h-5 w-5" />
                      )}
                    </button>
                    <Lock className="h-5 w-5 text-slate-300 transition group-hover:text-sky-400 group-focus-within:text-[#1077e5]" />
                  </div>
                  {fieldErrors.password ? <p className="mt-2 text-xs text-[#1077e5]">{fieldErrors.password}</p> : null}
                </label>

                <div className="flex flex-wrap items-center justify-between gap-4">
                  <Button onClick={handleTeacherLogin} type="button">
                    Entrar
                  </Button>
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
                      onChange={(event) => setClassCode(event.target.value)}
                      placeholder="Codigo de clase"
                      type="text"
                      value={classCode}
                    />
                    <BookOpen className="h-5 w-5 text-slate-300 transition group-hover:text-sky-400 group-focus-within:text-[#1077e5]" />
                  </div>
                  {fieldErrors.code ? <p className="mt-2 text-xs text-[#1077e5]">{fieldErrors.code}</p> : null}
                </label>
                <label className="group block">
                  <span className="sr-only">Nombre</span>
                  <div className="flex items-center rounded-xl border border-slate-200 px-4 py-3 transition hover:border-sky-200 hover:bg-sky-50/70 focus-within:border-[#1077e5] focus-within:bg-sky-50/80 focus-within:ring-4 focus-within:ring-sky-100">
                    <input
                      className="w-full bg-transparent text-base text-[#0f4f9e] caret-[#1077e5] outline-none placeholder:text-slate-300"
                      onChange={(event) => setStudentName(event.target.value)}
                      placeholder="Nombre"
                      type="text"
                      value={studentName}
                    />
                    <User className="h-5 w-5 text-slate-300 transition group-hover:text-sky-400 group-focus-within:text-[#1077e5]" />
                  </div>
                  {fieldErrors.name ? <p className="mt-2 text-xs text-[#1077e5]">{fieldErrors.name}</p> : null}
                </label>

                <Button onClick={handleStudentLogin} type="button">
                  Entrar a clase
                </Button>
              </form>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function TeacherDashboard({ onLogout }: { onLogout: () => void }) {
  return (
    <main className="min-h-screen bg-[#eef5fb] px-6 py-8 text-foreground">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-primary">Panel profesor</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-normal text-[#0f4f9e]">7mo Lenguaje - Clase en vivo</h1>
          </div>
          <Button onClick={onLogout} type="button" variant="secondary">
            <LogOut className="mr-2 h-4 w-4" />
            Salir
          </Button>
        </header>

        <section className="grid gap-4 md:grid-cols-3">
          <DashboardCard icon={BookOpen} label="Estado" value="Escuchando clase" />
          <DashboardCard icon={BookOpen} label="Objetivo detectado" value="Comprension lectora" />
          <DashboardCard icon={Users} label="Estudiantes" value="24 conectados" />
        </section>

        <section className="mt-6 rounded-xl bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-[#0f4f9e]">Actividad sugerida</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Kobi preparo una actividad de vocabulario en contexto para cerrar la clase. Puedes aprobarla, editarla o
            esperar una nueva opcion.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Button type="button">Aprobar actividad</Button>
            <Button type="button" variant="secondary">
              Editar
            </Button>
          </div>
        </section>
      </div>
    </main>
  );
}

function StudentDashboard({ name, onLogout }: { name: string; onLogout: () => void }) {
  return (
    <main className="min-h-screen bg-[#eef5fb] px-6 py-8 text-foreground">
      <div className="mx-auto max-w-4xl">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-primary">Panel estudiante</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-normal text-[#0f4f9e]">Hola, {name}</h1>
          </div>
          <Button onClick={onLogout} type="button" variant="secondary">
            <LogOut className="mr-2 h-4 w-4" />
            Salir
          </Button>
        </header>

        <section className="rounded-xl bg-white p-6 shadow-sm">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-sky-50 text-[#1077e5]">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <h2 className="text-xl font-semibold text-[#0f4f9e]">Actividad lista</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Lee cada oracion y elige la palabra que completa mejor el sentido. Puedes pedir una pista si te quedas
            atascado.
          </p>
          <div className="mt-6 rounded-xl border border-slate-200 p-4">
            <p className="text-sm font-medium text-slate-500">Pregunta 1</p>
            <p className="mt-2 text-lg text-[#0f4f9e]">El periodista redacto la ___ antes del mediodia.</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {["noticia", "novela", "receta"].map((option) => (
                <button className="rounded-xl border border-slate-200 px-4 py-3 text-sm hover:bg-sky-50" key={option}>
                  {option}
                </button>
              ))}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function DashboardCard({
  icon: Icon,
  label,
  value
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl bg-white p-5 shadow-sm">
      <Icon className="mb-4 h-5 w-5 text-[#1077e5]" />
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold text-[#0f4f9e]">{value}</p>
    </div>
  );
}
