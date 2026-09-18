"""Servidor de la aplicación estadística: API de datos y análisis, y el frontend compilado."""
from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .rutas import router

app = FastAPI(title="Estadística con SEM", version="0.1.0")
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
                   allow_methods=["*"], allow_headers=["*"])
app.include_router(router)


@app.get("/api/salud")
def salud():
    """Comprobación que usan el despliegue y el monitor: responde si el servidor está arriba."""
    return {"ok": True, "version": app.version}


DIST = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"
if DIST.exists():
    # en producción el mismo servidor entrega la interfaz compilada
    app.mount("/", StaticFiles(directory=DIST, html=True), name="frontend")
