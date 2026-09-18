"""Lectura y escritura de datos con sus metadatos (.sav, .csv, .xlsx)."""
from __future__ import annotations

import io
import re
import unicodedata
from pathlib import Path

import numpy as np
import pandas as pd
import pyreadstat

from .modelos import Variable

MEDIDA_SPSS = {"nominal": "nominal", "ordinal": "ordinal", "scale": "escala", "unknown": "escala"}
MEDIDA_A_SPSS = {"nominal": "nominal", "ordinal": "ordinal", "escala": "scale"}


def _medida_por_defecto(serie: pd.Series) -> str:
    if not pd.api.types.is_numeric_dtype(serie):
        return "nominal"
    distintos = serie.dropna().nunique()
    return "nominal" if distintos <= 10 and (serie.dropna() % 1 == 0).all() else "escala"


def _tipo(serie: pd.Series) -> str:
    if pd.api.types.is_datetime64_any_dtype(serie):
        return "fecha"
    return "numerica" if pd.api.types.is_numeric_dtype(serie) else "texto"


def nombre_spss(original: str, usados: set[str]) -> str:
    """Convierte una cabecera cualquiera en un nombre de variable válido para SPSS.

    Letras, dígitos y guion bajo, sin empezar por dígito, máximo 64 caracteres, único
    dentro del archivo. 'RAZON SOCIAL' → 'RAZON_SOCIAL'; '*Ingresos = a + b' → 'Ingresos_a_b'.
    """
    sin_acentos = unicodedata.normalize("NFKD", str(original)).encode("ascii", "ignore").decode()
    limpio = re.sub(r"[^A-Za-z0-9_]+", "_", sin_acentos).strip("_")
    limpio = re.sub(r"_+", "_", limpio)
    if not limpio:
        limpio = "VAR"
    if limpio[0].isdigit():
        limpio = "V" + limpio
    limpio = limpio[:64]
    base, k = limpio, 2
    while limpio.lower() in {u.lower() for u in usados}:
        sufijo = f"_{k}"
        limpio = base[: 64 - len(sufijo)] + sufijo
        k += 1
    usados.add(limpio)
    return limpio


def _variables_desde_df(df: pd.DataFrame) -> list[Variable]:
    """Renombra las columnas a nombres SPSS válidos; la cabecera original queda como etiqueta."""
    usados: set[str] = set()
    nombres = {col: nombre_spss(col, usados) for col in df.columns}
    df.rename(columns=nombres, inplace=True)
    out = []
    for original, col in nombres.items():
        s = df[col]
        tipo = _tipo(s)
        out.append(Variable(
            nombre=col, tipo=tipo,
            etiqueta=str(original).strip() if str(original).strip() != col else "",
            ancho=8 if tipo == "numerica" else int(min(max(s.astype(str).str.len().max() if len(s) else 8, 1), 255)),
            decimales=2 if tipo == "numerica" and not (s.dropna() % 1 == 0).all() else 0,
            alineacion="derecha" if tipo == "numerica" else "izquierda",
            medida=_medida_por_defecto(s),
        ))
    return out


def leer_sav(ruta: Path) -> tuple[pd.DataFrame, list[Variable]]:
    df, meta = pyreadstat.read_sav(str(ruta), apply_value_formats=False, user_missing=True)
    variables = []
    for i, col in enumerate(meta.column_names):
        s = df[col]
        tipo = _tipo(s)
        formato = (meta.original_variable_types.get(col) or "F8.2").upper()
        decimales = 0
        ancho = 8
        if formato.startswith("F") and "." in formato:
            try:
                ancho, decimales = (int(x) for x in formato[1:].split("."))
            except ValueError:
                pass
        elif formato.startswith("A"):
            try:
                ancho = int(formato[1:])
            except ValueError:
                pass
        etiquetas = {str(_normalizar_clave(k)): str(v)
                     for k, v in (meta.variable_value_labels.get(col) or {}).items()}
        perdidos = list(meta.missing_user_values.get(col, []))
        for rango in meta.missing_ranges.get(col, []):
            lo, hi = rango.get("lo"), rango.get("hi")
            # un valor discreto viene como rango con lo == hi; se guarda como valor suelto
            perdidos.append(lo if lo == hi else [lo, hi])
        variables.append(Variable(
            nombre=col, tipo=tipo, ancho=ancho, decimales=decimales,
            etiqueta=meta.column_labels[i] or "",
            etiquetas_valores=etiquetas, perdidos=perdidos,
            columnas=int(meta.variable_display_width.get(col, 8) or 8),
            alineacion="derecha" if tipo == "numerica" else "izquierda",
            medida=MEDIDA_SPSS.get(meta.variable_measure.get(col, "unknown"), "escala"),
        ))
    return df, variables


def _normalizar_clave(k):
    # las claves de etiquetas de valor llegan como float (1.0); se guardan como "1"
    if isinstance(k, float) and k.is_integer():
        return int(k)
    return k


def leer_archivo(ruta: Path) -> tuple[pd.DataFrame, list[Variable]]:
    ext = ruta.suffix.lower()
    if ext == ".sav":
        return leer_sav(ruta)
    if ext in (".xlsx", ".xls"):
        df = pd.read_excel(ruta)
    elif ext in (".csv", ".txt"):
        df = pd.read_csv(ruta, sep=None, engine="python", encoding_errors="replace")
    else:
        raise ValueError(f"Formato no soportado: {ext}")
    df.columns = [str(c).strip() for c in df.columns]
    return df, _variables_desde_df(df)


def escribir_sav(df: pd.DataFrame, variables: list[Variable], ruta: Path) -> None:
    etiquetas_col = [v.etiqueta for v in variables]
    etiquetas_val = {}
    for v in variables:
        if not v.etiquetas_valores:
            continue
        claves = {}
        for k, lab in v.etiquetas_valores.items():
            try:
                claves[float(k) if v.tipo == "numerica" else k] = lab
            except ValueError:
                claves[k] = lab
        etiquetas_val[v.nombre] = claves
    perdidos = {v.nombre: [p for p in v.perdidos if not isinstance(p, list)]
                for v in variables if v.perdidos}
    formatos = {v.nombre: (f"F{v.ancho}.{v.decimales}" if v.tipo == "numerica" else f"A{v.ancho}")
                for v in variables}
    pyreadstat.write_sav(
        df, str(ruta),
        column_labels=etiquetas_col,
        variable_value_labels=etiquetas_val,
        missing_ranges={k: v for k, v in perdidos.items() if v},
        variable_measure={v.nombre: MEDIDA_A_SPSS[v.medida] for v in variables},
        variable_format=formatos,
    )


def escribir_csv(df: pd.DataFrame) -> bytes:
    buf = io.StringIO()
    df.to_csv(buf, index=False)
    return buf.getvalue().encode("utf-8")


def a_json_seguro(valor):
    """NaN, numpy y fechas no son JSON: se convierten antes de responder."""
    if valor is None:
        return None
    if isinstance(valor, (np.floating, float)):
        return None if np.isnan(valor) else float(valor)
    if isinstance(valor, (np.integer,)):
        return int(valor)
    if isinstance(valor, (pd.Timestamp,)):
        return valor.isoformat()
    if isinstance(valor, (np.bool_,)):
        return bool(valor)
    return valor
