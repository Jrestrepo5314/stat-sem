import { toPng, toSvg } from 'html-to-image'

// Se excluyen los controles y el fondo de puntos: solo el diagrama.
const filtro = (n: HTMLElement) => !(n.classList?.contains('react-flow__controls') || n.classList?.contains('react-flow__background'))

function descargar(url: string, nombre: string) {
  const a = document.createElement('a')
  a.href = url; a.download = nombre; a.click()
}

export async function exportarPNG(el: HTMLElement, nombre = 'diagrama.png') {
  descargar(await toPng(el, { backgroundColor: '#ffffff', pixelRatio: 2, filter: filtro }), nombre)
}

export async function exportarSVG(el: HTMLElement, nombre = 'diagrama.svg') {
  descargar(await toSvg(el, { backgroundColor: '#ffffff', filter: filtro }), nombre)
}
