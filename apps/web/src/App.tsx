import { Routes, Route, Navigate } from "react-router-dom";
import { LoginPage } from "./features/auth/LoginPage";
import { TeacherDashboard } from "./features/teacher/TeacherDashboard";
import { LiveClassMonitor } from "./features/teacher/LiveClassMonitor";
import { PreviousClasses } from "./features/teacher/PreviousClasses";
import { SessionAnalytics } from "./features/teacher/SessionAnalytics";
import { HelpCenter } from "./features/teacher/HelpCenter";
import { StudentDashboard } from "./features/student/StudentDashboard";

export function App() {
  return (
    <Routes>
      <Route path="/" element={<LoginPage />} />
      <Route path="/teacher" element={<TeacherDashboard />} />
      <Route path="/teacher/monitor" element={<LiveClassMonitor />} />
      <Route path="/teacher/repositories" element={<PreviousClasses />} />
      <Route path="/teacher/analytics" element={<SessionAnalytics />} />
      <Route path="/teacher/ayuda" element={<HelpCenter />} />
      <Route path="/student" element={<Navigate to="/student/asignaciones" replace />} />
      <Route path="/student/asignaciones" element={<StudentDashboard />} />
      <Route path="/student/progreso" element={<StudentDashboard />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
