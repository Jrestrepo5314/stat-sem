// Prueba de humo del camino fácil al SEM: el ejemplo guiado desde la pantalla vacía,
// el asistente del lienzo (proponer medición y estructura), estimar solo la medición
// y el enlace profundo con el que llega el tutor del libro (?ejemplo= &modelo=).
// Uso: node test/ui_asistente.mjs [carpeta_capturas]   (requiere backend en :8000 y vite en :5173)
import puppeteer from 'puppeteer-core'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'

const URL = process.env.URL || 'http://127.0.0.1:5173'
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync)
const OUT = process.argv[2] ?? 'test/capturas'
mkdirSync(OUT, { recursive: true })

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--window-size=1500,950'] })
const page = await browser.newPage()
await page.setViewport({ width: 1500, height: 950 })
const errores = []
page.on('pageerror', (e) => errores.push('pageerror: ' + e.message))
page.on('console', (m) => { if (m.type() === 'error') errores.push('console: ' + m.text()) })
page.on('dialog', (d) => d.accept())
const foto = (n) => page.screenshot({ path: `${OUT}/${n}.png` })
const espera = (ms) => new Promise((r) => setTimeout(r, ms))
const clicTexto = async (sel, texto) => {
  const ok = await page.evaluate((sel, texto) => {
    const el = [...document.querySelectorAll(sel)].find((e) => e.textContent.trim().startsWith(texto))
    if (!el || el.disabled) return false
    el.click(); return true
  }, sel, texto)
  if (!ok) throw new Error(`no encontré (o está deshabilitado) "${texto}" en ${sel}`)
}
const sintaxis = () => page.$eval('.lienzo-sem textarea', (t) => t.value)
const fallo = (m) => errores.push('comprobación: ' + m)

// --- 1. pantalla vacía → «Ver un SEM de ejemplo, listo para estimar»
await page.goto(URL, { waitUntil: 'networkidle0' })
await page.waitForSelector('.vacio')
await foto('a1_pantalla_vacia_con_ejemplos')
await clicTexto('.fila-ejemplos button', 'Ver un SEM de ejemplo')
await page.waitForSelector('.lienzo-sem textarea', { timeout: 20000 })
await page.waitForFunction(() => document.querySelectorAll('.lienzo .react-flow__node').length === 12, { timeout: 10000 })
await espera(500)
await foto('a2_ejemplo_guiado_en_el_lienzo')
if (await page.$('.cabecera .pantalla-completa')) fallo('con el lienzo abierto, el botón de pantalla completa de la cabecera sigue ahí (y no puede recibir el clic)')
if (!(await page.$('.lienzo-cabecera .pantalla-completa'))) fallo('el lienzo no tiene botón de pantalla completa')
const s1 = await sintaxis()
if (!s1.includes('clima =~ cli1 + cli2 + cli3') || !s1.includes('desempeno ~ compromiso')) fallo('el ejemplo guiado no dejó el modelo en el lienzo: ' + s1)

// --- 2. primero solo la medición, después el modelo completo
await clicTexto('.panel-sintaxis .fila-botones button', 'Estimar solo la medición')
await page.waitForFunction(() => document.querySelectorAll('.salida').length >= 1, { timeout: 30000 })
const titulosCFA = await page.evaluate(() => [...document.querySelectorAll('.salida .tabla-salida h4, .salida h4')].map((h) => h.textContent))
if (titulosCFA.some((t) => t.includes('estructural'))) fallo('la estimación solo de medición trajo tabla estructural: ' + titulosCFA.join(' | '))
await clicTexto('.panel-sintaxis .fila-botones button', 'Estimar el modelo completo')
await page.waitForFunction(() => document.querySelectorAll('.salida').length >= 2, { timeout: 30000 })
await page.waitForFunction(() => document.querySelectorAll('.lienzo .react-flow__edge-textwrapper').length >= 9, { timeout: 10000 })
await espera(400)
await foto('a3_medicion_y_completo_estimados')

// --- 3. el asistente sobre un lienzo vacío: proponer medición y estructura
await clicTexto('.herramientas button', 'Vaciar')
await page.waitForFunction(() => document.querySelectorAll('.lienzo .react-flow__node').length === 0, { timeout: 5000 })
await clicTexto('.fila-asistente button', '1 · Proponer la medición')
await page.waitForFunction(() => document.querySelectorAll('.lienzo .react-flow__node').length === 12, { timeout: 5000 })
const s2 = await sintaxis()
for (const l of ['CLI =~ cli1 + cli2 + cli3', 'COM =~ com1 + com2 + com3', 'DES =~ des1 + des2 + des3']) if (!s2.includes(l)) fallo(`la medición propuesta no trae «${l}»: ${s2}`)
if (/salario|antiguedad|sexo/.test(s2)) fallo('la medición propuesta metió variables que no son ítems: ' + s2)
await clicTexto('.fila-asistente button', '2 · Proponer la estructura')
await espera(300)
const s3 = await sintaxis()
if (!s3.includes('COM ~ CLI') || !s3.includes('DES ~ COM')) fallo('la estructura propuesta no encadena los constructos: ' + s3)
// un clic en el fondo translúcido no cierra el lienzo (así se perdía el modelo)
await page.mouse.click(8, 8)
await espera(300)
if (!(await page.$('.lienzo-sem textarea'))) fallo('un clic en el fondo cerró el lienzo')
// el PNG exportado abarca el modelo entero (no lo que cabe en la ventana): sus
// dimensiones son las del rectángulo de los nodos más 40 px de margen, a escala 2
const carpetaDescargas = resolve(OUT, 'descargas')
rmSync(carpetaDescargas, { recursive: true, force: true }); mkdirSync(carpetaDescargas, { recursive: true })
const cdp = await page.createCDPSession()
await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: carpetaDescargas })
const esperado = await page.evaluate(() => {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const n of document.querySelectorAll('.lienzo .react-flow__node')) {
    const m = /translate\(\s*(-?[\d.]+)px,\s*(-?[\d.]+)px\)/.exec(n.style.transform)
    const x = Number(m[1]), y = Number(m[2])
    minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x + n.offsetWidth); maxY = Math.max(maxY, y + n.offsetHeight)
  }
  return { ancho: Math.ceil(maxX - minX + 80) * 2, alto: Math.ceil(maxY - minY + 80) * 2 }
})
await clicTexto('.herramientas button', 'PNG')
let png = null
for (let i = 0; i < 40 && !png; i++) { await espera(250); png = readdirSync(carpetaDescargas).find((f) => f.endsWith('.png')) }
if (!png) fallo('no se descargó el PNG del lienzo')
else {
  const b = readFileSync(resolve(carpetaDescargas, png))
  const ancho = b.readUInt32BE(16), alto = b.readUInt32BE(20)
  if (Math.abs(ancho - esperado.ancho) > 4 || Math.abs(alto - esperado.alto) > 4) fallo(`el PNG no abarca el modelo entero: ${ancho}×${alto}, esperado ${esperado.ancho}×${esperado.alto}`)
  console.log('png exportado:', png, `${ancho}×${alto}`)
}
await page.click('.asistente-sem summary')
await espera(300)
await foto('a4_asistente_con_ayuda_abierta')
await clicTexto('.panel-sintaxis .fila-botones button', 'Cerrar')

// --- 4. el enlace profundo con el que llega el tutor del libro
const modelo = 'clima =~ cli1 + cli2 + cli3\ncompromiso =~ com1 + com2 + com3\ncompromiso ~ clima'
await page.goto(`${URL}/?ejemplo=encuesta_demo&modelo=${encodeURIComponent(modelo)}`, { waitUntil: 'networkidle0' })
await page.waitForSelector('.lienzo-sem textarea', { timeout: 20000 })
await page.waitForFunction(() => document.querySelectorAll('.lienzo .react-flow__node').length === 8, { timeout: 10000 })
const s4 = await sintaxis()
if (s4 !== modelo) fallo('el enlace profundo no dejó el modelo tal cual: ' + s4)
if (await page.evaluate(() => location.search)) fallo('la barra de direcciones conserva los parámetros')
await espera(300)
await foto('a5_enlace_profundo_del_tutor')

console.log(JSON.stringify({ ejemploGuiado: s1.split('\n').length, medicionPropuesta: s2.split('\n').length, conEstructura: s3.split('\n').length, enlaceProfundo: s4.split('\n').length }))
if (errores.length) { console.log('ERRORES:'); errores.forEach((e) => console.log(' ', e)) }
await browser.close()
process.exit(errores.length ? 1 : 0)
