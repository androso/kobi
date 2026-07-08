import { create } from "zustand";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import type { VerifiedBundleContent } from "./artifacts";

interface UserProfile {
  role: "teacher" | "student" | null;
  email?: string;
  studentName?: string;
  studentId?: string;
  studentAccessToken?: string;
  classId?: string;
  className?: string;
  joinCode?: string;
  id?: string;
  displayName?: string;
}

interface TeacherAuthResult {
  error?: string;
}

interface StudentJoinResult {
  error?: string;
}

interface JoinedClassRow {
  student_id: string;
  class_id: string;
  class_name: string;
  join_code: string;
  display_name: string;
  access_token: string;
}

interface AuthState {
  status: "initializing" | "authenticated" | "unauthenticated";
  user: UserProfile | null;
  initializeAuth: () => Promise<void>;
  loginTeacher: (email: string, password: string) => Promise<TeacherAuthResult>;
  signupTeacher: (email: string, password: string) => Promise<TeacherAuthResult>;
  loginStudent: (code: string, studentName: string) => Promise<StudentJoinResult>;
  logout: () => Promise<void>;
}

const localStudentAuthKey = "kobi.localStudentAuth";

function teacherProfileFromSupabaseUser(user: User): UserProfile {
  return {
    role: "teacher",
    email: user.email ?? undefined,
    id: user.id,
    displayName: user.user_metadata?.display_name ?? user.email?.split("@")[0] ?? "Docente",
  };
}

function readLocalStudentAuth(): UserProfile | null {
  if (typeof window === "undefined") return null;

  try {
    const stored = window.localStorage.getItem(localStudentAuthKey);
    if (!stored) return null;
    const parsed = JSON.parse(stored) as UserProfile;

    if (
      parsed.role !== "student" ||
      !parsed.studentId ||
      !parsed.studentAccessToken ||
      !parsed.classId ||
      !parsed.studentName
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeLocalStudentAuth(profile: UserProfile) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(localStudentAuthKey, JSON.stringify(profile));
}

function clearLocalStudentAuth() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(localStudentAuthKey);
}

async function ensureTeacherProfile(user: User) {
  if (!supabase) return;

  const displayName = user.user_metadata?.display_name ?? user.email?.split("@")[0] ?? "Docente";

  await supabase.from("teacher_profiles").upsert({
    id: user.id,
    display_name: displayName,
  });
}

export const useAuthStore = create<AuthState>((set, get) => ({
  status: "initializing",
  user: null,
  initializeAuth: async () => {
    if (!supabase) {
      set({ status: "unauthenticated", user: null });
      return;
    }

    try {
      const { data } = await supabase.auth.getSession();
      const session: Session | null = data.session;
      const localStudentAuth = readLocalStudentAuth();

      if (session?.user) {
        await ensureTeacherProfile(session.user);
        useClassStore.setState({ classes: [], artefactos: [], submissions: [] });
      }

      set({
        status: session?.user || localStudentAuth ? "authenticated" : "unauthenticated",
        user: session?.user ? teacherProfileFromSupabaseUser(session.user) : localStudentAuth,
      });

      supabase.auth.onAuthStateChange((_event, nextSession) => {
        if (nextSession?.user) {
          void ensureTeacherProfile(nextSession.user);
          useClassStore.setState({ classes: [], artefactos: [], submissions: [] });
        }

        const localStudentAuth = readLocalStudentAuth();
        set({
          status: nextSession?.user || localStudentAuth ? "authenticated" : "unauthenticated",
          user: nextSession?.user ? teacherProfileFromSupabaseUser(nextSession.user) : localStudentAuth,
        });
      });
    } catch (error) {
      console.error("Unable to initialize Supabase auth.", error);
      set({ status: "unauthenticated", user: null });
    }
  },
  loginTeacher: async (email, password) => {
    const normalizedEmail = email.trim().toLowerCase();

    if (!supabase) {
      return { error: "Supabase no esta configurado. Define VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY." };
    }

    const { data, error } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password });

    if (error) return { error: error.message };
    if (!data.user) return { error: "No se pudo iniciar sesion." };

    await ensureTeacherProfile(data.user);
    clearLocalStudentAuth();
    useClassStore.setState({ classes: [], artefactos: [], submissions: [] });
    set({ status: "authenticated", user: teacherProfileFromSupabaseUser(data.user) });
    return {};
  },
  signupTeacher: async (email, password) => {
    const normalizedEmail = email.trim().toLowerCase();

    if (!supabase) {
      return { error: "Supabase no esta configurado. Define VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY." };
    }

    const { data, error } = await supabase.auth.signUp({ email: normalizedEmail, password });

    if (error) return { error: error.message };

    if (!data.session?.user) {
      return { error: "No se pudo iniciar sesion despues de crear la cuenta. Desactiva la confirmacion por correo en Supabase Auth." };
    }

    await ensureTeacherProfile(data.session.user);
    clearLocalStudentAuth();
    useClassStore.setState({ classes: [], artefactos: [], submissions: [] });
    set({ status: "authenticated", user: teacherProfileFromSupabaseUser(data.session.user) });
    return {};
  },
  loginStudent: async (code, studentName) => {
    if (!supabase) {
      return { error: "Supabase no esta configurado. Define VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY." };
    }

    const normalizedCode = code.trim().toUpperCase();
    const normalizedName = studentName.trim();

    const { data: joinedClass, error: joinError } = await supabase
      .rpc("join_class_by_code", {
        input_code: normalizedCode,
        input_display_name: normalizedName,
      })
      .single();

    if (joinError) {
      if (joinError.code === "P0002") return { error: "No encontramos una clase con ese codigo." };
      return { error: joinError.message };
    }

    const joined = joinedClass as JoinedClassRow;

    const profile: UserProfile = {
      role: "student",
      studentId: joined.student_id,
      studentAccessToken: joined.access_token,
      classId: joined.class_id,
      className: joined.class_name,
      joinCode: joined.join_code,
      studentName: joined.display_name,
    };

    await supabase.auth.signOut();
    writeLocalStudentAuth(profile);
    set({ status: "authenticated", user: profile });
    return {};
  },
  logout: async () => {
    const currentUser = get().user;
    if (currentUser?.role === "student") clearLocalStudentAuth();
    if (supabase) await supabase.auth.signOut();
    set({ status: "unauthenticated", user: null });
  },
}));

export interface ClassItem {
  id: string;
  title: string;
  joinCode: string;
  focus: string;
  students: string;
  studentCount: number;
  topics: string[];
  accent: string;
  tone: string;
  badge?: string;
  icon: "leaf" | "sigma" | "book" | "pen";
  image?: string;
}

/**
 * Difficulty variant of an artefacto: apoyo (support), base (core), reto (challenge).
 */
export type ArtefactoBand = "support" | "core" | "challenge";

/**
 * Student-facing metadata for a verified ActivityArtifact bundle rendered in a
 * sandboxed iframe via packages/activities.
 */
export interface Artefacto {
  id: string;
  classId: string;
  title: string;
  section: string;
  objective: string;
  band: ArtefactoBand;
  kind: "verified_bundle";
  content: VerifiedBundleContent;
  estimateLabel?: string;
  breadcrumb?: string[];
  status: "draft" | "assigned";
  due: string;
  createdAt: number;
}

/**
 * A student's submission for an artefacto; flows back so teacher analytics can
 * report real progress. Keyed uniquely by (artefactoId, studentName).
 */
export interface ArtefactoSubmission {
  id: string;
  artefactoId: string;
  classId: string;
  studentName: string;
  answers: [];
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
  loadingClasses: boolean;
  classError: string | null;
  monitoringClassId: string | null;
  sessions: SavedSession[];
  artefactos: Artefacto[];
  submissions: ArtefactoSubmission[];
  loadTeacherClasses: (teacherId: string) => Promise<void>;
  startMonitoring: (id: string) => void;
  stopMonitoring: () => void;
  endSession: (session: SavedSession) => void;
  addClass: (newClass: {
    title: string;
    unit: string;
    grade: number;
    subject: "lenguaje" | "ciencias" | "matematicas" | "sociales";
  }, teacherId: string) => Promise<{ error?: string; classItem?: ClassItem }>;
  resetClasses: () => void;
}

interface ClassRow {
  id: string;
  name: string;
  join_code: string;
  subject: string;
  unit: string;
  grade: number;
}

const subjectThemeMap: Record<string, Pick<ClassItem, "accent" | "tone" | "icon" | "image">> = {
  lenguaje: {
    accent: "text-violet-700",
    tone: "from-violet-600 to-purple-500",
    icon: "book",
    image: "https://lh3.googleusercontent.com/aida-public/AB6AXuCpycvw0OTR6LZbzoWOMk7z3c-p9wMvTQoYyHII1w-4g5rUbzvB_0p33ESghjGNCfseRdj5ouhEUbTrXj52sIfJ9RMFn5JMtRfNXZ-v-KXEWkKpr1lMH23hOqgtEYhMsBcX4JD-tKQdkAq1X93KbzOX4BGFAvHo8O9E9_8IYAluDRxNGs-niCbr2pMnBUC3cFbqF6wlnSubrpUUrKu2hTKD8mzsjSdQRgJilvuO9f_lM7l_NZR1J3YxBJAprOGHte9ecoWntu4mMVY",
  },
  lengua: {
    accent: "text-violet-700",
    tone: "from-violet-600 to-purple-500",
    icon: "book",
    image: "https://lh3.googleusercontent.com/aida-public/AB6AXuCpycvw0OTR6LZbzoWOMk7z3c-p9wMvTQoYyHII1w-4g5rUbzvB_0p33ESghjGNCfseRdj5ouhEUbTrXj52sIfJ9RMFn5JMtRfNXZ-v-KXEWkKpr1lMH23hOqgtEYhMsBcX4JD-tKQdkAq1X93KbzOX4BGFAvHo8O9E9_8IYAluDRxNGs-niCbr2pMnBUC3cFbqF6wlnSubrpUUrKu2hTKD8mzsjSdQRgJilvuO9f_lM7l_NZR1J3YxBJAprOGHte9ecoWntu4mMVY",
  },
  ciencias: {
    accent: "text-emerald-700",
    tone: "from-emerald-600 to-teal-500",
    icon: "leaf",
    image: "https://lh3.googleusercontent.com/aida-public/AB6AXuBCAwPsVw47e0Nv2o8f8sBJM_d_mY5O81AtCriMIujynK1Z4qFVr-U_1_BOLZz-c9WnkGdFLcIxY-pCddOH7FNrl4Nz3RJSepvcldBk9Hn-unZmUUahnjRaxJUfGgcqzcrtMmlDFp3i945BScZwFB8FpFCiY7l7hpZt_9Ac6FLAoZZcrdpnH05aRWNP5a3NlMK0drZNLJ05ejf9BogvXk_G02ZR5Gq8nCFjvbqq7-deOlmo_kbRavVCO0AbBkNsIOBOJN1NGhVDmOM",
  },
  matematicas: {
    accent: "text-blue-700",
    tone: "from-blue-600 to-indigo-500",
    icon: "sigma",
    image: "https://lh3.googleusercontent.com/aida-public/AB6AXuA932KhbIrFuy-YeSLoezsXY1m5ssXcWSCC6nKu52j9iVzwAW0nbMgsKdzmvGZ-x1ZGA4YLqNnsEUuf0YbOjW3QTAaVw7AeJSd_HlaLZEYO49CWgi58UglcAAkhr5-GeZxDYNYJqtLwLnL2xl8gvQpmNmluT-yrr4iOuyjeJSoGn0jgZG5Y4gQjl0kaq9cxGKhtuOToJYeEkDpLt8KG6AeUI7yRUTLfqyF6MB4w0o2AGtWFJOCeN6Wh_eTS3RPoN6ml2gq0Y37Tr9w",
  },
  sociales: {
    accent: "text-amber-700",
    tone: "from-amber-600 to-orange-500",
    icon: "pen",
    image: "https://images.unsplash.com/photo-1455390582262-044cdead277a?w=400",
  },
  otro: {
    accent: "text-slate-700",
    tone: "from-slate-600 to-zinc-500",
    icon: "pen",
    image: "https://images.unsplash.com/photo-1455390582262-044cdead277a?w=400",
  },
};

function generateJoinCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 5; i += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

function classItemFromRow(row: ClassRow, studentCount: number): ClassItem {
  const theme = subjectThemeMap[row.subject] ?? subjectThemeMap.otro;

  return {
    id: row.id,
    title: row.name,
    joinCode: row.join_code,
    focus: row.unit,
    students: `${studentCount} estudiantes activos`,
    studentCount,
    topics: [row.unit],
    accent: theme.accent,
    tone: theme.tone,
    icon: theme.icon,
    image: theme.image,
  };
}

const defaultClasses: ClassItem[] = [
  {
    id: "class-1",
    title: "Ciencia 4to - Sección A",
    joinCode: "KOBI7",
    focus: "Ecosistemas y energía",
    students: "24 estudiantes activos",
    studentCount: 24,
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
    joinCode: "MATE5",
    focus: "Matemáticas",
    students: "22 estudiantes activos",
    studentCount: 22,
    topics: ["Variables", "Ecuaciones", "Orden de operaciones"],
    accent: "text-blue-700",
    tone: "from-blue-600 to-indigo-500",
    icon: "sigma",
    image: "https://lh3.googleusercontent.com/aida-public/AB6AXuA932KhbIrFuy-YeSLoezsXY1m5ssXcWSCC6nKu52j9iVzwAW0nbMgsKdzmvGZ-x1ZGA4YLqNnsEUuf0YbOjW3QTAaVw7AeJSd_HlaLZEYO49CWgi58UglcAAkhr5-GeZxDYNYJqtLwLnL2xl8gvQpmNmluT-yrr4iOuyjeJSoGn0jgZG5Y4gQjl0kaq9cxGKhtuOToJYeEkDpLt8KG6AeUI7yRUTLfqyF6MB4w0o2AGtWFJOCeN6Wh_eTS3RPoN6ml2gq0Y37Tr9w"
  },
  {
    id: "class-3",
    title: "Lengua 8vo - Escritura creativa",
    joinCode: "LENG8",
    focus: "Lengua y artes",
    students: "28 estudiantes activos",
    studentCount: 28,
    topics: ["Metáforas", "Estructura narrativa", "Voz"],
    accent: "text-violet-700",
    tone: "from-violet-600 to-purple-500",
    icon: "book",
    image: "https://lh3.googleusercontent.com/aida-public/AB6AXuCpycvw0OTR6LZbzoWOMk7z3c-p9wMvTQoYyHII1w-4g5rUbzvB_0p33ESghjGNCfseRdj5ouhEUbTrXj52sIfJ9RMFn5JMtRfNXZ-v-KXEWkKpr1lMH23hOqgtEYhMsBcX4JD-tKQdkAq1X93KbzOX4BGFAvHo8O9E9_8IYAluDRxNGs-niCbr2pMnBUC3cFbqF6wlnSubrpUUrKu2hTKD8mzsjSdQRgJilvuO9f_lM7l_NZR1J3YxBJAprOGHte9ecoWntu4mMVY"
  }
];

/** Resolve a class by its join code (case-insensitive). */
export function findClassByCode(classes: ClassItem[], code: string): ClassItem | undefined {
  const normalized = code.trim().toUpperCase();
  return classes.find((item) => item.joinCode.toUpperCase() === normalized);
}

export const useClassStore = create<ClassState>((set) => ({
  classes: defaultClasses,
  loadingClasses: false,
  classError: null,
  monitoringClassId: null,
  sessions: [],
  artefactos: [],
  submissions: [],
  loadTeacherClasses: async (teacherId) => {
    if (!supabase) {
      set({ classError: "Supabase no esta configurado." });
      return;
    }

    set({ loadingClasses: true, classError: null });

    const { data: classRows, error } = await supabase
      .from("classes")
      .select("id,name,join_code,subject,unit,grade")
      .eq("teacher_id", teacherId)
      .order("created_at", { ascending: false });

    if (error) {
      set({ loadingClasses: false, classError: error.message });
      return;
    }

    const rows = (classRows ?? []) as ClassRow[];
    const counts = new Map<string, number>();

    if (rows.length > 0) {
      const { data: studentRows, error: studentError } = await supabase
        .from("students")
        .select("class_id")
        .in("class_id", rows.map((row) => row.id));

      if (studentError) {
        set({ loadingClasses: false, classError: studentError.message });
        return;
      }

      for (const row of studentRows ?? []) {
        counts.set(row.class_id, (counts.get(row.class_id) ?? 0) + 1);
      }
    }

    set({
      classes: rows.map((row) => classItemFromRow(row, counts.get(row.id) ?? 0)),
      loadingClasses: false,
      classError: null,
    });
  },
  startMonitoring: (id) => set({ monitoringClassId: id }),
  stopMonitoring: () => set({ monitoringClassId: null }),
  // Ending a session saves it to history and clears the active monitor
  endSession: (session) =>
    set((state) => ({
      sessions: [session, ...state.sessions],
      monitoringClassId: null,
    })),
  addClass: async (newClass, teacherId) => {
    if (!supabase) {
      return { error: "Supabase no esta configurado." };
    }

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const joinCode = generateJoinCode();
      const { data, error } = await supabase
        .from("classes")
        .insert({
          teacher_id: teacherId,
          name: newClass.title,
          join_code: joinCode,
          grade: newClass.grade,
          subject: newClass.subject,
          unit: newClass.unit,
        })
        .select("id,name,join_code,subject,unit,grade")
        .single();

      if (error) {
        if (error.code === "23505") continue;
        return { error: error.message };
      }

      const createdClass = classItemFromRow(data as ClassRow, 0);
      set((state) => ({ classes: [createdClass, ...state.classes] }));
      return { classItem: createdClass };
    }

    return { error: "No se pudo generar un codigo unico para la clase." };
  },
  resetClasses: () =>
    set({
      classes: defaultClasses,
      loadingClasses: false,
      classError: null,
      artefactos: [],
      submissions: [],
    }),
}));
