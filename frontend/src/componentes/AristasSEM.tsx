import { useLayoutEffect, useRef, useState } from 'react'
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@xyflow/react'

/**
 * Arista con el rótulo en un punto elegido del trazo (`data.t`, de 0 a 1), no en el
 * punto medio. En el TAM del libro, el coeficiente de CO→IA caía en mitad del camino,
 * justo encima de la carga de up2 (0,35 sobre 0,92): las flechas estructurales llevan
 * ahora el rótulo cerca de su origen, donde no hay cargas que tapar.
 */
export function AristaRotulada({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd, markerStart, style, label, data }: EdgeProps) {
  const [path] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition })
  const t = typeof data?.t === 'number' ? data.t : 0.5
  const ref = useRef<SVGPathElement>(null)
  const [punto, setPunto] = useState<{ x: number; y: number } | null>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const largo = el.getTotalLength()
    const p = el.getPointAtLength(largo * t)
    setPunto({ x: p.x, y: p.y })
  }, [path, t])
  return (
    <>
      <path ref={ref} d={path} fill="none" stroke="none" />
      <BaseEdge id={id} path={path} markerEnd={markerEnd} markerStart={markerStart} style={style} />
      {label && punto && (
        <EdgeLabelRenderer>
          <div className="nodrag nopan rotulo-arista" style={{ transform: `translate(-50%, -50%) translate(${punto.x}px, ${punto.y}px)` }}>
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}

export const TIPOS_ARISTA = { rotulada: AristaRotulada }
