import { useMemo, useRef } from 'react'
import { Background, Controls, ReactFlow } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { exportarPNG, exportarSVG } from '../exportar'
import { disponer } from '../sem/disposicion'
import { aristasDeModelo, etiquetasDeGrafo, modeloDeGrafo, nodosDeModelo } from '../sem/grafo'
import type { BloqueGrafo } from '../tipos'
import { TIPOS_NODO } from './NodosSEM'

/** Diagrama de rutas de un resultado: solo lectura, con los coeficientes estimados. */
export default function DiagramaRutas({ grafo }: { grafo: BloqueGrafo }) {
  const ref = useRef<HTMLDivElement>(null)
  const { nodos, aristas } = useMemo(() => {
    const m = modeloDeGrafo(grafo)
    const pos = disponer(m)
    return { nodos: nodosDeModelo(m, pos), aristas: aristasDeModelo(m, pos, etiquetasDeGrafo(grafo)) }
  }, [grafo])
  const lienzo = () => ref.current?.querySelector('.react-flow') as HTMLElement

  return (
    <div className="diagrama" ref={ref}>
      <ReactFlow defaultNodes={nodos} defaultEdges={aristas} nodeTypes={TIPOS_NODO} fitView nodesConnectable={false}
        proOptions={{ hideAttribution: true }} minZoom={0.3}>
        <Background gap={16} color="#e4e7eb" />
        <Controls showInteractive={false} />
      </ReactFlow>
      <div className="pie-diagrama">
        <span className="tenue">Los nodos se pueden arrastrar. * = p &lt; 0,05.</span>
        <span className="espacio" />
        <button onClick={() => exportarPNG(lienzo(), 'diagrama_rutas.png')}>Exportar PNG</button>
        <button onClick={() => exportarSVG(lienzo(), 'diagrama_rutas.svg')}>Exportar SVG</button>
      </div>
    </div>
  )
}
