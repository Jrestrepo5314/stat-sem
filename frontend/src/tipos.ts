// Espejo de backend/app/modelos.py

export type Medida = 'nominal' | 'ordinal' | 'escala'
export type TipoVariable = 'numerica' | 'texto' | 'fecha'
export type Alineacion = 'izquierda' | 'centro' | 'derecha'

export interface Variable {
  nombre: string
  tipo: TipoVariable
  ancho: number
  decimales: number
  etiqueta: string
  etiquetas_valores: Record<string, string>
  perdidos: (number | string | [number, number])[]
  columnas: number
  alineacion: Alineacion
  medida: Medida
}

export interface ResumenDataset {
  id: string
  nombre: string
  n_filas: number
  n_variables: number
}

export type Celda = string | number | null

export interface PaginaFilas {
  total: number
  inicio: number
  filas: Celda[][]
}

export interface BloqueTabla {
  tipo: 'tabla'
  titulo: string
  columnas: string[]
  filas: Celda[][]
  notas: string[]
}

export interface BloqueTexto {
  tipo: 'texto'
  texto: string
  nivel: 'parrafo' | 'aviso' | 'error'
}

export interface NodoGrafo { id: string; tipo: 'latente' | 'observada' }
export interface AristaGrafo {
  id: string
  origen: string
  destino: string
  tipo: 'carga' | 'regresion' | 'covarianza'
  valor: number | null
  p: number | null
}

export interface BloqueGrafo {
  tipo: 'grafo'
  titulo: string
  nodos: NodoGrafo[]
  aristas: AristaGrafo[]
}

export type Bloque = BloqueTabla | BloqueTexto | BloqueGrafo

export interface Salida {
  titulo: string
  procedimiento: string
  bloques: Bloque[]
  // añadido por el frontend
  hora?: string
  id?: number
}

export function variableNueva(nombre: string): Variable {
  return {
    nombre, tipo: 'numerica', ancho: 8, decimales: 2, etiqueta: '', etiquetas_valores: {},
    perdidos: [], columnas: 8, alineacion: 'derecha', medida: 'escala',
  }
}
