import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { App } from "./App";
import { ThemeToggle } from "./components/ThemeToggle";
import { useAuthStore } from "./lib/store";
import { initializeTheme } from "./lib/theme";
import "./index.css";

const queryClient = new QueryClient();
initializeTheme();
void useAuthStore.getState().initializeAuth();

const router = createBrowserRouter([
  {
    path: "*",
    element: <App />
  }
]);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeToggle />
      <RouterProvider router={router} />
    </QueryClientProvider>
  </React.StrictMode>
);
