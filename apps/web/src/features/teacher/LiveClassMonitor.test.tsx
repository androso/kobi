import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { LiveClassMonitor } from "./LiveClassMonitor";
import { useClassStore } from "../../lib/store";

const mocks = vi.hoisted(() => {
  const candidate = {
    id: "candidate-core",
    sessionId: "session-1",
    activityId: "activity-core",
    difficultyBand: "core",
    status: "ready",
    source: "new",
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
    bundleRef: "bundle-core",
    bundleHtml: "<!doctype html><html><body>Actividad</body></html>",
    evidence: [{ objective_code: "L7.4.2", section: "U4", text: "Estructura de la noticia" }],
    verifierScores: {
      deterministic: "pass",
      rubric: {
        curriculum_alignment: 0.95,
        age_fit: 0.9,
        duration_fit: 0.9,
        answer_correctness: 0.9,
        hint_leakage: 0.9,
        duplicate_risk: 0.86,
        spanish_suitability: 0.9,
      },
    },
  };

  return {
    candidate,
    listStudents: vi.fn(async () => [{ id: "student-1", displayName: "Ana" }]),
    loadOrCreateReadyCandidates: vi.fn(async () => ({
      sessionId: "session-1",
      candidates: [candidate],
      created: true,
    })),
    publishAssignments: vi.fn(async () => [
      {
        id: "assignment-1",
        sessionId: "session-1",
        activityId: "activity-core",
        studentId: "student-1",
        variant: "core",
      },
    ]),
  };
});

vi.mock("../../lib/supabase", () => ({ supabase: {} }));

vi.mock("../activityDelivery/artifactDelivery", () => ({
  SupabaseActivityDeliveryStore: class {
    listStudents = mocks.listStudents;
  },
  loadOrCreateReadyCandidates: mocks.loadOrCreateReadyCandidates,
  publishAssignments: mocks.publishAssignments,
}));

describe("LiveClassMonitor activity delivery", () => {
  it("renders generated candidates and publishes assignments", async () => {
    const user = userEvent.setup();
    useClassStore.getState().resetClasses();
    useClassStore.getState().startMonitoring("class-1");

    render(
      <MemoryRouter>
        <LiveClassMonitor />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole("button", { name: /hora de actividad/i }));

    expect(await screen.findByRole("heading", { name: /aprobar y entregar actividad/i })).toBeInTheDocument();
    expect(screen.getByText("Practica: La noticia")).toBeInTheDocument();
    expect(screen.getByText(/Estructura de la noticia/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /publicar a estudiantes/i }));

    expect(mocks.publishAssignments).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "session-1",
        classId: "class-1",
        approvedBands: ["core"],
      }),
    );
    expect(await screen.findByText(/Publicado para 1 estudiantes/i)).toBeInTheDocument();
  });
});
