"""Rutas HTTP: datasets, filas, variables, exportación y análisis."""
from __future__ import annotations

import inspect
import tempfile
from pathlib import Path
from typing import Any

import httpx
import pandas as pd
from fastapi import APIRouter, Header, HTTPException, Query, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel

from .almacen import almacen
from .analisis import PROCEDIMIENTOS
from .io_datos import a_json_seguro, escribir_csv, escribir_sav, leer_archivo
from .modelos import EdicionCelda, PaginaFilas, ResumenDataset, Salida, Variable

router = APIRouter(prefix="/api")


# Cada navegador manda su identificador en X-Cliente; solo ve sus propios conjuntos de datos.
Cliente = Header(default="anon", alias="X-Cliente")
MAX_BYTES = 100 * 1024 * 1024


def _ds(id: str, cliente: str):
    try:
        return almacen.obtener(id, cliente)
    except KeyError:
        raise HTTPException(404, "Dataset no encontrado")


@router.get("/datasets", response_model=list[ResumenDataset])
def listar(cliente: str = Cliente):
    return almacen.listar(cliente)


@router.post("/datasets", response_model=ResumenDataset)
async def subir(archivo: UploadFile, cliente: str = Cliente):
    sufijo = Path(archivo.filename or "datos.csv").suffix.lower()
    if sufijo not in (".sav", ".csv", ".txt", ".xlsx", ".xls"):
        raise HTTPException(400, f"Formato no soportado: {sufijo}")
    contenido = await archivo.read()
    if len(contenido) > MAX_BYTES:
        raise HTTPException(413, "El archivo supera los 100 MB")
    with tempfile.NamedTemporaryFile(suffix=sufijo, delete=False) as tmp:
        tmp.write(contenido)
        ruta = Path(tmp.name)
    try:
        df, variables = leer_archivo(ruta)
    except Exception as e:
        raise HTTPException(400, f"No se pudo leer el archivo: {e}")
    finally:
        ruta.unlink(missing_ok=True)
    ds = almacen.crear(archivo.filename or "datos", df, variables, cliente)
    return ds.resumen()


class ImportarURL(BaseModel):
    url: str


# Solo se descargan datos de sitios propios o de repositorios conocidos: el servidor
# no debe convertirse en un descargador genérico.
HOSTS_PERMITIDOS = {
    "sem.jarestrepo.com", "estadistica.jarestrepo.com", "tutor.jarestrepo.com", "jarestrepo.com",
    "localhost", "127.0.0.1", "zenodo.org", "raw.githubusercontent.com",
}


@router.post("/datasets/importar", response_model=ResumenDataset)
def importar(cuerpo: ImportarURL, cliente: str = Cliente):
    """Abre un archivo de datos por URL (lo usa el tutor del libro con sus conjuntos de datos)."""
    from urllib.parse import urlparse

    u = urlparse(cuerpo.url)
    if u.scheme not in ("http", "https") or u.hostname not in HOSTS_PERMITIDOS:
        raise HTTPException(400, "Solo se pueden abrir datos desde los sitios del autor o de Zenodo")
    nombre = Path(u.path).name or "datos.csv"
    sufijo = Path(nombre).suffix.lower()
    if sufijo not in (".sav", ".csv", ".txt", ".xlsx", ".xls"):
        raise HTTPException(400, f"Formato no soportado: {sufijo}")
    try:
        with httpx.Client(follow_redirects=True, timeout=30) as h:
            r = h.get(cuerpo.url)
            r.raise_for_status()
            contenido = r.content
    except httpx.HTTPError as e:
        raise HTTPException(502, f"No se pudo descargar el archivo: {e}")
    if len(contenido) > MAX_BYTES:
        raise HTTPException(413, "El archivo supera los 100 MB")
    with tempfile.NamedTemporaryFile(suffix=sufijo, delete=False) as tmp:
        tmp.write(contenido)
        ruta = Path(tmp.name)
    try:
        df, variables = leer_archivo(ruta)
    except Exception as e:
        raise HTTPException(400, f"No se pudo leer el archivo: {e}")
    finally:
        ruta.unlink(missing_ok=True)
    return almacen.crear(nombre, df, variables, cliente).resumen()


@router.post("/datasets/nuevo", response_model=ResumenDataset)
def nuevo(nombre: str = "Sin título", filas: int = 0, cliente: str = Cliente):
    df = pd.DataFrame(index=range(filas))
    return almacen.crear(nombre, df, [], cliente).resumen()


@router.get("/datasets/{id}")
def detalle(id: str, cliente: str = Cliente) -> dict[str, Any]:
    ds = _ds(id, cliente)
    return {"resumen": ds.resumen(), "variables": ds.variables}


@router.delete("/datasets/{id}")
def borrar(id: str, cliente: str = Cliente):
    _ds(id, cliente)
    almacen.borrar(id)
    return {"ok": True}


@router.get("/datasets/{id}/filas", response_model=PaginaFilas)
def filas(id: str, inicio: int = 0, n: int = 200, cliente: str = Cliente):
    ds = _ds(id, cliente)
    bloque = ds.df.iloc[inicio: inicio + n]
    return PaginaFilas(total=len(ds.df), inicio=inicio,
                       filas=[[a_json_seguro(x) for x in fila] for fila in bloque.itertuples(index=False)])


@router.put("/datasets/{id}/celda")
def editar_celda(id: str, ed: EdicionCelda, cliente: str = Cliente):
    ds = _ds(id, cliente)
    if ed.variable not in ds.df.columns:
        raise HTTPException(400, "Variable inexistente")
    if ed.fila >= len(ds.df):
        # escribir por debajo del final añade filas vacías, como en SPSS
        ds.df = ds.df.reindex(range(ed.fila + 1))
    v = ds.variable(ed.variable)
    valor = ed.valor
    if v.tipo == "numerica":
        if valor in ("", None):
            valor = float("nan")
        else:
            try:
                valor = float(str(valor).replace(",", "."))
            except ValueError:
                raise HTTPException(400, "La variable es numérica")
        if not pd.api.types.is_float_dtype(ds.df[ed.variable]):
            ds.df[ed.variable] = ds.df[ed.variable].astype(float)
    ds.df.iat[ed.fila, ds.df.columns.get_loc(ed.variable)] = valor
    almacen.guardar(ds)
    return {"ok": True, "n_filas": len(ds.df)}


@router.put("/datasets/{id}/variables")
def guardar_variables(id: str, variables: list[Variable], cliente: str = Cliente):
    """Reemplaza la Vista de Variables completa; renombra, añade y quita columnas según haga falta."""
    ds = _ds(id, cliente)
    nombres = [v.nombre for v in variables]
    if len(set(nombres)) != len(nombres):
        raise HTTPException(400, "Hay nombres de variable repetidos")
    viejos = [v.nombre for v in ds.variables]
    # renombrados por posición: el frontend manda la lista en el mismo orden
    renombres = {vo: vn for vo, vn in zip(viejos, nombres) if vo != vn and vo in ds.df.columns}
    ds.df = ds.df.rename(columns=renombres)
    for v in variables:
        if v.nombre not in ds.df.columns:
            ds.df[v.nombre] = float("nan") if v.tipo == "numerica" else None
        elif v.tipo == "texto" and pd.api.types.is_numeric_dtype(ds.df[v.nombre]):
            ds.df[v.nombre] = ds.df[v.nombre].astype(object).where(ds.df[v.nombre].notna(), None)
        elif v.tipo == "numerica" and not pd.api.types.is_numeric_dtype(ds.df[v.nombre]):
            ds.df[v.nombre] = pd.to_numeric(ds.df[v.nombre], errors="coerce")
    sobrantes = [c for c in ds.df.columns if c not in nombres]
    ds.df = ds.df.drop(columns=sobrantes)[nombres]
    ds.variables = variables
    almacen.guardar(ds)
    return {"ok": True}


@router.post("/datasets/{id}/filas/insertar")
def insertar_fila(id: str, posicion: int, cliente: str = Cliente):
    ds = _ds(id, cliente)
    vacia = pd.DataFrame([[float("nan")] * len(ds.df.columns)], columns=ds.df.columns)
    ds.df = pd.concat([ds.df.iloc[:posicion], vacia, ds.df.iloc[posicion:]], ignore_index=True)
    almacen.guardar(ds)
    return {"ok": True, "n_filas": len(ds.df)}


@router.delete("/datasets/{id}/filas/{posicion}")
def borrar_fila(id: str, posicion: int, cliente: str = Cliente):
    ds = _ds(id, cliente)
    ds.df = ds.df.drop(index=ds.df.index[posicion]).reset_index(drop=True)
    almacen.guardar(ds)
    return {"ok": True, "n_filas": len(ds.df)}


@router.get("/datasets/{id}/exportar")
def exportar(id: str, formato: str = "sav", cliente: str = Cliente,
             cliente_q: str | None = Query(default=None, alias="cliente")):
    # la descarga abre una pestaña nueva y no puede mandar cabeceras: el cliente va en la URL
    ds = _ds(id, cliente_q or cliente)
    base = Path(ds.nombre).stem or "datos"
    if formato == "csv":
        return Response(escribir_csv(ds.df), media_type="text/csv",
                        headers={"Content-Disposition": f'attachment; filename="{base}.csv"'})
    with tempfile.NamedTemporaryFile(suffix=".sav", delete=False) as tmp:
        ruta = Path(tmp.name)
    try:
        escribir_sav(ds.df, ds.variables, ruta)
        datos = ruta.read_bytes()
    except Exception as e:
        raise HTTPException(400, f"No se pudo escribir el .sav: {e}")
    finally:
        ruta.unlink(missing_ok=True)
    return Response(datos, media_type="application/octet-stream",
                    headers={"Content-Disposition": f'attachment; filename="{base}.sav"'})


@router.post("/datasets/{id}/analisis/{procedimiento}", response_model=Salida)
def analizar(id: str, procedimiento: str, parametros: dict[str, Any], cliente: str = Cliente):
    ds = _ds(id, cliente)
    fn = PROCEDIMIENTOS.get(procedimiento)
    if fn is None:
        raise HTTPException(404, f"Procedimiento desconocido: {procedimiento}")
    permitidos = set(inspect.signature(fn).parameters) - {"ds"}
    extra = set(parametros) - permitidos
    if extra:
        raise HTTPException(400, f"Parámetros no reconocidos: {', '.join(sorted(extra))}")
    try:
        return fn(ds, **parametros)
    except HTTPException:
        raise
    except (KeyError, ValueError, TypeError) as e:
        raise HTTPException(400, f"No se pudo ejecutar el análisis: {e}")
