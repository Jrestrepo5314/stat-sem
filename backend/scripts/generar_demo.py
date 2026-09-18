"""Genera el dataset de demostración `encuesta_demo.sav`.

Simula una encuesta a empleados con tres constructos latentes (clima, compromiso,
desempeño) medidos por tres ítems cada uno, más variables sociodemográficas con
etiquetas de valor y perdidos definidos por el usuario, para probar toda la app.
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pyreadstat

# cargas verdaderas del modelo: sirven para que las pruebas comprueben la estimación SEM
CARGAS = {"clima": [0.80, 0.75, 0.70], "compromiso": [0.85, 0.80, 0.70], "desempeno": [0.75, 0.80, 0.70]}
BETA_CLIMA_COMPROMISO = 0.60
BETA_COMPROMISO_DESEMPENO = 0.50


def generar(n: int = 400, semilla: int = 7) -> tuple[pd.DataFrame, dict]:
    rng = np.random.default_rng(semilla)
    clima = rng.normal(size=n)
    compromiso = BETA_CLIMA_COMPROMISO * clima + rng.normal(scale=np.sqrt(1 - BETA_CLIMA_COMPROMISO ** 2), size=n)
    desempeno = BETA_COMPROMISO_DESEMPENO * compromiso + rng.normal(scale=np.sqrt(1 - BETA_COMPROMISO_DESEMPENO ** 2), size=n)
    datos = {}
    for nombre, latente in (("clima", clima), ("compromiso", compromiso), ("desempeno", desempeno)):
        for k, carga in enumerate(CARGAS[nombre], 1):
            ruido = rng.normal(scale=np.sqrt(1 - carga ** 2), size=n)
            item = carga * latente + ruido
            # escala Likert 1-5, como en una encuesta real
            datos[f"{nombre[:3]}{k}"] = np.clip(np.round(item * 1.1 + 3), 1, 5)
    df = pd.DataFrame(datos)
    df.insert(0, "id", np.arange(1, n + 1))
    df["sexo"] = rng.choice([1, 2], size=n)
    df["area"] = rng.choice([1, 2, 3], size=n, p=[0.4, 0.35, 0.25])
    df["antiguedad"] = np.round(rng.gamma(2.0, 3.0, size=n), 1)
    # salario depende de antigüedad y área para que la regresión tenga algo que encontrar
    df["salario"] = np.round(1800 + 95 * df["antiguedad"] + 250 * (df["area"] == 3) + rng.normal(scale=300, size=n))
    df["satisfaccion"] = np.clip(np.round(3 + 0.5 * compromiso + rng.normal(scale=0.7, size=n)), 1, 5)
    # perdidos de usuario: 9 = "no responde" en satisfacción, y algunos NaN de sistema
    df.loc[rng.choice(n, 12, replace=False), "satisfaccion"] = 9
    df.loc[rng.choice(n, 8, replace=False), "antiguedad"] = np.nan
    meta = {
        "column_labels": ["Identificador", "Clima: apoyo del jefe", "Clima: recursos", "Clima: comunicación",
                          "Compromiso: orgullo", "Compromiso: permanencia", "Compromiso: esfuerzo",
                          "Desempeño: metas", "Desempeño: calidad", "Desempeño: iniciativa",
                          "Sexo", "Área de trabajo", "Antigüedad (años)", "Salario mensual (USD)",
                          "Satisfacción general"],
        "variable_value_labels": {
            "sexo": {1: "Mujer", 2: "Hombre"},
            "area": {1: "Operaciones", 2: "Comercial", 3: "Administración"},
            "satisfaccion": {1: "Muy insatisfecho", 5: "Muy satisfecho", 9: "No responde"},
        },
        "missing_ranges": {"satisfaccion": [9]},
        "variable_measure": {"id": "nominal", "sexo": "nominal", "area": "nominal",
                             "satisfaccion": "ordinal", "antiguedad": "scale", "salario": "scale",
                             **{f"{p}{k}": "ordinal" for p in ("cli", "com", "des") for k in (1, 2, 3)}},
        "variable_format": {"antiguedad": "F8.1", "salario": "F8.0", "id": "F6.0"},
    }
    return df, meta


def escribir(ruta: Path, n: int = 400) -> Path:
    df, meta = generar(n)
    ruta.parent.mkdir(parents=True, exist_ok=True)
    pyreadstat.write_sav(df, str(ruta), **meta)
    return ruta


if __name__ == "__main__":
    destino = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parent.parent / "data" / "ejemplos" / "encuesta_demo.sav"
    print(escribir(destino))
