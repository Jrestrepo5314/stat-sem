import { Handle, Position, type NodeProps } from '@xyflow/react'

// Cuatro conectores por nodo; en modo "loose" cualquiera sirve de origen o destino.
function Conectores() {
  return (
    <>
      <Handle id="t" type="target" position={Position.Top} className="conector" />
      <Handle id="b" type="source" position={Position.Bottom} className="conector" />
      <Handle id="l" type="target" position={Position.Left} className="conector" />
      <Handle id="r" type="source" position={Position.Right} className="conector" />
    </>
  )
}

export function NodoLatente({ data, selected }: NodeProps) {
  return (
    <div className={`nodo-latente ${selected ? 'seleccionado' : ''}`} title="Doble clic para renombrar">
      {String(data.label)}
      <Conectores />
    </div>
  )
}

export function NodoObservada({ data, selected }: NodeProps) {
  return (
    <div className={`nodo-observada ${selected ? 'seleccionado' : ''}`}>
      {String(data.label)}
      <Conectores />
    </div>
  )
}

export const TIPOS_NODO = { latente: NodoLatente, observada: NodoObservada }
