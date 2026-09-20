# Estadística · SEM

Aplicación estadística web con la interfaz y las funciones esenciales de SPSS/PSPP
(vista de datos, vista de variables, descriptivos, comparación de medias, correlación y
regresión) más un módulo de **modelos de ecuaciones estructurales** con sintaxis tipo
lavaan y diagrama de rutas.

- **Backend**: Python 3.13, FastAPI. Motor estadístico con `pandas`, `scipy`, `statsmodels`
  y `semopy`; lectura y escritura de `.sav` con `pyreadstat`.
- **Frontend**: React 19 + TypeScript + Vite. Matrices con AG-Grid (Community) y diagrama
  de rutas con React Flow.

## Cómo se usa

```powershell
# una sola vez
pip install fastapi "uvicorn[standard]" python-multipart pyreadstat semopy statsmodels scipy pandas openpyxl pytest httpx
cd frontend; npm install; cd ..

# cada vez
.\iniciar.ps1        # abre backend (:8000) y frontend (:5173) en dos ventanas y el navegador
```

O a mano: `cd backend; python -m uvicorn app.main:app --reload` y `cd frontend; npx vite`.

Hay un conjunto de datos de prueba en `backend/data/ejemplos/encuesta_demo.sav` (400 casos,
tres constructos con tres ítems cada uno, etiquetas de valor y perdidos de usuario). Se
regenera con `python backend/scripts/generar_demo.py`.

## Flujo

1. **Archivo → Abrir datos**: `.sav`, `.csv` o `.xlsx` (o arrastrar el archivo a la ventana).
2. **Vista de datos / Vista de variables**: edición de celdas, atributos de las variables,
   etiquetas de valor y valores perdidos, como en SPSS. Los cambios de la vista de variables se
   guardan con el botón *Guardar cambios*.
3. **Analizar**: cada procedimiento abre un cuadro de diálogo con la lista de variables; el
   resultado aparece en el panel de la derecha, con índice de salidas y exportación a HTML.
4. **SEM → Lienzo y sintaxis del modelo**: un lienzo de arrastrar y soltar y un editor de
   sintaxis (`latente =~ ítem1 + ítem2`, `dependiente ~ predictor`, `a ~~ b`) **sincronizados en
   los dos sentidos**: lo que se dibuja se escribe y lo que se escribe se dibuja. Se añaden
   constructos con un botón y variables observadas desde la paleta; arrastrando de un nodo a otro
   se crea una carga (latente → indicador), una regresión o una covarianza según la herramienta
   activa; Supr borra; doble clic renombra un constructo. Al estimar, los coeficientes aparecen
   sobre las flechas del lienzo. Devuelve cargas, regresiones, varianzas, índices de ajuste (χ²,
   CFI, TLI, NFI, GFI, AGFI, RMSEA, SRMR, AIC, BIC) y el diagrama de rutas del resultado. Tanto
   el lienzo como el diagrama se exportan a **PNG y SVG**.
   **La vía fácil**: el panel de sintaxis lleva un asistente en tres pasos. «1 · Proponer la
   medición» agrupa los ítems numerados (`fu1, fu2, fu3` → `FU =~ fu1 + fu2 + fu3`) en constructos;
   «2 · Proponer la estructura» los encadena en el orden en que aparecen; «Estimar solo la medición»
   ajusta el CFA sin las flechas estructurales antes del modelo completo. Y `SEM → Ejemplo guiado`
   (o «Ver un SEM de ejemplo» en la pantalla vacía) abre la encuesta de demostración con su modelo
   ya escrito: solo queda pulsar Estimar.
5. **Archivo → Guardar como .sav** conserva etiquetas, perdidos y nivel de medida.

## Parámetros de la URL

El tutor del libro llega con todo preparado: `?abrir=<url>` descarga y abre un conjunto de datos
(solo desde los sitios del autor o Zenodo), `?ejemplo=encuesta_demo` abre el de ejemplo,
`?modelo=<sintaxis>` deja ese modelo en el lienzo SEM y lo abre, y `?sem=1` abre el lienzo vacío.
La API expone `GET /api/ejemplos` (lista con el modelo sugerido) y `POST /api/datasets/ejemplo/{clave}`.

## Procedimientos

| Menú | Procedimiento | Qué devuelve |
|---|---|---|
| Descriptivos | Frecuencias | tabla de frecuencias con porcentajes válidos y acumulados; respeta los perdidos de usuario |
| Descriptivos | Descriptivos | N, mínimo, máximo, media, DE, varianza, asimetría y curtosis con sus errores típicos |
| Descriptivos | Explorar | estadísticos con IC 95 %, media recortada, percentiles y Shapiro-Wilk, por factor opcional |
| Descriptivos | Tablas cruzadas | recuentos y porcentajes, χ² de Pearson, razón de verosimilitud, corrección de continuidad y Fisher (2×2), phi y V de Cramér |
| Comparar medias | T una muestra, T independientes, T relacionadas | con Levene, gl de Welch e IC 95 % de la diferencia |
| Comparar medias | ANOVA de un factor | descriptivos por grupo, Levene, tabla ANOVA con eta², Alexander-Govern y Tukey HSD |
| Correlaciones | Bivariadas | Pearson, Spearman o Kendall con significación y N por pares |
| Regresión | Lineal | resumen del modelo, Durbin-Watson, ANOVA, coeficientes B y Beta, IC 95 % y FIV |
| SEM | Modelo | estimadores ML, GLS, ULS, DWLS y FIML |

## Pruebas

```powershell
cd backend; python -m pytest tests -q          # 16 pruebas contra la API, contrastadas con scipy/statsmodels
cd frontend; npx vitest run                    # 9 pruebas del núcleo sintaxis ↔ modelo ↔ disposición
cd frontend; npx tsc -b; node test/ui_humo.mjs # prueba de humo de la interfaz con capturas (requiere los dos servidores)
cd frontend; node test/ui_asistente.mjs      # el camino fácil al SEM: ejemplo guiado, asistente, CFA y enlace profundo
cd frontend; node test/ui_enlace_tutor.mjs   # contra producción: el enlace del tutor con los datos y el modelo del cap. 8
```

Los datos de cada sesión se guardan en `backend/data/sesiones/` (ignorada por git) y sobreviven a
un reinicio del servidor; *Cerrar conjunto de datos* los borra.

## Despliegue (VPS de Hostinger, detrás de Traefik)

- **Dominio** `sem.jarestrepo.com` → registro A a `31.97.14.5` (hPanel → Domains → DNS).
- **En el VPS**: carpeta `/opt/stat-sem`, entorno virtual `/opt/stat-sem/venv`, servicio systemd
  `stat-sem` (usuario `statsem`, sin shell, solo escribe en `backend/data`), puerto interno **8789**,
  enrutado por `/docker/traefik/dynamic/stat-sem.yml` con certificado de Let's Encrypt. Un solo
  proceso (uvicorn) sirve la API y `frontend/dist`, así que no hay CORS en producción.
- **Primera vez**: `bash deploy/desplegar.sh --sin-pruebas` sube el código y luego, en el VPS,
  `bash /opt/stat-sem/deploy/instalar_vps.sh` crea usuario, venv, servicio y enrutado.
- **Cada vez**: `bash deploy/desplegar.sh` (pruebas → build → subida → reinicio → comprobación), o
  simplemente `git push` a `main`: el flujo `.github/workflows/desplegar.yml` hace lo mismo con los
  secretos `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY` y `SITIO_URL`.
- Cada navegador se identifica con la cabecera `X-Cliente` (un UUID guardado en `localStorage`) y
  solo ve sus propios conjuntos de datos; los datos de sesión se borran a los 7 días. No hay
  cuentas de usuario: quien tenga la URL puede usar la app.

## Arquitectura

```
backend/app/
  main.py          FastAPI + CORS; en producción sirve frontend/dist
  rutas.py         /api/datasets…  (subir, filas paginadas, celda, variables, exportar, analisis/<proc>)
  almacen.py       datasets en memoria + pickle en disco; perdidos_como_nan() para los análisis
  io_datos.py      pyreadstat/pandas: lee y escribe .sav con etiquetas, perdidos, medida y formato
  modelos.py       esquemas Pydantic; contrato de salida (bloques tabla / texto / grafo)
  analisis/        descriptivos.py · medias.py · relaciones.py · sem.py
frontend/src/
  App.tsx          menús, pestañas, panel de resultados, diálogos
  sem/             sintaxis.ts (analizar/generar, inversas) · disposicion.ts (auto-layout) ·
                   grafo.ts (modelo ↔ nodos/aristas de React Flow, etiquetas de estimación)
  componentes/     VistaDatos (AG-Grid infinito) · VistaVariables · ModalEtiquetas ·
                   DialogoAnalisis (a partir de procedimientos.ts) · LienzoSEM · NodosSEM ·
                   Resultados · DiagramaRutas
  exportar.ts      PNG/SVG con html-to-image
```

Para añadir un procedimiento: función en `backend/app/analisis/` que reciba `(ds, **parámetros)` y
devuelva una `Salida`, registrarla en `PROCEDIMIENTOS`, y describir su cuadro de diálogo en
`frontend/src/procedimientos.ts`.
