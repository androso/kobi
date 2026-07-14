import type { SupabaseClient } from "@supabase/supabase-js";
import {
  activityManifestSchema,
  authorizeActivityTelemetryMessage,
  type ActivityEvidence,
  type ActivityManifest,
  type ActivityVerifierScores,
  type DifficultyBand,
  resolveApprovedActivityForBand,
} from "@kobi/activities/contracts";

type CandidateStatus = "ready" | "approved" | "rejected" | "superseded";
type ActivitySource = "seeded" | "reused" | "new";

export interface DeliveryCandidate {
  id: string;
  sessionId: string;
  activityId: string;
  difficultyBand: DifficultyBand;
  status: CandidateStatus;
  source: ActivitySource;
  manifest: ActivityManifest;
  bundleRef: string;
  bundleHtml: string;
  evidence: ActivityEvidence[];
  verifierScores: ActivityVerifierScores;
}

export interface StudentForAssignment {
  id: string;
  displayName: string;
}

export interface AssignmentUpsert {
  session_id: string;
  candidate_id: string;
  activity_id: string;
  student_id: string;
  variant: DifficultyBand;
  status: "assigned";
  dismissed_at: null;
}

export interface PublishedAssignment {
  id: string;
  sessionId: string;
  activityId: string;
  studentId: string;
  variant: DifficultyBand;
}

export interface StudentAssignment {
  id: string;
  sessionId: string;
  activityId: string;
  studentId: string;
  variant: DifficultyBand;
  status: string;
  manifest: ActivityManifest;
  bundleHtml: string;
}

export interface ActivityDeliveryStore {
  ensureActiveSession(classId: string): Promise<string>;
  listCandidates(sessionId: string): Promise<DeliveryCandidate[]>;
  listStudents(classId: string): Promise<StudentForAssignment[]>;
  updateCandidateStatuses(
    sessionId: string,
    updates: Array<{ candidateId: string; status: CandidateStatus; approvedAt: string | null }>,
  ): Promise<void>;
  upsertAssignments(assignments: AssignmentUpsert[]): Promise<PublishedAssignment[]>;
  loadLatestAssignmentForStudent(studentId: string): Promise<StudentAssignment | null>;
  dismissAssignmentForStudent(input: {
    assignmentId: string;
    studentId: string;
    dismissedAt: string;
  }): Promise<void>;
  writeEvent(input: {
    assignmentId: string;
    type: "attempt" | "hint" | "complete";
    payload: Record<string, unknown>;
  }): Promise<void>;
  markAssignmentComplete(input: {
    assignmentId: string;
    score: number;
    completedAt: string;
  }): Promise<void>;
}

const orderedBands: DifficultyBand[] = ["support", "core", "challenge"];

export async function loadOrCreateReadyCandidates(
  store: ActivityDeliveryStore,
  classId: string,
) {
  const sessionId = await store.ensureActiveSession(classId);
  const existing = await store.listCandidates(sessionId);
  const hasAllBands = orderedBands.every((band) =>
    existing.some((candidate) => candidate.difficultyBand === band),
  );

  if (hasAllBands) {
    return { sessionId, candidates: sortCandidates(existing), created: false };
  }

  return { sessionId, candidates: sortCandidates(existing), created: false };
}

export function buildAssignmentUpserts(input: {
  sessionId: string;
  students: StudentForAssignment[];
  candidates: DeliveryCandidate[];
  approvedBands: DifficultyBand[];
  overridesByBand: Partial<Record<DifficultyBand, string[]>>;
}): AssignmentUpsert[] {
  if (!input.approvedBands.includes("core")) {
    throw new Error("La actividad core debe estar aprobada antes de publicar.");
  }

  for (const candidate of input.candidates) {
    if (candidate.sessionId !== input.sessionId) {
      throw new Error("La actividad candidata no pertenece a esta sesion.");
    }

    if (candidate.manifest.difficulty_band !== candidate.difficultyBand) {
      throw new Error("La variante de la candidata no coincide con su manifest.");
    }
  }

  const approvals = input.candidates.map((candidate) => ({
    difficulty_band: candidate.difficultyBand,
    activity_id: candidate.activityId,
    candidate_id: candidate.id,
    approved: input.approvedBands.includes(candidate.difficultyBand),
  }));

  return input.students.map((student) => {
    const requestedBand = requestedBandForStudent(student.id, input.overridesByBand);
    const approved = resolveApprovedActivityForBand(approvals, requestedBand);

    if (!approved) {
      throw new Error("No hay actividad core aprobada para asignar.");
    }

    if (!approved.candidate_id) {
      throw new Error("La actividad aprobada no tiene candidata asociada.");
    }

    return {
      session_id: input.sessionId,
      candidate_id: approved.candidate_id,
      activity_id: approved.activity_id,
      student_id: student.id,
      variant: approved.difficulty_band,
      status: "assigned",
      dismissed_at: null,
    };
  });
}

export async function publishAssignments(input: {
  store: ActivityDeliveryStore;
  sessionId: string;
  classId: string;
  candidates: DeliveryCandidate[];
  approvedBands: DifficultyBand[];
  overridesByBand: Partial<Record<DifficultyBand, string[]>>;
}) {
  const students = await input.store.listStudents(input.classId);
  const assignments = buildAssignmentUpserts({ ...input, students });
  const approvedAt = new Date().toISOString();

  await input.store.updateCandidateStatuses(
    input.sessionId,
    input.candidates.map((candidate) => ({
      candidateId: candidate.id,
      status: input.approvedBands.includes(candidate.difficultyBand) ? "approved" : "rejected",
      approvedAt: input.approvedBands.includes(candidate.difficultyBand) ? approvedAt : null,
    })),
  );

  return input.store.upsertAssignments(assignments);
}

export async function handleStudentActivityMessage(input: {
  store: ActivityDeliveryStore;
  assignment: StudentAssignment;
  message: unknown;
  sourceMatches: boolean;
  eventsInRateWindow?: number;
}) {
  const authorized = authorizeActivityTelemetryMessage(input.message, {
    assignmentId: input.assignment.id,
    sourceMatches: input.sourceMatches,
    eventsInRateWindow: input.eventsInRateWindow,
  });

  if (!authorized.ok) return authorized;

  await input.store.writeEvent({
    assignmentId: authorized.event.assignment_id,
    type: authorized.event.type,
    payload: authorized.event.payload,
  });

  if (authorized.event.type === "complete") {
    await input.store.markAssignmentComplete({
      assignmentId: authorized.event.assignment_id,
      score: Number(authorized.event.payload.score ?? 0),
      completedAt: String(authorized.event.payload.completed_at ?? new Date().toISOString()),
    });
  }

  return authorized;
}

export class SupabaseActivityDeliveryStore implements ActivityDeliveryStore {
  constructor(private readonly client: SupabaseClient) {}

  async ensureActiveSession(classId: string) {
    const { data: existing, error: selectError } = await this.client
      .from("sessions")
      .select("id")
      .eq("class_id", classId)
      .eq("status", "active")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (selectError) throw new Error(selectError.message);
    if (existing?.id) return String(existing.id);

    const { data, error } = await this.client
      .from("sessions")
      .insert({ class_id: classId, status: "active" })
      .select("id")
      .single();

    if (error) throw new Error(error.message);
    return String(data.id);
  }

  async listCandidates(sessionId: string) {
    const { data: candidateRows, error } = await this.client
      .from("session_activity_candidates")
      .select("id,session_id,activity_id,difficulty_band,status,source,evidence,verifier_scores,created_at")
      .eq("session_id", sessionId)
      .in("status", ["ready", "approved"])
      .order("created_at", { ascending: true });

    if (error) throw new Error(error.message);
    const rows = (candidateRows ?? []) as CandidateRow[];
    if (rows.length === 0) return [];

    const activityById = await this.loadActivities(rows.map((row) => row.activity_id));
    const bundleRefs = Array.from(activityById.values()).map((activity) => activity.bundle_ref);
    const bundleByRef = await this.loadBundles(bundleRefs);

    return rows.map((row) => {
      const activity = required(activityById.get(row.activity_id), "No se encontro la actividad candidata.");
      return candidateFromRows(row, activity, required(bundleByRef.get(activity.bundle_ref), "No se encontro el bundle."));
    });
  }

  async listStudents(classId: string) {
    const { data, error } = await this.client
      .from("students")
      .select("id,display_name")
      .eq("class_id", classId)
      .order("display_name", { ascending: true });

    if (error) throw new Error(error.message);
    return ((data ?? []) as Array<{ id: string; display_name: string }>).map((row) => ({
      id: row.id,
      displayName: row.display_name,
    }));
  }

  async updateCandidateStatuses(
    _sessionId: string,
    updates: Array<{ candidateId: string; status: CandidateStatus; approvedAt: string | null }>,
  ) {
    for (const update of updates) {
      const { error } = await this.client
        .from("session_activity_candidates")
        .update({ status: update.status, approved_at: update.approvedAt })
        .eq("id", update.candidateId)
        .eq("session_id", _sessionId);

      if (error) throw new Error(error.message);
    }
  }

  async upsertAssignments(assignments: AssignmentUpsert[]) {
    if (assignments.length === 0) return [];

    const { data, error } = await this.client
      .from("assignments")
      .upsert(assignments, { onConflict: "session_id,student_id" })
      .select("id,session_id,activity_id,student_id,variant");

    if (error) throw new Error(error.message);
    return ((data ?? []) as AssignmentRow[]).map((row) => ({
      id: row.id,
      sessionId: row.session_id,
      activityId: row.activity_id,
      studentId: row.student_id,
      variant: row.variant,
    }));
  }

  async loadLatestAssignmentForStudent(studentId: string) {
    const { data: assignment, error } = await this.client
      .from("assignments")
      .select("id,session_id,activity_id,student_id,variant,status,created_at")
      .eq("student_id", studentId)
      .is("dismissed_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!assignment) return null;

    const assignmentRow = assignment as AssignmentRow & { status: string };
    const activityById = await this.loadActivities([assignmentRow.activity_id]);
    const activity = required(activityById.get(assignmentRow.activity_id), "No se encontro la actividad asignada.");
    const manifest = parseManifest(activity.manifest);
    const bundleByRef = await this.loadBundles([activity.bundle_ref]);
    const bundle = required(bundleByRef.get(activity.bundle_ref), "No se encontro el bundle asignado.");

    return {
      id: assignmentRow.id,
      sessionId: assignmentRow.session_id,
      activityId: assignmentRow.activity_id,
      studentId: assignmentRow.student_id,
      variant: assignmentRow.variant,
      status: assignmentRow.status,
      manifest,
      bundleHtml: bundle.index_html,
    };
  }

  async dismissAssignmentForStudent(input: {
    assignmentId: string;
    studentId: string;
    dismissedAt: string;
  }) {
    const { error } = await this.client
      .from("assignments")
      .update({ dismissed_at: input.dismissedAt })
      .eq("id", input.assignmentId)
      .eq("student_id", input.studentId);

    if (error) throw new Error(error.message);
  }

  async writeEvent(input: {
    assignmentId: string;
    type: "attempt" | "hint" | "complete";
    payload: Record<string, unknown>;
  }) {
    const { error } = await this.client
      .from("events")
      .insert({
        assignment_id: input.assignmentId,
        type: input.type,
        payload: input.payload,
      });

    if (error) throw new Error(error.message);
  }

  async markAssignmentComplete(input: {
    assignmentId: string;
    score: number;
    completedAt: string;
  }) {
    const { error } = await this.client
      .from("assignments")
      .update({ status: "completed", score: input.score, completed_at: input.completedAt })
      .eq("id", input.assignmentId);

    if (error) throw new Error(error.message);
  }

  private async loadActivities(activityIds: string[]) {
    const { data, error } = await this.client
      .from("activities")
      .select("id,contract_version,manifest,bundle_ref,evidence,status,source,verifier_scores")
      .in("id", activityIds);

    if (error) throw new Error(error.message);
    return new Map(((data ?? []) as ActivityRow[]).map((row) => [row.id, row] as const));
  }

  private async loadBundles(bundleRefs: string[]) {
    const { data, error } = await this.client
      .from("activity_bundles")
      .select("ref,index_html")
      .in("ref", bundleRefs);

    if (error) throw new Error(error.message);
    return new Map(((data ?? []) as BundleRow[]).map((row) => [row.ref, row] as const));
  }

}

function requestedBandForStudent(
  studentId: string,
  overridesByBand: Partial<Record<DifficultyBand, string[]>>,
): DifficultyBand {
  if (overridesByBand.support?.includes(studentId)) return "support";
  if (overridesByBand.challenge?.includes(studentId)) return "challenge";
  return "core";
}

function sortCandidates(candidates: DeliveryCandidate[]) {
  return [...candidates].sort(
    (a, b) => orderedBands.indexOf(a.difficultyBand) - orderedBands.indexOf(b.difficultyBand),
  );
}

function parseManifest(value: unknown): ActivityManifest {
  const parsed = activityManifestSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error("La actividad asignada no cumple el contrato de manifest.");
  }

  return parsed.data;
}

function candidateFromRows(
  row: CandidateRow,
  activity: ActivityRow,
  bundle: BundleRow,
): DeliveryCandidate {
  return {
    id: row.id,
    sessionId: row.session_id,
    activityId: row.activity_id,
    difficultyBand: row.difficulty_band,
    status: row.status,
    source: row.source,
    manifest: parseManifest(activity.manifest),
    bundleRef: activity.bundle_ref,
    bundleHtml: bundle.index_html,
    evidence: row.evidence,
    verifierScores: row.verifier_scores,
  };
}


function required<T>(value: T | undefined, message: string): T {
  if (!value) throw new Error(message);
  return value;
}

interface CandidateRow {
  id: string;
  session_id: string;
  activity_id: string;
  difficulty_band: DifficultyBand;
  status: CandidateStatus;
  source: ActivitySource;
  evidence: ActivityEvidence[];
  verifier_scores: ActivityVerifierScores;
}

interface ActivityRow {
  id: string;
  manifest: unknown;
  bundle_ref: string;
  evidence: ActivityEvidence[];
  status: string;
  source: ActivitySource;
  verifier_scores: ActivityVerifierScores;
}

interface BundleRow {
  ref: string;
  index_html: string;
}

interface AssignmentRow {
  id: string;
  session_id: string;
  activity_id: string;
  student_id: string;
  variant: DifficultyBand;
}
