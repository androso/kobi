import type { ReactElement } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { LoginPage } from "./features/auth/LoginPage";
import { TeacherDashboard } from "./features/teacher/TeacherDashboard";
import { LiveClassMonitor } from "./features/teacher/LiveClassMonitor";
import { PreviousClasses } from "./features/teacher/PreviousClasses";
import { HelpCenter } from "./features/teacher/HelpCenter";
import { StudentDashboard } from "./features/student/StudentDashboard";
import { StudentRoster } from "./features/teacher/StudentRoster";
import { useAuthStore } from "./lib/store";

function AuthRedirect() {
  const user = useAuthStore((state) => state.user);

  if (user?.role === "teacher") return <Navigate to="/teacher" replace />;
  if (user?.role === "student") return <Navigate to="/student" replace />;

  return <LoginPage />;
}

function RequireRole({
  children,
  role,
}: {
  children: ReactElement;
  role: "teacher" | "student";
}) {
  const status = useAuthStore((state) => state.status);
  const user = useAuthStore((state) => state.user);

  if (status === "initializing") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#eef5fb] text-sm font-medium text-[#0f4f9e]">
        Cargando Kobi...
      </main>
    );
  }

  if (user?.role !== role) return <Navigate to="/" replace />;

  return children;
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<AuthRedirect />} />
      <Route
        path="/teacher/classes/:classId/students"
        element={<RequireRole role="teacher"><StudentRoster /></RequireRole>}
      />
      <Route
        path="/teacher"
        element={
          <RequireRole role="teacher">
            <TeacherDashboard />
          </RequireRole>
        }
      />
      <Route
        path="/teacher/monitor"
        element={
          <RequireRole role="teacher">
            <LiveClassMonitor />
          </RequireRole>
        }
      />
      <Route
        path="/teacher/repositories"
        element={
          <RequireRole role="teacher">
            <PreviousClasses />
          </RequireRole>
        }
      />
      <Route
        path="/teacher/ayuda"
        element={
          <RequireRole role="teacher">
            <HelpCenter />
          </RequireRole>
        }
      />
      <Route
        path="/student"
        element={
          <RequireRole role="student">
            <Navigate to="/student/asignaciones" replace />
          </RequireRole>
        }
      />
      <Route
        path="/student/asignaciones"
        element={
          <RequireRole role="student">
            <StudentDashboard />
          </RequireRole>
        }
      />
      <Route
        path="/student/progreso"
        element={
          <RequireRole role="student">
            <StudentDashboard />
          </RequireRole>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
