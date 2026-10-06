import { useQuery } from "@tanstack/react-query";
import { NavLink, Outlet } from "react-router";
import { api, type Usuario } from "../api";

const enlaces = [
  { to: "/", label: "Inicio", end: true },
  { to: "/presupuestos", label: "Presupuestos" },
  { to: "/clientes", label: "Clientes" },
  { to: "/buses", label: "Buses" },
  { to: "/productos", label: "Productos" },
  { to: "/estadisticas", label: "Estadísticas" },
];

export function Layout() {
  const { data: usuario } = useQuery({ queryKey: ["me"], queryFn: () => api<Usuario>("/me") });

  return (
    <div className="min-h-dvh">
      <header className="bg-marca-700 text-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-acento" aria-hidden />
            <span className="font-semibold tracking-tight">Reconstructora · Presupuestos</span>
          </div>
          {usuario && (
            <span className="text-sm text-marca-100">
              {usuario.nombre}
              {usuario.rol === "admin" && <span className="ml-2 rounded bg-marca-600 px-1.5 py-0.5 text-xs">admin</span>}
            </span>
          )}
        </div>
        <nav className="mx-auto max-w-6xl overflow-x-auto px-2">
          <ul className="flex gap-1 text-sm">
            {[...enlaces, ...(usuario?.rol === "admin" ? [{ to: "/usuarios", label: "Usuarios", end: false }] : [])].map((e) => (
              <li key={e.to}>
                <NavLink
                  to={e.to}
                  end={e.end}
                  className={({ isActive }) =>
                    `block whitespace-nowrap rounded-t-md px-3 py-2 ${
                      isActive ? "bg-slate-50 font-medium text-marca-900" : "text-marca-100 hover:bg-marca-600"
                    }`
                  }
                >
                  {e.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
