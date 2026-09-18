import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Background, ConnectionMode, Controls, ReactFlow, applyNodeChanges,
  type Connection, type Edge, type Node, type NodeChange,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { exportarPNG, exportarSVG } from '../exportar'
import { disponer, type Posiciones } from '../sem/disposicion'
import { aristasDeModelo, etiquetasDeGrafo, modeloDeGrafo, nodosDeModelo } from '../sem/grafo'
import { analizar, generar, iguales, modeloVacio, nombreLatenteLibre, type ModeloSEM } from '../sem/sintaxis'
import type { BloqueGrafo, Variable } from '../tipos'
import { TIPOS_NODO } from './NodosSEM'

type Herramienta = 'mover' | 'flecha' | 'covarianza'
const NOMBRE = /^[A-Za-z_][A-Za-z0-9_.]*$/

interface Props {
  variables: Variable[]
  sintaxis: string
  posiciones: Posiciones
  estimaciones: BloqueGrafo | null
  onCambio: (sintaxis: string, posiciones: Posiciones) => void
  onEjecutar: (parametros: Record<string, unknown>) => Promise<void>
  onCerrar: () => void
}

/**
 * Lienzo del modelo SEM. El modelo (ModeloSEM) es la única fuente de verdad: el lienzo y la
 * sintaxis se derivan de él, y cualquiera de los dos lo modifica.
 */
export default function LienzoSEM({ variables, sintaxis, posiciones, estimaciones, onCambio, onEjecutar, onCerrar }: Props) {
  const [modelo, setModelo] = useState<ModeloSEM>(() => analizar(sintaxis).modelo)
  const [pos, setPos] = useState<Posiciones>(() => disponer(analizar(sintaxis).modelo, posiciones))
  const [texto, setTexto] = useState(sintaxis)
  const [erroresSintaxis, setErroresSintaxis] = useState<string[]>([])
  const [herramienta, setHerramienta] = useState<Herramienta>('flecha')
  const [estimador, setEstimador] = useState('ML')
  const [estandarizado, setEstandarizado] = useState(true)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nodos, setNodos] = useState<Node[]>([])
  const ref = useRef<HTMLDivElement>(null)
  const temporizador = useRef<number | null>(null)

  // las estimaciones solo se muestran si corresponden al modelo que está en el lienzo
  const etiquetas = useMemo(() => (estimaciones && iguales(modeloDeGrafo(estimaciones), modelo)) ? etiquetasDeGrafo(estimaciones) : undefined,
    [estimaciones, modelo])

  useEffect(() => { setNodos(nodosDeModelo(modelo, pos)) }, [modelo, pos])
  const aristas = useMemo<Edge[]>(() => aristasDeModelo(modelo, pos, etiquetas), [modelo, pos, etiquetas])
  useEffect(() => { onCambio(texto, pos) }, [texto, pos, onCambio])

  /** Cambios que nacen en el lienzo: se reescribe la sintaxis. */
  const cambiarModelo = useCallback((m: ModeloSEM, nuevasPos?: Posiciones) => {
    setModelo(m)
    setPos((p) => disponer(m, nuevasPos ?? p))
    setTexto(generar(m))
    setErroresSintaxis([])
  }, [])

  /** Cambios que nacen en la sintaxis: se reconstruye el lienzo sin tocar el texto. */
  const onTexto = (s: string) => {
    setTexto(s)
    if (temporizador.current) window.clearTimeout(temporizador.current)
    temporizador.current = window.setTimeout(() => {
      const { modelo: m, errores } = analizar(s)
      setErroresSintaxis(errores)
      if (!iguales(m, modelo)) { setModelo(m); setPos((p) => disponer(m, p)) }
    }, 350)
  }

  const onNodesChange = useCallback((cambios: NodeChange[]) => {
    setNodos((ns) => applyNodeChanges(cambios, ns))
    const movidos = cambios.filter((c) => c.type === 'position' && !c.dragging && c.position)
    if (movidos.length) setPos((p) => {
      const q = { ...p }
      for (const c of movidos) if (c.type === 'position' && c.position) q[c.id] = c.position
      return q
    })
  }, [])

  const onConnect = useCallback((c: Connection) => {
    if (!c.source || !c.target || c.source === c.target) return
    const m = structuredClone(modelo)
    const esLat = (x: string) => m.latentes.includes(x)
    const existe = (lista: [string, string][], par: [string, string]) => lista.some(([a, b]) => a === par[0] && b === par[1])
    if (herramienta === 'covarianza') {
      if (!existe(m.covarianzas, [c.source, c.target]) && !existe(m.covarianzas, [c.target, c.source])) m.covarianzas.push([c.source, c.target])
    } else if (esLat(c.source) && !esLat(c.target)) {
      if (!existe(m.cargas, [c.source, c.target])) m.cargas.push([c.source, c.target])
    } else if (!existe(m.regresiones, [c.target, c.source])) {
      m.regresiones.push([c.target, c.source])
    }
    cambiarModelo(m)
  }, [modelo, herramienta, cambiarModelo])

  const onNodesDelete = useCallback((borrados: Node[]) => {
    const ids = new Set(borrados.map((n) => n.id))
    const m = structuredClone(modelo)
    m.latentes = m.latentes.filter((l) => !ids.has(l))
    m.observadas = m.observadas.filter((o) => !ids.has(o))
    const sin = (p: [string, string]) => !ids.has(p[0]) && !ids.has(p[1])
    m.cargas = m.cargas.filter(sin); m.regresiones = m.regresiones.filter(sin); m.covarianzas = m.covarianzas.filter(sin)
    cambiarModelo(m)
  }, [modelo, cambiarModelo])

  const onEdgesDelete = useCallback((borradas: Edge[]) => {
    const ids = new Set(borradas.map((e) => e.id))
    const m = structuredClone(modelo)
    m.cargas = m.cargas.filter(([a, b]) => !ids.has(`c:${a}>${b}`))
    m.regresiones = m.regresiones.filter(([d, p]) => !ids.has(`r:${d}<${p}`))
    m.covarianzas = m.covarianzas.filter(([a, b]) => !ids.has(`v:${[a, b].sort().join('~')}`))
    cambiarModelo(m)
  }, [modelo, cambiarModelo])

  const anadirLatente = () => {
    const m = structuredClone(modelo)
    const nombre = nombreLatenteLibre(m)
    m.latentes.push(nombre)
    cambiarModelo(m, { ...pos, [nombre]: { x: 40 + (m.latentes.length - 1) * 200, y: 160 } })
  }

  const anadirObservada = (nombre: string) => {
    if (modelo.observadas.includes(nombre) || modelo.latentes.includes(nombre)) return
    const m = structuredClone(modelo)
    m.observadas.push(nombre)
    cambiarModelo(m, { ...pos, [nombre]: { x: 40 + (m.observadas.length - 1) * 110, y: 20 } })
  }

  const renombrar = (id: string) => {
    if (!modelo.latentes.includes(id)) return
    const nuevo = window.prompt('Nombre del constructo', id)?.trim()
    if (!nuevo || nuevo === id) return
    if (!NOMBRE.test(nuevo) || modelo.latentes.includes(nuevo) || modelo.observadas.includes(nuevo)) { setError(`Nombre no válido o repetido: ${nuevo}`); return }
    const m = structuredClone(modelo)
    const r = (x: string) => (x === id ? nuevo : x)
    m.latentes = m.latentes.map(r)
    m.cargas = m.cargas.map(([a, b]) => [r(a), r(b)]); m.regresiones = m.regresiones.map(([a, b]) => [r(a), r(b)]); m.covarianzas = m.covarianzas.map(([a, b]) => [r(a), r(b)])
    const p = { ...pos }; p[nuevo] = p[id]; delete p[id]
    cambiarModelo(m, p)
  }

  const limpiar = () => { if (modelo.latentes.length + modelo.observadas.length === 0 || confirm('¿Vaciar el modelo?')) cambiarModelo(modeloVacio(), {}) }
  const reordenar = () => setPos(disponer(modelo))

  const ejecutar = async () => {
    setOcupado(true); setError(null)
    try { await onEjecutar({ sintaxis: texto, estimador, estandarizado }) }
    catch (e) { setError((e as Error).message) }
    finally { setOcupado(false) }
  }

  const lienzo = () => ref.current?.querySelector('.react-flow') as HTMLElement
  const enModelo = new Set([...modelo.observadas, ...modelo.latentes])

  return (
    <div className="modal-fondo" onClick={onCerrar}>
      <div className="modal lienzo-sem" onClick={(e) => e.stopPropagation()}>
        <div className="lienzo-cabecera">
          <h3>Modelo de ecuaciones estructurales</h3>
          <div className="herramientas">
            <button className={herramienta === 'mover' ? 'activa' : ''} onClick={() => setHerramienta('mover')} title="Solo mover nodos">Mover</button>
            <button className={herramienta === 'flecha' ? 'activa' : ''} onClick={() => setHerramienta('flecha')} title="Arrastre de un nodo a otro: latente→indicador crea una carga; en otro caso una regresión">→ Carga / regresión</button>
            <button className={herramienta === 'covarianza' ? 'activa' : ''} onClick={() => setHerramienta('covarianza')} title="Arrastre de un nodo a otro">↔ Covarianza</button>
            <span className="sep" />
            <button onClick={anadirLatente}>+ Constructo latente</button>
            <button onClick={reordenar}>Reordenar</button>
            <button onClick={limpiar}>Vaciar</button>
            <span className="sep" />
            <button onClick={() => exportarPNG(lienzo(), 'modelo_sem.png')}>PNG</button>
            <button onClick={() => exportarSVG(lienzo(), 'modelo_sem.svg')}>SVG</button>
          </div>
          <button className="cerrar" onClick={onCerrar} title="Cerrar">×</button>
        </div>
        <div className="lienzo-cuerpo">
          <div className="lista-disponibles">
            <div className="titulo-lista">Variables observadas (clic para añadir)</div>
            <ul>
              {variables.filter((v) => v.tipo === 'numerica').map((v) => (
                <li key={v.nombre} className={enModelo.has(v.nombre) ? 'usada' : ''} title={v.etiqueta} onClick={() => anadirObservada(v.nombre)}>
                  <span className={`icono-medida ${v.medida}`} />{v.nombre}
                </li>
              ))}
            </ul>
            <div className="tenue">Supr borra el nodo o la flecha seleccionada. Doble clic en un constructo para renombrarlo.</div>
          </div>
          <div className="lienzo" ref={ref}>
            <ReactFlow
              nodes={nodos} edges={aristas} nodeTypes={TIPOS_NODO}
              onNodesChange={onNodesChange} onConnect={onConnect}
              onNodesDelete={onNodesDelete} onEdgesDelete={onEdgesDelete}
              onNodeDoubleClick={(_, n) => renombrar(n.id)}
              connectionMode={ConnectionMode.Loose}
              nodesConnectable={herramienta !== 'mover'}
              deleteKeyCode={['Delete', 'Backspace']}
              fitView minZoom={0.3} proOptions={{ hideAttribution: true }}>
              <Background gap={16} color="#e4e7eb" />
              <Controls showInteractive={false} />
            </ReactFlow>
          </div>
          <div className="panel-sintaxis">
            <div className="titulo-lista">Sintaxis (editable; el lienzo se actualiza al escribir)</div>
            <textarea value={texto} spellCheck={false} onChange={(e) => onTexto(e.target.value)}
              placeholder={'latente =~ item1 + item2 + item3\ndependiente ~ predictor\na ~~ b'} />
            {erroresSintaxis.map((e, i) => <div key={i} className="error-dialogo">{e}</div>)}
            <label>Estimador
              <select value={estimador} onChange={(e) => setEstimador(e.target.value)}>
                <option value="ML">Máxima verosimilitud (ML)</option>
                <option value="GLS">Mínimos cuadrados generalizados (GLS)</option>
                <option value="ULS">Mínimos cuadrados no ponderados (ULS)</option>
                <option value="DWLS">Mínimos cuadrados ponderados diagonalmente (DWLS)</option>
                <option value="FIML">ML con información completa (FIML)</option>
              </select>
            </label>
            <label className="check"><input type="checkbox" checked={estandarizado} onChange={(e) => setEstandarizado(e.target.checked)} /> Coeficientes estandarizados en el diagrama</label>
            {etiquetas && <div className="tenue">El lienzo muestra las estimaciones del último ajuste de este modelo.</div>}
            {error && <div className="error-dialogo">{error}</div>}
            <div className="fila-botones">
              <button onClick={onCerrar}>Cerrar</button>
              <button className="primario" onClick={ejecutar} disabled={ocupado || !texto.trim()}>{ocupado ? 'Estimando…' : 'Estimar'}</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
