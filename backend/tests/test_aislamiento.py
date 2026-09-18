"""Cada navegador (cabecera X-Cliente) ve solo sus conjuntos de datos."""
from fastapi.testclient import TestClient


def test_otro_cliente_no_ve_ni_toca_el_dataset(cliente, ds_id):
    from app.main import app
    otro = TestClient(app, headers={"X-Cliente": "otro-navegador"})
    assert all(d["id"] != ds_id for d in otro.get("/api/datasets").json())
    assert otro.get(f"/api/datasets/{ds_id}").status_code == 404
    assert otro.get(f"/api/datasets/{ds_id}/filas").status_code == 404
    assert otro.post(f"/api/datasets/{ds_id}/analisis/descriptivos", json={"variables": ["cli1"]}).status_code == 404
    assert otro.delete(f"/api/datasets/{ds_id}").status_code == 404
    # el dueño sigue viéndolo
    assert cliente.get(f"/api/datasets/{ds_id}").status_code == 200


def test_exportar_acepta_el_cliente_en_la_url(cliente, ds_id):
    sin_cabecera = TestClient(cliente.app)
    assert sin_cabecera.get(f"/api/datasets/{ds_id}/exportar", params={"formato": "csv"}).status_code == 404
    r = sin_cabecera.get(f"/api/datasets/{ds_id}/exportar", params={"formato": "csv", "cliente": "prueba"})
    assert r.status_code == 200 and r.content.startswith(b"id,")
