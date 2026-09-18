"""Modelos de ecuaciones estructurales con semopy (sintaxis tipo lavaan)."""
from __future__ import annotations

import math

import numpy as np
import pandas as pd
import semopy

from ..almacen import Dataset
from ..formato import p_valor, r, tabla, texto
from ..modelos import BloqueGrafo, Salida

ESTIMADORES = {"ML": "MLW", "ULS": "ULS", "GLS": "GLS", "DWLS": "DWLS", "FIML": "FIML"}
OPERADORES = {"=~": "Modelo de medición (cargas)", "~": "Modelo estructural (regresiones)", "~~": "Varianzas y covarianzas"}


def _srmr(modelo) -> float | None:
    """semopy no trae SRMR; se calcula desde la covarianza muestral y la implicada."""
    try:
        sigma, _ = modelo.calc_sigma()
        s = modelo.mx_cov
        d = np.sqrt(np.diag(s))
        res = (s - sigma) / np.outer(d, d)
        tri = res[np.tril_indices_from(res)]
        return float(np.sqrt(np.mean(tri ** 2)))
    except Exception:
        return None


def _variables_del_modelo(sintaxis: str) -> list[str]:
    nombres = set()
    for linea in sintaxis.splitlines():
        linea = linea.split("#")[0].strip()
        if not linea:
            continue
        for op in ("=~", "~~", "~"):
            if op in linea:
                izq, der = linea.split(op, 1)
                nombres.add(izq.strip())
                for term in der.split("+"):
                    term = term.strip()
                    if "*" in term:
                        term = term.split("*", 1)[1].strip()
                    if term:
                        nombres.add(term)
                break
    return sorted(nombres)


def ajustar_sem(ds: Dataset, sintaxis: str, estimador: str = "ML", estandarizado: bool = True) -> Salida:
    sintaxis = sintaxis.strip()
    if not sintaxis:
        return Salida(titulo="SEM", procedimiento="sem", bloques=[texto("La sintaxis del modelo está vacía.", "error")])
    try:
        modelo = semopy.Model(sintaxis)
    except Exception as e:  # sintaxis mal formada
        return Salida(titulo="SEM", procedimiento="sem", bloques=[texto(f"No se pudo leer la sintaxis: {e}", "error")])
    latentes = set(modelo.vars.get("latent", []))
    observadas = [v for v in _variables_del_modelo(sintaxis) if v not in latentes]
    faltan = [v for v in observadas if v not in ds.df.columns]
    if faltan:
        return Salida(titulo="SEM", procedimiento="sem",
                      bloques=[texto(f"Variables observadas que no están en los datos: {', '.join(faltan)}", "error")])
    df = ds.perdidos_como_nan(observadas).apply(pd.to_numeric, errors="coerce")
    obj = ESTIMADORES.get(estimador, "MLW")
    if obj != "FIML":
        df = df.dropna()
    n = len(df)
    try:
        modelo.fit(df, obj=obj)
    except Exception as e:
        return Salida(titulo="SEM", procedimiento="sem", bloques=[texto(f"La estimación falló: {e}", "error")])

    est = modelo.inspect(std_est=True)
    est["clase"] = [_clase(f, latentes) for _, f in est.iterrows()]
    bloques = []
    for clase, titulo in OPERADORES.items():
        sub = est[est["clase"] == clase]
        if sub.empty:
            continue
        filas = []
        for _, fila in sub.iterrows():
            if clase == "=~":
                izq, der = fila["rval"], fila["lval"]      # semopy escribe indicador ~ latente
            else:
                izq, der = fila["lval"], fila["rval"]
            filas.append([izq, clase, der, _float(fila["Estimate"]), _float(fila.get("Est. Std")),
                          _float(fila.get("Std. Err")), _float(fila.get("z-value")),
                          p_valor(_float(fila.get("p-value")))])
        bloques.append(tabla(titulo, ["Variable", "Op.", "Variable", "Estimación", "Estandarizada",
                                      "Error típ.", "z", "Sig."], filas,
                             notas=["Los parámetros sin error típico son los fijados a 1 para identificar el constructo."]
                             if clase == "=~" else []))

    try:
        st = semopy.calc_stats(modelo).iloc[0]
        chi2, gl, p = st["chi2"], st["DoF"], st["chi2 p-value"]
        filas = [["Chi-cuadrado", chi2], ["gl", gl], ["Sig. (chi-cuadrado)", p_valor(_float(p))],
                 ["Chi-cuadrado / gl", chi2 / gl if gl else None],
                 ["CFI", st["CFI"]], ["TLI", st["TLI"]], ["NFI", st["NFI"]], ["GFI", st["GFI"]], ["AGFI", st["AGFI"]],
                 ["RMSEA", st["RMSEA"]], ["SRMR", _srmr(modelo)],
                 ["AIC", st["AIC"]], ["BIC", st["BIC"]], ["Log-verosimilitud", st["LogLik"]]]
        notas = [f"Estimador: {estimador}. N = {n}.",
                 "Referencias habituales: CFI y TLI ≥ 0,90 (mejor ≥ 0,95); RMSEA ≤ 0,08 (mejor ≤ 0,06); SRMR ≤ 0,08."]
        bloques.append(tabla("Índices de ajuste global", ["Índice", "Valor"], filas, notas=notas))
    except Exception as e:
        bloques.append(texto(f"No se pudieron calcular los índices de ajuste: {e}", "aviso"))

    bloques.append(_grafo(modelo, est, latentes, estandarizado))
    return Salida(titulo="Modelo de ecuaciones estructurales", procedimiento="sem", bloques=bloques)


def _float(x):
    try:
        return float(x)
    except (TypeError, ValueError):
        return float("nan")


def _clase(fila, latentes: set[str]) -> str:
    """semopy usa '~' tanto para cargas (indicador ~ latente) como para regresiones."""
    if fila["op"] == "~~":
        return "~~"
    if fila["op"] == "~" and fila["rval"] in latentes and fila["lval"] not in latentes:
        return "=~"
    return "~"


def _grafo(modelo, est: pd.DataFrame, latentes: set[str], estandarizado: bool) -> BloqueGrafo:
    nodos, vistos = [], set()
    for _, fila in est.iterrows():
        for nombre in (fila["lval"], fila["rval"]):
            if nombre in vistos:
                continue
            vistos.add(nombre)
            nodos.append({"id": nombre, "tipo": "latente" if nombre in latentes else "observada"})
    aristas = []
    col = "Est. Std" if estandarizado and "Est. Std" in est.columns else "Estimate"
    for i, fila in est.iterrows():
        op = fila["clase"] if "clase" in est.columns else fila["op"]
        valor = r(_float(fila[col]), 3)
        p = _float(fila.get("p-value"))
        if op == "=~":
            aristas.append({"id": f"e{i}", "origen": fila["rval"], "destino": fila["lval"], "tipo": "carga",
                            "valor": valor, "p": r(p, 3)})
        elif op == "~":
            aristas.append({"id": f"e{i}", "origen": fila["rval"], "destino": fila["lval"], "tipo": "regresion",
                            "valor": valor, "p": r(p, 3)})
        elif op == "~~" and fila["lval"] != fila["rval"]:
            aristas.append({"id": f"e{i}", "origen": fila["lval"], "destino": fila["rval"], "tipo": "covarianza",
                            "valor": valor, "p": r(p, 3)})
    return BloqueGrafo(titulo="Diagrama de rutas" + (" (estandarizado)" if estandarizado else ""),
                       nodos=nodos, aristas=aristas)
