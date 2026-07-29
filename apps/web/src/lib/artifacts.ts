/**
 * Student artifact metadata.
 *
 * Production delivery uses schema-validated ActivityArtifact manifests plus
 * self-contained HTML rendered in the sandboxed iframe.
 */

export interface VerifiedBundleContent {
  type: "verified_bundle";
  family: string;
}
