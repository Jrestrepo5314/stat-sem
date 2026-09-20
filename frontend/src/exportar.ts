import { toPng, toSvg } from 'html-to-image'

// Se excluyen los controles y el fondo de puntos: solo el diagrama.
const filtro = (n: HTMLElement) => !(n.classList?.contains('react-flow__controls') || n.classList?.contains('react-flow__background'))

function descargar(url: string, nombre: string) {
  const a = document.createElement('a')
  a.href = url; a.download = nombre; a.click()
}

const MARGEN = 40

/**
 * El modelo entero, no lo que cabe en la ventana.
 *
 * Antes se fotografiaba el lienzo tal como se veía: con el zoom y el desplazamiento
 * del momento, así que el PNG salía con constructos cortados por los bordes y medio
 * lienzo en blanco (Jorge lo descargó y se veía así). Ahora se leen las posiciones
 * de los nodos, se calcula el rectángulo que los abarca y se dibuja el «viewport» de
 * React Flow a escala 1 con un margen alrededor. Se aplica sobre la copia que hace
 * html-to-image; el lienzo en pantalla no se mueve.
 */
function marcoCompleto(el: HTMLElement): { objetivo: HTMLElement; ancho: number; alto: number; transform: string } | null {
  const viewport = el.querySelector<HTMLElement>('.react-flow__viewport')
  const nodos = [...el.querySelectorAll<HTMLElement>('.react-flow__node')]
  if (!viewport || !nodos.length) return null
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const n of nodos) {
    const m = /translate\(\s*(-?[\d.]+)px,\s*(-?[\d.]+)px\)/.exec(n.style.transform)
    if (!m) continue
    const x = Number(m[1]), y = Number(m[2])
    minX = Math.min(minX, x); minY = Math.min(minY, y)
    maxX = Math.max(maxX, x + n.offsetWidth); maxY = Math.max(maxY, y + n.offsetHeight)
  }
  if (!Number.isFinite(minX)) return null
  return {
    objetivo: viewport,
    ancho: Math.ceil(maxX - minX + 2 * MARGEN),
    alto: Math.ceil(maxY - minY + 2 * MARGEN),
    transform: `translate(${MARGEN - minX}px, ${MARGEN - minY}px) scale(1)`,
  }
}

function opciones(el: HTMLElement) {
  const marco = marcoCompleto(el)
  if (!marco) return { objetivo: el, extra: {} }
  return {
    objetivo: marco.objetivo,
    extra: { width: marco.ancho, height: marco.alto, style: { width: `${marco.ancho}px`, height: `${marco.alto}px`, transform: marco.transform } },
  }
}

export async function exportarPNG(el: HTMLElement, nombre = 'diagrama.png') {
  const { objetivo, extra } = opciones(el)
  descargar(await toPng(objetivo, { backgroundColor: '#ffffff', pixelRatio: 2, filter: filtro, ...extra }), nombre)
}

export async function exportarSVG(el: HTMLElement, nombre = 'diagrama.svg') {
  const { objetivo, extra } = opciones(el)
  descargar(await toSvg(objetivo, { backgroundColor: '#ffffff', filter: filtro, ...extra }), nombre)
}
