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
