import { render, screen } from "@testing-library/react";
import { App } from "./App";

describe("App", () => {
  it("renders the Kobi landing surface", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: /aula lista para actividad/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /crear clase/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /unirse con código/i })).toBeInTheDocument();
  });
});
