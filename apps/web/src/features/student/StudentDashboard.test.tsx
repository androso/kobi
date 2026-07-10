import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore, useClassStore } from "../../lib/store";
import { StudentDashboard } from "./StudentDashboard";

const mocks = vi.hoisted(() => ({
  loadLatestAssignmentForStudent: vi.fn(),
  dismissAssignmentForStudent: vi.fn(async () => {}),
  handleStudentActivityMessage: vi.fn(),
}));

vi.mock("../../lib/supabase", () => ({ supabase: {} }));

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

  function renderDashboard() {
    return render(
      <MemoryRouter initialEntries={["/student/asignaciones"]}>
        <StudentDashboard />
      </MemoryRouter>,
    );
  }

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
