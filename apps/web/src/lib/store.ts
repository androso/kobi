import { create } from "zustand";
import type { ArtifactContent, ArtifactKind, QuizAnswer } from "./artifacts";

interface UserProfile {
  role: "teacher" | "student" | null;
  email?: string;
  studentName?: string;
  classCode?: string;
}

interface AuthState {
  user: UserProfile | null;
  loginTeacher: (email: string) => void;
  loginStudent: (studentName: string, classCode: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loginTeacher: (email) => set({ user: { role: "teacher", email } }),
  loginStudent: (studentName, classCode) => set({ user: { role: "student", studentName, classCode } }),
  logout: () => set({ user: null }),
}));

export interface ClassItem {
  id: string;
  code: string;
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

/**
 * Difficulty variant of an artefacto. Mirrors the three bands promised on the
 * login slide: apoyo (support), base (core) and reto (challenge).
 */
export type ArtefactoBand = "support" | "core" | "challenge";

/**
 * An "artefacto" is the student-facing activity the teacher publishes to a
 * class. It is the shared contract between the teacher flow (which authors and
 * assigns it) and the student dashboard (which renders and answers it).
 */
export interface Artefacto {
  id: string;
  classId: string;
  title: string;
  section: string;
  objective: string;
  band: ArtefactoBand;
  /** Drives the lesson-list icon and the renderer dispatch. */
  kind: ArtifactKind;
  /** The typed payload the client renders (see lib/artifacts.ts). */
  content: ArtifactContent;
  /** Lesson-list subtitle, e.g. "Quiz · 3 preguntas". */
  estimateLabel?: string;
  /** Renderer breadcrumb, e.g. ["Lengua", "La noticia", "Vocabulario"]. */
  breadcrumb?: string[];
  status: "draft" | "assigned";
  due: string;
  createdAt: number;
}

/**
 * A student's submission for an artefacto. Flows back from the student dashboard
 * so the teacher analytics can report real progress. Keyed uniquely by
 * (artefactoId, studentName).
 */
export interface ArtefactoSubmission {
  id: string;
  artefactoId: string;
  classId: string;
  studentName: string;
  answers: QuizAnswer[];
  score: number;
  total: number;
  attempts: number;
  hintsUsed: number;
  status: "in_progress" | "submitted" | "completed";
  submittedAt: number;
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
  artefactos: Artefacto[];
  submissions: ArtefactoSubmission[];
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
  /** Teacher publishes an artefacto to a class. */
  assignArtefacto: (
    artefacto: Omit<Artefacto, "id" | "status" | "createdAt"> & Partial<Pick<Artefacto, "status">>,
  ) => void;
  /** Student submits a quiz attempt; upserts by (artefactoId, studentName). */
  submitArtefacto: (
    submission: Omit<ArtefactoSubmission, "id" | "submittedAt" | "status">,
  ) => void;
  resetClasses: () => void;
}

const defaultClasses: ClassItem[] = [
  {
    id: "class-1",
    code: "KOBI7",
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
    code: "KOBI5",
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
    code: "KOBI8",
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

// Seeded artefactos for the demo class (KOBI7 / class-1). These stand in for
// activities the teacher would publish, and keep the student dashboard working
// end-to-end until the teacher "publish" UI is wired to assignArtefacto.
const defaultArtefactos: Artefacto[] = [
  {
    id: "artefacto-1",
    classId: "class-1",
    title: "Vocabulario en contexto: La noticia",
    section: "Unidad 4 · Lección 5",
    objective: "L7.4.2",
    band: "core",
    kind: "quiz",
    estimateLabel: "Quiz · 3 preguntas",
    breadcrumb: ["Lengua", "La noticia", "Vocabulario"],
    content: {
      type: "quiz",
      questions: [
        {
          id: "q1",
          prompt: "El periodista redacto la ___ antes del mediodia.",
          choices: [
            { id: "a", label: "noticia" },
            { id: "b", label: "novela" },
            { id: "c", label: "receta" },
          ],
          correctChoiceId: "a",
          hints: [
            "Piensa en la palabra que nombra lo que escribio el periodista.",
            "La frase habla de un texto informativo, no de una historia o una comida.",
          ],
          explanation: "Una noticia es un texto informativo sobre un hecho reciente.",
        },
        {
          id: "q2",
          prompt: "¿Qué parte de la noticia resume lo esencial al inicio?",
          choices: [
            { id: "a", label: "la entradilla" },
            { id: "b", label: "el epílogo" },
            { id: "c", label: "la moraleja" },
          ],
          correctChoiceId: "a",
          hints: ["Va justo después del titular."],
          explanation: "La entradilla resume el qué, quién, cuándo y dónde.",
        },
        {
          id: "q3",
          prompt: "Una noticia responde principalmente a la pregunta ___.",
          choices: [
            { id: "a", label: "qué pasó" },
            { id: "b", label: "cómo cocinar" },
            { id: "c", label: "quién ganó ayer" },
          ],
          correctChoiceId: "a",
          hints: ["Busca la opción más general."],
          explanation: "Toda noticia parte del hecho: qué pasó.",
        },
      ],
    },
    status: "assigned",
    due: "Hoy",
    createdAt: 0,
  },
  {
    id: "artefacto-2",
    classId: "class-1",
    title: "Lectura rápida",
    section: "Unidad 4 · Lección 5",
    objective: "L7.4.1",
    band: "support",
    kind: "quiz",
    estimateLabel: "Quiz · 2 preguntas",
    breadcrumb: ["Lengua", "La noticia", "Lectura"],
    content: {
      type: "quiz",
      questions: [
        {
          id: "q1",
          prompt: "El propósito principal de una noticia es ___.",
          choices: [
            { id: "a", label: "informar" },
            { id: "b", label: "entretener con ficción" },
            { id: "c", label: "dar una receta" },
          ],
          correctChoiceId: "a",
          hints: ["Piensa en para qué sirve un periódico."],
        },
        {
          id: "q2",
          prompt: "El título breve que encabeza la noticia se llama ___.",
          choices: [
            { id: "a", label: "titular" },
            { id: "b", label: "índice" },
            { id: "c", label: "portada" },
          ],
          correctChoiceId: "a",
          hints: ["Es lo primero que lees, en letra grande."],
        },
      ],
    },
    status: "assigned",
    due: "Mañana",
    createdAt: 0,
  },
  {
    id: "artefacto-3",
    classId: "class-1",
    title: "Reto extra",
    section: "Unidad 4 · Lección 5",
    objective: "L7.4.3",
    band: "challenge",
    kind: "quiz",
    estimateLabel: "Quiz · 1 pregunta",
    breadcrumb: ["Lengua", "La noticia", "Reto"],
    content: {
      type: "quiz",
      questions: [
        {
          id: "q1",
          prompt: "La parte de la noticia que resume lo esencial se llama ___.",
          choices: [
            { id: "a", label: "entradilla" },
            { id: "b", label: "epílogo" },
            { id: "c", label: "moraleja" },
          ],
          correctChoiceId: "a",
          hints: ["Va justo después del titular.", "Resume el qué, quién y cuándo."],
        },
      ],
    },
    status: "assigned",
    due: "Opcional",
    createdAt: 0,
  },
];

/** Resolve a class by its join code (case-insensitive). */
export function findClassByCode(classes: ClassItem[], code: string): ClassItem | undefined {
  const normalized = code.trim().toUpperCase();
  return classes.find((item) => item.code.toUpperCase() === normalized);
}

/** Artefactos assigned to a class, oldest first. */
export function selectClassArtefactos(
  state: Pick<ClassState, "artefactos">,
  classId: string,
): Artefacto[] {
  return state.artefactos
    .filter((item) => item.classId === classId && item.status === "assigned")
    .sort((a, b) => a.createdAt - b.createdAt);
}

/** A student's submission for a given artefacto, if any. */
export function selectSubmission(
  state: Pick<ClassState, "submissions">,
  artefactoId: string,
  studentName: string,
): ArtefactoSubmission | undefined {
  return state.submissions.find(
    (item) => item.artefactoId === artefactoId && item.studentName === studentName,
  );
}

// Generate a short, human-readable class join code (e.g. "KOBI-4821").
function generateClassCode(): string {
  return `KOBI-${Math.floor(1000 + Math.random() * 9000)}`;
}

export const useClassStore = create<ClassState>((set) => ({
  classes: defaultClasses,
  monitoringClassId: null,
  sessions: [],
  artefactos: defaultArtefactos,
  submissions: [],
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
      code: generateClassCode(),
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
  assignArtefacto: (artefacto) =>
    set((state) => ({
      artefactos: [
        ...state.artefactos,
        {
          ...artefacto,
          id: `artefacto-${Date.now()}`,
          status: artefacto.status ?? "assigned",
          createdAt: Date.now(),
        },
      ],
    })),
  submitArtefacto: (submission) =>
    set((state) => {
      const status: ArtefactoSubmission["status"] =
        submission.score >= submission.total ? "completed" : "submitted";
      const existing = state.submissions.find(
        (item) =>
          item.artefactoId === submission.artefactoId && item.studentName === submission.studentName,
      );

      const record: ArtefactoSubmission = {
        ...submission,
        id: existing?.id ?? `submission-${Date.now()}`,
        status,
        submittedAt: Date.now(),
      };

      return {
        submissions: existing
          ? state.submissions.map((item) => (item.id === existing.id ? record : item))
          : [...state.submissions, record],
      };
    }),
  resetClasses: () => set({ classes: defaultClasses, artefactos: defaultArtefactos, submissions: [] }),
}));
