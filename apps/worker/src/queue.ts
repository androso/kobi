import PgBoss from "pg-boss";

let boss: PgBoss | undefined;

export const JOB_TRANSCRIBE_CHUNK = "transcribe-chunk";
export const JOB_BUILD_LESSON_STATE = "build-lesson-state";
export const JOB_GENERATE_ACTIVITY_ARTIFACTS = "generate-activity-artifacts";
export const JOB_CHECKPOINT_SCHEDULER = "checkpoint-scheduler";
export const JOB_EVALUATE_CHECKPOINT = "evaluate-checkpoint";

const QUEUE_NAMES = [
  JOB_TRANSCRIBE_CHUNK,
  JOB_BUILD_LESSON_STATE,
  JOB_GENERATE_ACTIVITY_ARTIFACTS,
  JOB_CHECKPOINT_SCHEDULER,
  JOB_EVALUATE_CHECKPOINT,
];

/** Single pg-boss client for the worker process, backed by DATABASE_URL. */
export async function getQueue(): Promise<PgBoss> {
  if (!boss) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL is required for the pg-boss queue");
    }
    boss = new PgBoss(connectionString);
    await boss.start();
    // pg-boss v10 requires queues to be created before send()/work() will route
    // jobs to them; send() otherwise silently inserts nothing (no error).
    for (const name of QUEUE_NAMES) {
      await boss.createQueue(name);
    }
  }
  return boss;
}

export async function stopQueue() {
  if (!boss) return;
  await boss.stop({ graceful: true, timeout: 5000 });
  boss = undefined;
}
