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

export interface ClassItem {
  id: string;
  title: string;
  focus: string;
  students: string;
  topics: string[];
  accent: string;
  tone: string;
  badge?: string;
  icon: "leaf" | "sigma" | "book" | "pen";
  image?: string;
}

export interface SessionTranscriptLine {
  time: string;
  speaker: string;
  text: string;
}

export interface SavedSession {
  id: string;
  classId: string;
  subject: string;
  subjectColor: string;
  dotColor: string;
  title: string;
  focus: string;
  date: string;
  duration: string;
  summaryPoints: string[];
  nextSteps: string[];
  transcript: SessionTranscriptLine[];
}

interface ClassState {
  classes: ClassItem[];
  monitoringClassId: string | null;
  sessions: SavedSession[];
  startMonitoring: (id: string) => void;
  stopMonitoring: () => void;
  endSession: (session: SavedSession) => void;
  addClass: (newClass: {
    title: string;
    focus: string;
    studentCount: number;
    topics: string[];
    subjectType: "ciencias" | "matematicas" | "lengua" | "otro";
  }) => void;
  resetClasses: () => void;
}

const defaultClasses: ClassItem[] = [
  {
    id: "class-1",
    title: "Ciencia 4to - Sección A",
    focus: "Ecosistemas y energía",
    students: "24 estudiantes activos",
    topics: ["Fotosintesis", "Cadenas alimentarias", "Niveles tróficos"],
    accent: "text-emerald-700",
    tone: "from-emerald-600 to-teal-500",
    badge: "Lección activa",
    icon: "leaf",
    image: "https://lh3.googleusercontent.com/aida-public/AB6AXuBCAwPsVw47e0Nv2o8f8sBJM_d_mY5O81AtCriMIujynK1Z4qFVr-U_1_BOLZz-c9WnkGdFLcIxY-pCddOH7FNrl4Nz3RJSepvcldBk9Hn-unZmUUahnjRaxJUfGgcqzcrtMmlDFp3i945BScZwFB8FpFCiY7l7hpZt_9Ac6FLAoZZcrdpnH05aRWNP5a3NlMK0drZNLJ05ejf9BogvXk_G02ZR5Gq8nCFjvbqq7-deOlmo_kbRavVCO0AbBkNsIOBOJN1NGhVDmOM"
  },
  {
    id: "class-2",
    title: "Matemáticas 5to - Álgebra básica",
    focus: "Matemáticas",
    students: "22 estudiantes activos",
    topics: ["Variables", "Ecuaciones", "Orden de operaciones"],
    accent: "text-blue-700",
    tone: "from-blue-600 to-indigo-500",
    icon: "sigma",
    image: "https://lh3.googleusercontent.com/aida-public/AB6AXuA932KhbIrFuy-YeSLoezsXY1m5ssXcWSCC6nKu52j9iVzwAW0nbMgsKdzmvGZ-x1ZGA4YLqNnsEUuf0YbOjW3QTAaVw7AeJSd_HlaLZEYO49CWgi58UglcAAkhr5-GeZxDYNYJqtLwLnL2xl8gvQpmNmluT-yrr4iOuyjeJSoGn0jgZG5Y4gQjl0kaq9cxGKhtuOToJYeEkDpLt8KG6AeUI7yRUTLfqyF6MB4w0o2AGtWFJOCeN6Wh_eTS3RPoN6ml2gq0Y37Tr9w"
  },
  {
    id: "class-3",
    title: "Lengua 8vo - Escritura creativa",
    focus: "Lengua y artes",
    students: "28 estudiantes activos",
    topics: ["Metáforas", "Estructura narrativa", "Voz"],
    accent: "text-violet-700",
    tone: "from-violet-600 to-purple-500",
    icon: "book",
    image: "https://lh3.googleusercontent.com/aida-public/AB6AXuCpycvw0OTR6LZbzoWOMk7z3c-p9wMvTQoYyHII1w-4g5rUbzvB_0p33ESghjGNCfseRdj5ouhEUbTrXj52sIfJ9RMFn5JMtRfNXZ-v-KXEWkKpr1lMH23hOqgtEYhMsBcX4JD-tKQdkAq1X93KbzOX4BGFAvHo8O9E9_8IYAluDRxNGs-niCbr2pMnBUC3cFbqF6wlnSubrpUUrKu2hTKD8mzsjSdQRgJilvuO9f_lM7l_NZR1J3YxBJAprOGHte9ecoWntu4mMVY"
  }
];

export const useClassStore = create<ClassState>((set) => ({
  classes: defaultClasses,
  monitoringClassId: null,
  sessions: [],
  startMonitoring: (id) => set({ monitoringClassId: id }),
  stopMonitoring: () => set({ monitoringClassId: null }),
  // Ending a session saves it to history and clears the active monitor
  endSession: (session) =>
    set((state) => ({
      sessions: [session, ...state.sessions],
      monitoringClassId: null,
    })),
  addClass: (newClass) => {
    let accent = "text-slate-700";
    let tone = "from-slate-600 to-zinc-500";
    let icon: "leaf" | "sigma" | "book" | "pen" = "pen";
    let image = "https://images.unsplash.com/photo-1455390582262-044cdead277a?w=400"; // default cover

    if (newClass.subjectType === "ciencias") {
      accent = "text-emerald-700";
      tone = "from-emerald-600 to-teal-500";
      icon = "leaf";
      image = "https://lh3.googleusercontent.com/aida-public/AB6AXuBCAwPsVw47e0Nv2o8f8sBJM_d_mY5O81AtCriMIujynK1Z4qFVr-U_1_BOLZz-c9WnkGdFLcIxY-pCddOH7FNrl4Nz3RJSepvcldBk9Hn-unZmUUahnjRaxJUfGgcqzcrtMmlDFp3i945BScZwFB8FpFCiY7l7hpZt_9Ac6FLAoZZcrdpnH05aRWNP5a3NlMK0drZNLJ05ejf9BogvXk_G02ZR5Gq8nCFjvbqq7-deOlmo_kbRavVCO0AbBkNsIOBOJN1NGhVDmOM";
    } else if (newClass.subjectType === "matematicas") {
      accent = "text-blue-700";
      tone = "from-blue-600 to-indigo-500";
      icon = "sigma";
      image = "https://lh3.googleusercontent.com/aida-public/AB6AXuA932KhbIrFuy-YeSLoezsXY1m5ssXcWSCC6nKu52j9iVzwAW0nbMgsKdzmvGZ-x1ZGA4YLqNnsEUuf0YbOjW3QTAaVw7AeJSd_HlaLZEYO49CWgi58UglcAAkhr5-GeZxDYNYJqtLwLnL2xl8gvQpmNmluT-yrr4iOuyjeJSoGn0jgZG5Y4gQjl0kaq9cxGKhtuOToJYeEkDpLt8KG6AeUI7yRUTLfqyF6MB4w0o2AGtWFJOCeN6Wh_eTS3RPoN6ml2gq0Y37Tr9w";
    } else if (newClass.subjectType === "lengua") {
      accent = "text-violet-700";
      tone = "from-violet-600 to-purple-500";
      icon = "book";
      image = "https://lh3.googleusercontent.com/aida-public/AB6AXuCpycvw0OTR6LZbzoWOMk7z3c-p9wMvTQoYyHII1w-4g5rUbzvB_0p33ESghjGNCfseRdj5ouhEUbTrXj52sIfJ9RMFn5JMtRfNXZ-v-KXEWkKpr1lMH23hOqgtEYhMsBcX4JD-tKQdkAq1X93KbzOX4BGFAvHo8O9E9_8IYAluDRxNGs-niCbr2pMnBUC3cFbqF6wlnSubrpUUrKu2hTKD8mzsjSdQRgJilvuO9f_lM7l_NZR1J3YxBJAprOGHte9ecoWntu4mMVY";
    }

    const createdClass: ClassItem = {
      id: `class-${Date.now()}`,
      title: newClass.title,
      focus: newClass.focus,
      students: `${newClass.studentCount} estudiantes activos`,
      topics: newClass.topics,
      accent,
      tone,
      icon,
      image,
    };

    set((state) => ({ classes: [...state.classes, createdClass] }));
  },
  resetClasses: () => set({ classes: defaultClasses }),
}));
