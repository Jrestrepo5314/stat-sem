"""Ayudas para armar bloques de salida con números legibles."""
from __future__ import annotations

import math
from typing import Any

import numpy as np

from .modelos import BloqueTabla, BloqueTexto


def r(x: Any, dec: int = 3) -> Any:
    """Redondea si es número; deja pasar cadenas y None; NaN → None."""
    if x is None:
        return None
    if isinstance(x, (bool, np.bool_)):
        return bool(x)
    if isinstance(x, (int, np.integer)):
        return int(x)
    if isinstance(x, (float, np.floating)):
        if math.isnan(x) or math.isinf(x):
            return None
        return round(float(x), dec)
    return x


def p_valor(p: float) -> Any:
    if p is None or (isinstance(p, float) and math.isnan(p)):
        return None
    return "<0,001" if p < 0.001 else round(float(p), 3)


def tabla(titulo: str, columnas: list[str], filas: list[list[Any]], notas: list[str] | None = None,
          dec: int = 3) -> BloqueTabla:
    return BloqueTabla(titulo=titulo, columnas=columnas,
                       filas=[[r(c, dec) for c in fila] for fila in filas], notas=notas or [])


def texto(t: str, nivel: str = "parrafo") -> BloqueTexto:
    return BloqueTexto(texto=t, nivel=nivel)  # type: ignore[arg-type]


def etiqueta(ds, nombre: str) -> str:
    """'nombre (etiqueta)' si la variable tiene etiqueta; si no, el nombre."""
    try:
        v = ds.variable(nombre)
    except KeyError:
        return nombre
    return f"{nombre} — {v.etiqueta}" if v.etiqueta else nombre


def etiqueta_valor(ds, nombre: str, valor: Any) -> str:
    try:
        v = ds.variable(nombre)
    except KeyError:
        return str(valor)
    clave = str(int(valor)) if isinstance(valor, float) and valor.is_integer() else str(valor)
    lab = v.etiquetas_valores.get(clave)
    return f"{clave} {lab}" if lab else clave
