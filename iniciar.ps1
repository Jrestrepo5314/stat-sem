# Arranca el servidor Python y la interfaz en desarrollo, cada uno en su ventana.
# Uso: .\iniciar.ps1          (backend en http://127.0.0.1:8000, app en http://127.0.0.1:5173)
$raiz = Split-Path -Parent $MyInvocation.MyCommand.Path
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$raiz\backend'; python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$raiz\frontend'; npx vite --host 127.0.0.1 --port 5173"
Start-Sleep -Seconds 3
Start-Process "http://127.0.0.1:5173"
