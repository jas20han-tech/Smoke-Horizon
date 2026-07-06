@echo off
title Smoke Horizon

echo Starting Smoke Horizon...
echo.

:: Start backend in a new window
start "Smoke Horizon - Backend" cmd /k "cd /d %~dp0backend && venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000"

:: Wait 3 seconds for backend to initialize
timeout /t 3 /nobreak >nul

:: Start frontend in a new window
start "Smoke Horizon - Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"

echo.
echo Both servers are starting...
echo Backend  → http://localhost:8000
echo Frontend → http://localhost:5173
echo.
echo Opening browser in 5 seconds...
timeout /t 5 /nobreak >nul

:: Open browser
start http://localhost:5173

echo.
echo Done! Close the two server windows to stop.
