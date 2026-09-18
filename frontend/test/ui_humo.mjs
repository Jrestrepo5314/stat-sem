// Prueba de humo de la interfaz: abre la app, carga el .sav de demostración, corre un
// análisis desde el diálogo y un SEM desde el lienzo, y guarda capturas de cada pantalla.
// Uso: node test/ui_humo.mjs [carpeta_capturas]   (requiere backend en :8000 y vite en :5173)
import puppeteer from 'puppeteer-core'
import { existsSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const URL = 'http://127.0.0.1:5173'
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync)
const SAV = resolve('../backend/data/ejemplos/encuesta_demo.sav')
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
    if (!el) return false
    el.click(); return true
  }, sel, texto)
  if (!ok) throw new Error(`no encontré "${texto}" en ${sel}`)
}
const escribirTextarea = (sel, s) => page.evaluate((sel, s) => {
  const ta = document.querySelector(sel)
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(ta, s)
  ta.dispatchEvent(new Event('input', { bubbles: true }))
}, sel, s)
const contar = (sel) => page.evaluate((sel) => document.querySelectorAll(sel).length, sel)

await page.goto(URL, { waitUntil: 'networkidle0' })
await foto('01_inicio')

const input = await page.$('input[type=file]')
await input.uploadFile(SAV)
await page.waitForSelector('.ag-row', { timeout: 15000 })
await espera(600)
await foto('02_vista_datos')

await clicTexto('.menu > button', 'Datos')
await clicTexto('.menu-item', 'Mostrar etiquetas')
await espera(500)
await foto('03_datos_con_etiquetas')

await clicTexto('.pestanas > button', 'Vista de variables')
await page.waitForSelector('.vista-variables .ag-row')
await foto('04_vista_variables')
await clicTexto('.pestanas > button', 'Vista de datos')

await clicTexto('.menu > button', 'Analizar')
await clicTexto('.menu-item', 'Descriptivos')
await page.waitForSelector('.dialogo-analisis')
await clicTexto('.lista-disponibles li', 'antiguedad')
await page.click('.dialogo-analisis .flecha')
await clicTexto('.lista-disponibles li', 'salario')
await page.click('.dialogo-analisis .flecha')
await foto('05_dialogo_descriptivos')
await clicTexto('.dialogo-analisis .fila-botones button', 'Aceptar')
await page.waitForSelector('.tabla-salida', { timeout: 15000 })
await foto('06_resultado_descriptivos')

await clicTexto('.menu > button', 'Analizar')
await clicTexto('.menu-item', 'ANOVA')
await page.waitForSelector('.dialogo-analisis')
await clicTexto('.lista-disponibles li', 'salario')
await page.click('.dialogo-analisis .campo:nth-of-type(1) .flecha')
await clicTexto('.lista-disponibles li', 'area')
await page.click('.dialogo-analisis .campo:nth-of-type(2) .flecha')
await clicTexto('.dialogo-analisis .fila-botones button', 'Aceptar')
await page.waitForFunction(() => document.querySelectorAll('.salida').length >= 2, { timeout: 15000 })
await foto('07_resultado_anova')

// --- lienzo SEM: sintaxis → lienzo
await clicTexto('.menu > button', 'SEM')
await clicTexto('.menu-item', 'Lienzo')
await page.waitForSelector('.lienzo-sem textarea')
await escribirTextarea('.lienzo-sem textarea', `clima =~ cli1 + cli2 + cli3
compromiso =~ com1 + com2 + com3
desempeno =~ des1 + des2 + des3
compromiso ~ clima
desempeno ~ compromiso`)
await page.waitForFunction(() => document.querySelectorAll('.lienzo .react-flow__node').length === 12, { timeout: 10000 })
await espera(500)
await foto('08_lienzo_desde_sintaxis')

// --- lienzo → sintaxis: añadir un constructo y una observada desde la paleta
await clicTexto('.herramientas button', '+ Constructo')
await page.waitForFunction(() => document.querySelectorAll('.lienzo .react-flow__node').length === 13, { timeout: 5000 })
await clicTexto('.lienzo-cuerpo .lista-disponibles li', 'satisfaccion')
await page.waitForFunction(() => document.querySelectorAll('.lienzo .react-flow__node').length === 14, { timeout: 5000 })
const sintaxisTrasAnadir = await page.$eval('.lienzo-sem textarea', (t) => t.value)
// un constructo sin indicadores y una observada suelta no cambian la sintaxis
if (sintaxisTrasAnadir.split('\n').length !== 5) errores.push('la sintaxis cambió al añadir nodos sueltos: ' + sintaxisTrasAnadir)

// --- borrar los dos nodos sueltos con la tecla Supr y estimar
for (const id of ['F1', 'satisfaccion']) {
  await page.click(`[data-id="${id}"]`)
  await page.keyboard.press('Delete')
  await espera(200)
}
await page.waitForFunction(() => document.querySelectorAll('.lienzo .react-flow__node').length === 12, { timeout: 5000 })
await clicTexto('.panel-sintaxis .fila-botones button', 'Estimar')
await page.waitForFunction(() => document.querySelectorAll('.salida').length >= 3, { timeout: 30000 })
await page.waitForFunction(() => document.querySelectorAll('.lienzo .react-flow__edge-textwrapper').length >= 9, { timeout: 10000 })
await espera(600)
await foto('09_lienzo_con_estimaciones')
await clicTexto('.panel-sintaxis .fila-botones button', 'Cerrar')

await page.waitForSelector('.diagrama .react-flow__node', { timeout: 10000 })
await page.evaluate(() => document.querySelector('.diagrama')?.scrollIntoView())
await espera(500)
await foto('10_diagrama_rutas')

const resumen = await page.evaluate(() => ({
  salidas: document.querySelectorAll('.salida').length,
  tablas: document.querySelectorAll('.tabla-salida').length,
  nodos: document.querySelectorAll('.diagrama .react-flow__node').length,
  aristas: document.querySelectorAll('.diagrama .react-flow__edge').length,
  botonesExportar: [...document.querySelectorAll('.pie-diagrama button')].map((b) => b.textContent),
}))
console.log(JSON.stringify(resumen))
if (errores.length) { console.log('ERRORES DE PÁGINA:'); errores.forEach((e) => console.log(' ', e)) }
await browser.close()
process.exit(errores.length ? 1 : 0)
