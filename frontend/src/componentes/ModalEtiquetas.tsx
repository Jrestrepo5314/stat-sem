import { useState } from 'react'
import type { Variable } from '../tipos'

interface Props {
  variable: Variable
  que: 'etiquetas' | 'perdidos'
  onCerrar: () => void
  onGuardar: (v: Variable) => void
}

/** Editor de etiquetas de valor o de valores perdidos de una variable (como los diálogos de SPSS). */
export default function ModalEtiquetas({ variable, que, onCerrar, onGuardar }: Props) {
  const [pares, setPares] = useState<[string, string][]>(Object.entries(variable.etiquetas_valores))
  const [valor, setValor] = useState('')
  const [etiqueta, setEtiqueta] = useState('')
  const [perdidos, setPerdidos] = useState(
    variable.perdidos.filter((p) => !Array.isArray(p)).map(String).join(', '),
  )
  const rango = variable.perdidos.find((p) => Array.isArray(p)) as [number, number] | undefined
  const [lo, setLo] = useState(rango ? String(rango[0]) : '')
  const [hi, setHi] = useState(rango ? String(rango[1]) : '')

  const guardarEtiquetas = () => onGuardar({ ...variable, etiquetas_valores: Object.fromEntries(pares) })

  const guardarPerdidos = () => {
    const sueltos = perdidos.split(',').map((s) => s.trim()).filter(Boolean)
      .map((s) => (variable.tipo === 'numerica' ? Number(s.replace(',', '.')) : s))
    if (sueltos.some((s) => typeof s === 'number' && Number.isNaN(s))) { alert('Hay un valor perdido que no es numérico.'); return }
    const lista: Variable['perdidos'] = [...sueltos]
    if (lo !== '' && hi !== '') lista.push([Number(lo), Number(hi)])
    onGuardar({ ...variable, perdidos: lista })
  }

  return (
    <div className="modal-fondo" onClick={onCerrar}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{que === 'etiquetas' ? 'Etiquetas de valor' : 'Valores perdidos'} · {variable.nombre}</h3>
        {que === 'etiquetas' ? (
          <>
            <div className="fila-form">
              <label>Valor <input value={valor} onChange={(e) => setValor(e.target.value)} style={{ width: 90 }} /></label>
              <label>Etiqueta <input value={etiqueta} onChange={(e) => setEtiqueta(e.target.value)} style={{ width: 240 }} /></label>
              <button onClick={() => {
                if (!valor) return
                setPares((p) => [...p.filter(([k]) => k !== valor), [valor, etiqueta]])
                setValor(''); setEtiqueta('')
              }}>Añadir</button>
            </div>
            <ul className="lista-etiquetas">
              {pares.map(([k, lab]) => (
                <li key={k}><code>{k}</code> = {lab}
                  <button className="enlace" onClick={() => setPares((p) => p.filter(([x]) => x !== k))}>quitar</button>
                </li>
              ))}
              {!pares.length && <li className="tenue">Sin etiquetas</li>}
            </ul>
            <div className="fila-botones">
              <button onClick={onCerrar}>Cancelar</button>
              <button className="primario" onClick={guardarEtiquetas}>Aceptar</button>
            </div>
          </>
        ) : (
          <>
            <label className="bloque-form">Valores perdidos discretos (separados por coma)
              <input value={perdidos} onChange={(e) => setPerdidos(e.target.value)} placeholder="p. ej. 9, 99" />
            </label>
            {variable.tipo === 'numerica' && (
              <div className="fila-form">
                <label>Rango desde <input value={lo} onChange={(e) => setLo(e.target.value)} style={{ width: 80 }} /></label>
                <label>hasta <input value={hi} onChange={(e) => setHi(e.target.value)} style={{ width: 80 }} /></label>
              </div>
            )}
            <p className="tenue">Los valores marcados como perdidos se excluyen de todos los análisis, pero se conservan en los datos.</p>
            <div className="fila-botones">
              <button onClick={onCerrar}>Cancelar</button>
              <button className="primario" onClick={guardarPerdidos}>Aceptar</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
