import {
  buildActivitySessionContext,
  createActivityArtifactCandidates,
  verifyActivityArtifact,
} from "@kobi/activities";
import { staticActivityContext } from "./staticActivityContext.js";

const sessionContext = buildActivitySessionContext([staticActivityContext.lessonState]);
const candidates = createActivityArtifactCandidates({
  lessonState: staticActivityContext.lessonState,
  sessionContext,
  curriculumMatches: staticActivityContext.curriculumMatches,
});

const summary = candidates.map((candidate) => {
  const result = verifyActivityArtifact(candidate);
  return {
    band: candidate.manifest.difficulty_band,
    title: candidate.manifest.title,
    bundle_ref: candidate.bundle_ref,
    ok: result.ok,
    errors: result.errors,
  };
});

console.log(JSON.stringify(summary, null, 2));
