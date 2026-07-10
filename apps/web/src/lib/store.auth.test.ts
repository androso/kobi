import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(async () => ({ data: { session: null } })),
  onAuthStateChange: vi.fn(),
  rpc: vi.fn(),
  signOut: vi.fn(async () => {}),
}));

vi.mock("./supabase", () => ({
  supabase: {
    auth: {
      getSession: mocks.getSession,
      onAuthStateChange: mocks.onAuthStateChange,
      signOut: mocks.signOut,
    },
    rpc: mocks.rpc,
  },
}));

import { useAuthStore } from "./store";

const storageKey = "kobi.localStudentAuth";
const storedStudent = {
  role: "student",
  studentName: "Ana",
  studentId: "student-1",
  classId: "class-1",
  className: "Lenguaje 7 A",
  joinCode: "KOBI7",
} as const;

describe("student auth persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    mocks.getSession.mockResolvedValue({ data: { session: null } });
    mocks.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
    useAuthStore.setState({ status: "initializing", user: null });
  });

  it("restores a student session with its stored access token after refresh", async () => {
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({ ...storedStudent, studentAccessToken: "student-token-1" }),
    );

    await useAuthStore.getState().initializeAuth();

    expect(useAuthStore.getState()).toMatchObject({
      status: "authenticated",
      user: { studentId: "student-1", studentAccessToken: "student-token-1" },
    });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("upgrades a legacy stored session by rejoining the existing student identity", async () => {
    window.localStorage.setItem(storageKey, JSON.stringify(storedStudent));
    mocks.rpc.mockReturnValue({
      single: vi.fn(async () => ({
        data: {
          student_id: "student-1",
          class_id: "class-1",
          class_name: "Lenguaje 7 A",
          join_code: "KOBI7",
          display_name: "Ana",
          access_token: "rotated-student-token",
        },
        error: null,
      })),
    });

    await useAuthStore.getState().initializeAuth();

    expect(mocks.rpc).toHaveBeenCalledWith("join_class_by_code", {
      input_code: "KOBI7",
      input_display_name: "Ana",
    });
    expect(useAuthStore.getState()).toMatchObject({
      status: "authenticated",
      user: { studentId: "student-1", studentAccessToken: "rotated-student-token" },
    });
    expect(JSON.parse(window.localStorage.getItem(storageKey) ?? "{}")).toMatchObject({
      studentId: "student-1",
      studentAccessToken: "rotated-student-token",
    });
  });
});
