import { supabase } from "./supabase";

const API_URL = import.meta.env.VITE_KOBI_API_URL?.replace(/\/$/, "") ?? "";

export type CurriculumSourceStatus =
  | "pending_upload"
  | "uploaded"
  | "processing"
  | "cleanup_pending"
  | "ready"
  | "failed"
  | "superseded";

export interface CurriculumLibrarySource {
  id: string;
  originalFilename: string;
  sizeBytes: number;
  status: CurriculumSourceStatus;
  errorMessage: string | null;
  grade: number;
  subject: string;
  unit: string;
  pageCount: number | null;
  chunksBuilt: number | null;
  storageDeletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  isOwner: boolean;
  selected: boolean;
}

export interface CurriculumLibraryResponse {
  classContext: { id: string; grade: number; subject: string; unit: string };
  selectedSourceIds: string[];
  sources: CurriculumLibrarySource[];
}

interface SignedUploadResponse {
  sourceId: string;
  bucket: string;
  upload: { path: string; token: string };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  if (!API_URL) throw new Error("Configura VITE_KOBI_API_URL para administrar materiales.");
  const session = await supabase?.auth.getSession();
  const token = session?.data.session?.access_token;
  if (!token) throw new Error("Tu sesion expiro. Inicia sesion nuevamente.");

  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
      ...init?.headers,
    },
  });
  const body = (await response.json().catch(() => null)) as
    | T
    | { error?: { code?: string } | string }
    | null;
  if (!response.ok) {
    const apiError =
      body && typeof body === "object" && "error" in body
        ? (body as { error?: { code?: string } | string }).error
        : null;
    const code = typeof apiError === "string" ? apiError : apiError?.code;
    throw new Error(code ?? `La solicitud fallo (${response.status}).`);
  }
  return body as T;
}

export const curriculumApi = {
  library: (classId: string) =>
    request<CurriculumLibraryResponse>(`/api/classes/${classId}/curriculum/library`),

  replaceSelections: (classId: string, sourceIds: string[]) =>
    request<{ classId: string; selectedSourceIds: string[] }>(
      `/api/classes/${classId}/curriculum/selections`,
      { method: "PUT", body: JSON.stringify({ sourceIds }) },
    ),

  uploadPdf: async (classId: string, file: File, pageCount: number) => {
    if (!supabase) throw new Error("Supabase no esta configurado.");
    const signed = await request<SignedUploadResponse>(
      `/api/classes/${classId}/curriculum/uploads`,
      {
        method: "POST",
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type || "application/pdf",
          sizeBytes: file.size,
          pageCount,
        }),
      },
    );

    const { error } = await supabase.storage
      .from(signed.bucket)
      .uploadToSignedUrl(signed.upload.path, signed.upload.token, file, {
        contentType: file.type || "application/pdf",
      });
    if (error) throw new Error(error.message);

    await request(`/api/classes/${classId}/curriculum/uploads/complete`, {
      method: "POST",
      body: JSON.stringify({ sourceId: signed.sourceId }),
    });
    return signed.sourceId;
  },
};
