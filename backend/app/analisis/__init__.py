"""Procedimientos disponibles; cada uno recibe el dataset y los parámetros del cuadro de diálogo."""
from .descriptivos import descriptivos, explorar, frecuencias, tablas_cruzadas
from .medias import anova_un_factor, t_independientes, t_pareadas, t_una_muestra
from .relaciones import correlaciones, regresion_lineal
from .sem import ajustar_sem

PROCEDIMIENTOS = {
    "frecuencias": frecuencias,
    "descriptivos": descriptivos,
    "explorar": explorar,
    "tablas_cruzadas": tablas_cruzadas,
    "t_una_muestra": t_una_muestra,
    "t_independientes": t_independientes,
    "t_pareadas": t_pareadas,
    "anova_un_factor": anova_un_factor,
    "correlaciones": correlaciones,
    "regresion_lineal": regresion_lineal,
    "sem": ajustar_sem,
}
