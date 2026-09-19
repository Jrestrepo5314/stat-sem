"""Importar datos por URL: solo desde sitios permitidos, y con error claro si no se puede descargar."""


def test_rechaza_hosts_ajenos(cliente):
    r = cliente.post("/api/datasets/importar", json={"url": "https://example.com/datos.csv"})
    assert r.status_code == 400 and "sitios" in r.json()["detail"]
    r = cliente.post("/api/datasets/importar", json={"url": "ftp://zenodo.org/datos.csv"})
    assert r.status_code == 400


def test_rechaza_formato_no_soportado(cliente):
    r = cliente.post("/api/datasets/importar", json={"url": "https://zenodo.org/record/1/files/datos.exe"})
    assert r.status_code == 400 and "Formato" in r.json()["detail"]


def test_descarga_fallida_es_502(cliente):
    r = cliente.post("/api/datasets/importar", json={"url": "http://127.0.0.1:9/no-existe.csv"})
    assert r.status_code == 502


def test_cabecera_frame_ancestors(cliente):
    r = cliente.get("/api/salud")
    assert "frame-ancestors" in r.headers["content-security-policy"]
    assert "jarestrepo.com" in r.headers["content-security-policy"]
