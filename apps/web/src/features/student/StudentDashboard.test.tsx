import { act, fireEvent, render, screen } from "@testing-library/react";
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
function dispatchActivityMessage(data: unknown, source: MessageEventSource) {
  const event = new MessageEvent("message", { data });
  Object.defineProperty(event, "source", { value: source });
  fireEvent(window, event);
}


describe("StudentDashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadLatestAssignmentForStudent.mockResolvedValue(assignment);
    mocks.handleStudentActivityMessage.mockResolvedValue({ ok: false });
    useClassStore.getState().resetClasses();
    useAuthStore.setState({
      status: "authenticated",
      user: {
        role: "student",
        studentName: "Ana",
        studentId: "student-1",
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
    expect(activityFrame.getAttribute("srcdoc")).toContain("Content-Security-Policy");
    expect(activityFrame.getAttribute("srcdoc")).toContain("connect-src 'none'");
  });

  it("answers manifest requests only for the current activity iframe and cleans up its listener", async () => {
    const view = renderDashboard();
    const activityFrame = await screen.findByTitle("Practica: La noticia") as HTMLIFrameElement;
    await act(async () => {
      await Promise.resolve();
    });
    const sourceWindow = activityFrame.contentWindow;
    expect(sourceWindow).not.toBeNull();
    if (!sourceWindow) return;
    const postMessage = vi.spyOn(sourceWindow, "postMessage");

    dispatchActivityMessage(
      { sdk: "activity-sdk/v1", type: "request", id: "manifest-1", method: "getManifest" },
      sourceWindow,
    );
    dispatchActivityMessage(
      { sdk: "activity-sdk/v1", type: "request", id: "band-1", method: "getBand" },
      sourceWindow,
    );

    expect(postMessage).toHaveBeenNthCalledWith(1, {
      sdk: "activity-sdk/v1",
      type: "response",
      id: "manifest-1",
      ok: true,
      result: assignment.manifest,
    }, "*");
    expect(postMessage).toHaveBeenNthCalledWith(2, {
      sdk: "activity-sdk/v1",
      type: "response",
      id: "band-1",
      ok: true,
      result: "core",
    }, "*");

    dispatchActivityMessage(
      { sdk: "activity-sdk/v1", type: "request", id: "foreign", method: "getManifest" },
      window,
    );
    expect(postMessage).toHaveBeenCalledTimes(2);

    view.unmount();
    dispatchActivityMessage(
      { sdk: "activity-sdk/v1", type: "request", id: "stale", method: "getBand" },
      sourceWindow,
    );
    expect(postMessage).toHaveBeenCalledTimes(2);
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
