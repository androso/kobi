import { LogOut } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "../../components/ui/button";
import { useAuthStore } from "../../lib/store";

export function StudentDashboard() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);

  const studentName = user?.studentName || "Ana";
  const className = user?.className ?? "Clase Kobi";
  const joinCode = user?.joinCode;

  function handleLogout() {
    logout();
    navigate("/");
  }

  return (
    <main className="min-h-screen bg-[#eef5fb] px-6 py-8 text-foreground">
      <div className="mx-auto max-w-4xl">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-primary">Panel estudiante</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-normal text-[#0f4f9e]">Hola, {studentName}</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {className}
              {joinCode ? <span className="ml-2 font-semibold text-[#1077e5]">Codigo {joinCode}</span> : null}
            </p>
          </div>
          <Button onClick={handleLogout} type="button" variant="secondary">
            <LogOut className="mr-2 h-4 w-4" />
            Salir
          </Button>
        </header>

        <section className="rounded-xl bg-white p-6 shadow-sm">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-sky-50 text-[#1077e5]">
            <svg
              className="h-6 w-6"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-[#0f4f9e]">Actividad lista</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Lee cada oracion y elige la palabra que completa mejor el sentido. Puedes pedir una pista si te quedas atascado.
          </p>
          <div className="mt-6 rounded-xl border border-slate-200 p-4">
            <p className="text-sm font-medium text-slate-500">Pregunta 1</p>
            <p className="mt-2 text-lg text-[#0f4f9e]">El periodista redacto la ___ antes del mediodia.</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {["noticia", "novela", "receta"].map((option) => (
                <button className="rounded-xl border border-slate-200 px-4 py-3 text-sm hover:bg-sky-50" key={option}>
                  {option}
                </button>
              ))}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
