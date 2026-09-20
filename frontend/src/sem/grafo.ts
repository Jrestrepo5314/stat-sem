// Del modelo (y sus posiciones) a los nodos y aristas de React Flow, y del grafo que
// devuelve el servidor tras estimar al modelo, para poder compararlos.
import { MarkerType, type Edge, type Node } from '@xyflow/react'
import { numero } from '../formato'
import type { AristaGrafo, BloqueGrafo } from '../tipos'
import { ANCHO_LAT, ANCHO_OBS, type Posiciones } from './disposicion'
import { modeloVacio, type ModeloSEM } from './sintaxis'

export type Etiquetas = Map<string, { valor: number | null; p: number | null }>

export const claveArista = (tipo: string, a: string, b: string) =>
  tipo === 'covarianza' ? `v:${[a, b].sort().join('~')}` : tipo === 'carga' ? `c:${a}>${b}` : `r:${b}<${a}`

export function modeloDeGrafo(g: BloqueGrafo): ModeloSEM {
  const m = modeloVacio()
  m.latentes = g.nodos.filter((n) => n.tipo === 'latente').map((n) => n.id)
  m.observadas = g.nodos.filter((n) => n.tipo === 'observada').map((n) => n.id)
  for (const a of g.aristas) {
    if (a.tipo === 'carga') m.cargas.push([a.origen, a.destino])
    else if (a.tipo === 'regresion') m.regresiones.push([a.destino, a.origen])
    else m.covarianzas.push([a.origen, a.destino])
  }
  return m
}

export function etiquetasDeGrafo(g: BloqueGrafo): Etiquetas {
  const e: Etiquetas = new Map()
  for (const a of g.aristas as AristaGrafo[]) e.set(claveArista(a.tipo, a.origen, a.destino), { valor: a.valor, p: a.p })
  return e
}

/** Elige los conectores según dónde está cada nodo, para que las flechas no se crucen por encima. */
function conectores(pos: Posiciones, a: string, b: string): { sourceHandle: string; targetHandle: string } {
  const pa = pos[a] ?? { x: 0, y: 0 }, pb = pos[b] ?? { x: 0, y: 0 }
  const dx = pb.x - pa.x, dy = pb.y - pa.y
  if (Math.abs(dy) >= Math.abs(dx) * 0.6) return dy > 0 ? { sourceHandle: 'b', targetHandle: 't' } : { sourceHandle: 't', targetHandle: 'b' }
  return dx > 0 ? { sourceHandle: 'r', targetHandle: 'l' } : { sourceHandle: 'l', targetHandle: 'r' }
}

export function nodosDeModelo(m: ModeloSEM, pos: Posiciones): Node[] {
  return [
    ...m.latentes.map<Node>((l) => ({ id: l, type: 'latente', position: pos[l] ?? { x: 0, y: 0 }, data: { label: l }, style: { width: ANCHO_LAT } })),
    ...m.observadas.map<Node>((o) => ({ id: o, type: 'observada', position: pos[o] ?? { x: 0, y: 0 }, data: { label: o }, style: { width: ANCHO_OBS } })),
  ]
}

export function aristasDeModelo(m: ModeloSEM, pos: Posiciones, etiquetas?: Etiquetas): Edge[] {
  const flecha = (color: string) => ({ type: MarkerType.ArrowClosed, width: 18, height: 18, color })
  const rotulo = (clave: string) => {
    const e = etiquetas?.get(clave)
    if (!e || e.valor === null) return ''
    return numero(e.valor, 2) + (e.p !== null && e.p < 0.05 ? '*' : '')
  }
  const comun = (label: string) => ({
    label, labelStyle: { fontSize: 11, fill: '#1f2933' }, labelBgStyle: { fill: '#fff', fillOpacity: 0.9 },
  })
  const out: Edge[] = []
  for (const [lat, ind] of m.cargas) {
    const k = claveArista('carga', lat, ind)
    out.push({ id: k, source: lat, target: ind, ...conectores(pos, lat, ind), ...comun(rotulo(k)), type: 'rotulada', data: { t: 0.5 },
      markerEnd: flecha('#334e68'), style: { stroke: '#334e68', strokeWidth: 1.4 } })
  }
  for (const [dep, pred] of m.regresiones) {
    const k = claveArista('regresion', pred, dep)
    // el rótulo va cerca del origen: en el punto medio chocaba con las cargas de otro constructo
    out.push({ id: k, source: pred, target: dep, ...conectores(pos, pred, dep), ...comun(rotulo(k)), type: 'rotulada', data: { t: 0.3 },
      markerEnd: flecha('#1f5f8b'), style: { stroke: '#1f5f8b', strokeWidth: 2.2 } })
  }
  for (const [a, b] of m.covarianzas) {
    const k = claveArista('covarianza', a, b)
    // dos constructos apilados en la misma columna se unen por el costado izquierdo,
    // no de arriba abajo a través de los indicadores del primero
    const apilados = Math.abs((pos[a]?.x ?? 0) - (pos[b]?.x ?? 0)) < ANCHO_LAT
    const asas = apilados ? { sourceHandle: 'l', targetHandle: 'l' } : conectores(pos, a, b)
    out.push({ id: k, source: a, target: b, ...asas, ...comun(rotulo(k)), type: 'smoothstep',
      markerStart: flecha('#7b8794'), markerEnd: flecha('#7b8794'),
      style: { stroke: '#7b8794', strokeDasharray: '6 4', strokeWidth: 1.4 } })
  }
  return out
}
