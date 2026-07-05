# Login Flow Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clean up the login and sign-up UX by removing the redundant segmented toggle button group under roles and using a dynamic form header with bottom switch links, while resolving Spanish grammar accents.

**Architecture:** Update `LoginPage.tsx` form headers and add bottom toggle links, and update `App.test.tsx` to align with the new elements.

**Tech Stack:** React, Tailwind CSS, Lucide React, Vitest

---

### Task 1: Refactor LoginPage Form Section & Accents
**Files:**
- Modify: `apps/web/src/features/auth/LoginPage.tsx`

- [ ] **Step 1: Make form header dynamic and fix Spanish accents**
  Update the main `h2` heading element:
  ```tsx
  const formTitle =
    role === "student"
      ? "Entrar a la clase"
      : teacherAuthMode === "login"
        ? "Iniciar sesión"
        : "Crear cuenta";
  ```
  And render:
  ```tsx
  <h2 className="mt-2 text-4xl font-medium tracking-normal text-[#1077e5]">{formTitle}</h2>
  ```
  Ensure description has corrected accents:
  ```tsx
  <p className="mt-4 text-sm leading-6 text-muted-foreground">
    Entra con calma. Kobi se encarga de convertir los últimos minutos de clase en una actividad clara,
    rápida y lista para tus estudiantes.
  </p>
  ```

- [ ] **Step 2: Remove the teacher auth mode segmented control switcher**
  Locate and delete the toggle switcher `grid grid-cols-2` under `form`:
  ```diff
  - <div className="grid grid-cols-2 gap-2 rounded-full bg-slate-50 p-1">
  -   <button ...>Iniciar sesion</button>
  -   <button ...>Crear cuenta</button>
  - </div>
  ```

- [ ] **Step 3: Update inputs with correct Spanish names and icons on the left**
  Update inputs for both forms: place icons (Mail, Lock, BookOpen, User) on the left side of text fields, put the Eye/EyeOff toggle on the right side of the password field, and fix Spanish accents.
  Teacher form email field:
  ```tsx
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
  ```
  Teacher form password field:
  ```tsx
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
  ```
  Student form fields:
  ```tsx
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
  ```

- [ ] **Step 4: Add bottom contextual switcher link**
  Add toggling buttons/links at the bottom of the teacher form:
  ```tsx
  <div className="mt-6 flex flex-col gap-3">
    {teacherAuthMode === "login" ? (
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
    ) : (
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
    )}
  </div>
  ```

- [ ] **Step 5: Verify typescript compilation**
  Run: `pnpm --filter @kobi/web exec tsc --noEmit`
  Expected: Success.

---

### Task 2: Align Testing Queries in App.test.tsx
**Files:**
- Modify: `apps/web/src/App.test.tsx`

- [ ] **Step 1: Align queries to support accented text and the bottom toggle link**
  Update queries to find accented text (e.g. `/iniciar sesi[oó]n/i`, `/correo electr[oó]nico/i`, `/contrase[nñ]a/i`, `/c[oó]digo de clase/i`).
  Also, update the signup action in `App.test.tsx`: click on "Regístrate" bottom toggle link instead of the removed segmented switcher tab "Crear cuenta".
  ```typescript
  // Replace:
  // await user.click(screen.getByRole("button", { name: /crear cuenta/i }));
  // With:
  // await user.click(screen.getByRole("button", { name: /reg[ií]strate/i }));
  ```

- [ ] **Step 2: Run all web tests**
  Run: `pnpm --filter @kobi/web test`
  Expected: All 15 tests pass.
