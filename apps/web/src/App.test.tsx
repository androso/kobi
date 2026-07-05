import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "./App";
import { useAuthStore } from "./lib/store";
import { MemoryRouter } from "react-router-dom";

describe("App", () => {
  beforeEach(() => {
    useAuthStore.setState({ user: null });
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

    expect(screen.getByRole("heading", { name: /hola, ana/i })).toBeInTheDocument();
    expect(screen.getByText(/actividad lista/i)).toBeInTheDocument();
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
});
