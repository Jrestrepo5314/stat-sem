// Modelo SEM como estructura y su conversión bidireccional con la sintaxis tipo lavaan.
// El lienzo trabaja sobre ModeloSEM; el editor de texto trabaja sobre la sintaxis;
// `analizar` y `generar` son inversas salvo por el orden y los comentarios.

export interface ModeloSEM {
  latentes: string[]
  observadas: string[]
  cargas: [string, string][]        // [latente, indicador]
  regresiones: [string, string][]   // [dependiente, predictor]
  covarianzas: [string, string][]   // [a, b]
}

export const modeloVacio = (): ModeloSEM => ({ latentes: [], observadas: [], cargas: [], regresiones: [], covarianzas: [] })

const NOMBRE = /^[A-Za-z_][A-Za-z0-9_.]*$/

function terminos(der: string): string[] {
  return der.split('+').map((t) => {
    t = t.trim()
    if (t.includes('*')) t = t.split('*').pop()!.trim()   // "0.5*x" o "a*x" → x
    return t
  }).filter(Boolean)
}

/** Lee la sintaxis. Devuelve el modelo y las líneas que no pudo entender. */
export function analizar(sintaxis: string): { modelo: ModeloSEM; errores: string[] } {
  const m = modeloVacio()
  const errores: string[] = []
  const lat = new Set<string>(), obs = new Set<string>()
  const agregar = (lista: [string, string][], par: [string, string]) => {
    if (!lista.some(([a, b]) => a === par[0] && b === par[1])) lista.push(par)
  }
  const lineas = sintaxis.split(/\r?\n/)
  // primera pasada: qué es latente (todo lo que aparece a la izquierda de =~)
  for (const cruda of lineas) {
    const l = cruda.split('#')[0].trim()
    if (l.includes('=~')) lat.add(l.split('=~')[0].trim())
  }
  lineas.forEach((cruda, i) => {
    const l = cruda.split('#')[0].trim()
    if (!l) return
    const op = l.includes('=~') ? '=~' : l.includes('~~') ? '~~' : l.includes('~') ? '~' : null
    if (!op) { errores.push(`Línea ${i + 1}: no reconozco "${l}"`); return }
    const [izq, der] = l.split(op, 2).map((s) => s.trim())
    const ders = terminos(der)
    if (!NOMBRE.test(izq) || !ders.length || ders.some((d) => !NOMBRE.test(d))) {
      errores.push(`Línea ${i + 1}: nombre de variable no válido en "${l}"`); return
    }
    for (const d of ders) {
      if (op === '=~') { agregar(m.cargas, [izq, d]); if (!lat.has(d)) obs.add(d) }
      else if (op === '~') { agregar(m.regresiones, [izq, d]); if (!lat.has(izq)) obs.add(izq); if (!lat.has(d)) obs.add(d) }
      else { if (izq === d) continue; agregar(m.covarianzas, [izq, d]); if (!lat.has(izq)) obs.add(izq); if (!lat.has(d)) obs.add(d) }
    }
  })
  m.latentes = [...lat]
  m.observadas = [...obs]
  return { modelo: m, errores }
}

/** Escribe la sintaxis a partir del modelo, agrupando por latente y por dependiente. */
export function generar(m: ModeloSEM): string {
  const lineas: string[] = []
  for (const l of m.latentes) {
    const inds = m.cargas.filter(([lat]) => lat === l).map(([, i]) => i)
    if (inds.length) lineas.push(`${l} =~ ${inds.join(' + ')}`)
  }
  const deps = [...new Set(m.regresiones.map(([d]) => d))]
  for (const d of deps) {
    const preds = m.regresiones.filter(([dep]) => dep === d).map(([, p]) => p)
    lineas.push(`${d} ~ ${preds.join(' + ')}`)
  }
  for (const [a, b] of m.covarianzas) lineas.push(`${a} ~~ ${b}`)
  return lineas.join('\n')
}

/** Igualdad estructural, sin importar el orden. */
export function iguales(a: ModeloSEM, b: ModeloSEM): boolean {
  const clave = (m: ModeloSEM) => JSON.stringify({
    l: [...m.latentes].sort(), o: [...m.observadas].sort(),
    c: m.cargas.map((p) => p.join('>')).sort(),
    r: m.regresiones.map((p) => p.join('>')).sort(),
    v: m.covarianzas.map((p) => [...p].sort().join('<>')).sort(),
  })
  return clave(a) === clave(b)
}

export function nombreLatenteLibre(m: ModeloSEM, base = 'F'): string {
  let k = 1
  while (m.latentes.includes(`${base}${k}`) || m.observadas.includes(`${base}${k}`)) k++
  return `${base}${k}`
}

// ---------------------------------------------------------------------------
// Propuestas automáticas: la vía fácil para quien nunca ha escrito un modelo.
// ---------------------------------------------------------------------------

/**
 * Propone el modelo de medición a partir de los nombres de las variables.
 *
 * Una encuesta bien nombrada ya lleva el modelo escrito: «fu1, fu2, fu3» son los
 * tres ítems del constructo FU, «cli1..cli3» los de CLI. Se agrupan las
 * variables por su prefijo alfabético; cada grupo con dos o más ítems se
 * convierte en un constructo latente, nombrado con el prefijo en mayúsculas
 * como hace el libro (FU =~ fu1 + fu2 + fu3). Lo que no encaje en el patrón
 * (id, sexo, salario) se deja fuera: el estudiante lo añade si lo necesita.
 */
export function proponerMedicion(nombres: string[]): ModeloSEM {
  const grupos = new Map<string, string[]>()
  for (const n of nombres) {
    const m = /^([A-Za-z][A-Za-z_]*?)[_.]?(\d+)$/.exec(n)
    if (!m) continue
    const prefijo = m[1]
    if (!grupos.has(prefijo)) grupos.set(prefijo, [])
    grupos.get(prefijo)!.push(n)
  }
  const modelo = modeloVacio()
  for (const [prefijo, items] of grupos) {
    if (items.length < 2) continue
    let latente = prefijo.toUpperCase()
    // si el nombre en mayúsculas choca con una variable observada, se marca
    if (nombres.includes(latente) || modelo.latentes.includes(latente)) latente = `${latente}_lat`
    modelo.latentes.push(latente)
    for (const it of items) { modelo.cargas.push([latente, it]); modelo.observadas.push(it) }
  }
  return modelo
}

/**
 * Propone un modelo estructural en cadena sobre los constructos existentes:
 * el primero explica al segundo, el segundo al tercero… (clima → compromiso →
 * desempeño). Es la hipótesis más sencilla de leer y de corregir: el estudiante
 * arrastra o reescribe las flechas que su teoría diga distinto.
 */
export function proponerCadena(m: ModeloSEM): ModeloSEM {
  const r = structuredClone(m)
  r.regresiones = []
  for (let i = 1; i < r.latentes.length; i++) r.regresiones.push([r.latentes[i], r.latentes[i - 1]])
  return r
}

/** Solo el modelo de medición (CFA): las cargas y las covarianzas, sin regresiones. */
export function soloMedicion(m: ModeloSEM): ModeloSEM {
  const r = structuredClone(m)
  r.regresiones = []
  // las observadas que solo participaban como predictores o dependientes salen
  const enCargas = new Set(r.cargas.map(([, o]) => o))
  const enCov = new Set(r.covarianzas.flat())
  r.observadas = r.observadas.filter((o) => enCargas.has(o) || enCov.has(o))
  return r
}
