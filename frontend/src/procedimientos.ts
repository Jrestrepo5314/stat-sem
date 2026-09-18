// Definición declarativa de cada cuadro de diálogo de análisis.
// El componente DialogoAnalisis dibuja los campos a partir de esto y arma los parámetros
// con las mismas claves que esperan las funciones de backend/app/analisis.

export type TipoCampo = 'variables' | 'variable' | 'numero' | 'texto' | 'select' | 'check' | 'checks' | 'pares'

export interface Campo {
  clave: string
  etiqueta: string
  tipo: TipoCampo
  requerido?: boolean
  numerica?: boolean            // solo admite variables numéricas
  opciones?: { valor: string; etiqueta: string }[]
  porDefecto?: unknown
  ayuda?: string
}

export interface Procedimiento {
  clave: string
  titulo: string
  menu: string
  campos: Campo[]
}

export const PROCEDIMIENTOS: Procedimiento[] = [
  {
    clave: 'frecuencias', titulo: 'Frecuencias', menu: 'Estadísticos descriptivos',
    campos: [{ clave: 'variables', etiqueta: 'Variables', tipo: 'variables', requerido: true }],
  },
  {
    clave: 'descriptivos', titulo: 'Descriptivos', menu: 'Estadísticos descriptivos',
    campos: [{ clave: 'variables', etiqueta: 'Variables', tipo: 'variables', requerido: true, numerica: true }],
  },
  {
    clave: 'explorar', titulo: 'Explorar', menu: 'Estadísticos descriptivos',
    campos: [
      { clave: 'variables', etiqueta: 'Lista de dependientes', tipo: 'variables', requerido: true, numerica: true },
      { clave: 'factor', etiqueta: 'Lista de factores (opcional)', tipo: 'variable' },
    ],
  },
  {
    clave: 'tablas_cruzadas', titulo: 'Tablas cruzadas', menu: 'Estadísticos descriptivos',
    campos: [
      { clave: 'filas', etiqueta: 'Filas', tipo: 'variable', requerido: true },
      { clave: 'columnas', etiqueta: 'Columnas', tipo: 'variable', requerido: true },
      { clave: 'porcentajes', etiqueta: 'Porcentajes', tipo: 'checks', porDefecto: [],
        opciones: [{ valor: 'fila', etiqueta: 'Fila' }, { valor: 'columna', etiqueta: 'Columna' }, { valor: 'total', etiqueta: 'Total' }] },
      { clave: 'chi2', etiqueta: 'Chi-cuadrado y medidas de asociación', tipo: 'check', porDefecto: true },
    ],
  },
  {
    clave: 't_una_muestra', titulo: 'Prueba T para una muestra', menu: 'Comparar medias',
    campos: [
      { clave: 'variables', etiqueta: 'Variables para contrastar', tipo: 'variables', requerido: true, numerica: true },
      { clave: 'valor_prueba', etiqueta: 'Valor de prueba', tipo: 'numero', porDefecto: 0 },
    ],
  },
  {
    clave: 't_independientes', titulo: 'Prueba T para muestras independientes', menu: 'Comparar medias',
    campos: [
      { clave: 'variables', etiqueta: 'Variables para contrastar', tipo: 'variables', requerido: true, numerica: true },
      { clave: 'grupo', etiqueta: 'Variable de agrupación', tipo: 'variable', requerido: true },
      { clave: 'grupo1', etiqueta: 'Grupo 1 (valor)', tipo: 'texto', requerido: true, ayuda: 'Escriba el valor tal como está en los datos, p. ej. 1' },
      { clave: 'grupo2', etiqueta: 'Grupo 2 (valor)', tipo: 'texto', requerido: true },
    ],
  },
  {
    clave: 't_pareadas', titulo: 'Prueba T para muestras relacionadas', menu: 'Comparar medias',
    campos: [{ clave: 'pares', etiqueta: 'Variables emparejadas', tipo: 'pares', requerido: true, numerica: true }],
  },
  {
    clave: 'anova_un_factor', titulo: 'ANOVA de un factor', menu: 'Comparar medias',
    campos: [
      { clave: 'dependientes', etiqueta: 'Lista de dependientes', tipo: 'variables', requerido: true, numerica: true },
      { clave: 'factor', etiqueta: 'Factor', tipo: 'variable', requerido: true },
      { clave: 'post_hoc', etiqueta: 'Comparaciones post hoc (Tukey HSD)', tipo: 'check', porDefecto: true },
    ],
  },
  {
    clave: 'correlaciones', titulo: 'Correlaciones bivariadas', menu: 'Correlaciones',
    campos: [
      { clave: 'variables', etiqueta: 'Variables', tipo: 'variables', requerido: true, numerica: true },
      { clave: 'metodo', etiqueta: 'Coeficiente', tipo: 'select', porDefecto: 'pearson',
        opciones: [{ valor: 'pearson', etiqueta: 'Pearson' }, { valor: 'spearman', etiqueta: 'Spearman' }, { valor: 'kendall', etiqueta: 'Tau-b de Kendall' }] },
    ],
  },
  {
    clave: 'regresion_lineal', titulo: 'Regresión lineal', menu: 'Regresión',
    campos: [
      { clave: 'dependiente', etiqueta: 'Dependiente', tipo: 'variable', requerido: true, numerica: true },
      { clave: 'independientes', etiqueta: 'Independientes', tipo: 'variables', requerido: true, numerica: true },
    ],
  },
]

export const MENUS_ANALIZAR = ['Estadísticos descriptivos', 'Comparar medias', 'Correlaciones', 'Regresión']

export function procedimiento(clave: string): Procedimiento {
  const p = PROCEDIMIENTOS.find((x) => x.clave === clave)
  if (!p) throw new Error(`procedimiento desconocido: ${clave}`)
  return p
}
