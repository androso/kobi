import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "./App";
import { useAuthStore, useClassStore } from "./lib/store";
import { MemoryRouter } from "react-router-dom";
import { vi } from "vitest";

vi.mock("./lib/supabase", () => ({ supabase: null }));

describe("App", () => {
  beforeEach(() => {
    useAuthStore.setState({
      status: "unauthenticated",
      user: null,
      loginTeacher: async (email) => {
        useAuthStore.setState({ status: "authenticated", user: { role: "teacher", email, id: "teacher-1", displayName: "Sra. Henderson" } });
        return {};
      },
      signupTeacher: async (email) => {
        useAuthStore.setState({ status: "authenticated", user: { role: "teacher", email, id: "teacher-1", displayName: "Sra. Henderson" } });
        return {};
      },
      loginStudent: async (code, studentName) => {
        if (code !== "KOBI7") return { error: "No encontramos una clase con ese codigo." };
        useAuthStore.setState({
          status: "authenticated",
          user: {
            role: "student",
            studentName,
            studentId: "student-1",
            studentAccessToken: "student-token-1",
            classId: "class-1",
            className: "Ciencia 4to - Sección A",
            joinCode: "KOBI7",
          },
        });
        return {};
      },
      logout: async () => {
        useAuthStore.setState({ status: "unauthenticated", user: null });
      },
    });
    useClassStore.getState().resetClasses();
    useClassStore.setState({
      sessions: [],
      loadTeacherClasses: async () => {},
      addClass: async (newClass) => {
        const createdClass = {
          id: "class-created",
          title: newClass.title,
          joinCode: "HIST6",
          focus: newClass.unit,
          students: "0 estudiantes activos",
          studentCount: 0,
          topics: [newClass.unit],
          accent: "text-slate-700",
          tone: "from-slate-600 to-zinc-500",
          icon: "pen" as const,
        };

        useClassStore.setState((state) => ({ classes: [createdClass, ...state.classes] }));
        return { classItem: createdClass };
      },
    });
  });

  function renderApp(initialRoute = "/") {
    return render(
      <MemoryRouter initialEntries={[initialRoute]}>
        <App />
      </MemoryRouter>
    );
  }

  it("renders the teacher login surface", () => {
    renderApp();

    expect(screen.getByRole("heading", { name: /iniciar sesi[oó]n/i })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/correo electr[oó]nico/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /entrar/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /olvidaste tu contrase/i })).not.toBeInTheDocument();
  });

  it("keeps focused login fields on a dark surface in dark mode", async () => {
    const user = userEvent.setup();
    renderApp();

    const passwordInput = screen.getByPlaceholderText(/^contrase[nñ]a$/i);
    const inputShell = passwordInput.parentElement;

    expect(inputShell).toHaveClass(
      "dark:focus-within:border-sky-400",
      "dark:focus-within:bg-slate-800",
      "dark:focus-within:ring-sky-400/25",
    );

    await user.click(passwordInput);
    expect(passwordInput).toHaveFocus();
  });

  it("shows empty login fields as accessible errors", async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole("button", { name: /^entrar$/i }));

    const emailInput = screen.getByPlaceholderText(/correo electr[oó]nico/i);
    const passwordInput = screen.getByPlaceholderText(/^contrase[nñ]a$/i);
    const emailError = screen.getByText(/ingresa tu correo electr[oó]nico/i);
    const passwordError = screen.getByText(/ingresa tu contrase[nñ]a/i);

    expect(emailInput).toHaveAttribute("aria-invalid", "true");
    expect(emailInput).toHaveAttribute("aria-describedby", "login-email-error");
    expect(emailInput.parentElement).toHaveClass("border-red-500", "dark:border-red-400");
    expect(emailError).toHaveClass("text-red-600", "dark:text-red-300");

    expect(passwordInput).toHaveAttribute("aria-invalid", "true");
    expect(passwordInput).toHaveAttribute("aria-describedby", "login-password-error");
    expect(passwordInput.parentElement).toHaveClass("border-red-500", "dark:border-red-400");
    expect(passwordError).toHaveClass("text-red-600", "dark:text-red-300");
  });

  it("switches to the student join form", async () => {
    const user = userEvent.setup();

    renderApp();
    await user.click(screen.getByRole("button", { name: /estudiante/i }));

    expect(screen.getByPlaceholderText(/c[oó]digo de clase/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/nombre/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /entrar a clase/i })).toBeInTheDocument();
  });

  it("toggles password visibility", async () => {
    const user = userEvent.setup();

    renderApp();

    const passwordInput = screen.getByPlaceholderText(/^contrase[nñ]a$/i);
    expect(passwordInput).toHaveAttribute("type", "password");

    await user.click(screen.getByRole("button", { name: /mostrar contrase[nñ]a/i }));

    expect(passwordInput).toHaveAttribute("type", "text");
  });

  it("logs into the teacher dashboard with Supabase credentials", async () => {
    const user = userEvent.setup();

    renderApp();
    await user.type(screen.getByPlaceholderText(/correo electr[oó]nico/i), "maestra@kobi.test");
    await user.type(screen.getByPlaceholderText(/^contrase[nñ]a$/i), "securepass");
    await user.click(screen.getByRole("button", { name: /^entrar$/i }));

    expect(screen.getByRole("heading", { name: /bienvenido\(a\) de nuevo, sra\. henderson/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /tus clases/i })).toBeInTheDocument();
  });

  it("preserves the teacher brand mark colors in dark mode", async () => {
    const user = userEvent.setup();
    renderApp();

    await user.type(screen.getByPlaceholderText(/correo electr[oó]nico/i), "maestra@kobi.test");
    await user.type(screen.getByPlaceholderText(/^contrase[nñ]a$/i), "securepass");
    await user.click(screen.getByRole("button", { name: /^entrar$/i }));

    const brandHeading = screen.getByRole("heading", { name: "Kobi Labs" });
    const brandMark = brandHeading.parentElement?.previousElementSibling;

    expect(brandMark).toHaveClass("teacher-brand-mark");
    expect(brandMark?.querySelector("svg")).toHaveClass("teacher-brand-mascot");
  });

  it("switches store-backed classes between grid and list layouts", async () => {
    const user = userEvent.setup();
    useClassStore.setState({
      classes: [
        {
          id: "class-store-1",
          title: "Lenguaje 7mo",
          joinCode: "LENG7",
          focus: "Comprensión lectora",
          students: "18 estudiantes activos",
          studentCount: 18,
          topics: ["Ideas principales"],
          accent: "text-violet-700",
          tone: "from-violet-600 to-purple-500",
          icon: "book",
        },
        {
          id: "class-store-2",
          title: "Ciencias 6to",
          joinCode: "CIEN6",
          focus: "El sistema solar",
          students: "20 estudiantes activos",
          studentCount: 20,
          topics: ["Planetas"],
          accent: "text-emerald-700",
          tone: "from-emerald-600 to-teal-500",
          icon: "leaf",
        },
      ],
    });

    renderApp();
    await user.type(screen.getByPlaceholderText(/correo electr[oó]nico/i), "maestra@kobi.test");
    await user.type(screen.getByPlaceholderText(/^contrase[nñ]a$/i), "securepass");
    await user.click(screen.getByRole("button", { name: /^entrar$/i }));

    const gridButton = screen.getByRole("button", { name: /cuadrícula/i });
    const listButton = screen.getByRole("button", { name: /lista/i });
    const classList = screen.getByRole("list", { name: /clases/i });

    expect(gridButton).toHaveAttribute("aria-pressed", "true");
    expect(listButton).toHaveAttribute("aria-pressed", "false");
    expect(classList).toHaveClass("md:grid-cols-2", "lg:grid-cols-3");
    expect(within(classList).getByText("Lenguaje 7mo")).toBeInTheDocument();
    expect(within(classList).getByText("Ciencias 6to")).toBeInTheDocument();

    await user.click(listButton);

    expect(gridButton).toHaveAttribute("aria-pressed", "false");
    expect(listButton).toHaveAttribute("aria-pressed", "true");
    expect(classList).toHaveClass("grid-cols-1");
    expect(classList).not.toHaveClass("md:grid-cols-2", "lg:grid-cols-3");
    expect(within(classList).getAllByRole("listitem")[0]).toHaveClass("md:grid-cols-[16rem_minmax(0,1fr)]");
  });

  it("signs up a teacher and opens the dashboard when Supabase returns a session", async () => {
    const user = userEvent.setup();

    renderApp();
    await user.click(screen.getByRole("button", { name: /reg[ií]strate/i }));
    await user.type(screen.getByPlaceholderText(/correo electr[oó]nico/i), "nueva@kobi.test");
    await user.type(screen.getByPlaceholderText(/^contrase[nñ]a$/i), "securepass");
    await user.type(screen.getByPlaceholderText(/confirmar contrase[nñ]a/i), "securepass");
    await user.click(screen.getByRole("button", { name: /^crear cuenta$/i }));

    expect(screen.getByRole("heading", { name: /bienvenido\(a\) de nuevo, sra\. henderson/i })).toBeInTheDocument();
  });

  it("shows the Supabase confirmation error when teacher signup does not return a session", async () => {
    const user = userEvent.setup();
    useAuthStore.setState({
      signupTeacher: async () => ({ error: "No se pudo iniciar sesion despues de crear la cuenta. Desactiva la confirmacion por correo en Supabase Auth." }),
    });

    renderApp();
    await user.click(screen.getByRole("button", { name: /reg[ií]strate/i }));
    await user.type(screen.getByPlaceholderText(/correo electr[oó]nico/i), "nueva@kobi.test");
    await user.type(screen.getByPlaceholderText(/^contrase[nñ]a$/i), "securepass");
    await user.type(screen.getByPlaceholderText(/confirmar contrase[nñ]a/i), "securepass");
    await user.click(screen.getByRole("button", { name: /^crear cuenta$/i }));

    expect(screen.getByText(/desactiva la confirmacion por correo/i)).toBeInTheDocument();
  });

  it("joins the student dashboard without silently loading demo quiz artifacts", async () => {
    const user = userEvent.setup();

    renderApp();
    await user.click(screen.getByRole("button", { name: /estudiante/i }));
    await user.type(screen.getByPlaceholderText(/c[oó]digo de clase/i), "KOBI7");
    await user.type(screen.getByPlaceholderText(/nombre/i), "Ana");
    await user.click(screen.getByRole("button", { name: /entrar a clase/i }));

    expect(await screen.findByText(/no tienes actividades asignadas todav/i)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /vocabulario en contexto: la noticia/i })).not.toBeInTheDocument();

    expect(screen.queryByRole("link", { name: /progreso/i })).not.toBeInTheDocument();
  });

  it("shows an error when a student uses an invalid classroom code", async () => {
    const user = userEvent.setup();

    renderApp();
    await user.click(screen.getByRole("button", { name: /estudiante/i }));
    await user.type(screen.getByPlaceholderText(/c[oó]digo de clase/i), "MALO1");
    await user.type(screen.getByPlaceholderText(/nombre/i), "Ana");
    await user.click(screen.getByRole("button", { name: /entrar a clase/i }));

    expect(screen.getByText(/no encontramos una clase con ese codigo/i)).toBeInTheDocument();
  });

  it("clears login fields after logout", async () => {
    const user = userEvent.setup();

    renderApp();
    await user.type(screen.getByPlaceholderText(/correo electr[oó]nico/i), "maestra@kobi.test");
    await user.type(screen.getByPlaceholderText(/^contrase[nñ]a$/i), "securepass");
    await user.click(screen.getByRole("button", { name: /^entrar$/i }));
    await user.click(screen.getByRole("button", { name: /salir/i }));

    expect(screen.getByPlaceholderText(/correo electr[oó]nico/i)).toHaveValue("");
    expect(screen.getByPlaceholderText(/^contrase[nñ]a$/i)).toHaveValue("");
  });

  it("shows the Supabase error after a failed teacher login", async () => {
    const user = userEvent.setup();
    useAuthStore.setState({
      loginTeacher: async () => ({ error: "Invalid login credentials" }),
    });

    renderApp();
    await user.type(screen.getByPlaceholderText(/correo electr[oó]nico/i), "wrong@example.com");
    await user.type(screen.getByPlaceholderText(/^contrase[nñ]a$/i), "wrongpass");
    await user.click(screen.getByRole("button", { name: /^entrar$/i }));

    expect(screen.getByText(/invalid login credentials/i)).toBeInTheDocument();
  });

  it("creates a new class using the class creation modal", async () => {
    const user = userEvent.setup();

    renderApp();
    
    // Login
    await user.type(screen.getByPlaceholderText(/correo electr[oó]nico/i), "maestra@kobi.test");
    await user.type(screen.getByPlaceholderText(/^contrase[nñ]a$/i), "securepass");
    await user.click(screen.getByRole("button", { name: /^entrar$/i }));

    // Verify initial classes
    expect(screen.getByText("Ciencia 4to - Sección A")).toBeInTheDocument();

    // Click on add class button
    await user.click(screen.getByRole("button", { name: /^nueva clase$/i }));

    // Verify modal is open
    expect(screen.getByRole("heading", { name: /hagamos que el aprendizaje fluya/i })).toBeInTheDocument();

    // Fill form
    await user.type(screen.getByLabelText(/nombre de la clase/i), "Historia 6to");
    await user.type(screen.getByLabelText(/unidad o tema principal/i), "Prehistoria");
    await user.clear(screen.getByLabelText(/grado/i));
    await user.type(screen.getByLabelText(/grado/i), "6");
    
    // Submit
    await user.click(screen.getByRole("button", { name: /crear clase/i }));

    // Verify modal is closed
    expect(screen.queryByRole("heading", { name: /crear nueva clase/i })).not.toBeInTheDocument();

    // Verify new class card is rendered
    expect(screen.getByText("Historia 6to")).toBeInTheDocument();
    expect(screen.getByText(/codigo hist6/i)).toBeInTheDocument();
    expect(screen.getAllByText("Prehistoria")[0]).toBeInTheDocument();
  });

  it("opens a classroom code share modal from a class card", async () => {
    const user = userEvent.setup();

    renderApp();
    await user.type(screen.getByPlaceholderText(/correo electr[oó]nico/i), "maestra@kobi.test");
    await user.type(screen.getByPlaceholderText(/^contrase[nñ]a$/i), "securepass");
    await user.click(screen.getByRole("button", { name: /^entrar$/i }));

    await user.click(screen.getAllByRole("button", { name: /compartir/i })[0]);

    const dialog = screen.getByText(/compartir clase/i).closest("div");
    expect(dialog).not.toBeNull();
    expect(within(dialog as HTMLElement).getByRole("heading", { name: /ciencia 4to - sección a/i })).toBeInTheDocument();
    expect(within(dialog as HTMLElement).getByText(/codigo de clase/i)).toBeInTheDocument();
    expect(within(dialog as HTMLElement).getByText("KOBI7")).toBeInTheDocument();
    expect(within(dialog as HTMLElement).getByRole("button", { name: /copiar invitacion/i })).toBeInTheDocument();
  });

  it("does not expose unwired teacher navigation or fabricated dashboard summaries", async () => {
    const user = userEvent.setup();
    useClassStore.setState({
      sessions: [
        {
          id: "session-real",
          classId: "class-1",
          subject: "CIENCIAS",
          subjectColor: "text-emerald-700",
          dotColor: "bg-emerald-500",
          title: "Ciencia 4to - Sección A",
          focus: "Ecosistemas",
          date: "10 de julio de 2026",
          duration: "15:00",
          summaryPoints: ["Resumen real"],
          nextSteps: [],
          transcript: [],
        },
      ],
    });

    renderApp();
    await user.type(screen.getByPlaceholderText(/correo electr[oó]nico/i), "maestra@kobi.test");
    await user.type(screen.getByPlaceholderText(/^contrase[nñ]a$/i), "securepass");
    await user.click(screen.getByRole("button", { name: /^entrar$/i }));

    expect(screen.queryByRole("button", { name: /^anal[ií]ticas$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /actividades recientes/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^soporte$/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/participación semanal subió/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/próxima sesión/i)).not.toBeInTheDocument();
  });

  it("navigates to the previous classes section and opens the summary modal", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>
    );

    // Login as teacher
    await user.type(screen.getByPlaceholderText("Correo electrónico"), "maestra@kobi.test");
    await user.type(screen.getByPlaceholderText("Contraseña"), "securepass");
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    // Click on "Clases anteriores" in the sidebar
    const sidebarLink = screen.getByRole("button", { name: /clases anteriores/i });
    expect(sidebarLink).toBeInTheDocument();
    await user.click(sidebarLink);

    // Verify we are on the Historial de Clases page
    expect(screen.getByText("Historial de Sesiones")).toBeInTheDocument();
    expect(screen.getAllByText("Ciencias 4to Grado - Sección A")[0]).toBeInTheDocument();
    expect(screen.queryByText(/participación promedio/i)).not.toBeInTheDocument();
    expect(screen.queryByText("64%")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /filtrar por fecha/i })).not.toBeInTheDocument();

    // Click on "Ver detalles" button of the first session
    const detailsButtons = screen.getAllByRole("button", { name: /ver detalles/i });
    await user.click(detailsButtons[0]);

    // Verify unified details modal opens with its contents
    expect(screen.getByText("Detalles de la Clase")).toBeInTheDocument();
    expect(screen.getByText(/Se discutieron los niveles tróficos/i)).toBeInTheDocument();
    expect(screen.getAllByText("Carlos M.:")[0]).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /reproducir/i })).not.toBeInTheDocument();

    // Close modal
    await user.click(screen.getByRole("button", { name: /entendido/i }));
    expect(screen.queryByText("Detalles de la Clase")).not.toBeInTheDocument();
  });

  it("opens the teacher help center from the sidebar", async () => {
    const user = userEvent.setup();

    renderApp();
    await user.type(screen.getByPlaceholderText(/^correo electr[oó]nico$/i), "maestra@kobi.test");
    await user.type(screen.getByPlaceholderText(/^contrase[nñ]a$/i), "securepass");
    await user.click(screen.getByRole("button", { name: /^entrar$/i }));

    await user.click(screen.getByRole("button", { name: /ayuda/i }));

    expect(screen.getByRole("heading", { name: /^kobi$/i })).toBeInTheDocument();
    expect(screen.getByText(/atajos para crear clases, revisar estado y preparar la siguiente sesión/i)).toBeInTheDocument();
  });

  it("filters help topics and opens the relevant teacher section", async () => {
    const user = userEvent.setup();

    renderApp();
    await user.type(screen.getByPlaceholderText(/correo electr[oó]nico/i), "maestra@kobi.test");
    await user.type(screen.getByPlaceholderText(/^contrase[nñ]a$/i), "securepass");
    await user.click(screen.getByRole("button", { name: /^entrar$/i }));
    await user.click(screen.getByRole("button", { name: /ayuda/i }));

    const search = screen.getByLabelText(/buscar ayuda/i);
    await user.clear(search);
    await user.type(search, "monitoreo");

    expect(screen.getByRole("button", { name: /ver monitoreo en vivo/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /crear una clase/i })).not.toBeInTheDocument();

    await user.click(screen.getAllByRole("button", { name: /ir al monitoreo/i })[0]);
    expect(screen.getByRole("heading", { name: /monitoreo en vivo/i })).toBeInTheDocument();
  });
});
