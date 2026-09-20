import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from './api'
import { MENUS_ANALIZAR, PROCEDIMIENTOS } from './procedimientos'
import type { ResumenDataset, Salida, Variable } from './tipos'
import DialogoAnalisis from './componentes/DialogoAnalisis'
import LienzoSEM from './componentes/LienzoSEM'
import type { Posiciones } from './sem/disposicion'
import type { BloqueGrafo } from './tipos'
import Resultados from './componentes/Resultados'
import VistaDatos from './componentes/VistaDatos'
import VistaVariables from './componentes/VistaVariables'
import './estilos.css'

let contadorSalidas = 0

export default function App() {
  const [datasets, setDatasets] = useState<ResumenDataset[]>([])
  const [activo, setActivo] = useState<ResumenDataset | null>(null)
  const [variables, setVariables] = useState<Variable[]>([])
  const [version, setVersion] = useState(0)
  const [pestana, setPestana] = useState<'datos' | 'variables'>('datos')
  const [conEtiquetas, setConEtiquetas] = useState(false)
  const [salidas, setSalidas] = useState<Salida[]>([])
  const [dialogo, setDialogo] = useState<string | null>(null)
  const [lienzoSEM, setLienzoSEM] = useState(false)
  const [modeloSEM, setModeloSEM] = useState<{ sintaxis: string; posiciones: Posiciones }>({ sintaxis: '', posiciones: {} })
  const [ultimoGrafo, setUltimoGrafo] = useState<BloqueGrafo | null>(null)
  const onCambioSEM = useCallback((sintaxis: string, posiciones: Posiciones) => setModeloSEM({ sintaxis, posiciones }), [])
  const [menuAbierto, setMenuAbierto] = useState<string | null>(null)
  const [mensaje, setMensaje] = useState<{ texto: string; tipo: 'error' | 'info' } | null>(null)
  const [filaActiva, setFilaActiva] = useState<number | null>(null)
  const [anchoResultados, setAnchoResultados] = useState(46)
  const inputArchivo = useRef<HTMLInputElement>(null)
  const arrastrando = useRef(false)

  const avisar = useCallback((texto: string, tipo: 'error' | 'info' = 'error') => {
    setMensaje({ texto, tipo })
    window.setTimeout(() => setMensaje((m) => (m?.texto === texto ? null : m)), 6000)
  }, [])

  const cargarLista = useCallback(async () => {
    try { setDatasets(await api.listarDatasets()) } catch (e) { avisar((e as Error).message) }
  }, [avisar])

  const abrirDataset = useCallback(async (id: string) => {
    try {
      const d = await api.detalle(id)
      setActivo(d.resumen); setVariables(d.variables); setVersion((v) => v + 1)
    } catch (e) { avisar((e as Error).message) }
  }, [avisar])

  useEffect(() => { cargarLista() }, [cargarLista])

  /** Deja el modelo en el lienzo y lo abre: es lo que hace fácil «ver un SEM». */
  const sembrarSEM = useCallback((sintaxis: string) => {
    setModeloSEM({ sintaxis, posiciones: {} })
    setUltimoGrafo(null)
    setLienzoSEM(true)
  }, [])

  /** Abre un conjunto de ejemplo y, si se pide, su modelo SEM sugerido en el lienzo. */
  const abrirEjemplo = useCallback(async (clave: string, conModelo: boolean) => {
    try {
      const r = await api.abrirEjemplo(clave)
      await cargarLista(); await abrirDataset(r.id)
      avisar(`Abierto ${r.nombre}: ${r.n_filas} casos, ${r.n_variables} variables`, 'info')
      if (conModelo) {
        const e = (await api.listarEjemplos()).find((x) => x.clave === clave)
        if (e?.modelo) sembrarSEM(e.modelo)
      }
    } catch (e) { avisar((e as Error).message) }
  }, [cargarLista, abrirDataset, avisar, sembrarSEM])

  // Parámetros de la URL, con los que el tutor del libro llega aquí con todo preparado:
  //   ?abrir=<url>       descarga y abre ese conjunto de datos (sitios del autor o Zenodo)
  //   ?ejemplo=<clave>   abre uno de los conjuntos de ejemplo de la app
  //   ?modelo=<sintaxis> deja ese modelo en el lienzo SEM y lo abre
  //   ?sem=1             abre el lienzo aunque no venga modelo
  // Se leen todos ANTES de limpiar la barra de direcciones.
  useEffect(() => {
    const q = new URLSearchParams(location.search)
    const url = q.get('abrir'), ejemplo = q.get('ejemplo'), modelo = q.get('modelo'), sem = q.get('sem')
    if (!url && !ejemplo && !modelo && !sem) return
    history.replaceState(null, '', location.pathname)
    const despues = () => { if (modelo) sembrarSEM(modelo); else if (sem) setLienzoSEM(true) }
    if (ejemplo) { abrirEjemplo(ejemplo, false).then(despues); return }
    if (!url) { despues(); return }
    api.importarURL(url)
      .then(async (r) => { await cargarLista(); await abrirDataset(r.id); avisar(`Abierto ${r.nombre}: ${r.n_filas} casos, ${r.n_variables} variables`, 'info'); despues() })
      .catch((e) => avisar((e as Error).message))
  }, [cargarLista, abrirDataset, avisar, abrirEjemplo, sembrarSEM])

  const subir = async (archivo: File) => {
    try {
      const r = await api.subirArchivo(archivo)
      await cargarLista(); await abrirDataset(r.id)
      avisar(`Abierto ${r.nombre}: ${r.n_filas} casos, ${r.n_variables} variables`, 'info')
    } catch (e) { avisar((e as Error).message) }
  }

  const nuevo = async () => {
    const r = await api.nuevoDataset()
    await cargarLista(); await abrirDataset(r.id); setPestana('variables')
  }

  const cerrar = async () => {
    if (!activo) return
    if (!confirm(`¿Cerrar ${activo.nombre}? Los datos se borran del servidor; guárdelos antes si los necesita.`)) return
    await api.borrarDataset(activo.id)
    setActivo(null); setVariables([]); await cargarLista()
  }

  const ejecutar = async (procedimiento: string, params: Record<string, unknown>) => {
    if (!activo) return
    const s = await api.analizar(activo.id, procedimiento, params)
    s.id = ++contadorSalidas
    s.hora = new Date().toLocaleTimeString('es-CO')
    setSalidas((prev) => [...prev, s])
    if (procedimiento === 'sem') {
      const g = s.bloques.find((b) => b.tipo === 'grafo') as BloqueGrafo | undefined
      setUltimoGrafo(g ?? null)
      if (!g) throw new Error(s.bloques.map((b) => (b.tipo === 'texto' ? b.texto : '')).filter(Boolean).join(' ') || 'La estimación no devolvió resultados')
    }
  }

  const insertarFila = async () => {
    if (!activo) return
    await api.insertarFila(activo.id, filaActiva ?? activo.n_filas)
    await abrirDataset(activo.id)
  }

  const borrarFila = async () => {
    if (!activo || filaActiva === null) return
    await api.borrarFila(activo.id, filaActiva)
    await abrirDataset(activo.id)
  }

  const descargar = (formato: 'sav' | 'csv') => {
    if (!activo) return
    window.open(api.urlExportar(activo.id, formato), '_blank')
  }

  // separador arrastrable entre el editor y los resultados
  const onMoverSeparador = (e: React.MouseEvent) => {
    if (!arrastrando.current) return
    const pct = 100 - (e.clientX / window.innerWidth) * 100
    setAnchoResultados(Math.min(75, Math.max(20, pct)))
  }

  const menu = (nombre: string, contenido: React.ReactNode) => (
    <div className="menu" onMouseLeave={() => setMenuAbierto(null)}>
      <button className={menuAbierto === nombre ? 'abierto' : ''} onClick={() => setMenuAbierto(menuAbierto === nombre ? null : nombre)}>{nombre}</button>
      {menuAbierto === nombre && <div className="menu-lista" onClick={() => setMenuAbierto(null)}>{contenido}</div>}
    </div>
  )
  const item = (texto: string, fn: () => void, deshabilitado = false) => (
    <button key={texto} className="menu-item" onClick={fn} disabled={deshabilitado}>{texto}</button>
  )
  const hayDatos = activo !== null

  return (
    <div className="app" onMouseMove={onMoverSeparador} onMouseUp={() => { arrastrando.current = false }}>
      <header className="cabecera">
        <div className="marca">Estadística <span>·</span> SEM</div>
        <nav className="menus">
          {menu('Archivo', <>
            {item('Abrir datos… (.sav, .csv, .xlsx)', () => inputArchivo.current?.click())}
            {item('Abrir la encuesta de ejemplo', () => abrirEjemplo('encuesta_demo', false))}
            {item('Nuevo conjunto de datos', nuevo)}
            {item('Guardar como .sav', () => descargar('sav'), !hayDatos)}
            {item('Exportar a CSV', () => descargar('csv'), !hayDatos)}
            {item('Cerrar conjunto de datos', cerrar, !hayDatos)}
          </>)}
          {menu('Datos', <>
            {item('Insertar caso', insertarFila, !hayDatos)}
            {item('Eliminar caso seleccionado', borrarFila, !hayDatos || filaActiva === null)}
            {item(conEtiquetas ? 'Mostrar valores' : 'Mostrar etiquetas de valor', () => setConEtiquetas(!conEtiquetas), !hayDatos)}
          </>)}
          {menu('Analizar', <>
            {MENUS_ANALIZAR.map((grupo) => (
              <div key={grupo} className="menu-grupo">
                <div className="menu-titulo">{grupo}</div>
                {PROCEDIMIENTOS.filter((p) => p.menu === grupo).map((p) => item(p.titulo + '…', () => setDialogo(p.clave), !hayDatos))}
              </div>
            ))}
          </>)}
          {menu('SEM', <>
            {item('Lienzo y sintaxis del modelo…', () => setLienzoSEM(true), !hayDatos)}
            {item('Ejemplo guiado: clima → compromiso → desempeño', () => abrirEjemplo('encuesta_demo', true))}
          </>)}
        </nav>
        <div className="selector-datasets">
          <select value={activo?.id ?? ''} onChange={(e) => e.target.value && abrirDataset(e.target.value)}>
            <option value="">— conjuntos abiertos —</option>
            {datasets.map((d) => <option key={d.id} value={d.id}>{d.nombre} ({d.n_filas}×{d.n_variables})</option>)}
          </select>
        </div>
        <input ref={inputArchivo} type="file" accept=".sav,.csv,.txt,.xlsx,.xls" hidden
          onChange={(e) => { const f = e.target.files?.[0]; if (f) subir(f); e.target.value = '' }} />
      </header>

      {mensaje && <div className={`mensaje ${mensaje.tipo}`}>{mensaje.texto}</div>}

      <main className="cuerpo" style={{ gridTemplateColumns: `1fr 6px ${anchoResultados}%` }}>
        <section className="editor">
          {activo ? (
            <>
              <div className="pestanas">
                <button className={pestana === 'datos' ? 'activa' : ''} onClick={() => setPestana('datos')}>Vista de datos</button>
                <button className={pestana === 'variables' ? 'activa' : ''} onClick={() => setPestana('variables')}>Vista de variables</button>
                <span className="espacio" />
                <span className="tenue">{activo.nombre} · {activo.n_filas} casos · {activo.n_variables} variables</span>
              </div>
              {pestana === 'datos'
                ? <VistaDatos id={activo.id} variables={variables} version={version} conEtiquetas={conEtiquetas} onFilaActiva={setFilaActiva} onError={avisar} />
                : <VistaVariables id={activo.id} variables={variables} onGuardado={() => abrirDataset(activo.id)} onError={avisar} />}
            </>
          ) : (
            <div className="vacio" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) subir(f) }}>
              <h2>Abra un archivo de datos</h2>
              <p>Arrastre aquí un archivo <b>.sav</b> de SPSS, un <b>.csv</b> o un <b>.xlsx</b>, o use <em>Archivo → Abrir datos</em>.</p>
              <button className="primario" onClick={() => inputArchivo.current?.click()}>Abrir datos…</button>
              <button onClick={nuevo}>Nuevo conjunto vacío</button>
              <p className="o-bien">¿Sin datos a mano? Practique con los de la aplicación:</p>
              <div className="fila-ejemplos">
                <button onClick={() => abrirEjemplo('encuesta_demo', false)} title="400 empleados: clima, compromiso y desempeño con tres ítems cada uno, más sexo, área, antigüedad y salario">Abrir la encuesta de ejemplo</button>
                <button onClick={() => abrirEjemplo('encuesta_demo', true)} title="Abre la encuesta con su modelo ya escrito en el lienzo: solo queda pulsar Estimar">Ver un SEM de ejemplo, listo para estimar</button>
              </div>
            </div>
          )}
        </section>
        <div className="separador" onMouseDown={() => { arrastrando.current = true }} />
        <Resultados salidas={salidas} onLimpiar={() => setSalidas([])} />
      </main>

      {dialogo && activo && (
        <DialogoAnalisis clave={dialogo} variables={variables} onCerrar={() => setDialogo(null)}
          onEjecutar={(p) => ejecutar(dialogo, p)} />
      )}
      {lienzoSEM && activo && (
        <LienzoSEM variables={variables} sintaxis={modeloSEM.sintaxis} posiciones={modeloSEM.posiciones}
          estimaciones={ultimoGrafo} onCambio={onCambioSEM}
          onCerrar={() => setLienzoSEM(false)} onEjecutar={(p) => ejecutar('sem', p)} />
      )}
    </div>
  )
}
