import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router";
import { Layout } from "./components/Layout";
import "./index.css";
import { Bus } from "./pages/Bus";
import { Buses } from "./pages/Buses";
import { Cliente } from "./pages/Cliente";
import { Clientes } from "./pages/Clientes";
import { Estadisticas } from "./pages/Estadisticas";
import { Inicio } from "./pages/Inicio";
import { Pendiente } from "./pages/Pendiente";
import { Producto } from "./pages/Producto";
import { Productos } from "./pages/Productos";
import { Usuarios } from "./pages/Usuarios";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});

const router = createBrowserRouter([
  {
    path: "/",
    element: <Layout />,
    children: [
      { index: true, element: <Inicio /> },
      { path: "presupuestos", element: <Pendiente titulo="Presupuestos" fase={4} /> },
      { path: "clientes", element: <Clientes /> },
      { path: "clientes/:id", element: <Cliente /> },
      { path: "buses", element: <Buses /> },
      { path: "buses/:id", element: <Bus /> },
      { path: "productos", element: <Productos /> },
      { path: "productos/:id", element: <Producto /> },
      { path: "estadisticas", element: <Estadisticas /> },
      { path: "usuarios", element: <Usuarios /> },
      { path: "*", element: <Pendiente titulo="Página no encontrada" /> },
    ],
  },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
