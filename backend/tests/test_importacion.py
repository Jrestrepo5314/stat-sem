"""Archivos con cabeceras que no son nombres SPSS válidos: se renombran y se conservan como etiqueta."""
import io

import pyreadstat

from app.io_datos import nombre_spss


def test_nombre_spss():
    usados: set[str] = set()
    assert nombre_spss("RAZON SOCIAL", usados) == "RAZON_SOCIAL"
    assert nombre_spss("*Ingresos Operacionales = Ingresos + Participación", usados) == "Ingresos_Operacionales_Ingresos_Participacion"
    assert nombre_spss("2024", usados) == "V2024"
    assert nombre_spss("", usados) == "VAR"
    assert nombre_spss("razon social", usados) == "razon_social_2"      # choca con RAZON_SOCIAL sin distinguir mayúsculas
    largo = nombre_spss("x" * 100, usados)
    assert len(largo) == 64


def test_csv_con_cabeceras_malas_se_puede_guardar_como_sav(cliente, tmp_path):
    csv = "RAZON SOCIAL,*Ingresos Operacionales = a + b,2024,Año\nAcme,100.5,3,2024\nBeta,200,4,2023\n"
    r = cliente.post("/api/datasets", files={"archivo": ("empresas.csv", io.BytesIO(csv.encode("utf-8")), "text/csv")})
    assert r.status_code == 200, r.text
    ds_id = r.json()["id"]
    vars_ = cliente.get(f"/api/datasets/{ds_id}").json()["variables"]
    assert [v["nombre"] for v in vars_] == ["RAZON_SOCIAL", "Ingresos_Operacionales_a_b", "V2024", "Ano"]
    assert vars_[0]["etiqueta"] == "RAZON SOCIAL" and vars_[3]["etiqueta"] == "Año"
    r = cliente.get(f"/api/datasets/{ds_id}/exportar", params={"formato": "sav"})
    assert r.status_code == 200, r.text
    ruta = tmp_path / "empresas.sav"
    ruta.write_bytes(r.content)
    df, meta = pyreadstat.read_sav(str(ruta))
    assert list(df.columns) == ["RAZON_SOCIAL", "Ingresos_Operacionales_a_b", "V2024", "Ano"]
    assert meta.column_labels[0] == "RAZON SOCIAL"
    assert df["Ingresos_Operacionales_a_b"].tolist() == [100.5, 200.0]


def test_exportar_sav_invalido_da_400_y_no_500(cliente, ds_id):
    vars_ = cliente.get(f"/api/datasets/{ds_id}").json()["variables"]
    # la API acepta el nombre (la interfaz es quien lo valida); el .sav no puede llevarlo
    vars_[0]["nombre"] = "con espacio"
    cliente.put(f"/api/datasets/{ds_id}/variables", json=vars_)
    r = cliente.get(f"/api/datasets/{ds_id}/exportar", params={"formato": "sav"})
    assert r.status_code == 400 and "espacio" in r.json()["detail"].lower()
    vars_[0]["nombre"] = "id"
    cliente.put(f"/api/datasets/{ds_id}/variables", json=vars_)
