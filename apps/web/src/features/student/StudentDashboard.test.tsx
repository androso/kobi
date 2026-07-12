import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore, useClassStore } from "../../lib/store";
import { StudentDashboard } from "./StudentDashboard";

const mocks = vi.hoisted(() => ({
  loadLatestAssignmentForStudent: vi.fn(),
  dismissAssignmentForStudent: vi.fn(async () => {}),
  handleStudentActivityMessage: vi.fn(),
  realtimeHandlers: [] as Array<() => void>,
  subscribe: vi.fn(),
  removeChannel: vi.fn(async () => "ok"),
}));

vi.mock("../../lib/supabase", () => ({
  supabase: {
    channel: vi.fn(() => ({
      on: vi.fn((_type, _config, handler) => {
        mocks.realtimeHandlers.push(handler);
        return { subscribe: mocks.subscribe };
      }),
    })),
    removeChannel: mocks.removeChannel,
  },
}));

vi.mock("../activityDelivery/artifactDelivery", () => ({
  SupabaseActivityDeliveryStore: class {
    loadLatestAssignmentForStudent = mocks.loadLatestAssignmentForStudent;
    dismissAssignmentForStudent = mocks.dismissAssignmentForStudent;
  },
  handleStudentActivityMessage: mocks.handleStudentActivityMessage,
}));

const assignment = {
  id: "assignment-1",
  sessionId: "session-1",
  activityId: "activity-1",
  studentId: "student-1",
  variant: "core",
  status: "assigned",
  manifest: {
    family: "guided_practice",
    title: "Practica: La noticia",
    difficulty_band: "core",
    curriculum: { grade: 7, subject: "lenguaje", unit: "U4", objective: "L7.4.2" },
    est_minutes: 6,
    content: {
      items: [{ prompt: "Identifica titular, entradilla y fuente.", answer_key: ["titular"], hints: ["Lee el encabezado."] }],
      telemetry_events: ["attempt", "hint", "complete"],
    },
    entry: "index.html",
    sdk_version: "activity-sdk/v1",
    allowed_capabilities: ["dom", "css"],
  },
  bundleHtml: "<!doctype html><html><body>Actividad</body></html>",
};

describe("StudentDashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.realtimeHandlers.length = 0;
    mocks.loadLatestAssignmentForStudent.mockResolvedValue(assignment);
    useClassStore.getState().resetClasses();
    useAuthStore.setState({
      status: "authenticated",
      user: {
        role: "student",
        studentName: "Ana",
        studentId: "student-1",
        studentAccessToken: "student-token-1",
        classId: "class-1",
        className: "Ciencia 4to - Seccion A",
        joinCode: "KOBI7",
      },
    });
  });

  it("reconciles assignments from Realtime and removes the subscription on route cleanup", async () => {
    const view = renderDashboard();
    expect(await screen.findByRole("heading", { name: /practica: la noticia/i })).toBeInTheDocument();

    mocks.loadLatestAssignmentForStudent.mockResolvedValue(null);
    await act(async () => mocks.realtimeHandlers[0]?.());

    expect(await screen.findByText(/no tienes actividades asignadas todav/i)).toBeInTheDocument();
    view.unmount();
    expect(mocks.removeChannel).toHaveBeenCalledOnce();
  });

  function renderDashboard() {
    return render(
      <MemoryRouter initialEntries={["/student/asignaciones"]}>
        <StudentDashboard />
      </MemoryRouter>,
    );
  }

  it("renders the shared student shell and keeps verified iframe delivery locked down", async () => {
    renderDashboard();

    expect(await screen.findByRole("heading", { name: /practica: la noticia/i })).toBeInTheDocument();
    expect(screen.getAllByText("Kobi Labs").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/portal estudiantil/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/clase kobi7/i).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /nueva clase/i })).not.toBeInTheDocument();

    const activityFrame = screen.getByTitle("Practica: La noticia");
    expect(activityFrame).toHaveAttribute("sandbox", "allow-scripts");
    expect(activityFrame).toHaveAttribute("referrerpolicy", "no-referrer");
  });

  it("uses dark-mode-safe student shell and pet surfaces", async () => {
    document.documentElement.classList.add("dark");

    renderDashboard();

    expect(await screen.findByRole("heading", { name: /practica: la noticia/i })).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: /navegación estudiante/i })).toHaveClass(
      "student-portal-sidebar",
    );
    expect(document.querySelector(".student-portal-profile")).toBeInTheDocument();
    expect(document.querySelectorAll(".kobi-pet-surface").length).toBeGreaterThan(0);
    expect(document.querySelectorAll(".kobi-mascot").length).toBeGreaterThan(0);

    document.documentElement.classList.remove("dark");
  });

  it("navigates between student assignments and completion-backed progress", async () => {
    const user = userEvent.setup();

    renderDashboard();
    expect(await screen.findByRole("heading", { name: /practica: la noticia/i })).toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: /progreso/i }));

    expect(screen.getByRole("heading", { level: 1, name: /progreso/i })).toBeInTheDocument();
    expect(screen.getByText(/este panel solo refleja actividades entregadas por tu docente/i)).toBeInTheDocument();
    expect(screen.queryByText(/pts$/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /analíticas/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: /artefactos/i }));
    expect(screen.getByRole("heading", { name: /practica: la noticia/i })).toBeInTheDocument();
  });

  it("dismisses a delivered assignment without falling back to seeded artifacts", async () => {
    const user = userEvent.setup();

    renderDashboard();

    expect(await screen.findByRole("heading", { name: /practica: la noticia/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /quitar de mi lista/i }));

    expect(mocks.dismissAssignmentForStudent).toHaveBeenCalledWith(
      expect.objectContaining({
        assignmentId: "assignment-1",
        studentId: "student-1",
        dismissedAt: expect.any(String),
      }),
    );
    expect(await screen.findByText(/no tienes actividades asignadas todav/i)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /vocabulario en contexto: la noticia/i })).not.toBeInTheDocument();
  });
});
