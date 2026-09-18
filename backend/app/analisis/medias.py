"""Comparación de medias: pruebas t y ANOVA de un factor."""
from __future__ import annotations

import math

import numpy as np
import pandas as pd
from scipy import stats
from statsmodels.stats.multicomp import pairwise_tukeyhsd

from ..almacen import Dataset
from ..formato import etiqueta, etiqueta_valor, p_valor, tabla, texto
from ..modelos import Salida


def _num(df: pd.DataFrame, v: str) -> pd.Series:
    return pd.to_numeric(df[v], errors="coerce")


def t_una_muestra(ds: Dataset, variables: list[str], valor_prueba: float = 0.0) -> Salida:
    df = ds.perdidos_como_nan(variables)
    desc, prueba = [], []
    for v in variables:
        s = _num(df, v).dropna()
        n = len(s)
        if n < 2:
            prueba.append([etiqueta(ds, v)] + [None] * 6)
            continue
        se = s.std(ddof=1) / math.sqrt(n)
        t, p = stats.ttest_1samp(s, valor_prueba)
        dif = s.mean() - valor_prueba
        tc = stats.t.ppf(0.975, n - 1)
        desc.append([etiqueta(ds, v), n, s.mean(), s.std(ddof=1), se])
        prueba.append([etiqueta(ds, v), t, n - 1, p_valor(p), dif, dif - tc * se, dif + tc * se])
    return Salida(titulo="Prueba T para una muestra", procedimiento="t_una_muestra", bloques=[
        tabla("Estadísticos para una muestra", ["Variable", "N", "Media", "Desv. típica", "Error típ. de la media"], desc),
        tabla(f"Prueba para una muestra (valor de prueba = {valor_prueba})",
              ["Variable", "t", "gl", "Sig. (bilateral)", "Diferencia de medias", "IC 95 % inferior", "IC 95 % superior"],
              prueba),
    ])


def t_independientes(ds: Dataset, variables: list[str], grupo: str, grupo1, grupo2) -> Salida:
    df = ds.perdidos_como_nan(variables + [grupo])
    g = df[grupo]
    # los grupos llegan como texto desde la interfaz; se comparan con el tipo de la columna
    if pd.api.types.is_numeric_dtype(g):
        grupo1, grupo2 = float(grupo1), float(grupo2)
    desc, prueba = [], []
    for v in variables:
        a = _num(df, v)[g == grupo1].dropna()
        b = _num(df, v)[g == grupo2].dropna()
        for nombre, s in ((grupo1, a), (grupo2, b)):
            desc.append([etiqueta(ds, v), etiqueta_valor(ds, grupo, nombre), len(s), s.mean(),
                         s.std(ddof=1), s.std(ddof=1) / math.sqrt(len(s)) if len(s) else None])
        if len(a) < 2 or len(b) < 2:
            prueba.append([etiqueta(ds, v), "—"] + [None] * 8)
            continue
        lev_f, lev_p = stats.levene(a, b, center="mean")
        for supuesto, equal in (("Se han asumido varianzas iguales", True),
                                ("No se han asumido varianzas iguales", False)):
            t, p = stats.ttest_ind(a, b, equal_var=equal)
            dif = a.mean() - b.mean()
            if equal:
                gl = len(a) + len(b) - 2
                sp2 = ((len(a) - 1) * a.var(ddof=1) + (len(b) - 1) * b.var(ddof=1)) / gl
                se = math.sqrt(sp2 * (1 / len(a) + 1 / len(b)))
            else:
                va, vb = a.var(ddof=1) / len(a), b.var(ddof=1) / len(b)
                se = math.sqrt(va + vb)
                gl = (va + vb) ** 2 / (va ** 2 / (len(a) - 1) + vb ** 2 / (len(b) - 1))
            tc = stats.t.ppf(0.975, gl)
            prueba.append([etiqueta(ds, v), supuesto, lev_f if equal else None, p_valor(lev_p) if equal else None,
                           t, gl, p_valor(p), dif, se, f"[{dif - tc * se:.3f}; {dif + tc * se:.3f}]"])
    return Salida(titulo="Prueba T para muestras independientes", procedimiento="t_independientes", bloques=[
        tabla("Estadísticos de grupo", ["Variable", etiqueta(ds, grupo), "N", "Media", "Desv. típica", "Error típ. de la media"], desc),
        tabla("Prueba de muestras independientes",
              ["Variable", "Supuesto", "Levene F", "Levene Sig.", "t", "gl", "Sig. (bilateral)",
               "Diferencia de medias", "Error típ. de la diferencia", "IC 95 % de la diferencia"], prueba),
    ])


def t_pareadas(ds: Dataset, pares: list[list[str]]) -> Salida:
    cols = sorted({c for par in pares for c in par})
    df = ds.perdidos_como_nan(cols)
    desc, corr, prueba = [], [], []
    for i, (a_n, b_n) in enumerate(pares, 1):
        sub = df[[a_n, b_n]].apply(pd.to_numeric, errors="coerce").dropna()
        a, b = sub[a_n], sub[b_n]
        n = len(sub)
        for nombre, s in ((a_n, a), (b_n, b)):
            desc.append([f"Par {i}", etiqueta(ds, nombre), n, s.mean(), s.std(ddof=1),
                         s.std(ddof=1) / math.sqrt(n) if n else None])
        if n < 2:
            prueba.append([f"Par {i}", f"{a_n} - {b_n}"] + [None] * 7)
            continue
        r, pr = stats.pearsonr(a, b)
        corr.append([f"Par {i}", f"{a_n} & {b_n}", n, r, p_valor(pr)])
        d = a - b
        se = d.std(ddof=1) / math.sqrt(n)
        t, p = stats.ttest_rel(a, b)
        tc = stats.t.ppf(0.975, n - 1)
        prueba.append([f"Par {i}", f"{a_n} - {b_n}", d.mean(), d.std(ddof=1), se,
                       f"[{d.mean() - tc * se:.3f}; {d.mean() + tc * se:.3f}]", t, n - 1, p_valor(p)])
    return Salida(titulo="Prueba T para muestras relacionadas", procedimiento="t_pareadas", bloques=[
        tabla("Estadísticos de muestras relacionadas", ["Par", "Variable", "N", "Media", "Desv. típica", "Error típ. de la media"], desc),
        tabla("Correlaciones de muestras relacionadas", ["Par", "Variables", "N", "Correlación", "Sig."], corr),
        tabla("Prueba de muestras relacionadas",
              ["Par", "Diferencia", "Media", "Desv. típica", "Error típ. de la media", "IC 95 % de la diferencia",
               "t", "gl", "Sig. (bilateral)"], prueba),
    ])


def anova_un_factor(ds: Dataset, dependientes: list[str], factor: str, post_hoc: bool = True) -> Salida:
    df = ds.perdidos_como_nan(dependientes + [factor])
    bloques = []
    for v in dependientes:
        sub = pd.DataFrame({"y": _num(df, v), "g": df[factor]}).dropna()
        grupos = {g: s["y"] for g, s in sub.groupby("g", sort=True)}
        if len(grupos) < 2:
            bloques.append(texto(f"{etiqueta(ds, v)}: el factor necesita al menos dos grupos con datos.", "aviso"))
            continue
        desc = []
        for g, s in grupos.items():
            n = len(s)
            se = s.std(ddof=1) / math.sqrt(n) if n > 1 else float("nan")
            tc = stats.t.ppf(0.975, n - 1) if n > 1 else float("nan")
            desc.append([etiqueta_valor(ds, factor, g), n, s.mean(), s.std(ddof=1), se,
                         s.mean() - tc * se, s.mean() + tc * se, s.min(), s.max()])
        y = sub["y"]
        desc.append(["Total", len(y), y.mean(), y.std(ddof=1), y.std(ddof=1) / math.sqrt(len(y)),
                     None, None, y.min(), y.max()])
        bloques.append(tabla(f"Descriptivos · {etiqueta(ds, v)}",
                             ["Grupo", "N", "Media", "Desv. típica", "Error típ.", "IC 95 % inferior",
                              "IC 95 % superior", "Mínimo", "Máximo"], desc))
        lev_f, lev_p = stats.levene(*grupos.values(), center="mean")
        bloques.append(tabla(f"Prueba de homogeneidad de varianzas · {etiqueta(ds, v)}",
                             ["Estadístico de Levene", "gl1", "gl2", "Sig."],
                             [[lev_f, len(grupos) - 1, len(y) - len(grupos), p_valor(lev_p)]]))
        gm = y.mean()
        ss_entre = sum(len(s) * (s.mean() - gm) ** 2 for s in grupos.values())
        ss_dentro = sum(((s - s.mean()) ** 2).sum() for s in grupos.values())
        gl_e, gl_d = len(grupos) - 1, len(y) - len(grupos)
        f = (ss_entre / gl_e) / (ss_dentro / gl_d)
        p = stats.f.sf(f, gl_e, gl_d)
        bloques.append(tabla(f"ANOVA · {etiqueta(ds, v)}",
                             ["Fuente", "Suma de cuadrados", "gl", "Media cuadrática", "F", "Sig."],
                             [["Inter-grupos", ss_entre, gl_e, ss_entre / gl_e, f, p_valor(p)],
                              ["Intra-grupos", ss_dentro, gl_d, ss_dentro / gl_d, None, None],
                              ["Total", ss_entre + ss_dentro, gl_e + gl_d, None, None, None]],
                             notas=[f"Eta cuadrado = {ss_entre / (ss_entre + ss_dentro):.3f}"]))
        wf, wp = stats.alexandergovern(*grupos.values()).statistic, stats.alexandergovern(*grupos.values()).pvalue
        bloques.append(tabla(f"Pruebas robustas de igualdad de medias · {etiqueta(ds, v)}",
                             ["Prueba", "Estadístico", "Sig."],
                             [["Alexander-Govern", wf, p_valor(wp)]]))
        if post_hoc and len(grupos) > 2:
            tk = pairwise_tukeyhsd(sub["y"].values, sub["g"].astype(str).values)
            filas = []
            for row in tk.summary().data[1:]:
                g1, g2, dif, p_adj, lo, hi, rech = row
                filas.append([etiqueta_valor(ds, factor, _reconvertir(g1, sub["g"])),
                              etiqueta_valor(ds, factor, _reconvertir(g2, sub["g"])),
                              dif, p_valor(float(p_adj)), lo, hi, "Sí" if rech else "No"])
            bloques.append(tabla(f"Comparaciones múltiples (Tukey HSD) · {etiqueta(ds, v)}",
                                 ["Grupo (I)", "Grupo (J)", "Diferencia de medias (I-J)", "Sig.",
                                  "IC 95 % inferior", "IC 95 % superior", "Diferencia significativa"], filas))
    return Salida(titulo="ANOVA de un factor", procedimiento="anova_un_factor", bloques=bloques)


def _reconvertir(texto_grupo: str, columna: pd.Series):
    """Tukey devuelve los grupos como texto; se vuelve al valor original para etiquetarlo."""
    for valor in columna.unique():
        if str(valor) == texto_grupo:
            return valor
    return texto_grupo
