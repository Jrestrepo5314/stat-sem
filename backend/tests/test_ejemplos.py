"""Los conjuntos de ejemplo se abren con un clic y traen su modelo SEM sugerido."""


def test_lista_de_ejemplos_trae_modelo(cliente):
    r = cliente.get("/api/ejemplos")
    assert r.status_code == 200, r.text
    lista = r.json()
    assert [e["clave"] for e in lista] == ["encuesta_demo"]
    e = lista[0]
    assert "archivo" not in e  # la ruta en disco no sale al navegador
    assert e["titulo"] and e["descripcion"]
    assert "clima =~ cli1 + cli2 + cli3" in e["modelo"]
    assert "desempeno ~ compromiso" in e["modelo"]


def test_abrir_ejemplo_crea_un_dataset_del_cliente(cliente):
    r = cliente.post("/api/datasets/ejemplo/encuesta_demo")
    assert r.status_code == 200, r.text
    resumen = r.json()
    assert resumen["n_filas"] == 400
    assert resumen["n_variables"] == 15
    # queda en la lista del cliente, como cualquier archivo subido
    ids = [d["id"] for d in cliente.get("/api/datasets").json()]
    assert resumen["id"] in ids
    # y el modelo sugerido se estima sobre él sin más
    modelo = next(e for e in cliente.get("/api/ejemplos").json() if e["clave"] == "encuesta_demo")["modelo"]
    s = cliente.post(f"/api/datasets/{resumen['id']}/analisis/sem", json={"sintaxis": modelo})
    assert s.status_code == 200, s.text
    titulos = [b.get("titulo") for b in s.json()["bloques"]]
    assert "Índices de ajuste global" in titulos


def test_ejemplo_inexistente_da_404(cliente):
    r = cliente.post("/api/datasets/ejemplo/no_existe")
    assert r.status_code == 404
