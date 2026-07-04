import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "./App";

describe("App", () => {
  it("renders the teacher login surface", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: /iniciar sesion/i })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/correo electronico/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /entrar/i })).toBeInTheDocument();
  });

  it("switches to the student join form", async () => {
    const user = userEvent.setup();

    render(<App />);
    await user.click(screen.getByRole("button", { name: /estudiante/i }));

    expect(screen.getByPlaceholderText(/codigo de clase/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/nombre/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /entrar a clase/i })).toBeInTheDocument();
  });
});
