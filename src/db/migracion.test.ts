import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** Aplica solo las primeras `n` migraciones (copiando la carpeta con el journal recortado). */
function carpetaHasta(n: number) {
  const dir = mkdtempSync(join(tmpdir(), "mig-"));
  cpSync("./drizzle", dir, { recursive: true });
  const journal = JSON.parse(readFileSync(join(dir, "meta/_journal.json"), "utf8"));
  journal.entries = journal.entries.slice(0, n);
  writeFileSync(join(dir, "meta/_journal.json"), JSON.stringify(journal));
  return dir;
}

describe("migración 0003 (estados y pagos)", () => {
  it("convierte 'listo' según el trabajo y pasa los anticipos a abonos", async () => {
    const pg = new PGlite();
    const db = drizzle(pg);
    await migrate(db, { migrationsFolder: carpetaHasta(3) });
    // Datos inventados con el esquema viejo.
    await pg.exec(`
      insert into clientes (id, nombre) values (1, 'Cliente Viejo');
      insert into trabajos (id, cliente_id, estado) values (1, 1, 'terminado'), (2, 1, 'no_concretado'), (3, 1, 'cotizado'), (4, 1, 'en_curso');
      insert into presupuestos (id, trabajo_id, estado, fecha, total, anticipo) values
        (1, 1, 'listo', '2024-01-01', 1000, 500),
        (2, 2, 'listo', '2024-02-01', 2000, null),
        (3, 3, 'listo', '2024-03-01', 3000, 0),
        (4, 4, 'listo', null, 4000, 100),
        (5, 4, 'borrador', '2024-05-01', 50, null);
    `);
    await migrate(db, { migrationsFolder: "./drizzle" });

    const est = await pg.query<{ id: number; estado: string }>("select id, estado from presupuestos order by id");
    expect(est.rows.map((r) => r.estado)).toEqual(["terminado", "cancelado", "cotizacion", "en_curso", "borrador"]);
    const pagos = await pg.query<{ presupuesto_id: number; monto: string; forma: string | null }>("select presupuesto_id, monto, forma from pagos order by presupuesto_id");
    expect(pagos.rows.map((r) => [r.presupuesto_id, Number(r.monto), r.forma])).toEqual([[1, 500, null], [4, 100, null]]);
  });
});
