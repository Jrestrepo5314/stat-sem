import { useEffect, useRef } from 'react'
import { celda } from '../formato'
import type { Bloque, Salida } from '../tipos'
import DiagramaRutas from './DiagramaRutas'

interface Props {
  salidas: Salida[]
  onLimpiar: () => void
}

function BloqueVista({ b }: { b: Bloque }) {
  if (b.tipo === 'texto') return <p className={`salida-texto ${b.nivel}`}>{b.texto}</p>
  if (b.tipo === 'grafo') return (<div className="bloque"><h4>{b.titulo}</h4><DiagramaRutas grafo={b} /></div>)
  return (
    <div className="bloque">
      <h4>{b.titulo}</h4>
      <div className="tabla-scroll">
        <table className="tabla-salida">
          <thead><tr>{b.columnas.map((c, i) => <th key={i}>{c}</th>)}</tr></thead>
          <tbody>
            {b.filas.map((f, i) => (
              <tr key={i}>{f.map((x, j) => <td key={j} className={typeof x === 'number' ? 'num' : ''}>{celda(x)}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
      {b.notas.map((n, i) => <div key={i} className="nota">{n}</div>)}
    </div>
  )
}

function aHTML(salidas: Salida[]): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
  const partes = salidas.map((s) => {
    const bloques = s.bloques.map((b) => {
      if (b.tipo === 'texto') return `<p>${esc(b.texto)}</p>`
      if (b.tipo === 'grafo') return `<p><i>Diagrama de rutas: ${b.aristas.length} relaciones (ver en la aplicación).</i></p>`
      const cab = b.columnas.map((c) => `<th>${esc(c)}</th>`).join('')
      const filas = b.filas.map((f) => `<tr>${f.map((x) => `<td style="text-align:${typeof x === 'number' ? 'right' : 'left'}">${esc(celda(x))}</td>`).join('')}</tr>`).join('')
      const notas = b.notas.map((n) => `<div style="font-size:11px;color:#555">${esc(n)}</div>`).join('')
      return `<h4>${esc(b.titulo)}</h4><table border="1" cellspacing="0" cellpadding="4" style="border-collapse:collapse;font-size:12px"><thead><tr>${cab}</tr></thead><tbody>${filas}</tbody></table>${notas}`
    }).join('')
    return `<h2>${esc(s.titulo)}</h2><div style="color:#666;font-size:12px">${s.hora ?? ''}</div>${bloques}`
  })
  return `<!doctype html><html><head><meta charset="utf-8"><title>Resultados</title><style>body{font-family:Segoe UI,Arial,sans-serif;margin:24px}th{background:#eef2f6}</style></head><body>${partes.join('<hr>')}</body></html>`
}

export default function Resultados({ salidas, onLimpiar }: Props) {
  const fin = useRef<HTMLDivElement>(null)
  useEffect(() => { fin.current?.scrollIntoView({ behavior: 'smooth' }) }, [salidas.length])

  const exportar = () => {
    const blob = new Blob([aHTML(salidas)], { type: 'text/html' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob); a.download = 'resultados.html'; a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div className="resultados">
      <div className="barra-acciones">
        <strong>Resultados</strong>
        <span className="espacio" />
        <button onClick={exportar} disabled={!salidas.length}>Exportar HTML</button>
        <button onClick={onLimpiar} disabled={!salidas.length}>Limpiar</button>
      </div>
      <div className="resultados-cuerpo">
        <nav className="indice-salidas">
          {salidas.map((s) => <a key={s.id} href={`#salida-${s.id}`}>{s.titulo}</a>)}
          {!salidas.length && <span className="tenue">Los análisis aparecen aquí</span>}
        </nav>
        <div className="contenido-salidas">
          {salidas.map((s) => (
            <section key={s.id} id={`salida-${s.id}`} className="salida">
              <h3>{s.titulo} <span className="hora">{s.hora}</span></h3>
              {s.bloques.map((b, i) => <BloqueVista key={i} b={b} />)}
            </section>
          ))}
          <div ref={fin} />
        </div>
      </div>
    </div>
  )
}
