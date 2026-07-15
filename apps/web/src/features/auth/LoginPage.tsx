import { useEffect, useState } from "react";
import { BookOpen, Eye, EyeOff, Lock, Mail, User } from "lucide-react";
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

const inputShellBaseClassName =
  "flex items-center gap-3 rounded-xl border px-4 py-3 transition focus-within:ring-4";
const fieldErrorClassName = "mt-2 text-xs font-medium text-red-600 dark:text-red-300";

function inputShellClassName(hasError: boolean) {
  return hasError
    ? `${inputShellBaseClassName} border-red-500 hover:border-red-500 hover:bg-red-50/50 focus-within:border-red-500 focus-within:bg-red-50/50 focus-within:ring-red-200 dark:border-red-400 dark:hover:border-red-300 dark:hover:bg-red-950/30 dark:focus-within:border-red-300 dark:focus-within:bg-red-950/30 dark:focus-within:ring-red-400/25`
    : `${inputShellBaseClassName} border-slate-200 hover:border-sky-200 hover:bg-sky-50/70 focus-within:border-[#1077e5] focus-within:bg-sky-50/80 focus-within:ring-sky-100 dark:hover:border-sky-600 dark:hover:bg-slate-800/60 dark:focus-within:border-sky-400 dark:focus-within:bg-slate-800 dark:focus-within:ring-sky-400/25`;
}

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
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [isTeacherLoginPending, setIsTeacherLoginPending] = useState(false);
  const [isStudentLoginPending, setIsStudentLoginPending] = useState(false);
  const [studentUsername, setStudentUsername] = useState("");
  const [studentPassword, setStudentPassword] = useState("");
  const [showStudentPassword, setShowStudentPassword] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{
    email?: string;
    password?: string;
    confirmPassword?: string;
    username?: string;
    studentPassword?: string;
  }>({});

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setActiveSlide((current) => (current + 1) % slides.length);
    }, 4500);

    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    const savedEmail = typeof window !== "undefined" ? window.localStorage.getItem("kobi_remembered_email") : null;
    if (savedEmail) {
      setTeacherEmail(savedEmail);
      setRememberMe(true);
    }
  }, []);

  const slide = slides[activeSlide];

  async function handleTeacherSubmit() {
    const nextFieldErrors: { email?: string; password?: string; confirmPassword?: string } = {};
    const normalizedEmail = teacherEmail.trim().toLowerCase();
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!normalizedEmail) nextFieldErrors.email = "Ingresa tu correo electrónico.";
    else if (!emailPattern.test(normalizedEmail)) nextFieldErrors.email = "Escribe un correo electrónico válido.";
    if (!teacherPassword.trim()) nextFieldErrors.password = "Ingresa tu contraseña.";
    else if (teacherAuthMode === "signup" && teacherPassword.length < 6) {
      nextFieldErrors.password = "Usa al menos 6 caracteres.";
    }
    if (teacherAuthMode === "signup") {
      if (!confirmPassword.trim()) {
        nextFieldErrors.confirmPassword = "Confirma tu contraseña.";
      } else if (confirmPassword !== teacherPassword) {
        nextFieldErrors.confirmPassword = "Las contraseñas no coinciden.";
      }
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

    if (typeof window !== "undefined") {
      if (rememberMe) {
        window.localStorage.setItem("kobi_remembered_email", normalizedEmail);
      } else {
        window.localStorage.removeItem("kobi_remembered_email");
      }
    }

    setError("");
    setNotice("");
    setFieldErrors({});
    navigate("/teacher");
  }

  async function handleStudentLogin() {
    const nextFieldErrors: { username?: string; studentPassword?: string } = {};
    const normalizedUsername = studentUsername.trim().toLowerCase();
    if (!normalizedUsername) nextFieldErrors.username = "Escribe tu usuario.";
    if (!studentPassword) nextFieldErrors.studentPassword = "Escribe tu contraseña.";

    if (Object.keys(nextFieldErrors).length > 0) {
      setFieldErrors(nextFieldErrors);
      setError("");
      setNotice("");
      return;
    }

    setIsStudentLoginPending(true);
    const result = await loginStudent(normalizedUsername, studentPassword);
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
    setConfirmPassword("");
    setShowConfirmPassword(false);
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
            <div className="mb-8">
              <p className="text-sm font-medium text-primary">Bienvenido a Kobi</p>
              <h2 className="mt-2 text-4xl font-medium tracking-normal text-[#1077e5]">
                {role === "student"
                  ? "Hola, estudiante"
                  : teacherAuthMode === "login"
                    ? "Iniciar sesión"
                    : "Crear cuenta"}
              </h2>
              <p className="mt-4 text-sm leading-6 text-muted-foreground">
                {role === "student" ? "Escribe el usuario y la contraseña que te dio tu docente." : "Entra con calma. Kobi prepara actividades claras y listas para tus estudiantes."}
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
                  <div className={inputShellClassName(Boolean(fieldErrors.email))}>
                    <Mail className="h-5 w-5 text-slate-300 transition group-hover:text-sky-400 group-focus-within:text-[#1077e5]" />
                    <input
                      className="w-full bg-transparent text-base text-[#0f4f9e] caret-[#1077e5] outline-none placeholder:text-slate-300"
                      aria-describedby={fieldErrors.email ? "login-email-error" : undefined}
                      aria-invalid={Boolean(fieldErrors.email)}
                      onChange={(event) => setTeacherEmail(event.target.value)}
                      placeholder="Correo electrónico"
                      type="email"
                      value={teacherEmail}
                    />
                  </div>
                  {fieldErrors.email ? <p className={fieldErrorClassName} id="login-email-error">{fieldErrors.email}</p> : null}
                </label>
                <label className="group block">
                  <span className="sr-only">Contraseña</span>
                  <div className={inputShellClassName(Boolean(fieldErrors.password))}>
                    <Lock className="h-5 w-5 text-slate-300 transition group-hover:text-sky-400 group-focus-within:text-[#1077e5]" />
                    <input
                      className="w-full bg-transparent text-base text-[#0f4f9e] caret-[#1077e5] outline-none placeholder:text-slate-300"
                      aria-describedby={fieldErrors.password ? "login-password-error" : undefined}
                      aria-invalid={Boolean(fieldErrors.password)}
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
                  {fieldErrors.password ? <p className={fieldErrorClassName} id="login-password-error">{fieldErrors.password}</p> : null}
                </label>

                {teacherAuthMode === "signup" ? (
                  <label className="group block">
                    <span className="sr-only">Confirmar contraseña</span>
                    <div className={inputShellClassName(Boolean(fieldErrors.confirmPassword))}>
                      <Lock className="h-5 w-5 text-slate-300 transition group-hover:text-sky-400 group-focus-within:text-[#1077e5]" />
                      <input
                        className="w-full bg-transparent text-base text-[#0f4f9e] caret-[#1077e5] outline-none placeholder:text-slate-300"
                        aria-describedby={fieldErrors.confirmPassword ? "login-confirm-password-error" : undefined}
                        aria-invalid={Boolean(fieldErrors.confirmPassword)}
                        onChange={(event) => setConfirmPassword(event.target.value)}
                        placeholder="Confirmar contraseña"
                        type={showConfirmPassword ? "text" : "password"}
                        value={confirmPassword}
                      />
                      <button
                        aria-label={showConfirmPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                        className="shrink-0 text-slate-300 transition hover:text-sky-400 focus-visible:text-[#1077e5] focus-visible:outline-none"
                        onClick={() => setShowConfirmPassword((current) => !current)}
                        type="button"
                      >
                        {showConfirmPassword ? (
                          <EyeOff className="h-5 w-5" />
                        ) : (
                          <Eye className="h-5 w-5" />
                        )}
                      </button>
                    </div>
                    {fieldErrors.confirmPassword ? <p className={fieldErrorClassName} id="login-confirm-password-error">{fieldErrors.confirmPassword}</p> : null}
                  </label>
                ) : null}

                <div className="flex flex-wrap items-center justify-between gap-4">
                  <Button disabled={isTeacherLoginPending} onClick={handleTeacherSubmit} type="button">
                    {teacherSubmitLabel}
                  </Button>
                  {teacherAuthMode === "login" ? (
                    <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
                      <input
                        className="h-4 w-4 accent-[#1077e5]"
                        type="checkbox"
                        checked={rememberMe}
                        onChange={(event) => setRememberMe(event.target.checked)}
                      />
                      Recordarme
                    </label>
                  ) : null}
                </div>

                <div className="mt-6 flex flex-col gap-3">
                  {teacherAuthMode === "login" ? (
                    <>
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
                  <span className="sr-only">Usuario</span>
                  <div className={`${inputShellClassName(Boolean(fieldErrors.username))} min-h-14`}>
                    <BookOpen className="h-5 w-5 text-slate-300 transition group-hover:text-sky-400 group-focus-within:text-[#1077e5]" />
                    <input
                      className="w-full bg-transparent text-base text-[#0f4f9e] caret-[#1077e5] outline-none placeholder:text-slate-300"
                      aria-describedby={fieldErrors.username ? "student-username-error" : undefined}
                      aria-invalid={Boolean(fieldErrors.username)}
                      autoCapitalize="none"
                      autoComplete="username"
                      onChange={(event) => setStudentUsername(event.target.value)}
                      placeholder="Tu usuario"
                      type="text"
                      value={studentUsername}
                    />
                  </div>
                  {fieldErrors.username ? <p className={fieldErrorClassName} id="student-username-error">{fieldErrors.username}</p> : null}
                </label>
                <label className="group block">
                  <span className="sr-only">Contraseña</span>
                  <div className={`${inputShellClassName(Boolean(fieldErrors.studentPassword))} min-h-14`}>
                    <Lock className="h-5 w-5 text-slate-300 transition group-hover:text-sky-400 group-focus-within:text-[#1077e5]" />
                    <input
                      className="w-full bg-transparent text-base text-[#0f4f9e] caret-[#1077e5] outline-none placeholder:text-slate-300"
                      aria-describedby={fieldErrors.studentPassword ? "student-password-error" : undefined}
                      aria-invalid={Boolean(fieldErrors.studentPassword)}
                      autoComplete="current-password"
                      onChange={(event) => setStudentPassword(event.target.value)}
                      placeholder="Tu contraseña"
                      type={showStudentPassword ? "text" : "password"}
                      value={studentPassword}
                    />
                    <button aria-label={showStudentPassword ? "Ocultar contraseña" : "Mostrar contraseña"} type="button" onClick={() => setShowStudentPassword((value) => !value)}>
                      {showStudentPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                  {fieldErrors.studentPassword ? <p className={fieldErrorClassName} id="student-password-error">{fieldErrors.studentPassword}</p> : null}
                </label>

                <Button disabled={isStudentLoginPending} type="submit">
                  {isStudentLoginPending ? "Entrando..." : "Entrar"}
                </Button>
              </form>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
