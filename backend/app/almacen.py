"""Almacén de datasets en memoria, con copia en disco para sobrevivir a reinicios."""
from __future__ import annotations

import pickle
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path

import pandas as pd

from .modelos import ResumenDataset, Variable

CARPETA = Path(__file__).resolve().parent.parent / "data" / "sesiones"


@dataclass
class Dataset:
    id: str
    nombre: str
    df: pd.DataFrame
    variables: list[Variable] = field(default_factory=list)
    propietario: str = "anon"     # identificador del navegador que lo subió: nadie más lo ve

    def resumen(self) -> ResumenDataset:
        return ResumenDataset(id=self.id, nombre=self.nombre,
                              n_filas=len(self.df), n_variables=len(self.df.columns))

    def variable(self, nombre: str) -> Variable:
        for v in self.variables:
            if v.nombre == nombre:
                return v
        raise KeyError(nombre)

    def perdidos_como_nan(self, columnas: list[str] | None = None) -> pd.DataFrame:
        """Copia del df con los valores perdidos del usuario convertidos a NaN.

        Los análisis trabajan siempre sobre esta copia, nunca sobre el df crudo.
        """
        cols = columnas or list(self.df.columns)
        out = self.df[cols].copy()
        for v in self.variables:
            if v.nombre not in cols or not v.perdidos:
                continue
            s = out[v.nombre]
            mask = pd.Series(False, index=s.index)
            for p in v.perdidos:
                if isinstance(p, list) and len(p) == 2:
                    mask |= (s >= p[0]) & (s <= p[1])
                else:
                    mask |= s == p
            out.loc[mask, v.nombre] = float("nan") if v.tipo == "numerica" else None
        return out


DIAS_RETENCION = 7


class Almacen:
    def __init__(self, carpeta: Path = CARPETA):
        self.carpeta = carpeta
        self.carpeta.mkdir(parents=True, exist_ok=True)
        self._datos: dict[str, Dataset] = {}
        self._cargar_disco()

    def _ruta(self, id: str) -> Path:
        return self.carpeta / f"{id}.pkl"

    def _cargar_disco(self) -> None:
        limite = time.time() - DIAS_RETENCION * 86400
        for p in self.carpeta.glob("*.pkl"):
            if p.stat().st_mtime < limite:      # los datos viejos no se conservan indefinidamente
                p.unlink(missing_ok=True)
                continue
            try:
                with open(p, "rb") as f:
                    ds: Dataset = pickle.load(f)
                self._datos[ds.id] = ds
            except Exception:
                p.unlink(missing_ok=True)

    def guardar(self, ds: Dataset) -> None:
        self._datos[ds.id] = ds
        with open(self._ruta(ds.id), "wb") as f:
            pickle.dump(ds, f)

    def crear(self, nombre: str, df: pd.DataFrame, variables: list[Variable], propietario: str = "anon") -> Dataset:
        ds = Dataset(id=uuid.uuid4().hex[:12], nombre=nombre, df=df, variables=variables, propietario=propietario)
        self.guardar(ds)
        return ds

    def obtener(self, id: str, propietario: str = "anon") -> Dataset:
        ds = self._datos.get(id)
        if ds is None or ds.propietario != propietario:
            raise KeyError(id)
        return ds

    def listar(self, propietario: str = "anon") -> list[ResumenDataset]:
        return [d.resumen() for d in self._datos.values() if d.propietario == propietario]

    def borrar(self, id: str) -> None:
        self._datos.pop(id, None)
        self._ruta(id).unlink(missing_ok=True)


almacen = Almacen()
