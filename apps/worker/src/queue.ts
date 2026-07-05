import PgBoss from "pg-boss";

let boss: PgBoss | undefined;

/** Single pg-boss client for the worker process, backed by DATABASE_URL. */
export async function getQueue(): Promise<PgBoss> {
  if (!boss) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL is required for the pg-boss queue");
    }
    boss = new PgBoss(connectionString);
    await boss.start();
  }
  return boss;
}

export const JOB_TRANSCRIBE_CHUNK = "transcribe-chunk";
export const JOB_BUILD_LESSON_STATE = "build-lesson-state";
export const JOB_GENERATE_ACTIVITY_ARTIFACTS = "generate-activity-artifacts";
