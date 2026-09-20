// Extremo a extremo en producción (o donde diga URL): el enlace con el que el tutor del
// libro manda al laboratorio los datos del capítulo 8 y el modelo TAM. Debe abrir el
// lienzo con el modelo puesto y estimar sin tocar nada.
// Uso: node test/ui_enlace_tutor.mjs   (por defecto contra sem.jarestrepo.com)
import puppeteer from 'puppeteer-core'
import { existsSync, mkdirSync } from 'node:fs'

const LAB = process.env.URL || 'https://sem.jarestrepo.com'
const TUTOR = process.env.TUTOR || 'https://estadistica.jarestrepo.com'
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync)
mkdirSync('test/capturas', { recursive: true })

const modelo = ['# Modelo de medida (CFA)', 'FU =~ fu1 + fu2 + fu3', 'UP =~ up1 + up2 + up3', 'CO =~ co1 + co2 + co3', 'IA =~ ia1 + ia2 + ia3',
  '# Modelo estructural (path)', 'UP ~ FU', 'IA ~ UP + FU + CO'].join('\n')
const enlace = `${LAB}/?abrir=${encodeURIComponent(TUTOR + '/datos/sem_ecommerce.csv')}&modelo=${encodeURIComponent(modelo)}`

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--window-size=1500,950'] })
const page = await browser.newPage()
await page.setViewport({ width: 1500, height: 950 })
const errores = []
page.on('pageerror', (e) => errores.push('pageerror: ' + e.message))
await page.goto(enlace, { waitUntil: 'networkidle0' })
await page.waitForSelector('.lienzo-sem textarea', { timeout: 30000 })
await page.waitForFunction(() => document.querySelectorAll('.lienzo .react-flow__node').length === 16, { timeout: 15000 })
const sintaxis = await page.$eval('.lienzo-sem textarea', (t) => t.value)
if (sintaxis !== modelo) errores.push('el modelo no llegó tal cual: ' + sintaxis)
await page.evaluate(() => [...document.querySelectorAll('.panel-sintaxis .fila-botones button')].find((b) => b.textContent.startsWith('Estimar el modelo completo'))?.click())
await page.waitForFunction(() => document.querySelectorAll('.salida').length >= 1, { timeout: 60000 })
try { await page.waitForFunction(() => document.querySelectorAll('.lienzo .react-flow__edge-textwrapper').length >= 12, { timeout: 15000 }) } catch { errores.push('sin etiquetas sobre las flechas tras estimar') }
await new Promise((r) => setTimeout(r, 500))
const ajuste = await page.evaluate(() => {
  const filas = [...document.querySelectorAll('.tabla-salida tr')].map((tr) => [...tr.querySelectorAll('td')].map((td) => td.textContent.trim()))
  const busca = (n) => filas.find((f) => f[0] === n)?.[1]
  const textos = [...document.querySelectorAll('.salida .texto-salida, .salida p, .salida .aviso, .salida .error')].map((e) => e.textContent.trim()).filter(Boolean).slice(0, 4)
  return { CFI: busca('CFI'), RMSEA: busca('RMSEA'), SRMR: busca('SRMR'), error: document.querySelector('.lienzo-sem .error-dialogo')?.textContent || null, textos, titulos: [...document.querySelectorAll('.salida h4, .salida h3')].map((h) => h.textContent.trim()).slice(0, 8) }
})
if (ajuste.error) errores.push('la estimación devolvió error: ' + ajuste.error)
if (!ajuste.CFI) errores.push('no aparecen los índices de ajuste')
await page.screenshot({ path: 'test/capturas/enlace_tutor_produccion.png' })
console.log(JSON.stringify({ nodos: 16, ...ajuste }))
if (errores.length) { console.log('ERRORES:'); errores.forEach((e) => console.log(' ', e)) }
await browser.close()
process.exit(errores.length ? 1 : 0)
