import { describe, expect, it, vi } from "vitest";
import type {
  ActivityDeliveryStore,
  AssignmentUpsert,
  DeliveryCandidate,
  StudentAssignment,
  StudentForAssignment,
} from "./artifactDelivery";
import {
  buildAssignmentUpserts,
  handleStudentActivityMessage,
  loadOrCreateReadyCandidates,
  publishAssignments,
  SupabaseActivityDeliveryStore,
} from "./artifactDelivery";
import type { ActivityManifest, DifficultyBand } from "@kobi/activities/contracts";

const manifest = (band: DifficultyBand): ActivityManifest => ({
  family: band === "support" ? "match_classify" : band === "challenge" ? "sequence_order" : "guided_practice",
  title: `Actividad ${band}`,
  difficulty_band: band,
  curriculum: { grade: 7, subject: "lenguaje", unit: "U4", objective: "L7.4.2" },
  est_minutes: 6,
  content: {
    items: [{ prompt: "Identifica las partes de la noticia.", answer_key: ["titular"], hints: ["Lee el encabezado."] }],
    telemetry_events: ["attempt", "hint", "complete"],
  },
  entry: "index.html",
  sdk_version: "activity-sdk/v1",
  allowed_capabilities: ["dom", "css"],
});

const candidate = (band: DifficultyBand): DeliveryCandidate => ({
  id: `candidate-${band}`,
  candidateSetVersion: "candidate-set-1",
  sessionId: "session-1",
  activityId: `activity-${band}`,
  difficultyBand: band,
  status: "ready",
  source: "new",
  manifest: manifest(band),
  bundleRef: `bundle-${band}`,
  bundleHtml: "<!doctype html><html><body>ok</body></html>",
  evidence: [{ objective_code: "L7.4.2", section: "U4", text: "La noticia" }],
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
});

function store(overrides: Partial<ActivityDeliveryStore> = {}): ActivityDeliveryStore {
  return {
    ensureActiveSession: vi.fn(async () => "session-1"),
    listCandidates: vi.fn(async () => []),
    listStudents: vi.fn(async () => []),
    publishAssignments: vi.fn(async () => []),
    loadLatestAssignmentForStudent: vi.fn(async () => null),
    writeEvent: vi.fn(async () => {}),
    markAssignmentComplete: vi.fn(async () => {}),
    dismissAssignmentForStudent: vi.fn(async () => {}),
    ...overrides,
  };
}

describe("artifact delivery bridge", () => {
  it("loads existing ready candidates without browser-side generation", async () => {
    const fakeStore = store({
      listCandidates: vi.fn(async () => [candidate("challenge"), candidate("support"), candidate("core")]),
    });

    const result = await loadOrCreateReadyCandidates(fakeStore, "class-1");

    expect(result.created).toBe(false);
    expect(result.candidates.map((row) => row.difficultyBand)).toEqual(["support", "core", "challenge"]);
  });

  it("builds assignment upserts with approved core fallback", () => {
    const students: StudentForAssignment[] = [
      { id: "student-1", displayName: "Ana" },
      { id: "student-2", displayName: "Luis" },
    ];

    const rows = buildAssignmentUpserts({
      sessionId: "session-1",
      students,
      candidates: [candidate("support"), candidate("core"), candidate("challenge")],
      approvedBands: ["core"],
      overridesByBand: { challenge: ["student-2"] },
    });

    expect(rows).toEqual([
      expect.objectContaining({
        student_id: "student-1",
        variant: "core",
        activity_id: "activity-core",
        dismissed_at: null,
      }),
      expect.objectContaining({
        student_id: "student-2",
        variant: "core",
        activity_id: "activity-core",
        dismissed_at: null,
      }),
    ]);
  });

  it("rejects candidate rows from another session before publishing", () => {
    expect(() =>
      buildAssignmentUpserts({
        sessionId: "session-1",
        students: [{ id: "student-1", displayName: "Ana" }],
        candidates: [{ ...candidate("core"), sessionId: "session-2" }],
        approvedBands: ["core"],
        overridesByBand: {},
      }),
    ).toThrow("La actividad candidata no pertenece a esta sesion.");
  });

  it("rejects candidates whose manifest band does not match the row band", () => {
    expect(() =>
      buildAssignmentUpserts({
        sessionId: "session-1",
        students: [{ id: "student-1", displayName: "Ana" }],
        candidates: [{ ...candidate("core"), manifest: manifest("support") }],
        approvedBands: ["core"],
        overridesByBand: {},
      }),
    ).toThrow("La variante de la candidata no coincide con su manifest.");
  });

  it("publishes approved bands and assignment rows", async () => {
    const fakeStore = store({
      listStudents: vi.fn(async () => [
        { id: "student-1", displayName: "Ana" },
        { id: "student-2", displayName: "Luis" },
      ]),
      publishAssignments: vi.fn(async ({ assignments: rows }) =>
        rows.map((row: AssignmentUpsert, index: number) => ({
          id: `assignment-${index}`,
          sessionId: row.session_id,
          activityId: row.activity_id,
          studentId: row.student_id,
          variant: row.variant,
        })),
      ),
    });

    const published = await publishAssignments({
      store: fakeStore,
      sessionId: "session-1",
      classId: "class-1",
      candidates: [candidate("support"), candidate("core"), candidate("challenge")],
      approvedBands: ["core", "support"],
      overridesByBand: { support: ["student-2"] },
      idempotencyKey: "publish-1",
    });

    expect(published.map((row) => row.variant)).toEqual(["core", "support"]);
    expect(fakeStore.publishAssignments).toHaveBeenCalledWith(expect.objectContaining({
      candidateSetVersion: "candidate-set-1",
      idempotencyKey: "publish-1",
      assignments: expect.arrayContaining([expect.objectContaining({ dismissed_at: null })]),
    }));
  });

  it("calls the atomic publish RPC and maps its complete result", async () => {
    const rpc = vi.fn(async () => ({
      data: { assignments: [{ id: "assignment-1", session_id: "session-1", activity_id: "activity-core", student_id: "student-1", variant: "core" }] },
      error: null,
    }));
    const deliveryStore = new SupabaseActivityDeliveryStore({ rpc } as never);

    await expect(deliveryStore.publishAssignments({
      classId: "class-1",
      sessionId: "session-1",
      candidateSetVersion: "candidate-set-1",
      candidates: [{ candidate_id: "candidate-core", difficulty_band: "core", approved: true }],
      assignments: [{ session_id: "session-1", candidate_id: "candidate-core", activity_id: "activity-core", student_id: "student-1", variant: "core", status: "assigned", dismissed_at: null }],
      idempotencyKey: "publish-1",
    })).resolves.toEqual([expect.objectContaining({ id: "assignment-1", variant: "core" })]);

    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith("publish_session_assignments", expect.objectContaining({
      input_candidate_set_version: "candidate-set-1",
      input_idempotency_key: "publish-1",
    }));
  });

  it("maps a stale candidate-set conflict to a reload message", async () => {
    const rpc = vi.fn(async () => ({ data: null, error: { code: "40001", message: "candidate_set_version_conflict" } }));
    const deliveryStore = new SupabaseActivityDeliveryStore({ rpc } as never);
    await expect(deliveryStore.publishAssignments({
      classId: "class-1", sessionId: "session-1", candidateSetVersion: "stale",
      candidates: [], assignments: [], idempotencyKey: "publish-1",
    })).rejects.toThrow("Las candidatas cambiaron; vuelve a cargar antes de publicar.");
  });

  it("dismisses an assignment for the owning student without deleting it", async () => {
    const query = {
      eq: vi.fn(),
      then: vi.fn((resolve: (value: { error: null }) => void) => resolve({ error: null })),
    };
    query.eq.mockReturnValue(query);
    const update = vi.fn(() => query);
    const from = vi.fn(() => ({ update }));
    const deliveryStore = new SupabaseActivityDeliveryStore({ from } as never);

    await deliveryStore.dismissAssignmentForStudent({
      assignmentId: "assignment-1",
      studentId: "student-1",
      dismissedAt: "2026-07-05T08:00:00.000Z",
    });

    expect(from).toHaveBeenCalledWith("assignments");
    expect(update).toHaveBeenCalledWith({ dismissed_at: "2026-07-05T08:00:00.000Z" });
    expect(query.eq).toHaveBeenCalledWith("id", "assignment-1");
    expect(query.eq).toHaveBeenCalledWith("student_id", "student-1");
  });

  it("uses the student delivery RPC when dismissing with a student token", async () => {
    const rpc = vi.fn(async () => ({ error: null }));
    const from = vi.fn();
    const deliveryStore = new SupabaseActivityDeliveryStore(
      { from, rpc } as never,
      { studentId: "student-1", accessToken: "student-token-1" },
    );

    await deliveryStore.dismissAssignmentForStudent({
      assignmentId: "assignment-1",
      studentId: "student-1",
      dismissedAt: "2026-07-05T08:00:00.000Z",
    });

    expect(rpc).toHaveBeenCalledWith("dismiss_assignment_for_student", {
      input_assignment_id: "assignment-1",
      input_student_id: "student-1",
      input_access_token: "student-token-1",
      input_dismissed_at: "2026-07-05T08:00:00.000Z",
    });
    expect(from).not.toHaveBeenCalled();
  });

  it("loads student assignments through the authorized delivery RPC", async () => {
    const maybeSingle = vi.fn(async () => ({
      data: {
        id: "assignment-1",
        session_id: "session-1",
        activity_id: "activity-core",
        student_id: "student-1",
        variant: "core",
        status: "assigned",
        manifest: manifest("core"),
        bundle_html: "<!doctype html><html><body>Actividad</body></html>",
      },
      error: null,
    }));
    const rpc = vi.fn(() => ({ maybeSingle }));
    const from = vi.fn();
    const deliveryStore = new SupabaseActivityDeliveryStore(
      { from, rpc } as never,
      { studentId: "student-1", accessToken: "student-token-1" },
    );

    const assignment = await deliveryStore.loadLatestAssignmentForStudent("student-1");

    expect(rpc).toHaveBeenCalledWith("load_latest_assignment_for_student", {
      input_student_id: "student-1",
      input_access_token: "student-token-1",
    });
    expect(assignment).toMatchObject({
      id: "assignment-1",
      studentId: "student-1",
      bundleHtml: expect.stringContaining("Actividad"),
    });
    expect(from).not.toHaveBeenCalled();
  });

  it("authorizes iframe telemetry and stamps the parent assignment id", async () => {
    const fakeStore = store();
    const assignment: StudentAssignment = {
      id: "assignment-1",
      sessionId: "session-1",
      activityId: "activity-core",
      studentId: "student-1",
      variant: "core",
      status: "assigned",
      manifest: manifest("core"),
      bundleHtml: "<!doctype html><html><body>ok</body></html>",
    };

    const result = await handleStudentActivityMessage({
      store: fakeStore,
      assignment,
      sourceMatches: true,
      message: {
        sdk: "activity-sdk/v1",
        type: "event",
        method: "reportAttempt",
        payload: {
          item_index: 0,
          correct: true,
        },
      },
    });

    expect(result.ok).toBe(true);
    expect(fakeStore.writeEvent).toHaveBeenCalledWith({
      assignmentId: "assignment-1",
      type: "attempt",
      payload: expect.objectContaining({ assignment_id: "assignment-1" }),
    });
  });
});
