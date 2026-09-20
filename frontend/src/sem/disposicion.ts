// Disposición automática de un modelo SEM: los latentes en capas de izquierda a derecha
// según su profundidad en el modelo estructural (exógenos primero), con sus indicadores
// debajo; observadas sueltas arriba.
//
// Dentro de una capa, los constructos se apilan en bandas. Antes iban todos en una sola
// fila y en el TAM del libro (UP ~ FU; IA ~ UP + FU + CO) las flechas FU→IA y CO→IA
// quedaban tapadas por FU→UP y UP→IA: cuatro flechas sobre la misma línea horizontal.
import type { ModeloSEM } from './sintaxis'

export const ANCHO_LAT = 150, ANCHO_OBS = 92, SEP_X = 260, SEP_IND = 100
export const Y_LATENTE = 160, ALTO_INDICADOR = 180, ALTO_BANDA = 260
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

  // capa = camino más largo desde un exógeno; los que no dependen de nadie van en la 0
  const capa = new Map<string, number>()
  for (const l of orden) {
    let c = 0
    for (const [dep, pred] of m.regresiones) if (dep === l && capa.has(pred)) c = Math.max(c, capa.get(pred)! + 1)
    capa.set(l, c)
  }
  const capas: string[][] = []
  for (const l of orden) { const c = capa.get(l)!; (capas[c] ??= []).push(l) }
  const maxBandas = Math.max(1, ...capas.map((g) => (g ? g.length : 0)))

  let x = 40
  for (const grupo of capas) {
    if (!grupo) continue
    const anchoCapa = Math.max(...grupo.map((l) => Math.max(ANCHO_LAT, (indicadores.get(l) ?? []).length * SEP_IND)))
    const cx = x + anchoCapa / 2
    // una capa con menos constructos que la más poblada se centra verticalmente
    const desplaza = ((maxBandas - grupo.length) * ALTO_BANDA) / 2
    grupo.forEach((l, banda) => {
      const y = Y_LATENTE + desplaza + banda * ALTO_BANDA
      const inds = indicadores.get(l) ?? []
      pos[l] = { x: cx - ANCHO_LAT / 2, y }
      inds.forEach((ind, k) => {
        pos[ind] = { x: cx - (inds.length * SEP_IND) / 2 + k * SEP_IND + (SEP_IND - ANCHO_OBS) / 2, y: y + ALTO_INDICADOR }
      })
    })
    x += anchoCapa + (SEP_X - ANCHO_LAT)
  }
  m.observadas.filter((o) => !esIndicador.has(o)).forEach((o, k) => { pos[o] = { x: 40 + k * SEP_IND, y: 20 } })
  // lo que ya tenía sitio en el lienzo lo conserva
  for (const id of Object.keys(pos)) if (previas[id]) pos[id] = previas[id]
  return pos
}
