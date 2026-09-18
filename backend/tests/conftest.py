import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ))
sys.path.insert(0, str(RAIZ / "scripts"))


@pytest.fixture(scope="session")
def carpeta_tmp(tmp_path_factory):
    return tmp_path_factory.mktemp("sesiones")


@pytest.fixture(scope="session")
def cliente(carpeta_tmp):
    # el almacén se apunta a una carpeta temporal para no tocar data/sesiones
    from app import almacen as mod
    mod.almacen = mod.Almacen(carpeta_tmp)
    from app import rutas
    rutas.almacen = mod.almacen
    from app.main import app
    return TestClient(app, headers={"X-Cliente": "prueba"})


@pytest.fixture(scope="session")
def sav_demo(carpeta_tmp):
    from generar_demo import escribir
    return escribir(carpeta_tmp / "encuesta_demo.sav")


@pytest.fixture(scope="session")
def ds_id(cliente, sav_demo):
    with open(sav_demo, "rb") as f:
        r = cliente.post("/api/datasets", files={"archivo": ("encuesta_demo.sav", f, "application/octet-stream")})
    assert r.status_code == 200, r.text
    return r.json()["id"]
