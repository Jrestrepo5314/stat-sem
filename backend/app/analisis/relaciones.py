"""Correlaciones y regresión lineal por mínimos cuadrados ordinarios."""
from __future__ import annotations

import math

import numpy as np
import pandas as pd
import statsmodels.api as sm
from scipy import stats
from statsmodels.stats.outliers_influence import variance_inflation_factor
from statsmodels.stats.stattools import durbin_watson

from ..almacen import Dataset
from ..formato import etiqueta, p_valor, tabla, texto
from ..modelos import Salida

METODOS = {"pearson": stats.pearsonr, "spearman": stats.spearmanr, "kendall": stats.kendalltau}


def correlaciones(ds: Dataset, variables: list[str], metodo: str = "pearson") -> Salida:
    df = ds.perdidos_como_nan(variables).apply(pd.to_numeric, errors="coerce")
    fn = METODOS.get(metodo, stats.pearsonr)
    cab = ["Variable", "Estadístico"] + [etiqueta(ds, v) for v in variables]
    filas = []
    for a in variables:
        r_fila, p_fila, n_fila = [], [], []
        for b in variables:
            sub = df[[a, b]].dropna()
            n = len(sub)
            if a == b:
                r_fila.append(1.0); p_fila.append(None); n_fila.append(n)
                continue
            if n < 3:
                r_fila.append(None); p_fila.append(None); n_fila.append(n)
                continue
            res = fn(sub[a], sub[b])
            r, p = (res[0], res[1]) if isinstance(res, tuple) else (res.statistic, res.pvalue)
            r_fila.append(r); p_fila.append(p_valor(p)); n_fila.append(n)
        filas.append([etiqueta(ds, a), "Coeficiente"] + r_fila)
        filas.append(["", "Sig. (bilateral)"] + p_fila)
        filas.append(["", "N"] + n_fila)
    nombre = {"pearson": "Correlación de Pearson", "spearman": "Rho de Spearman", "kendall": "Tau-b de Kendall"}[metodo]
    return Salida(titulo=nombre, procedimiento="correlaciones",
                  bloques=[tabla("Correlaciones", cab, filas, notas=["N por pares: cada coeficiente usa los casos válidos en sus dos variables."])])


def regresion_lineal(ds: Dataset, dependiente: str, independientes: list[str]) -> Salida:
    df = ds.perdidos_como_nan([dependiente] + independientes).apply(pd.to_numeric, errors="coerce").dropna()
    n = len(df)
    if n <= len(independientes) + 1:
        return Salida(titulo="Regresión lineal", procedimiento="regresion_lineal",
                      bloques=[texto("No hay casos suficientes para estimar el modelo.", "error")])
    X = sm.add_constant(df[independientes])
    y = df[dependiente]
    m = sm.OLS(y, X).fit()
    resumen = tabla("Resumen del modelo",
                    ["R", "R cuadrado", "R cuadrado corregida", "Error típ. de la estimación", "Durbin-Watson"],
                    [[math.sqrt(m.rsquared), m.rsquared, m.rsquared_adj, math.sqrt(m.mse_resid), durbin_watson(m.resid)]],
                    notas=[f"Variables predictoras: (Constante), {', '.join(independientes)}. Variable dependiente: {dependiente}. N = {n}."])
    anova = tabla("ANOVA", ["Fuente", "Suma de cuadrados", "gl", "Media cuadrática", "F", "Sig."],
                  [["Regresión", m.ess, m.df_model, m.ess / m.df_model, m.fvalue, p_valor(m.f_pvalue)],
                   ["Residual", m.ssr, m.df_resid, m.mse_resid, None, None],
                   ["Total", m.ess + m.ssr, m.df_model + m.df_resid, None, None, None]])
    ic = m.conf_int(0.05)
    sy = y.std(ddof=1)
    filas = []
    for i, nombre in enumerate(X.columns):
        beta = None if nombre == "const" else m.params[nombre] * df[nombre].std(ddof=1) / sy
        vif = None if nombre == "const" or len(independientes) < 2 else variance_inflation_factor(X.values, i)
        filas.append(["(Constante)" if nombre == "const" else etiqueta(ds, nombre),
                      m.params[nombre], m.bse[nombre], beta, m.tvalues[nombre], p_valor(m.pvalues[nombre]),
                      ic.loc[nombre, 0], ic.loc[nombre, 1], vif])
    coef = tabla("Coeficientes",
                 ["Modelo", "B", "Error típ.", "Beta", "t", "Sig.", "IC 95 % inferior", "IC 95 % superior", "FIV"], filas)
    return Salida(titulo="Regresión lineal", procedimiento="regresion_lineal", bloques=[resumen, anova, coef])
