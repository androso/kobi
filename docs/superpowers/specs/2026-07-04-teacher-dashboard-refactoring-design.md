# Design Spec: Kobi Dashboard Modularization & Routing Refactor

This design spec outlines the plan to refactor the monolithic [App.tsx](file:///Users/mauricioparada/desktop/kobi/apps/web/src/App.tsx) layout into modular, feature-based directories under `features/`, using `react-router-dom` for browser routing and `zustand` for auth state management.

---

## 1. Objectives

- **Code Cleanliness**: Break down the 700+ line [App.tsx](file:///Users/mauricioparada/desktop/kobi/apps/web/src/App.tsx) into small, focused modules.
- **Routing Best Practices**: Replace screen state toggling with proper client-side routing (`/`, `/teacher`, `/student`) using `react-router-dom`.
- **State Separation**: Centralize authentication and mock user profile state in a global store (`lib/store.ts`) instead of prop-drilling or localized component states.
- **Test Integrity**: Ensure all existing unit tests in [App.test.tsx](file:///Users/mauricioparada/desktop/kobi/apps/web/src/App.test.tsx) continue to pass.

---

## 2. Architecture & File Layout

We will reorganize `apps/web/src/` as follows:

```text
apps/web/src/
├── main.tsx                    # Renders <App />
├── App.tsx                     # Routing configuration via <BrowserRouter>
├── lib/
│   └── store.ts                # Zustand global state (Auth + User context)
├── components/
│   └── ui/                     # Shared UI primitives (Button)
└── features/
    ├── auth/
    │   └── LoginPage.tsx       # Login form with slide animation and auth toggle
    ├── teacher/
    │   ├── TeacherDashboard.tsx # Teacher dashboard page wrapper
    │   └── components/
    │       ├── Sidebar.tsx     # Teacher layout left navigation bar
    │       ├── Header.tsx      # Teacher layout top header bar (Search + Profile)
    │       └── ClassCard.tsx   # Reusable card component for teacher classes
    └── student/
        └── StudentDashboard.tsx # Student dashboard view and clozes
```

---

## 3. Detailed Specifications

### A. Auth Store (`apps/web/src/lib/store.ts`)
Manages authentication state, user identity, and route-level profiles.

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

### B. Routing Configuration (`apps/web/src/App.tsx`)
Declares SPA endpoints and maps them to features.

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

### C. Feature Extraction Details

1. **`features/auth/LoginPage.tsx`**:
   - Contains slide list array, `slides` interval effect, email/password state.
   - Triggers `loginTeacher` or `loginStudent` from the store on success.
   - Redirects to `/teacher` or `/student` using `useNavigate()`.
   - Displays demo warnings in case of failures.

2. **`features/teacher/` & components**:
   - `TeacherDashboard.tsx`: Houses the layout container. Handles `viewMode` ("grid" | "list"). Renders sub-components.
   - `components/Sidebar.tsx`: sidebar navigations, `Salir` button invoking `logout()` and `navigate("/")`.
   - `components/Header.tsx`: search bar, settings, "MH" avatar icon.
   - `components/ClassCard.tsx`: individual class metadata view (science/math/language topic array).

3. **`features/student/StudentDashboard.tsx`**:
   - Greeting header with `"Hola, [name]"` from store.
   - Cloze quiz structure (Answer choices: noticia, novela, receta).
   - `Salir` button invoking store `logout()` and redirecting to `/`.

---

## 4. Test Verification Plan

The unit tests run on top of React Testing Library. We must ensure that wrapping the router context does not cause setup failures.
- **Verification Strategy**: [App.test.tsx](file:///Users/mauricioparada/desktop/kobi/apps/web/src/App.test.tsx) renders `<App />`, which includes `<BrowserRouter>`. Since `<BrowserRouter>` provides route context, Testing Library can successfully resolve routes as user-clicks navigate through `/teacher` and `/student`.
- **Command**: Run `pnpm --filter @kobi/web test` to verify zero regressions.
