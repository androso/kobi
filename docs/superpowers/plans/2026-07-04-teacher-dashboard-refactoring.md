# Teacher Dashboard Refactoring & Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the monolithic `App.tsx` into a modular, feature-based container architecture using `react-router-dom` for deep linking and `zustand` for state management.

**Architecture:** We will extract the LoginPage, StudentDashboard, and TeacherDashboard into dedicated folders under `features/`. A global Zustand store will centralize authentication credentials and active profile state, while `App.tsx` will focus purely on route declarations.

**Tech Stack:** React 19, TypeScript, Vite, Tailwind CSS, react-router-dom, Zustand, Lucide icons, Vitest.

---

### Task 1: Initialize Global Zustand Store

**Files:**
- Create: `apps/web/src/lib/store.ts`

- [ ] **Step 1: Write the store file**
  Create the global state manager holding mock authentication functions and current active user context.

```typescript
import { create } from "zustand";

interface UserProfile {
  role: "teacher" | "student" | null;
  email?: string;
  studentName?: string;
}

interface AuthState {
  user: UserProfile | null;
  loginTeacher: (email: string) => void;
  loginStudent: (studentName: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loginTeacher: (email) => set({ user: { role: "teacher", email } }),
  loginStudent: (studentName) => set({ user: { role: "student", studentName } }),
  logout: () => set({ user: null }),
}));
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/lib/store.ts
git commit -m "feat: initialize global auth state store using Zustand"
```

---

### Task 2: Create StudentDashboard Feature

**Files:**
- Create: `apps/web/src/features/student/StudentDashboard.tsx`

- [ ] **Step 1: Implement Student Dashboard**
  Create the StudentDashboard component leveraging the Zustand store and redirecting back to root `/` on logout.

```typescript
import { LogOut } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "../../components/ui/button";
import { useAuthStore } from "../../lib/store";

export function StudentDashboard() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);

  const studentName = user?.studentName || "Ana";

  function handleLogout() {
    logout();
    navigate("/");
  }

  return (
    <main className="min-h-screen bg-[#eef5fb] px-6 py-8 text-foreground">
      <div className="mx-auto max-w-4xl">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-primary">Panel estudiante</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-normal text-[#0f4f9e]">Hola, {studentName}</h1>
          </div>
          <Button onClick={handleLogout} type="button" variant="secondary">
            <LogOut className="mr-2 h-4 w-4" />
            Salir
          </Button>
        </header>

        <section className="rounded-xl bg-white p-6 shadow-sm">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-sky-50 text-[#1077e5]">
            <svg
              className="h-6 w-6"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-[#0f4f9e]">Actividad lista</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Lee cada oracion y elige la palabra que completa mejor el sentido. Puedes pedir una pista si te quedas atascado.
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
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/features/student/StudentDashboard.tsx
git commit -m "feat: extract student dashboard layout component"
```

---

### Task 3: Create LoginPage Feature

**Files:**
- Create: `apps/web/src/features/auth/LoginPage.tsx`

- [ ] **Step 1: Implement Login page**
  Extract the auth screen containing dynamic slideshow and credentials verification.

```typescript
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

export function LoginPage() {
  const navigate = useNavigate();
  const loginTeacher = useAuthStore((state) => state.loginTeacher);
  const loginStudent = useAuthStore((state) => state.loginStudent);

  const [activeSlide, setActiveSlide] = useState(0);
  const [role, setRole] = useState<"teacher" | "student">("teacher");
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
      loginTeacher(normalizedEmail);
      navigate("/teacher");
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
      loginStudent(normalizedName || DEMO_CLASS.studentName);
      navigate("/student");
      return;
    }

    setFieldErrors({
      code: `Credencial demo: ${DEMO_CLASS.code}`,
      name: "Escribe cualquier nombre."
    });
    setError("Credenciales incorrectas. Revisa el codigo demo que aparece debajo.");
  }

  function clearLoginErrors() {
    setError("");
    setFieldErrors({});
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
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/features/auth/LoginPage.tsx
git commit -m "feat: extract login page component and wire routing transition"
```

---

### Task 4: Create TeacherDashboard Feature Components

**Files:**
- Create: `apps/web/src/features/teacher/components/Sidebar.tsx`
- Create: `apps/web/src/features/teacher/components/Header.tsx`
- Create: `apps/web/src/features/teacher/components/ClassCard.tsx`
- Create: `apps/web/src/features/teacher/TeacherDashboard.tsx`

- [ ] **Step 1: Write Sidebar component**

```typescript
import { GraduationCap, FolderOpen, BarChart3, Plus, CircleHelp, BookOpen, LogOut, type LucideIcon } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "../../../components/ui/button";
import { useAuthStore } from "../../../lib/store";

const teacherNavItems: Array<{ label: string; icon: LucideIcon; active?: boolean }> = [
  { label: "Clases", icon: GraduationCap, active: true },
  { label: "Repositorios", icon: FolderOpen },
  { label: "Analitica", icon: BarChart3 }
];

function SidebarAction({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <button className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left text-sm font-medium text-slate-500 transition hover:bg-white hover:text-slate-900" type="button">
      <Icon className="h-5 w-5" />
      <span>{label}</span>
    </button>
  );
}

export function Sidebar() {
  const navigate = useNavigate();
  const logout = useAuthStore((state) => state.logout);

  function handleLogout() {
    logout();
    navigate("/");
  }

  return (
    <aside className="flex flex-col justify-between border-b border-slate-200/80 bg-[#eef3fb] p-3 sm:p-4 lg:border-b-0 lg:border-r">
      <div className="space-y-6">
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#0b5ed7] text-white shadow-lg shadow-blue-600/25">
            <GraduationCap className="h-6 w-6" />
          </div>
          <div className="pt-1">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#1557d4]">Portal docente</p>
            <p className="mt-1 text-sm text-slate-600">Organizacion del aula</p>
          </div>
        </div>

        <nav className="space-y-3">
          {teacherNavItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                className={`flex w-full items-center gap-4 rounded-2xl px-4 py-4 text-left text-sm font-semibold transition ${
                  item.active
                    ? "bg-[#2f6ff2] text-white shadow-[0_14px_30px_-18px_rgba(47,111,242,0.85)]"
                    : "text-slate-600 hover:bg-white hover:text-slate-900"
                }`}
                key={item.label}
                type="button"
              >
                <Icon className="h-5 w-5 shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      <div className="space-y-4">
        <Button className="h-12 w-full rounded-2xl bg-[#0b57d0] px-4 text-sm shadow-[0_12px_30px_-12px_rgba(11,87,208,0.55)] hover:bg-[#094fbf]" type="button">
          <Plus className="mr-2 h-4 w-4" />
          Nueva clase
        </Button>
        <div className="h-px bg-slate-200" />
        <div className="space-y-2">
          <SidebarAction icon={CircleHelp} label="Ayuda" />
          <SidebarAction icon={BookOpen} label="Soporte" />
          <button className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-sm font-medium text-slate-500 transition hover:bg-white hover:text-slate-900" onClick={handleLogout} type="button">
            <LogOut className="h-5 w-5" />
            <span>Salir</span>
          </button>
        </div>
      </div>
    </aside>
  );
}
```

- [ ] **Step 2: Write Header component**

```typescript
import { Search, Settings2, Grid3X3, type LucideIcon } from "lucide-react";

function TopBarIcon({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <button className="flex h-11 w-11 items-center justify-center rounded-full text-slate-600 transition hover:bg-slate-100 hover:text-slate-900" type="button">
      <Icon className="h-6 w-6" />
    </button>
  );
}

export function Header() {
  return (
    <header className="flex flex-wrap items-center gap-3 border-b border-slate-200/80 bg-white/75 px-3 py-3 backdrop-blur sm:px-4 lg:px-6">
      <div className="min-w-0">
        <h1 className="truncate text-xl font-semibold tracking-tight text-slate-950 sm:text-2xl lg:text-3xl">
          Kobi Learning Labs
        </h1>
      </div>

      <div className="flex flex-1 justify-center">
        <label className="flex w-full max-w-xl items-center gap-3 rounded-full border border-slate-200 bg-white px-4 py-2.5 text-slate-500 shadow-sm transition focus-within:border-[#1077e5] focus-within:ring-4 focus-within:ring-sky-100">
          <Search className="h-4 w-4 shrink-0" />
          <input className="w-full bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400" placeholder="Buscar clases, estudiantes o recursos..." type="text" />
        </label>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        <TopBarIcon icon={Settings2} />
        <TopBarIcon icon={Grid3X3} />
        <button className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border-2 border-violet-300 bg-[linear-gradient(135deg,#c0d2ff_0%,#5a7df8_55%,#9b5cf6_100%)] text-xs font-semibold text-white shadow-sm sm:h-11 sm:w-11" type="button">
          MH
        </button>
      </div>
    </header>
  );
}
```

- [ ] **Step 3: Write ClassCard component**

```typescript
import { ChevronRight, Users, type LucideIcon } from "lucide-react";

interface ClassItem {
  title: string;
  focus: string;
  students: string;
  topics: readonly string[];
  accent: string;
  tone: string;
  badge: string;
  icon: LucideIcon;
}

export function ClassCard({ item, viewMode }: { item: ClassItem; viewMode: "grid" | "list" }) {
  const Icon = item.icon;
  const isList = viewMode === "list";

  return (
    <article className={`overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm ${isList ? "grid md:grid-cols-[16rem_minmax(0,1fr)]" : ""}`}>
      <div className={`relative overflow-hidden ${isList ? "min-h-48" : "min-h-52 sm:min-h-56"}`}>
        <div className={`absolute inset-0 bg-gradient-to-br ${item.tone}`} />
        <div className="absolute inset-0 opacity-25 [background-image:radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.65)_1px,transparent_0)] [background-size:24px_24px]" />
        <div className="absolute left-5 top-5 rounded-full border border-white/20 bg-white/20 px-3 py-1 text-[11px] font-semibold tracking-[0.22em] text-white backdrop-blur-sm">
          {item.badge}
        </div>
        <Icon className="absolute right-5 top-5 h-14 w-14 text-white/20 sm:h-16 sm:w-16" />
        <div className="absolute bottom-5 left-5 right-5 flex items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-white/80">Panel docente</p>
            <p className="mt-1 line-clamp-2 text-xl font-semibold leading-tight text-white/95 sm:text-2xl">{item.focus}</p>
          </div>
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-sm">
            <ChevronRight className="h-5 w-5" />
          </div>
        </div>
      </div>

      <div className="p-5 sm:p-6">
        <h4 className="text-xl font-semibold tracking-tight text-slate-950 sm:text-2xl">{item.title}</h4>
        <p className={`mt-2 text-base font-semibold ${item.accent}`}>{item.focus}</p>
        <div className="mt-5 flex items-center gap-2 text-sm text-slate-600">
          <Users className="h-4 w-4" />
          <span>{item.students}</span>
        </div>
        <div className="mt-6">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">Temas</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {item.topics.map((topic) => (
              <span className="rounded-full bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700" key={topic}>
                {topic}
              </span>
            ))}
          </div>
        </div>
      </div>
    </article>
  );
}
```

- [ ] **Step 4: Write TeacherDashboard container page**

```typescript
import { useState } from "react";
import { LayoutGrid, List, Plus, Leaf, Sigma, PenLine } from "lucide-react";
import { Sidebar } from "./components/Sidebar";
import { Header } from "./components/Header";
import { ClassCard } from "./components/ClassCard";

const teacherClasses = [
  {
    title: "Ciencia 4to - Seccion A",
    focus: "Ecosistemas y energia",
    students: "24 estudiantes activos",
    topics: ["Fotosintesis", "Cadenas alimentarias", "Niveles troficos"],
    accent: "text-emerald-700",
    tone: "from-[#2d6bf3] via-[#5f83f4] to-[#8b5cf6]",
    badge: "LECCION ACTIVA",
    icon: Leaf
  },
  {
    title: "Matematicas 5to - Algebra basica",
    focus: "Matematicas",
    students: "22 estudiantes activos",
    topics: ["Variables", "Ecuaciones", "Orden de operaciones"],
    accent: "text-blue-700",
    tone: "from-[#17b26a] via-[#0f9d77] to-[#0b7d5d]",
    badge: "NUEVO BLOQUE",
    icon: Sigma
  },
  {
    title: "Lengua 6to - Escritura creativa",
    focus: "Lengua y artes",
    students: "28 estudiantes activos",
    topics: ["Metaforas", "Estructura narrativa", "Voz"],
    accent: "text-violet-700",
    tone: "from-[#d4b4ff] via-[#b784ff] to-[#9f5af8]",
    badge: "ESCRITURA",
    icon: PenLine
  }
] as const;

export function TeacherDashboard() {
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  return (
    <main className="min-h-screen bg-[#eef3fb] p-3 text-foreground sm:p-4 lg:p-5">
      <div className="mx-auto grid min-h-[calc(100vh-1.5rem)] max-w-[1520px] overflow-hidden rounded-[30px] border border-slate-200/80 bg-[#f7f9fe] shadow-[0_30px_90px_-40px_rgba(15,23,42,0.45)] lg:grid-cols-[15.5rem_minmax(0,1fr)]">
        <Sidebar />
        <div className="flex min-w-0 flex-col">
          <Header />
          <div className="flex-1 px-3 py-5 sm:px-4 lg:px-6 lg:py-6">
            <section className="mb-8 lg:mb-10">
              <h2 className="max-w-4xl text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl lg:text-[3.4rem] lg:leading-[1.02]">
                Bienvenida de nuevo, Sra. Henderson
              </h2>
              <p className="mt-3 max-w-3xl text-base leading-7 text-slate-600 sm:text-[1.05rem]">
                Tienes 2 clases proximas hoy y 46 estudiantes activos para acompañar.
              </p>
            </section>

            <section>
              <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
                <h3 className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">Tus clases</h3>
                <div className="inline-flex rounded-2xl bg-[#e5eefc] p-1">
                  <button
                    className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
                      viewMode === "grid" ? "bg-white text-[#1557d4] shadow-sm" : "text-slate-600 hover:text-slate-900"
                    }`}
                    onClick={() => setViewMode("grid")}
                    type="button"
                  >
                    <LayoutGrid className="h-4 w-4" />
                    Cuadricula
                  </button>
                  <button
                    className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
                      viewMode === "list" ? "bg-white text-[#1557d4] shadow-sm" : "text-slate-600 hover:text-slate-900"
                    }`}
                    onClick={() => setViewMode("list")}
                    type="button"
                  >
                    <List className="h-4 w-4" />
                    Lista
                  </button>
                </div>
              </div>

              <button className="group mb-5 flex min-h-32 w-full items-center justify-center rounded-[28px] border-2 border-dashed border-slate-300 bg-[#f4f7fd] px-5 py-6 text-slate-600 transition hover:border-[#b6ccf7] hover:bg-[#f7faff]" type="button">
                <div className="flex flex-col items-center gap-4">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#eadcff] text-[#321f7a] transition group-hover:bg-[#dcc8ff]">
                    <Plus className="h-8 w-8" />
                  </div>
                  <p className="text-xl font-semibold tracking-tight text-slate-700 sm:text-2xl">Crear nueva clase</p>
                </div>
              </button>

              <div className={viewMode === "grid" ? "grid gap-6 xl:grid-cols-3" : "grid gap-4"}>
                {teacherClasses.map((item) => (
                  <ClassCard item={item} key={item.title} viewMode={viewMode} />
                ))}
              </div>
            </section>
          </div>
        </div>
      </div>

      <button className="fixed bottom-6 right-6 flex h-16 w-16 items-center justify-center rounded-full bg-[#0b57d0] text-3xl text-white shadow-[0_16px_40px_-14px_rgba(11,87,208,0.7)] transition hover:bg-[#094fbf]" type="button">
        <Plus className="h-8 w-8" />
      </button>
    </main>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/teacher/
git commit -m "feat: extract teacher dashboard and its layout components"
```

---

### Task 5: Refactor App Routing Shell

**Files:**
- Modify: `apps/web/src/App.tsx`

- [ ] **Step 1: Replace App.tsx contents**
  Simplify App.tsx to only configuration and react-router mappings.

```typescript
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { LoginPage } from "./features/auth/LoginPage";
import { TeacherDashboard } from "./features/teacher/TeacherDashboard";
import { StudentDashboard } from "./features/student/StudentDashboard";

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LoginPage />} />
        <Route path="/teacher" element={<TeacherDashboard />} />
        <Route path="/student" element={<StudentDashboard />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/App.tsx
git commit -m "refactor: simplify App.tsx to route definitions using react-router-dom"
```

---

### Task 6: Verify and Run Suite Tests

**Files:**
- Modify: `apps/web/src/App.test.tsx` (if any adjustments are needed for context rendering, but standard react-router context inside App should handle routing tests natively).

- [ ] **Step 1: Run local vitest tests**

Run: `pnpm --filter @kobi/web test`
Expected: 7 passed tests.

- [ ] **Step 2: Commit if any fixes are applied to test suite**

```bash
git commit -a -m "test: verify all unit tests pass with new router layout"
```
