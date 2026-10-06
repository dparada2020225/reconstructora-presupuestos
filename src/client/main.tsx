import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router";
import { Layout } from "./components/Layout";
import "./index.css";
import { Ajustes } from "./pages/Ajustes";
import { Bus } from "./pages/Bus";
import { Buses } from "./pages/Buses";
import { Cliente } from "./pages/Cliente";
import { Clientes } from "./pages/Clientes";
import { Estadisticas } from "./pages/Estadisticas";
import { Inicio } from "./pages/Inicio";
import { Pendiente } from "./pages/Pendiente";
import { PresupuestoExistente, PresupuestoNuevo } from "./pages/Presupuesto";
import { Presupuestos } from "./pages/Presupuestos";
import { Producto } from "./pages/Producto";
import { Productos } from "./pages/Productos";
import { Trabajo } from "./pages/Trabajo";
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
      { path: "presupuestos", element: <Presupuestos /> },
      { path: "presupuestos/nuevo", element: <PresupuestoNuevo /> },
      { path: "presupuestos/:id", element: <PresupuestoExistente /> },
      { path: "trabajos/:id", element: <Trabajo /> },
      { path: "ajustes", element: <Ajustes /> },
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
