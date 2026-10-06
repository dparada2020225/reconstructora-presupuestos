export function Pendiente({ titulo, fase }: { titulo: string; fase?: number }) {
  return (
    <section>
      <h1 className="text-2xl font-semibold tracking-tight">{titulo}</h1>
      {fase && <p className="mt-2 text-slate-600">Esta sección llega en la fase {fase}.</p>}
    </section>
  );
}
