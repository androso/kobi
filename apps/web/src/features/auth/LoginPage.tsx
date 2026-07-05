import { useEffect, useState } from "react";
import { BookOpen, Eye, EyeOff, Lock, Mail, User, GraduationCap } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "../../components/ui/button";
import { useAuthStore } from "../../lib/store";

const slides = [
  {
    title: "Clase en vivo",
    body: "Kobi escucha la clase y prepara actividades alineadas al tema.",
    image: "/auth/live-session.png"
  },
  {
    title: "Currículo conectado",
    body: "Cada opción muestra objetivo, evidencia y contenido reutilizable.",
    image: "/auth/curriculum.png"
  },
  {
    title: "Actividad para todos",
    body: "Los estudiantes reciben variantes simples: apoyo, base y reto.",
    image: "/auth/students.png"
  }
];

export function LoginPage() {
  const navigate = useNavigate();
  const loginTeacher = useAuthStore((state) => state.loginTeacher);
  const signupTeacher = useAuthStore((state) => state.signupTeacher);
  const loginStudent = useAuthStore((state) => state.loginStudent);

  const [activeSlide, setActiveSlide] = useState(0);
  const [role, setRole] = useState<"teacher" | "student">("teacher");
  const [teacherAuthMode, setTeacherAuthMode] = useState<"login" | "signup">("login");
  const [teacherEmail, setTeacherEmail] = useState("");
  const [teacherPassword, setTeacherPassword] = useState("");
  const [showTeacherPassword, setShowTeacherPassword] = useState(false);
  const [isTeacherLoginPending, setIsTeacherLoginPending] = useState(false);
  const [isStudentLoginPending, setIsStudentLoginPending] = useState(false);
  const [classCode, setClassCode] = useState("");
  const [studentName, setStudentName] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
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

  async function handleTeacherSubmit() {
    const nextFieldErrors: { email?: string; password?: string } = {};
    const normalizedEmail = teacherEmail.trim().toLowerCase();
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!normalizedEmail) nextFieldErrors.email = "Ingresa tu correo electrónico.";
    else if (!emailPattern.test(normalizedEmail)) nextFieldErrors.email = "Escribe un correo electrónico válido.";
    if (!teacherPassword.trim()) nextFieldErrors.password = "Ingresa tu contraseña.";
    else if (teacherAuthMode === "signup" && teacherPassword.length < 6) {
      nextFieldErrors.password = "Usa al menos 6 caracteres.";
    }

    if (Object.keys(nextFieldErrors).length > 0) {
      setFieldErrors(nextFieldErrors);
      setError("");
      setNotice("");
      return;
    }

    setIsTeacherLoginPending(true);
    const result =
      teacherAuthMode === "login"
        ? await loginTeacher(normalizedEmail, teacherPassword)
        : await signupTeacher(normalizedEmail, teacherPassword);
    setIsTeacherLoginPending(false);

    if (result.error) {
      setError(result.error);
      setNotice("");
      setFieldErrors({});
      return;
    }

    setError("");
    setNotice("");
    setFieldErrors({});
    navigate("/teacher");
  }

  async function handleStudentLogin() {
    const nextFieldErrors: { code?: string; name?: string } = {};
    const normalizedCode = classCode.trim().toUpperCase();
    const normalizedName = studentName.trim();

    if (!normalizedCode) nextFieldErrors.code = "Ingresa el código de clase.";
    else if (normalizedCode.length < 4) nextFieldErrors.code = "El código parece incompleto.";
    if (!normalizedName) nextFieldErrors.name = "Escribe tu nombre.";

    if (Object.keys(nextFieldErrors).length > 0) {
      setFieldErrors(nextFieldErrors);
      setError("");
      setNotice("");
      return;
    }

    setIsStudentLoginPending(true);
    const result = await loginStudent(normalizedCode, normalizedName);
    setIsStudentLoginPending(false);

    if (!result.error) {
      setError("");
      setNotice("");
      setFieldErrors({});
      navigate("/student");
      return;
    }

    setFieldErrors({});
    setNotice("");
    setError(result.error);
  }

  function clearLoginErrors() {
    setError("");
    setNotice("");
    setFieldErrors({});
  }

  const teacherSubmitLabel =
    teacherAuthMode === "signup"
      ? isTeacherLoginPending
        ? "Creando..."
        : "Crear cuenta"
      : isTeacherLoginPending
        ? "Entrando..."
        : "Entrar";

  return (
    <main className="font-login flex min-h-screen items-center justify-center bg-[#eef5fb] px-4 py-8 text-foreground sm:px-6">
      <div className="grid min-h-[42rem] w-full max-w-6xl overflow-hidden rounded-[2rem] bg-white shadow-2xl shadow-slate-200/80 lg:grid-cols-[1fr_0.9fr]">
        <section className="relative flex min-h-[34rem] overflow-hidden bg-gradient-to-br from-[#0c51c7] via-[#1077e5] to-[#4fa1ff] px-7 py-8 text-white sm:px-10 lg:min-h-full lg:px-12">
          <div className="absolute inset-0 overflow-hidden opacity-40">
            <div className="absolute -left-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-xl" />
            <div className="absolute right-10 top-1/4 h-64 w-64 rounded-full bg-white/5 blur-2xl" />
            <div className="absolute -bottom-20 left-1/3 h-52 w-52 rounded-full bg-white/10 blur-xl" />
          </div>

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

              <div className="mt-8 flex gap-2" aria-label="Cambiar panel informativo">
                {slides.map((item, index) => (
                  <button
                    aria-label={`Ver ${item.title}`}
                    aria-current={index === activeSlide}
                    className="group relative flex h-11 w-11 items-center justify-center rounded-full transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
                    key={item.title}
                    onClick={() => setActiveSlide(index)}
                    type="button"
                  >
                    <span
                      className={`h-2.5 rounded-full transition-all duration-300 ${
                        index === activeSlide
                          ? "w-6 bg-white"
                          : "w-2 bg-white/40 group-hover:bg-white/70"
                      }`}
                    />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="flex items-center justify-center bg-white px-7 py-10 sm:px-10 lg:px-14">
          <div className="w-full max-w-md">
            <div className="mb-8">
              <p className="text-sm font-medium text-primary">Bienvenido a Kobi</p>
              <h2 className="mt-2 text-4xl font-medium tracking-normal text-[#1077e5]">
                {role === "student"
                  ? "Entrar a la clase"
                  : teacherAuthMode === "login"
                    ? "Iniciar sesión"
                    : "Crear cuenta"}
              </h2>
              <p className="mt-4 text-sm leading-6 text-muted-foreground">
                Entra con calma. Kobi se encarga de convertir los últimos minutos de clase en una actividad clara,
                rápida y lista para tus estudiantes.
              </p>
            </div>

            <div className="mb-5 grid grid-cols-2 gap-2 rounded-full bg-muted p-1.5">
              <button
                className={`flex items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium transition ${
                  role === "teacher" ? "bg-white text-[#1077e5] shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => {
                  setRole("teacher");
                  clearLoginErrors();
                }}
                type="button"
              >
                <GraduationCap className="h-4.5 w-4.5" />
                Profesor
              </button>
              <button
                className={`flex items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium transition ${
                  role === "student" ? "bg-white text-[#1077e5] shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => {
                  setRole("student");
                  clearLoginErrors();
                }}
                type="button"
              >
                <BookOpen className="h-4.5 w-4.5" />
                Estudiante
              </button>
            </div>

            {error ? <p className="mb-5 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600 animate-fade-in-up">{error}</p> : null}
            {notice ? <p className="mb-5 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700 animate-fade-in-up">{notice}</p> : null}

            {role === "teacher" ? (
              <form
                className="space-y-7"
                onSubmit={(event) => {
                  event.preventDefault();
                  void handleTeacherSubmit();
                }}
              >
                <label className="group block">
                  <span className="sr-only">Correo electrónico</span>
                  <div className="flex items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 transition hover:border-sky-200 hover:bg-sky-50/70 focus-within:border-[#1077e5] focus-within:bg-sky-50/80 focus-within:ring-4 focus-within:ring-sky-100">
                    <Mail className="h-5 w-5 text-slate-300 transition group-hover:text-sky-400 group-focus-within:text-[#1077e5]" />
                    <input
                      className="w-full bg-transparent text-base text-[#0f4f9e] caret-[#1077e5] outline-none placeholder:text-slate-300"
                      onChange={(event) => setTeacherEmail(event.target.value)}
                      placeholder="Correo electrónico"
                      type="email"
                      value={teacherEmail}
                    />
                  </div>
                  {fieldErrors.email ? <p className="mt-2 text-xs text-[#1077e5]">{fieldErrors.email}</p> : null}
                </label>
                <label className="group block">
                  <span className="sr-only">Contraseña</span>
                  <div className="flex items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 transition hover:border-sky-200 hover:bg-sky-50/70 focus-within:border-[#1077e5] focus-within:bg-sky-50/80 focus-within:ring-4 focus-within:ring-sky-100">
                    <Lock className="h-5 w-5 text-slate-300 transition group-hover:text-sky-400 group-focus-within:text-[#1077e5]" />
                    <input
                      className="w-full bg-transparent text-base text-[#0f4f9e] caret-[#1077e5] outline-none placeholder:text-slate-300"
                      onChange={(event) => setTeacherPassword(event.target.value)}
                      placeholder="Contraseña"
                      type={showTeacherPassword ? "text" : "password"}
                      value={teacherPassword}
                    />
                    <button
                      aria-label={showTeacherPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
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
                  </div>
                  {fieldErrors.password ? <p className="mt-2 text-xs text-[#1077e5]">{fieldErrors.password}</p> : null}
                </label>

                <div className="flex flex-wrap items-center justify-between gap-4">
                  <Button disabled={isTeacherLoginPending} onClick={handleTeacherSubmit} type="button">
                    {teacherSubmitLabel}
                  </Button>
                  {teacherAuthMode === "login" ? (
                    <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
                      <input className="h-4 w-4 accent-[#1077e5]" type="checkbox" />
                      Recordarme
                    </label>
                  ) : null}
                </div>

                <div className="mt-6 flex flex-col gap-3">
                  {teacherAuthMode === "login" ? (
                    <>
                      <button className="self-start text-sm font-medium text-[#1077e5] hover:text-[#005cb3] transition-colors" type="button">
                        ¿Olvidaste tu contraseña?
                      </button>
                      <p className="text-sm text-slate-500">
                        ¿No tienes una cuenta?{" "}
                        <button
                          type="button"
                          onClick={() => {
                            setTeacherAuthMode("signup");
                            clearLoginErrors();
                          }}
                          className="font-bold text-[#1077e5] hover:underline focus:outline-none"
                        >
                          Regístrate
                        </button>
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm text-slate-500">
                        ¿Ya tienes una cuenta?{" "}
                        <button
                          type="button"
                          onClick={() => {
                            setTeacherAuthMode("login");
                            clearLoginErrors();
                          }}
                          className="font-bold text-[#1077e5] hover:underline focus:outline-none"
                        >
                          Inicia sesión
                        </button>
                      </p>
                      <p className="text-xs leading-6 text-muted-foreground">
                        Crea tu acceso docente para preparar clases y revisar actividad en vivo.
                      </p>
                    </>
                  )}
                </div>
              </form>
            ) : (
              <form
                className="space-y-7"
                onSubmit={(event) => {
                  event.preventDefault();
                  void handleStudentLogin();
                }}
              >
                <label className="group block">
                  <span className="sr-only">Código de clase</span>
                  <div className="flex items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 transition hover:border-sky-200 hover:bg-sky-50/70 focus-within:border-[#1077e5] focus-within:bg-sky-50/80 focus-within:ring-4 focus-within:ring-sky-100">
                    <BookOpen className="h-5 w-5 text-slate-300 transition group-hover:text-sky-400 group-focus-within:text-[#1077e5]" />
                    <input
                      className="w-full bg-transparent text-base uppercase text-[#0f4f9e] caret-[#1077e5] outline-none placeholder:normal-case placeholder:text-slate-300"
                      onChange={(event) => setClassCode(event.target.value)}
                      placeholder="Código de clase"
                      type="text"
                      value={classCode}
                    />
                  </div>
                  {fieldErrors.code ? <p className="mt-2 text-xs text-[#1077e5]">{fieldErrors.code}</p> : null}
                </label>
                <label className="group block">
                  <span className="sr-only">Nombre</span>
                  <div className="flex items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 transition hover:border-sky-200 hover:bg-sky-50/70 focus-within:border-[#1077e5] focus-within:bg-sky-50/80 focus-within:ring-4 focus-within:ring-sky-100">
                    <User className="h-5 w-5 text-slate-300 transition group-hover:text-sky-400 group-focus-within:text-[#1077e5]" />
                    <input
                      className="w-full bg-transparent text-base text-[#0f4f9e] caret-[#1077e5] outline-none placeholder:text-slate-300"
                      onChange={(event) => setStudentName(event.target.value)}
                      placeholder="Nombre"
                      type="text"
                      value={studentName}
                    />
                  </div>
                  {fieldErrors.name ? <p className="mt-2 text-xs text-[#1077e5]">{fieldErrors.name}</p> : null}
                </label>

                <Button disabled={isStudentLoginPending} type="submit">
                  {isStudentLoginPending ? "Entrando..." : "Entrar a clase"}
                </Button>
              </form>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
