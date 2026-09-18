"""Estadística descriptiva: frecuencias, descriptivos, explorar y tablas cruzadas."""
from __future__ import annotations

import math

import numpy as np
import pandas as pd
from scipy import stats

from ..almacen import Dataset
from ..formato import etiqueta, etiqueta_valor, p_valor, tabla, texto
from ..modelos import Salida


def _se_asimetria(n: int) -> float:
    return math.sqrt(6 * n * (n - 1) / ((n - 2) * (n + 1) * (n + 3))) if n > 2 else float("nan")


def _se_curtosis(n: int) -> float:
    se = _se_asimetria(n)
    return 2 * se * math.sqrt((n * n - 1) / ((n - 3) * (n + 5))) if n > 3 else float("nan")


def frecuencias(ds: Dataset, variables: list[str], estadisticos: bool = True) -> Salida:
    df = ds.perdidos_como_nan(variables)
    bloques = []
    resumen = []
    for v in variables:
        s = df[v]
        validos = s.dropna()
        resumen.append([etiqueta(ds, v), len(validos), int(s.isna().sum())])
        conteo = validos.value_counts(sort=False)
        try:
            conteo = conteo.sort_index()
        except TypeError:
            pass
        total = len(s)
        n_val = len(validos)
        filas, acum = [], 0.0
        for valor, n in conteo.items():
            pct_val = 100 * n / n_val if n_val else 0
            acum += pct_val
            filas.append([etiqueta_valor(ds, v, valor), int(n), 100 * n / total, pct_val, acum])
        if n_val:
            filas.append(["Total válido", n_val, 100 * n_val / total, 100.0, None])
        if total - n_val:
            filas.append(["Perdidos", total - n_val, 100 * (total - n_val) / total, None, None])
        filas.append(["Total", total, 100.0, None, None])
        bloques.append(tabla(etiqueta(ds, v),
                             ["Valor", "Frecuencia", "Porcentaje", "Porcentaje válido", "Porcentaje acumulado"],
                             filas, dec=1))
    if estadisticos:
        bloques.insert(0, tabla("Estadísticos", ["Variable", "N válido", "N perdidos"], resumen))
    return Salida(titulo="Frecuencias", procedimiento="frecuencias", bloques=bloques)


def descriptivos(ds: Dataset, variables: list[str]) -> Salida:
    df = ds.perdidos_como_nan(variables)
    filas = []
    for v in variables:
        s = pd.to_numeric(df[v], errors="coerce").dropna()
        n = len(s)
        if n == 0:
            filas.append([etiqueta(ds, v), 0] + [None] * 9)
            continue
        filas.append([
            etiqueta(ds, v), n, s.min(), s.max(), s.mean(), s.std(ddof=1), s.var(ddof=1),
            s.skew() if n > 2 else None, _se_asimetria(n),
            s.kurt() if n > 3 else None, _se_curtosis(n),
        ])
    return Salida(titulo="Descriptivos", procedimiento="descriptivos", bloques=[
        tabla("Estadísticos descriptivos",
              ["Variable", "N", "Mínimo", "Máximo", "Media", "Desv. típica", "Varianza",
               "Asimetría", "Error típ. asimetría", "Curtosis", "Error típ. curtosis"], filas)])


def _explorar_serie(s: pd.Series) -> list[list]:
    n = len(s)
    media = s.mean()
    se = s.std(ddof=1) / math.sqrt(n) if n > 1 else float("nan")
    t = stats.t.ppf(0.975, n - 1) if n > 1 else float("nan")
    q1, q3 = s.quantile(0.25), s.quantile(0.75)
    recortada = stats.trim_mean(s, 0.05) if n >= 20 else media
    return [
        ["Media", media, se],
        ["IC 95 % para la media: límite inferior", media - t * se, None],
        ["IC 95 % para la media: límite superior", media + t * se, None],
        ["Media recortada al 5 %", recortada, None],
        ["Mediana", s.median(), None],
        ["Varianza", s.var(ddof=1), None],
        ["Desv. típica", s.std(ddof=1), None],
        ["Mínimo", s.min(), None],
        ["Máximo", s.max(), None],
        ["Rango", s.max() - s.min(), None],
        ["Rango intercuartílico", q3 - q1, None],
        ["Asimetría", s.skew() if n > 2 else None, _se_asimetria(n)],
        ["Curtosis", s.kurt() if n > 3 else None, _se_curtosis(n)],
    ]


def explorar(ds: Dataset, variables: list[str], factor: str | None = None) -> Salida:
    cols = variables + ([factor] if factor else [])
    df = ds.perdidos_como_nan(cols)
    bloques = []
    for v in variables:
        s_all = pd.to_numeric(df[v], errors="coerce")
        grupos = [(None, s_all)] if not factor else [(g, s_all[df[factor] == g]) for g in sorted(df[factor].dropna().unique())]
        for g, s in grupos:
            s = s.dropna()
            titulo = etiqueta(ds, v) + (f" · {etiqueta(ds, factor)} = {etiqueta_valor(ds, factor, g)}" if factor else "")
            if len(s) < 2:
                bloques.append(texto(f"{titulo}: menos de dos casos válidos.", "aviso"))
                continue
            bloques.append(tabla(titulo, ["Estadístico", "Valor", "Error típ."], _explorar_serie(s)))
            pct = [5, 10, 25, 50, 75, 90, 95]
            bloques.append(tabla(f"Percentiles · {titulo}", ["Percentil"] + [str(p) for p in pct],
                                 [["Valor"] + [s.quantile(p / 100) for p in pct]]))
            if len(s) >= 3:
                w, p = stats.shapiro(s if len(s) <= 5000 else s.sample(5000, random_state=1))
                bloques.append(tabla(f"Prueba de normalidad · {titulo}",
                                     ["Prueba", "Estadístico", "gl", "Sig."],
                                     [["Shapiro-Wilk", w, len(s), p_valor(p)]],
                                     notas=["Sobre una muestra de 5.000 casos cuando N es mayor."] if len(s) > 5000 else []))
    return Salida(titulo="Explorar", procedimiento="explorar", bloques=bloques)


def tablas_cruzadas(ds: Dataset, filas: str, columnas: str,
                    porcentajes: list[str] | None = None, chi2: bool = True) -> Salida:
    porcentajes = porcentajes or []
    df = ds.perdidos_como_nan([filas, columnas]).dropna()
    if df.empty:
        return Salida(titulo="Tablas cruzadas", procedimiento="tablas_cruzadas",
                      bloques=[texto("No hay casos válidos en las dos variables.", "error")])
    ct = pd.crosstab(df[filas], df[columnas])
    nombres_col = [etiqueta_valor(ds, columnas, c) for c in ct.columns]
    cab = [f"{etiqueta(ds, filas)} \\ {etiqueta(ds, columnas)}", ""] + nombres_col + ["Total"]
    cuerpo = []
    total = ct.values.sum()
    for idx, fila in ct.iterrows():
        cuerpo.append([etiqueta_valor(ds, filas, idx), "Recuento"] + [int(x) for x in fila] + [int(fila.sum())])
        if "fila" in porcentajes:
            cuerpo.append(["", "% de fila"] + [100 * x / fila.sum() for x in fila] + [100.0])
        if "columna" in porcentajes:
            cuerpo.append(["", "% de columna"] + [100 * x / ct[c].sum() for c, x in fila.items()] + [100 * fila.sum() / total])
        if "total" in porcentajes:
            cuerpo.append(["", "% del total"] + [100 * x / total for x in fila] + [100 * fila.sum() / total])
    cuerpo.append(["Total", "Recuento"] + [int(ct[c].sum()) for c in ct.columns] + [int(total)])
    bloques = [tabla("Tabla de contingencia", cab, cuerpo, dec=1)]
    if chi2 and ct.shape[0] > 1 and ct.shape[1] > 1:
        chi, p, gl, esperadas = stats.chi2_contingency(ct.values, correction=False)
        lr, p_lr, _, _ = stats.chi2_contingency(ct.values, correction=False, lambda_="log-likelihood")
        filas_chi = [["Chi-cuadrado de Pearson", chi, gl, p_valor(p)],
                     ["Razón de verosimilitud", lr, gl, p_valor(p_lr)]]
        if ct.shape == (2, 2):
            chi_c, p_c, _, _ = stats.chi2_contingency(ct.values, correction=True)
            filas_chi.insert(1, ["Corrección por continuidad", chi_c, gl, p_valor(p_c)])
            _, p_f = stats.fisher_exact(ct.values)
            filas_chi.append(["Estadístico exacto de Fisher (bilateral)", None, None, p_valor(p_f)])
        filas_chi.append(["N de casos válidos", int(total), None, None])
        bajas = int((esperadas < 5).sum())
        notas = [f"{bajas} casillas ({100 * bajas / esperadas.size:.1f} %) tienen una frecuencia esperada menor que 5. "
                 f"La frecuencia mínima esperada es {esperadas.min():.2f}."]
        bloques.append(tabla("Pruebas de chi-cuadrado", ["Prueba", "Valor", "gl", "Sig. asintótica (bilateral)"],
                             filas_chi, notas=notas))
        k = min(ct.shape) - 1
        v = math.sqrt(chi / (total * k)) if k > 0 else float("nan")
        medidas = [["V de Cramér", v, p_valor(p)]]
        if ct.shape == (2, 2):
            medidas.insert(0, ["Phi", math.sqrt(chi / total), p_valor(p)])
        bloques.append(tabla("Medidas simétricas", ["Medida", "Valor", "Sig. aproximada"], medidas))
    return Salida(titulo="Tablas cruzadas", procedimiento="tablas_cruzadas", bloques=bloques)
