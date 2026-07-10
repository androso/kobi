import { supabase } from "./supabase";

const API_URL = import.meta.env.VITE_KOBI_API_URL?.replace(/\/$/, "") || (import.meta.env.DEV ? "http://localhost:8787" : "");

export interface RosterStudent { id: string; class_id: string; display_name: string; username: string; is_active: boolean; activated_at: string | null; joined_at: string }

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const sessionResult = await supabase?.auth.getSession();
  const token = sessionResult?.data.session?.access_token;
  if (!token) throw new Error("Tu sesión expiró. Vuelve a iniciar sesión.");
  const response = await fetch(`${API_URL}${path}`, { ...init, headers: { "content-type": "application/json", authorization: `Bearer ${token}`, ...init?.headers } });
  const body = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? "No se pudo actualizar la lista.");
  return body;
}

export const rosterApi = {
  list: (classId: string) => request<{ students: RosterStudent[] }>(`/api/classes/${classId}/students`),
  create: (classId: string, displayName: string, password: string) => request<{ student: RosterStudent }>(`/api/classes/${classId}/students`, { method: "POST", body: JSON.stringify({ displayName, password }) }),
  resetPassword: (classId: string, id: string, password: string) => request<{ ok: true }>(`/api/classes/${classId}/students/${id}/password`, { method: "POST", body: JSON.stringify({ password }) }),
  setActive: (classId: string, id: string, active: boolean) => request<{ ok: true }>(`/api/classes/${classId}/students/${id}/${active ? "reactivate" : "deactivate"}`, { method: "POST" }),
};
