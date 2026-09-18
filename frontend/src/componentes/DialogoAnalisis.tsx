import { useMemo, useState } from 'react'
import { procedimiento, type Campo } from '../procedimientos'
import type { Variable } from '../tipos'

interface Props {
  clave: string
  variables: Variable[]
  onEjecutar: (parametros: Record<string, unknown>) => Promise<void>
  onCerrar: () => void
}

type Valores = Record<string, unknown>

function valoresIniciales(campos: Campo[]): Valores {
  const v: Valores = {}
  for (const c of campos) {
    if (c.tipo === 'variables' || c.tipo === 'pares' || c.tipo === 'checks') v[c.clave] = c.porDefecto ?? []
    else if (c.tipo === 'variable') v[c.clave] = null
    else v[c.clave] = c.porDefecto ?? (c.tipo === 'check' ? false : '')
  }
  return v
}

/** Cuadro de diálogo al estilo SPSS: lista de variables a la izquierda y campos destino a la derecha. */
export default function DialogoAnalisis({ clave, variables, onEjecutar, onCerrar }: Props) {
  const proc = useMemo(() => procedimiento(clave), [clave])
  const [valores, setValores] = useState<Valores>(() => valoresIniciales(proc.campos))
  const [marcadas, setMarcadas] = useState<string[]>([])
  const [parA, setParA] = useState<string | null>(null)
  const [parB, setParB] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const usadas = useMemo(() => {
    const s = new Set<string>()
    for (const c of proc.campos) {
      const v = valores[c.clave]
      if (c.tipo === 'variables') (v as string[]).forEach((x) => s.add(x))
      if (c.tipo === 'variable' && v) s.add(v as string)
    }
    return s
  }, [valores, proc])

  const disponibles = variables.filter((v) => !usadas.has(v.nombre))

  const pasar = (c: Campo) => {
    let candidatas = marcadas.filter((m) => !usadas.has(m))
    if (c.numerica) {
      const noNum = candidatas.filter((m) => variables.find((v) => v.nombre === m)?.tipo !== 'numerica')
      if (noNum.length) { setError(`Solo admite variables numéricas: ${noNum.join(', ')}`); return }
    }
    if (!candidatas.length) return
    setError(null)
    if (c.tipo === 'variables') {
      setValores({ ...valores, [c.clave]: [...(valores[c.clave] as string[]), ...candidatas] })
    } else if (c.tipo === 'variable') {
      setValores({ ...valores, [c.clave]: candidatas[0] })
    } else if (c.tipo === 'pares') {
      if (!parA) setParA(candidatas[0])
      else if (!parB) setParB(candidatas[0])
      candidatas = candidatas.slice(1)
    }
    setMarcadas([])
  }

  const quitar = (c: Campo, nombre: string) => {
    if (c.tipo === 'variables') setValores({ ...valores, [c.clave]: (valores[c.clave] as string[]).filter((x) => x !== nombre) })
    else setValores({ ...valores, [c.clave]: null })
  }

  const anadirPar = (c: Campo) => {
    if (!parA || !parB) return
    setValores({ ...valores, [c.clave]: [...(valores[c.clave] as string[][]), [parA, parB]] })
    setParA(null); setParB(null)
  }

  const validar = (): string | null => {
    for (const c of proc.campos) {
      const v = valores[c.clave]
      if (!c.requerido) continue
      if ((c.tipo === 'variables' || c.tipo === 'pares') && !(v as unknown[]).length) return `Falta: ${c.etiqueta}`
      if (c.tipo === 'variable' && !v) return `Falta: ${c.etiqueta}`
      if ((c.tipo === 'texto' || c.tipo === 'numero') && (v === '' || v === null)) return `Falta: ${c.etiqueta}`
    }
    return null
  }

  const ejecutar = async () => {
    const e = validar()
    if (e) { setError(e); return }
    const params: Valores = {}
    for (const c of proc.campos) {
      const v = valores[c.clave]
      if (c.tipo === 'numero') params[c.clave] = Number(String(v).replace(',', '.'))
      else if (c.tipo === 'variable' && !v) continue
      else params[c.clave] = v
    }
    setOcupado(true)
    try { await onEjecutar(params); onCerrar() }
    catch (err) { setError((err as Error).message) }
    finally { setOcupado(false) }
  }

  return (
    <div className="modal-fondo" onClick={onCerrar}>
      <div className="modal dialogo-analisis" onClick={(e) => e.stopPropagation()}>
        <h3>{proc.titulo}</h3>
        <div className="dialogo-cuerpo">
          <div className="lista-disponibles">
            <div className="titulo-lista">Variables</div>
            <ul>
              {disponibles.map((v) => (
                <li key={v.nombre} className={marcadas.includes(v.nombre) ? 'marcada' : ''}
                  title={v.etiqueta}
                  onClick={(e) => {
                    if (e.ctrlKey || e.metaKey) setMarcadas((m) => (m.includes(v.nombre) ? m.filter((x) => x !== v.nombre) : [...m, v.nombre]))
                    else setMarcadas([v.nombre])
                  }}>
                  <span className={`icono-medida ${v.medida}`} />{v.nombre}{v.etiqueta ? ` — ${v.etiqueta}` : ''}
                </li>
              ))}
            </ul>
            <div className="tenue">Ctrl+clic para marcar varias</div>
          </div>
          <div className="campos-destino">
            {proc.campos.map((c) => (
              <div key={c.clave} className="campo">
                <div className="titulo-lista">{c.etiqueta}{c.requerido ? ' *' : ''}</div>
                {(c.tipo === 'variables' || c.tipo === 'variable') && (
                  <div className="destino">
                    <button className="flecha" onClick={() => pasar(c)} title="Pasar">→</button>
                    <ul className="caja-destino">
                      {c.tipo === 'variables'
                        ? (valores[c.clave] as string[]).map((n) => <li key={n} onClick={() => quitar(c, n)} title="Clic para quitar">{n}</li>)
                        : valores[c.clave] ? <li onClick={() => quitar(c, valores[c.clave] as string)} title="Clic para quitar">{valores[c.clave] as string}</li> : null}
                    </ul>
                  </div>
                )}
                {c.tipo === 'pares' && (
                  <div className="destino pares">
                    <button className="flecha" onClick={() => pasar(c)} title="Pasar">→</button>
                    <div>
                      <div className="par-actual">
                        <span>Variable 1: <b>{parA ?? '—'}</b></span>
                        <span>Variable 2: <b>{parB ?? '—'}</b></span>
                        <button onClick={() => anadirPar(c)} disabled={!parA || !parB}>Añadir par</button>
                        <button className="enlace" onClick={() => { setParA(null); setParB(null) }}>limpiar</button>
                      </div>
                      <ul className="caja-destino">
                        {(valores[c.clave] as string[][]).map((p, i) => (
                          <li key={i} onClick={() => setValores({ ...valores, [c.clave]: (valores[c.clave] as string[][]).filter((_, j) => j !== i) })}>
                            Par {i + 1}: {p[0]} – {p[1]}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
                {c.tipo === 'numero' && (
                  <input type="text" value={String(valores[c.clave] ?? '')} onChange={(e) => setValores({ ...valores, [c.clave]: e.target.value })} style={{ width: 120 }} />
                )}
                {c.tipo === 'texto' && (
                  <input type="text" value={String(valores[c.clave] ?? '')} onChange={(e) => setValores({ ...valores, [c.clave]: e.target.value })} style={{ width: 160 }} title={c.ayuda} />
                )}
                {c.tipo === 'select' && (
                  <select value={String(valores[c.clave])} onChange={(e) => setValores({ ...valores, [c.clave]: e.target.value })}>
                    {c.opciones!.map((o) => <option key={o.valor} value={o.valor}>{o.etiqueta}</option>)}
                  </select>
                )}
                {c.tipo === 'check' && (
                  <label className="check"><input type="checkbox" checked={Boolean(valores[c.clave])} onChange={(e) => setValores({ ...valores, [c.clave]: e.target.checked })} /> {c.etiqueta}</label>
                )}
                {c.tipo === 'checks' && (
                  <div className="checks">
                    {c.opciones!.map((o) => {
                      const sel = valores[c.clave] as string[]
                      return (
                        <label key={o.valor} className="check">
                          <input type="checkbox" checked={sel.includes(o.valor)}
                            onChange={(e) => setValores({ ...valores, [c.clave]: e.target.checked ? [...sel, o.valor] : sel.filter((x) => x !== o.valor) })} /> {o.etiqueta}
                        </label>
                      )
                    })}
                  </div>
                )}
                {c.ayuda && c.tipo !== 'texto' && <div className="tenue">{c.ayuda}</div>}
              </div>
            ))}
          </div>
        </div>
        {error && <div className="error-dialogo">{error}</div>}
        <div className="fila-botones">
          <button onClick={() => setValores(valoresIniciales(proc.campos))}>Restablecer</button>
          <button onClick={onCerrar}>Cancelar</button>
          <button className="primario" onClick={ejecutar} disabled={ocupado}>{ocupado ? 'Calculando…' : 'Aceptar'}</button>
        </div>
      </div>
    </div>
  )
}
