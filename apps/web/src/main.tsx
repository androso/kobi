import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { App } from "./App";
import { useAuthStore } from "./lib/store";
import "./index.css";

const queryClient = new QueryClient();
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
      <RouterProvider router={router} />
    </QueryClientProvider>
  </React.StrictMode>
);
