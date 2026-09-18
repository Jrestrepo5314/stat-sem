import type { Celda, Variable } from './tipos'

const fmtCache = new Map<number, Intl.NumberFormat>()

export function numero(x: number, decimales = 3): string {
  let f = fmtCache.get(decimales)
  if (!f) {
    f = new Intl.NumberFormat('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: decimales })
    fmtCache.set(decimales, f)
  }
  return f.format(x)
}

/** Celda de una tabla de resultados: los números ya vienen redondeados del servidor. */
export function celda(x: Celda): string {
  if (x === null || x === undefined) return ''
  if (typeof x === 'number') return Number.isInteger(x) ? numero(x, 0) : numero(x, 3)
  return String(x)
}

/** Valor de la Vista de datos según los atributos de la variable. */
export function valorDato(x: Celda, v: Variable | undefined, conEtiquetas: boolean): string {
  if (x === null || x === undefined) return ''
  if (!v) return String(x)
  if (conEtiquetas && Object.keys(v.etiquetas_valores).length) {
    const clave = typeof x === 'number' && Number.isInteger(x) ? String(x) : String(x)
    const lab = v.etiquetas_valores[clave]
    if (lab) return lab
  }
  if (v.tipo === 'numerica' && typeof x === 'number') return numero(x, v.decimales)
  return String(x)
}

export function resumenPerdidos(v: Variable): string {
  if (!v.perdidos.length) return 'Ninguno'
  return v.perdidos.map((p) => (Array.isArray(p) ? `${p[0]} – ${p[1]}` : String(p))).join(', ')
}

export function resumenEtiquetas(v: Variable): string {
  const n = Object.keys(v.etiquetas_valores).length
  if (!n) return 'Ninguna'
  const [k, lab] = Object.entries(v.etiquetas_valores)[0]
  return n === 1 ? `{${k}, ${lab}}` : `{${k}, ${lab}}… (${n})`
}
