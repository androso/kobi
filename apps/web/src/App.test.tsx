import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "./App";
import { useAuthStore, useClassStore } from "./lib/store";
import { MemoryRouter } from "react-router-dom";

describe("App", () => {
  beforeEach(() => {
    useAuthStore.setState({
      status: "unauthenticated",
      user: null,
      loginTeacher: async (email) => {
        useAuthStore.setState({ status: "authenticated", user: { role: "teacher", email, id: "teacher-1" } });
        return {};
      },
      signupTeacher: async (email) => {
        useAuthStore.setState({ status: "authenticated", user: { role: "teacher", email, id: "teacher-1" } });
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

    expect(screen.getByRole("heading", { name: /iniciar sesion/i })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/correo electronico/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /entrar/i })).toBeInTheDocument();
  });

  it("switches to the student join form", async () => {
    const user = userEvent.setup();

    renderApp();
    await user.click(screen.getByRole("button", { name: /estudiante/i }));

    expect(screen.getByPlaceholderText(/codigo de clase/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/nombre/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /entrar a clase/i })).toBeInTheDocument();
  });

  it("toggles password visibility", async () => {
    const user = userEvent.setup();

    renderApp();

    const passwordInput = screen.getByPlaceholderText(/contrasena/i);
    expect(passwordInput).toHaveAttribute("type", "password");

    await user.click(screen.getByRole("button", { name: /mostrar contrasena/i }));

    expect(passwordInput).toHaveAttribute("type", "text");
  });

  it("logs into the teacher dashboard with Supabase credentials", async () => {
    const user = userEvent.setup();

    renderApp();
    await user.type(screen.getByPlaceholderText(/correo electronico/i), "maestra@kobi.test");
    await user.type(screen.getByPlaceholderText(/contrasena/i), "securepass");
    await user.click(screen.getByRole("button", { name: /^entrar$/i }));

    expect(screen.getByRole("heading", { name: /bienvenida de nuevo, sra\. henderson/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /tus clases/i })).toBeInTheDocument();
  });

  it("signs up a teacher and opens the dashboard when Supabase returns a session", async () => {
    const user = userEvent.setup();

    renderApp();
    await user.click(screen.getByRole("button", { name: /crear cuenta/i }));
    await user.type(screen.getByPlaceholderText(/correo electronico/i), "nueva@kobi.test");
    await user.type(screen.getByPlaceholderText(/contrasena/i), "securepass");
    await user.click(screen.getAllByRole("button", { name: /^crear cuenta$/i })[1]);

    expect(screen.getByRole("heading", { name: /bienvenida de nuevo, sra\. henderson/i })).toBeInTheDocument();
  });

  it("shows the Supabase confirmation error when teacher signup does not return a session", async () => {
    const user = userEvent.setup();
    useAuthStore.setState({
      signupTeacher: async () => ({ error: "No se pudo iniciar sesion despues de crear la cuenta. Desactiva la confirmacion por correo en Supabase Auth." }),
    });

    renderApp();
    await user.click(screen.getByRole("button", { name: /crear cuenta/i }));
    await user.type(screen.getByPlaceholderText(/correo electronico/i), "nueva@kobi.test");
    await user.type(screen.getByPlaceholderText(/contrasena/i), "securepass");
    await user.click(screen.getAllByRole("button", { name: /^crear cuenta$/i })[1]);

    expect(screen.getByText(/desactiva la confirmacion por correo/i)).toBeInTheDocument();
  });

  it("joins the student dashboard with a classroom code", async () => {
    const user = userEvent.setup();

    renderApp();
    await user.click(screen.getByRole("button", { name: /estudiante/i }));
    await user.type(screen.getByPlaceholderText(/codigo de clase/i), "KOBI7");
    await user.type(screen.getByPlaceholderText(/nombre/i), "Ana");
    await user.click(screen.getByRole("button", { name: /entrar a clase/i }));

    expect(screen.getByRole("heading", { name: /hola, ana/i })).toBeInTheDocument();
    expect(screen.getByText(/ciencia 4to - sección a/i)).toBeInTheDocument();
    expect(screen.getByText(/actividad lista/i)).toBeInTheDocument();
  });

  it("shows an error when a student uses an invalid classroom code", async () => {
    const user = userEvent.setup();

    renderApp();
    await user.click(screen.getByRole("button", { name: /estudiante/i }));
    await user.type(screen.getByPlaceholderText(/codigo de clase/i), "MALO1");
    await user.type(screen.getByPlaceholderText(/nombre/i), "Ana");
    await user.click(screen.getByRole("button", { name: /entrar a clase/i }));

    expect(screen.getByText(/no encontramos una clase con ese codigo/i)).toBeInTheDocument();
  });

  it("clears login fields after logout", async () => {
    const user = userEvent.setup();

    renderApp();
    await user.type(screen.getByPlaceholderText(/correo electronico/i), "maestra@kobi.test");
    await user.type(screen.getByPlaceholderText(/contrasena/i), "securepass");
    await user.click(screen.getByRole("button", { name: /^entrar$/i }));
    await user.click(screen.getByRole("button", { name: /salir/i }));

    expect(screen.getByPlaceholderText(/correo electronico/i)).toHaveValue("");
    expect(screen.getByPlaceholderText(/contrasena/i)).toHaveValue("");
  });

  it("shows the Supabase error after a failed teacher login", async () => {
    const user = userEvent.setup();
    useAuthStore.setState({
      loginTeacher: async () => ({ error: "Invalid login credentials" }),
    });

    renderApp();
    await user.type(screen.getByPlaceholderText(/correo electronico/i), "wrong@example.com");
    await user.type(screen.getByPlaceholderText(/contrasena/i), "wrongpass");
    await user.click(screen.getByRole("button", { name: /^entrar$/i }));

    expect(screen.getByText(/invalid login credentials/i)).toBeInTheDocument();
  });

  it("creates a new class using the class creation modal", async () => {
    const user = userEvent.setup();

    renderApp();
    
    // Login
    await user.type(screen.getByPlaceholderText(/correo electronico/i), "maestra@kobi.test");
    await user.type(screen.getByPlaceholderText(/contrasena/i), "securepass");
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
    await user.type(screen.getByPlaceholderText(/correo electronico/i), "maestra@kobi.test");
    await user.type(screen.getByPlaceholderText(/contrasena/i), "securepass");
    await user.click(screen.getByRole("button", { name: /^entrar$/i }));

    await user.click(screen.getAllByRole("button", { name: /compartir/i })[0]);

    expect(screen.getByRole("heading", { name: /ciencia 4to - sección a/i })).toBeInTheDocument();
    expect(screen.getByText(/codigo de clase/i)).toBeInTheDocument();
    expect(screen.getByText("KOBI7")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /copiar invitacion/i })).toBeInTheDocument();
  });

  it("navigates to the previous classes section and opens the summary modal", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>
    );

    // Login as teacher
    await user.type(screen.getByPlaceholderText("Correo electronico"), "maestra@kobi.test");
    await user.type(screen.getByPlaceholderText("Contrasena"), "securepass");
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    // Click on "Clases anteriores" in the sidebar
    const sidebarLink = screen.getByRole("button", { name: /clases anteriores/i });
    expect(sidebarLink).toBeInTheDocument();
    await user.click(sidebarLink);

    // Verify we are on the Historial de Clases page
    expect(screen.getByText("Historial de Sesiones")).toBeInTheDocument();
    expect(screen.getByText("Ciencias 4to Grado - Sección A")).toBeInTheDocument();

    // Click on "Ver detalles" button of the first session
    const detailsButtons = screen.getAllByRole("button", { name: /ver detalles/i });
    await user.click(detailsButtons[0]);

    // Verify unified details modal opens with its contents
    expect(screen.getByText("Detalles de la Clase")).toBeInTheDocument();
    expect(screen.getByText(/Se discutieron los niveles tróficos/i)).toBeInTheDocument();
    expect(screen.getAllByText("Carlos M.:")[0]).toBeInTheDocument();

    // Close modal
    await user.click(screen.getByRole("button", { name: /entendido/i }));
    expect(screen.queryByText("Detalles de la Clase")).not.toBeInTheDocument();
  });

  it("opens the teacher help center from the sidebar", async () => {
    const user = userEvent.setup();

    renderApp();
    await user.type(screen.getByPlaceholderText(/correo electronico/i), "maestra@kobi.test");
    await user.type(screen.getByPlaceholderText(/contrasena/i), "securepass");
    await user.click(screen.getByRole("button", { name: /^entrar$/i }));

    await user.click(screen.getByRole("button", { name: /ayuda/i }));

    expect(screen.getByRole("heading", { name: /^kobi$/i })).toBeInTheDocument();
    expect(screen.getByText(/atajos para crear clases, revisar estado y preparar la siguiente sesión/i)).toBeInTheDocument();
  });

  it("filters help topics and opens the relevant teacher section", async () => {
    const user = userEvent.setup();

    renderApp();
    await user.type(screen.getByPlaceholderText(/correo electronico/i), "maestra@kobi.test");
    await user.type(screen.getByPlaceholderText(/contrasena/i), "securepass");
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
