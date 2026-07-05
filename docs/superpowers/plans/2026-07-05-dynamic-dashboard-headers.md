# Dynamic Dashboard Headers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the teacher dashboard greeting header dynamically display the logged-in teacher's display name, current class count, and total student count, instead of the hardcoded mock data.

**Architecture:**
- Extend `UserProfile` to include `displayName`.
- Update `teacherProfileFromSupabaseUser` to extract `displayName`.
- Update `TeacherDashboard.tsx` to read the store values and compute student counts dynamically.
- Update `App.test.tsx` to mock `displayName` and adjust test regexes.

**Tech Stack:** React, Zustand, Vitest

---

### Task 1: Update Auth Store & UserProfile Interface
**Files:**
- Modify: `apps/web/src/lib/store.ts`

- [ ] **Step 1: Add displayName property to UserProfile interface**
  Update the `UserProfile` interface:
  ```typescript
  interface UserProfile {
    role: "teacher" | "student" | null;
    email?: string;
    studentName?: string;
    studentId?: string;
    classId?: string;
    className?: string;
    joinCode?: string;
    id?: string;
    displayName?: string;
  }
  ```

- [ ] **Step 2: Update teacherProfileFromSupabaseUser mapping**
  Extract the display name from the user metadata or fallback:
  ```typescript
  function teacherProfileFromSupabaseUser(user: User): UserProfile {
    return {
      role: "teacher",
      email: user.email ?? undefined,
      id: user.id,
      displayName: user.user_metadata?.display_name ?? user.email?.split("@")[0] ?? "Docente",
    };
  }
  ```

---

### Task 2: Make TeacherDashboard Greetings Dynamic
**Files:**
- Modify: `apps/web/src/features/teacher/TeacherDashboard.tsx`

- [ ] **Step 1: Compute dynamic values in TeacherDashboard**
  Retrieve `user` and compute `teacherName`, class count, and total students count:
  ```tsx
  const user = useAuthStore((state) => state.user);
  const teacherName = user?.displayName || user?.email?.split("@")[0] || "Docente";
  const classesCount = classes.length;
  const totalStudents = classes.reduce((sum, c) => sum + (c.studentCount || 0), 0);
  ```

- [ ] **Step 2: Update JSX to render dynamic text**
  Update the greeting hero section:
  ```tsx
  <section className="mb-10">
    <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl lg:text-[40px] leading-tight">
      Bienvenido(a) de nuevo, {teacherName}
    </h2>
    <p className="mt-2 text-slate-500 text-base sm:text-lg">
      {classesCount === 0
        ? "Crea una clase para comenzar a trabajar con tus estudiantes."
        : `Tienes ${classesCount} ${classesCount === 1 ? "clase próxima" : "clases próximas"} hoy y ${totalStudents} ${totalStudents === 1 ? "estudiante activo" : "estudiantes activos"} para acompañar.`}
    </p>
  </section>
  ```

---

### Task 3: Align Test Assertions in App.test.tsx
**Files:**
- Modify: `apps/web/src/App.test.tsx`

- [ ] **Step 1: Add displayName to mock user objects in setup**
  In `beforeEach`, update the auth store mock state:
  ```typescript
      loginTeacher: async (email) => {
        useAuthStore.setState({ status: "authenticated", user: { role: "teacher", email, id: "teacher-1", displayName: "Sra. Henderson" } });
        return {};
      },
      signupTeacher: async (email) => {
        useAuthStore.setState({ status: "authenticated", user: { role: "teacher", email, id: "teacher-1", displayName: "Sra. Henderson" } });
        return {};
      },
  ```

- [ ] **Step 2: Adjust dashboard title regex queries**
  Update the assertions to match `Bienvenido(a) de nuevo, Sra. Henderson`:
  ```typescript
  expect(screen.getByRole("heading", { name: /bienvenido\(a\) de nuevo, sra\. henderson/i })).toBeInTheDocument();
  ```

- [ ] **Step 3: Run Vitest tests**
  Run: `pnpm --filter @kobi/web test`
  Expected: All 15 tests pass.
