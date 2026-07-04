import { BookOpen, GraduationCap, Radio } from "lucide-react";
import { Button } from "./components/ui/button";

export function App() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <section className="mx-auto flex min-h-screen w-full max-w-5xl flex-col justify-center px-6 py-10">
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <GraduationCap className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground">Kobi</p>
            <h1 className="text-3xl font-semibold tracking-normal">Aula lista para actividad</h1>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-md border bg-white p-5 shadow-sm">
            <Radio className="mb-4 h-5 w-5 text-primary" />
            <h2 className="font-semibold">Sesión en vivo</h2>
            <p className="mt-2 text-sm text-muted-foreground">Captura el tema de clase y prepara opciones.</p>
          </div>
          <div className="rounded-md border bg-white p-5 shadow-sm">
            <BookOpen className="mb-4 h-5 w-5 text-primary" />
            <h2 className="font-semibold">Currículo</h2>
            <p className="mt-2 text-sm text-muted-foreground">Conecta actividades con objetivos del libro.</p>
          </div>
          <div className="rounded-md border bg-white p-5 shadow-sm">
            <GraduationCap className="mb-4 h-5 w-5 text-primary" />
            <h2 className="font-semibold">Estudiantes</h2>
            <p className="mt-2 text-sm text-muted-foreground">Entrega variantes y registra resultados.</p>
          </div>
        </div>

        <div className="mt-8 flex gap-3">
          <Button>Crear clase</Button>
          <Button variant="secondary">Unirse con código</Button>
        </div>
      </section>
    </main>
  );
}
