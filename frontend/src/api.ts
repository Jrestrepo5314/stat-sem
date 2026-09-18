import type { PaginaFilas, ResumenDataset, Salida, Variable } from './tipos'

const BASE = '/api'

// Identificador de este navegador: el servidor solo le muestra sus propios conjuntos de datos.
function clienteId(): string {
  try {
    let id = localStorage.getItem('statsem_cliente')
    if (!id) { id = crypto.randomUUID(); localStorage.setItem('statsem_cliente', id) }
    return id
  } catch { return 'anon' }
}
export const CLIENTE = clienteId()

async function pedir<T>(ruta: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(BASE + ruta, { ...init, headers: { ...(init.headers as Record<string, string> | undefined), 'X-Cliente': CLIENTE } })
  if (!r.ok) {
    let detalle = r.statusText
    try { detalle = (await r.json()).detail ?? detalle } catch { /* sin cuerpo JSON */ }
    throw new Error(detalle)
  }
  return r.json() as Promise<T>
}

const json = (cuerpo: unknown, method = 'POST'): RequestInit => ({
  method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo),
})

export const api = {
  listarDatasets: () => pedir<ResumenDataset[]>('/datasets'),

  subirArchivo(archivo: File) {
    const fd = new FormData()
    fd.append('archivo', archivo)
    return pedir<ResumenDataset>('/datasets', { method: 'POST', body: fd })
  },

  nuevoDataset: (nombre = 'Sin título') =>
    pedir<ResumenDataset>(`/datasets/nuevo?nombre=${encodeURIComponent(nombre)}`, { method: 'POST' }),

  detalle: (id: string) => pedir<{ resumen: ResumenDataset; variables: Variable[] }>(`/datasets/${id}`),

  borrarDataset: (id: string) => pedir<{ ok: boolean }>(`/datasets/${id}`, { method: 'DELETE' }),

  filas: (id: string, inicio: number, n: number) =>
    pedir<PaginaFilas>(`/datasets/${id}/filas?inicio=${inicio}&n=${n}`),

  editarCelda: (id: string, fila: number, variable: string, valor: unknown) =>
    pedir<{ ok: boolean; n_filas: number }>(`/datasets/${id}/celda`, json({ fila, variable, valor }, 'PUT')),

  guardarVariables: (id: string, variables: Variable[]) =>
    pedir<{ ok: boolean }>(`/datasets/${id}/variables`, json(variables, 'PUT')),

  insertarFila: (id: string, posicion: number) =>
    pedir<{ ok: boolean; n_filas: number }>(`/datasets/${id}/filas/insertar?posicion=${posicion}`, { method: 'POST' }),

  borrarFila: (id: string, posicion: number) =>
    pedir<{ ok: boolean; n_filas: number }>(`/datasets/${id}/filas/${posicion}`, { method: 'DELETE' }),

  analizar: (id: string, procedimiento: string, parametros: Record<string, unknown>) =>
    pedir<Salida>(`/datasets/${id}/analisis/${procedimiento}`, json(parametros)),

  urlExportar: (id: string, formato: 'sav' | 'csv') =>
    `${BASE}/datasets/${id}/exportar?formato=${formato}&cliente=${encodeURIComponent(CLIENTE)}`,
}
