"""Pruebas de extremo a extremo contra la API, con valores contrastados por fuera de la app."""
import math

import numpy as np
import pandas as pd
import pyreadstat
import pytest
from scipy import stats

from generar_demo import BETA_CLIMA_COMPROMISO, BETA_COMPROMISO_DESEMPENO, CARGAS


def analizar(cliente, ds_id, proc, **params):
    r = cliente.post(f"/api/datasets/{ds_id}/analisis/{proc}", json=params)
    assert r.status_code == 200, r.text
    return r.json()


def bloque(salida, titulo_inicio):
    for b in salida["bloques"]:
        if b["tipo"] == "tabla" and b["titulo"].startswith(titulo_inicio):
            return b
    raise AssertionError(f"sin bloque {titulo_inicio}: {[b.get('titulo') for b in salida['bloques']]}")


def fila(tabla, primera_celda):
    for f in tabla["filas"]:
        if f[0] == primera_celda:
            return f
    raise AssertionError(f"sin fila {primera_celda}: {[f[0] for f in tabla['filas']]}")


# ---------------------------------------------------------------- datos y metadatos

def test_lee_sav_con_metadatos(cliente, ds_id):
    d = cliente.get(f"/api/datasets/{ds_id}").json()
    assert d["resumen"]["n_filas"] == 400 and d["resumen"]["n_variables"] == 15
    vars_ = {v["nombre"]: v for v in d["variables"]}
    assert vars_["sexo"]["etiquetas_valores"] == {"1": "Mujer", "2": "Hombre"}
    assert vars_["sexo"]["medida"] == "nominal"
    assert vars_["satisfaccion"]["perdidos"] == [9.0]
    assert vars_["antiguedad"]["decimales"] == 1 and vars_["salario"]["decimales"] == 0
    assert vars_["cli1"]["etiqueta"] == "Clima: apoyo del jefe"


def test_pagina_de_filas_y_nulos(cliente, ds_id):
    p = cliente.get(f"/api/datasets/{ds_id}/filas", params={"inicio": 0, "n": 50}).json()
    assert p["total"] == 400 and len(p["filas"]) == 50
    assert p["filas"][0][0] == 1  # id de la primera fila
    todas = cliente.get(f"/api/datasets/{ds_id}/filas", params={"inicio": 0, "n": 400}).json()["filas"]
    antiguedad = [f[12] for f in todas]
    assert antiguedad.count(None) == 8  # los NaN de sistema viajan como null


def test_editar_celda_y_variables(cliente, ds_id):
    original = cliente.get(f"/api/datasets/{ds_id}/filas", params={"n": 1}).json()["filas"][0][13]
    r = cliente.put(f"/api/datasets/{ds_id}/celda", json={"fila": 0, "variable": "salario", "valor": "2500,5"})
    assert r.status_code == 200
    assert cliente.get(f"/api/datasets/{ds_id}/filas", params={"n": 1}).json()["filas"][0][13] == 2500.5
    # se restaura para que las pruebas siguientes comparen contra el .sav original
    cliente.put(f"/api/datasets/{ds_id}/celda", json={"fila": 0, "variable": "salario", "valor": original})
    r = cliente.put(f"/api/datasets/{ds_id}/celda", json={"fila": 0, "variable": "salario", "valor": "abc"})
    assert r.status_code == 400
    d = cliente.get(f"/api/datasets/{ds_id}").json()["variables"]
    d[13]["etiqueta"] = "Salario (USD)"
    d[13]["etiquetas_valores"] = {}
    r = cliente.put(f"/api/datasets/{ds_id}/variables", json=d)
    assert r.status_code == 200
    assert cliente.get(f"/api/datasets/{ds_id}").json()["variables"][13]["etiqueta"] == "Salario (USD)"


def test_exportar_sav_conserva_etiquetas(cliente, ds_id, tmp_path):
    r = cliente.get(f"/api/datasets/{ds_id}/exportar", params={"formato": "sav"})
    assert r.status_code == 200
    ruta = tmp_path / "salida.sav"
    ruta.write_bytes(r.content)
    df, meta = pyreadstat.read_sav(str(ruta))
    assert len(df) == 400
    assert meta.variable_value_labels["area"][3.0] == "Administración"
    assert meta.variable_measure["sexo"] == "nominal"


# ---------------------------------------------------------------- descriptivos

def test_frecuencias_respetan_perdidos_de_usuario(cliente, ds_id):
    s = analizar(cliente, ds_id, "frecuencias", variables=["satisfaccion"])
    est = bloque(s, "Estadísticos")
    assert est["filas"][0][1:] == [388, 12]  # los 12 nueves son perdidos
    t = bloque(s, "satisfaccion")
    assert fila(t, "Perdidos")[1] == 12
    assert fila(t, "Total")[1] == 400
    valores = [f[0] for f in t["filas"]]
    assert "5 Muy satisfecho" in valores and not any(v.startswith("9") for v in valores)


def test_descriptivos_coinciden_con_pandas(cliente, ds_id, sav_demo):
    df, _ = pyreadstat.read_sav(str(sav_demo))
    s = analizar(cliente, ds_id, "descriptivos", variables=["antiguedad"])
    f = bloque(s, "Estadísticos descriptivos")["filas"][0]
    a = df["antiguedad"].dropna()
    assert f[1] == 392
    assert f[4] == pytest.approx(a.mean(), abs=1e-3)
    assert f[5] == pytest.approx(a.std(ddof=1), abs=1e-3)
    assert f[7] == pytest.approx(a.skew(), abs=1e-3)


def test_tablas_cruzadas_chi2(cliente, ds_id, sav_demo):
    df, _ = pyreadstat.read_sav(str(sav_demo))
    s = analizar(cliente, ds_id, "tablas_cruzadas", filas="area", columnas="sexo", porcentajes=["fila"])
    ct = pd.crosstab(df["area"], df["sexo"])
    chi, p, gl, _ = stats.chi2_contingency(ct.values, correction=False)
    t = bloque(s, "Pruebas de chi-cuadrado")
    f = fila(t, "Chi-cuadrado de Pearson")
    assert f[1] == pytest.approx(chi, abs=1e-3) and f[2] == gl
    conteo = bloque(s, "Tabla de contingencia")
    assert fila(conteo, "Total")[-1] == 400
    assert fila(conteo, "1 Operaciones")[2] == int(ct.loc[1.0, 1.0])


def test_explorar_con_factor(cliente, ds_id):
    s = analizar(cliente, ds_id, "explorar", variables=["salario"], factor="area")
    titulos = [b["titulo"] for b in s["bloques"] if b["tipo"] == "tabla"]
    assert sum(t.startswith("salario") for t in titulos) == 3
    assert any("Shapiro" in str(b) for b in s["bloques"])


# ---------------------------------------------------------------- medias

def test_t_independientes_contra_scipy(cliente, ds_id, sav_demo):
    df, _ = pyreadstat.read_sav(str(sav_demo))
    s = analizar(cliente, ds_id, "t_independientes", variables=["salario"], grupo="sexo", grupo1="1", grupo2="2")
    a, b = df.loc[df.sexo == 1, "salario"], df.loc[df.sexo == 2, "salario"]
    t, p = stats.ttest_ind(a, b)
    f = bloque(s, "Prueba de muestras independientes")["filas"][0]
    assert f[4] == pytest.approx(t, abs=1e-3) and f[5] == len(df) - 2
    lev = stats.levene(a, b, center="mean")[0]
    assert f[2] == pytest.approx(lev, abs=1e-3)


def test_anova_recupera_efecto_de_area(cliente, ds_id, sav_demo):
    df, _ = pyreadstat.read_sav(str(sav_demo))
    s = analizar(cliente, ds_id, "anova_un_factor", dependientes=["salario"], factor="area", post_hoc=True)
    f_scipy = stats.f_oneway(*[g["salario"] for _, g in df.groupby("area")])
    t = bloque(s, "ANOVA")
    inter = fila(t, "Inter-grupos")
    assert inter[4] == pytest.approx(f_scipy.statistic, abs=1e-2)
    assert inter[5] == "<0,001"  # el área 3 gana 250 USD por construcción
    tukey = bloque(s, "Comparaciones múltiples")
    assert len(tukey["filas"]) == 3


def test_t_pareadas_y_una_muestra(cliente, ds_id, sav_demo):
    df, _ = pyreadstat.read_sav(str(sav_demo))
    s = analizar(cliente, ds_id, "t_pareadas", pares=[["cli1", "cli2"]])
    t_ref, _ = stats.ttest_rel(df["cli1"], df["cli2"])
    assert bloque(s, "Prueba de muestras relacionadas")["filas"][0][6] == pytest.approx(t_ref, abs=1e-3)
    s = analizar(cliente, ds_id, "t_una_muestra", variables=["cli1"], valor_prueba=3)
    t_ref, _ = stats.ttest_1samp(df["cli1"], 3)
    assert bloque(s, "Prueba para una muestra")["filas"][0][1] == pytest.approx(t_ref, abs=1e-3)


# ---------------------------------------------------------------- relaciones

def test_correlaciones_simetricas(cliente, ds_id, sav_demo):
    df, _ = pyreadstat.read_sav(str(sav_demo))
    s = analizar(cliente, ds_id, "correlaciones", variables=["cli1", "cli2", "des1"], metodo="pearson")
    t = bloque(s, "Correlaciones")
    r12 = t["filas"][0][3]
    r21 = t["filas"][3][2]
    assert r12 == r21 == pytest.approx(df[["cli1", "cli2"]].corr().iloc[0, 1], abs=1e-3)
    assert t["filas"][2][2] == 400  # N


def test_regresion_recupera_pendientes(cliente, ds_id, sav_demo):
    df, _ = pyreadstat.read_sav(str(sav_demo))
    s = analizar(cliente, ds_id, "regresion_lineal", dependiente="salario", independientes=["antiguedad"])
    coef = bloque(s, "Coeficientes")
    b_ant = [f for f in coef["filas"] if f[0].startswith("antiguedad")][0]
    sub = df.dropna(subset=["antiguedad"])
    pend, inter, r, _, _ = stats.linregress(sub["antiguedad"], sub["salario"])
    assert b_ant[1] == pytest.approx(pend, abs=1e-3)
    assert bloque(s, "Resumen del modelo")["filas"][0][1] == pytest.approx(r ** 2, abs=1e-3)
    assert 80 < pend < 110  # la pendiente verdadera es 95


# ---------------------------------------------------------------- SEM

SINTAXIS = """
clima =~ cli1 + cli2 + cli3
compromiso =~ com1 + com2 + com3
desempeno =~ des1 + des2 + des3
compromiso ~ clima
desempeno ~ compromiso
"""


def test_sem_recupera_el_modelo_generador(cliente, ds_id):
    s = analizar(cliente, ds_id, "sem", sintaxis=SINTAXIS, estimador="ML", estandarizado=True)
    assert not any(b["tipo"] == "texto" and b["nivel"] == "error" for b in s["bloques"]), s["bloques"]
    ajuste = bloque(s, "Índices de ajuste global")
    idx = {f[0]: f[1] for f in ajuste["filas"]}
    assert idx["CFI"] > 0.95 and idx["RMSEA"] < 0.06 and idx["SRMR"] is not None and idx["SRMR"] < 0.06
    est = bloque(s, "Modelo estructural")
    betas = {(f[0], f[2]): f[4] for f in est["filas"]}
    assert betas[("compromiso", "clima")] == pytest.approx(BETA_CLIMA_COMPROMISO, abs=0.12)
    assert betas[("desempeno", "compromiso")] == pytest.approx(BETA_COMPROMISO_DESEMPENO, abs=0.12)
    cargas = bloque(s, "Modelo de medición")
    est_std = {(f[0], f[2]): f[4] for f in cargas["filas"]}
    # la discretización a Likert atenúa las cargas: se pide el orden correcto, no el valor exacto
    for latente, items in (("clima", "cli"), ("compromiso", "com"), ("desempeno", "des")):
        for k, verdadera in enumerate(CARGAS[latente], 1):
            assert est_std[(latente, f"{items}{k}")] == pytest.approx(verdadera, abs=0.15)
    grafo = [b for b in s["bloques"] if b["tipo"] == "grafo"][0]
    assert {n["id"] for n in grafo["nodos"] if n["tipo"] == "latente"} == {"clima", "compromiso", "desempeno"}
    assert sum(a["tipo"] == "regresion" for a in grafo["aristas"]) == 2
    assert sum(a["tipo"] == "carga" for a in grafo["aristas"]) == 9


def test_sem_variable_inexistente(cliente, ds_id):
    s = analizar(cliente, ds_id, "sem", sintaxis="f =~ cli1 + noexiste")
    assert s["bloques"][0]["tipo"] == "texto" and "noexiste" in s["bloques"][0]["texto"]


def test_parametro_desconocido_es_400(cliente, ds_id):
    r = cliente.post(f"/api/datasets/{ds_id}/analisis/descriptivos", json={"variables": ["cli1"], "x": 1})
    assert r.status_code == 400
