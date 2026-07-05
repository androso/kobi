import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "./App";
import { useAuthStore, useClassStore } from "./lib/store";
import { MemoryRouter } from "react-router-dom";

describe("App", () => {
  beforeEach(() => {
    useAuthStore.setState({ user: null });
    useClassStore.getState().resetClasses();
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

  it("logs into the teacher dashboard with demo credentials", async () => {
    const user = userEvent.setup();

    renderApp();
    await user.type(screen.getByPlaceholderText(/correo electronico/i), "maestra@kobi.demo");
    await user.type(screen.getByPlaceholderText(/contrasena/i), "kobi123");
    await user.click(screen.getByRole("button", { name: /^entrar$/i }));

    expect(screen.getByRole("heading", { name: /bienvenida de nuevo, sra\. henderson/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /tus clases/i })).toBeInTheDocument();
  });

  it("logs into the student dashboard with the demo class code", async () => {
    const user = userEvent.setup();

    renderApp();
    await user.click(screen.getByRole("button", { name: /estudiante/i }));
    await user.type(screen.getByPlaceholderText(/codigo de clase/i), "KOBI7");
    await user.type(screen.getByPlaceholderText(/nombre/i), "Ana");
    await user.click(screen.getByRole("button", { name: /entrar a clase/i }));

    // Lesson list + first quiz question render for the seeded KOBI7 class.
    expect(screen.getByRole("heading", { name: /vocabulario en contexto: la noticia/i })).toBeInTheDocument();
    expect(screen.getByText(/pregunta 1 de 3/i)).toBeInTheDocument();

    // Answer all three questions correctly, advancing through the quiz.
    await user.click(screen.getByRole("button", { name: /^noticia$/i }));
    await user.click(screen.getByRole("button", { name: /siguiente/i }));
    await user.click(screen.getByRole("button", { name: /^la entradilla$/i }));
    await user.click(screen.getByRole("button", { name: /siguiente/i }));
    await user.click(screen.getByRole("button", { name: /^qué pasó$/i }));
    await user.click(screen.getByRole("button", { name: /entregar/i }));

    expect(screen.getByText(/respuesta correcta en todas/i)).toBeInTheDocument();
    expect(screen.getByText(/obtuviste 3 de 3/i)).toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: /progreso/i }));
    expect(screen.getByRole("heading", { name: /progreso/i })).toBeInTheDocument();
  });

  it("clears login fields after logout", async () => {
    const user = userEvent.setup();

    renderApp();
    await user.type(screen.getByPlaceholderText(/correo electronico/i), "maestra@kobi.demo");
    await user.type(screen.getByPlaceholderText(/contrasena/i), "kobi123");
    await user.click(screen.getByRole("button", { name: /^entrar$/i }));
    await user.click(screen.getByRole("button", { name: /salir/i }));

    expect(screen.getByPlaceholderText(/correo electronico/i)).toHaveValue("");
    expect(screen.getByPlaceholderText(/contrasena/i)).toHaveValue("");
  });

  it("shows the demo credentials after a failed login", async () => {
    const user = userEvent.setup();

    renderApp();
    await user.type(screen.getByPlaceholderText(/correo electronico/i), "wrong@example.com");
    await user.type(screen.getByPlaceholderText(/contrasena/i), "wrongpass");
    await user.click(screen.getByRole("button", { name: /^entrar$/i }));

    expect(screen.getByText(/credencial demo: maestra@kobi\.demo/i)).toBeInTheDocument();
    expect(screen.getByText(/credencial demo: kobi123/i)).toBeInTheDocument();
  });

  it("creates a new class using the class creation modal", async () => {
    const user = userEvent.setup();

    renderApp();
    
    // Login
    await user.type(screen.getByPlaceholderText(/correo electronico/i), "maestra@kobi.demo");
    await user.type(screen.getByPlaceholderText(/contrasena/i), "kobi123");
    await user.click(screen.getByRole("button", { name: /^entrar$/i }));

    // Verify initial classes
    expect(screen.getByText("Ciencia 4to - Sección A")).toBeInTheDocument();

    // Click on add class button
    await user.click(screen.getByRole("button", { name: /^nueva clase$/i }));

    // Verify modal is open
    expect(screen.getByRole("heading", { name: /hagamos que el aprendizaje fluya/i })).toBeInTheDocument();

    // Fill form
    await user.type(screen.getByLabelText(/nombre de la clase/i), "Historia 6to");
    await user.type(screen.getByLabelText(/enfoque o tema principal/i), "Prehistoria");
    await user.type(screen.getByLabelText(/temas clave/i), "Nomadas, Fuego");
    
    // Submit
    await user.click(screen.getByRole("button", { name: /crear clase/i }));

    // Verify modal is closed
    expect(screen.queryByRole("heading", { name: /crear nueva clase/i })).not.toBeInTheDocument();

    // Verify new class card is rendered
    expect(screen.getByText("Historia 6to")).toBeInTheDocument();
    expect(screen.getAllByText("Prehistoria")[0]).toBeInTheDocument();
    expect(screen.getByText("Nomadas")).toBeInTheDocument();
    expect(screen.getByText("Fuego")).toBeInTheDocument();
  });

  it("navigates to the previous classes section and opens the summary modal", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>
    );

    // Login as teacher
    await user.type(screen.getByPlaceholderText("Correo electronico"), "maestra@kobi.demo");
    await user.type(screen.getByPlaceholderText("Contrasena"), "kobi123");
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
    await user.type(screen.getByPlaceholderText(/correo electronico/i), "maestra@kobi.demo");
    await user.type(screen.getByPlaceholderText(/contrasena/i), "kobi123");
    await user.click(screen.getByRole("button", { name: /^entrar$/i }));

    await user.click(screen.getByRole("button", { name: /ayuda/i }));

    expect(screen.getByRole("heading", { name: /^kobi$/i })).toBeInTheDocument();
    expect(screen.getByText(/atajos para crear clases, revisar estado y preparar la siguiente sesión/i)).toBeInTheDocument();
  });

  it("filters help topics and opens the relevant teacher section", async () => {
    const user = userEvent.setup();

    renderApp();
    await user.type(screen.getByPlaceholderText(/correo electronico/i), "maestra@kobi.demo");
    await user.type(screen.getByPlaceholderText(/contrasena/i), "kobi123");
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
