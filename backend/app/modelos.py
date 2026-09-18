"""Esquemas compartidos entre el almacén, las rutas y los análisis."""
from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

Medida = Literal["nominal", "ordinal", "escala"]
TipoVariable = Literal["numerica", "texto", "fecha"]
Alineacion = Literal["izquierda", "centro", "derecha"]


class Variable(BaseModel):
    """Una fila de la Vista de Variables, con los mismos atributos que SPSS/PSPP."""

    nombre: str
    tipo: TipoVariable = "numerica"
    ancho: int = 8
    decimales: int = 2
    etiqueta: str = ""
    etiquetas_valores: dict[str, str] = Field(default_factory=dict)
    perdidos: list[Any] = Field(default_factory=list)
    columnas: int = 8
    alineacion: Alineacion = "derecha"
    medida: Medida = "escala"


class ResumenDataset(BaseModel):
    id: str
    nombre: str
    n_filas: int
    n_variables: int


class PaginaFilas(BaseModel):
    total: int
    inicio: int
    filas: list[list[Any]]


class EdicionCelda(BaseModel):
    fila: int
    variable: str
    valor: Any


# ---- contrato de salida de los análisis --------------------------------------
# El visor de resultados solo entiende estos bloques; cada análisis devuelve una
# Salida con uno o varios. Las filas llevan valores ya redondeados o cadenas.


class BloqueTabla(BaseModel):
    tipo: Literal["tabla"] = "tabla"
    titulo: str
    columnas: list[str]
    filas: list[list[Any]]
    notas: list[str] = Field(default_factory=list)


class BloqueTexto(BaseModel):
    tipo: Literal["texto"] = "texto"
    texto: str
    nivel: Literal["parrafo", "aviso", "error"] = "parrafo"


class BloqueGrafo(BaseModel):
    """Diagrama de rutas SEM: nodos y aristas para que el frontend lo dibuje."""

    tipo: Literal["grafo"] = "grafo"
    titulo: str
    nodos: list[dict[str, Any]]
    aristas: list[dict[str, Any]]


class Salida(BaseModel):
    titulo: str
    procedimiento: str
    bloques: list[BloqueTabla | BloqueTexto | BloqueGrafo]
