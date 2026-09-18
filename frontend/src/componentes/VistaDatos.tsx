import { useCallback, useEffect, useMemo, useRef } from 'react'
import { AgGridReact } from 'ag-grid-react'
import {
  AllCommunityModule, ModuleRegistry, themeQuartz,
  type CellValueChangedEvent, type ColDef, type GridApi, type GridReadyEvent, type IDatasource,
} from 'ag-grid-community'
import { api } from '../api'
import { valorDato } from '../formato'
import type { Celda, Variable } from '../tipos'

ModuleRegistry.registerModules([AllCommunityModule])

export const temaGrid = themeQuartz.withParams({
  fontSize: 13, headerFontSize: 13, rowHeight: 26, headerHeight: 30, spacing: 4,
  accentColor: '#1f5f8b', headerBackgroundColor: '#eef2f6', oddRowBackgroundColor: '#fafbfc',
})

type Fila = Record<string, Celda> & { __i: number }

interface Props {
  id: string
  variables: Variable[]
  version: number               // cambia cuando el servidor modificó los datos por fuera del grid
  conEtiquetas: boolean
  onFilaActiva: (indice: number | null) => void
  onError: (mensaje: string) => void
}

export default function VistaDatos({ id, variables, version, conEtiquetas, onFilaActiva, onError }: Props) {
  const gridApi = useRef<GridApi<Fila> | null>(null)
  const porNombre = useMemo(() => new Map(variables.map((v) => [v.nombre, v])), [variables])

  const columnas = useMemo<ColDef<Fila>[]>(() => [
    {
      headerName: '', valueGetter: (p) => (p.node?.rowIndex ?? 0) + 1, width: 60, pinned: 'left',
      cellClass: 'celda-indice', sortable: false, editable: false, suppressMovable: true,
    },
    ...variables.map<ColDef<Fila>>((v) => ({
      field: v.nombre, headerName: v.nombre, headerTooltip: v.etiqueta || v.nombre,
      width: Math.max(70, Math.min(360, v.columnas * 11 + 24)),
      editable: true, sortable: false, filter: false,
      cellClass: `alinear-${v.alineacion}`,
      valueFormatter: (p) => valorDato(p.value as Celda, porNombre.get(v.nombre), conEtiquetas),
    })),
  ], [variables, porNombre, conEtiquetas])

  const datasource = useMemo<IDatasource>(() => ({
    getRows: async (params) => {
      try {
        const pag = await api.filas(id, params.startRow, params.endRow - params.startRow)
        const filas: Fila[] = pag.filas.map((f, k) => {
          const fila = { __i: pag.inicio + k } as Fila
          variables.forEach((v, j) => { fila[v.nombre] = f[j] })
          return fila
        })
        params.successCallback(filas, pag.total)
      } catch (e) {
        onError((e as Error).message)
        params.failCallback()
      }
    },
  }), [id, variables, onError])

  useEffect(() => {
    gridApi.current?.refreshInfiniteCache()
  }, [version, datasource])

  const onReady = useCallback((e: GridReadyEvent<Fila>) => { gridApi.current = e.api }, [])

  const onCambio = useCallback(async (e: CellValueChangedEvent<Fila>) => {
    const nombre = e.colDef.field
    if (!nombre) return
    try {
      await api.editarCelda(id, e.data.__i, nombre, e.newValue ?? '')
    } catch (err) {
      onError((err as Error).message)
      e.api.refreshInfiniteCache()
    }
  }, [id, onError])

  return (
    <div className="grid-contenedor">
      <AgGridReact<Fila>
        theme={temaGrid}
        columnDefs={columnas}
        rowModelType="infinite"
        datasource={datasource}
        cacheBlockSize={200}
        maxBlocksInCache={20}
        onGridReady={onReady}
        onCellValueChanged={onCambio}
        onCellFocused={(e) => onFilaActiva(e.rowIndex)}
        stopEditingWhenCellsLoseFocus
        singleClickEdit={false}
        enableCellTextSelection
        localeText={{ noRowsToShow: 'Sin datos', loadingOoo: 'Cargando…' }}
      />
    </div>
  )
}
