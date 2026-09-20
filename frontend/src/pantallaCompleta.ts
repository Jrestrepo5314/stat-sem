import { useEffect, useState } from 'react'

/**
 * Pantalla completa de toda la aplicación. Hace falta sobre todo cuando la app va
 * incrustada en el tutor del libro: allí el laboratorio vive en un recuadro de tres
 * cuartos de pantalla y el lienzo SEM, que ya es un modal casi a pantalla completa
 * DE ESE RECUADRO, se queda pequeño. Con Esc se vuelve al tamaño normal.
 *
 * Desde un iframe solo funciona si el padre lo permite (`allow="fullscreen"`), que es
 * lo que hace el tutor.
 */
export const incrustada = (() => { try { return window.self !== window.top } catch { return true } })()

export async function alternarPantallaCompleta(): Promise<void> {
  try {
    if (document.fullscreenElement) await document.exitFullscreen()
    else await document.documentElement.requestFullscreen()
  } catch {
    /* el navegador o el marco no lo permiten: no hay nada que hacer */
  }
}

export function usePantallaCompleta(): boolean {
  const [activa, setActiva] = useState(!!document.fullscreenElement)
  useEffect(() => {
    const f = () => setActiva(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', f)
    return () => document.removeEventListener('fullscreenchange', f)
  }, [])
  return activa
}

export const puedePantallaCompleta = typeof document !== 'undefined' && !!document.documentElement.requestFullscreen
