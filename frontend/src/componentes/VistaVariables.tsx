import { useCallback, useEffect, useMemo, useState } from 'react'
import { AgGridReact } from 'ag-grid-react'
import type { CellValueChangedEvent, ColDef, ICellRendererParams } from 'ag-grid-community'
import { api } from '../api'
import { resumenEtiquetas, resumenPerdidos } from '../formato'
import { variableNueva, type Variable } from '../tipos'
import { temaGrid } from './VistaDatos'
import ModalEtiquetas from './ModalEtiquetas'

interface Props {
  id: string
  variables: Variable[]
  onGuardado: () => void
  onError: (mensaje: string) => void
}

const NOMBRE_VALIDO = /^[A-Za-z_][A-Za-z0-9_.]*$/

export default function VistaVariables({ id, variables, onGuardado, onError }: Props) {
  const [filas, setFilas] = useState<Variable[]>(() => structuredClone(variables))
  const [sucio, setSucio] = useState(false)
  const [editando, setEditando] = useState<{ indice: number; que: 'etiquetas' | 'perdidos' } | null>(null)
  const [seleccion, setSeleccion] = useState<number | null>(null)

  useEffect(() => { setFilas(structuredClone(variables)); setSucio(false) }, [variables])

  const columnas = useMemo<ColDef<Variable>[]>(() => [
    { headerName: '', valueGetter: (p) => (p.node?.rowIndex ?? 0) + 1, width: 50, pinned: 'left', cellClass: 'celda-indice', editable: false },
    { field: 'nombre', headerName: 'Nombre', width: 140, editable: true },
    { field: 'tipo', headerName: 'Tipo', width: 110, editable: true, cellEditor: 'agSelectCellEditor',
      cellEditorParams: { values: ['numerica', 'texto', 'fecha'] } },
    { field: 'ancho', headerName: 'Anchura', width: 90, editable: true, cellEditor: 'agNumberCellEditor', cellEditorParams: { min: 1, max: 255, precision: 0 } },
    { field: 'decimales', headerName: 'Decimales', width: 100, editable: true, cellEditor: 'agNumberCellEditor', cellEditorParams: { min: 0, max: 16, precision: 0 } },
    { field: 'etiqueta', headerName: 'Etiqueta', width: 260, editable: true },
    { headerName: 'Valores', width: 200, editable: false, valueGetter: (p) => p.data ? resumenEtiquetas(p.data) : '',
      cellRenderer: (p: ICellRendererParams<Variable>) => (
        <button className="celda-boton" onClick={() => setEditando({ indice: p.node.rowIndex ?? 0, que: 'etiquetas' })}>{p.value}…</button>
      ) },
    { headerName: 'Perdidos', width: 150, editable: false, valueGetter: (p) => p.data ? resumenPerdidos(p.data) : '',
      cellRenderer: (p: ICellRendererParams<Variable>) => (
        <button className="celda-boton" onClick={() => setEditando({ indice: p.node.rowIndex ?? 0, que: 'perdidos' })}>{p.value}…</button>
      ) },
    { field: 'columnas', headerName: 'Columnas', width: 100, editable: true, cellEditor: 'agNumberCellEditor', cellEditorParams: { min: 1, max: 60, precision: 0 } },
    { field: 'alineacion', headerName: 'Alineación', width: 110, editable: true, cellEditor: 'agSelectCellEditor',
      cellEditorParams: { values: ['izquierda', 'centro', 'derecha'] } },
    { field: 'medida', headerName: 'Medida', width: 110, editable: true, cellEditor: 'agSelectCellEditor',
      cellEditorParams: { values: ['nominal', 'ordinal', 'escala'] } },
  ], [])

  const onCambio = useCallback((e: CellValueChangedEvent<Variable>) => {
    setFilas((prev) => {
      const copia = [...prev]
      copia[e.node.rowIndex ?? 0] = { ...e.data }
      return copia
    })
    setSucio(true)
  }, [])

  const anadir = () => {
    let k = filas.length + 1
    while (filas.some((v) => v.nombre === `VAR${String(k).padStart(3, '0')}`)) k++
    setFilas([...filas, variableNueva(`VAR${String(k).padStart(3, '0')}`)])
    setSucio(true)
  }

  const eliminar = () => {
    if (seleccion === null) return
    if (!confirm(`¿Eliminar la variable ${filas[seleccion].nombre} y sus datos?`)) return
    setFilas(filas.filter((_, i) => i !== seleccion))
    setSeleccion(null)
    setSucio(true)
  }

  const guardar = async () => {
    for (const v of filas) {
      if (!NOMBRE_VALIDO.test(v.nombre)) { onError(`Nombre de variable no válido: "${v.nombre}". Use letras, dígitos y guion bajo, sin empezar por dígito.`); return }
    }
    try {
      await api.guardarVariables(id, filas)
      setSucio(false)
      onGuardado()
    } catch (e) { onError((e as Error).message) }
  }

  return (
    <div className="vista-variables">
      <div className="barra-acciones">
        <button onClick={anadir}>+ Variable</button>
        <button onClick={eliminar} disabled={seleccion === null}>− Eliminar</button>
        <span className="espacio" />
        {sucio && <span className="aviso-sucio">Cambios sin guardar</span>}
        <button onClick={() => { setFilas(structuredClone(variables)); setSucio(false) }} disabled={!sucio}>Descartar</button>
        <button className="primario" onClick={guardar} disabled={!sucio}>Guardar cambios</button>
      </div>
      <div className="grid-contenedor">
        <AgGridReact<Variable>
          theme={temaGrid}
          rowData={filas}
          columnDefs={columnas}
          getRowId={(p) => String(filas.indexOf(p.data))}
          onCellValueChanged={onCambio}
          onCellFocused={(e) => setSeleccion(e.rowIndex)}
          stopEditingWhenCellsLoseFocus
          singleClickEdit={false}
        />
      </div>
      {editando && (
        <ModalEtiquetas
          variable={filas[editando.indice]}
          que={editando.que}
          onCerrar={() => setEditando(null)}
          onGuardar={(v) => {
            setFilas((prev) => prev.map((x, i) => (i === editando.indice ? v : x)))
            setSucio(true)
            setEditando(null)
          }}
        />
      )}
    </div>
  )
}
