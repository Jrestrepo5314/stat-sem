// Disposición automática de un modelo SEM: latentes en fila (en el orden del modelo
// estructural) con sus indicadores debajo; observadas sueltas arriba.
import type { ModeloSEM } from './sintaxis'

export const ANCHO_LAT = 150, ANCHO_OBS = 92, SEP_X = 260, SEP_IND = 100
export type Posiciones = Record<string, { x: number; y: number }>

export function disponer(m: ModeloSEM, previas: Posiciones = {}): Posiciones {
  const pos: Posiciones = {}
  const indicadores = new Map<string, string[]>()
  for (const [lat, ind] of m.cargas) indicadores.set(lat, [...(indicadores.get(lat) ?? []), ind])
  const esIndicador = new Set(m.cargas.map(([, i]) => i))

  // orden topológico por las regresiones entre latentes: exógenos primero
  const entrantes = new Map(m.latentes.map((l) => [l, 0]))
  for (const [dep, pred] of m.regresiones) if (entrantes.has(dep) && entrantes.has(pred)) entrantes.set(dep, entrantes.get(dep)! + 1)
  const orden: string[] = []
  const pendientes = new Set(m.latentes)
  while (pendientes.size) {
    const libres = [...pendientes].filter((l) => entrantes.get(l) === 0)
    for (const l of (libres.length ? libres : [...pendientes])) {
      orden.push(l); pendientes.delete(l)
      for (const [dep, pred] of m.regresiones) if (pred === l && entrantes.has(dep)) entrantes.set(dep, entrantes.get(dep)! - 1)
    }
  }
  let x = 40
  for (const l of orden) {
    const inds = indicadores.get(l) ?? []
    const anchoBloque = Math.max(ANCHO_LAT, inds.length * SEP_IND)
    const cx = x + anchoBloque / 2
    pos[l] = { x: cx - ANCHO_LAT / 2, y: 160 }
    inds.forEach((ind, k) => {
      pos[ind] = { x: cx - (inds.length * SEP_IND) / 2 + k * SEP_IND + (SEP_IND - ANCHO_OBS) / 2, y: 340 }
    })
    x += anchoBloque + (SEP_X - ANCHO_LAT)
  }
  m.observadas.filter((o) => !esIndicador.has(o)).forEach((o, k) => { pos[o] = { x: 40 + k * SEP_IND, y: 20 } })
  // lo que ya tenía sitio en el lienzo lo conserva
  for (const id of Object.keys(pos)) if (previas[id]) pos[id] = previas[id]
  return pos
}
