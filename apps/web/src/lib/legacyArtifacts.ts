export function isLegacyArtifactDemoEnabled() {
  return import.meta.env.MODE === "test" || import.meta.env.DEV || import.meta.env.VITE_KOBI_PROJECT_MODE === "demo";
}
