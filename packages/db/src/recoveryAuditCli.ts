import { main } from "./recoveryAudit.js";

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
