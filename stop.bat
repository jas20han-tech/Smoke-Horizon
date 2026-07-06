@echo off
title Stopping Smoke Horizon

echo Stopping Smoke Horizon servers...

:: Kill uvicorn (backend)
taskkill /f /fi "WINDOWTITLE eq Smoke Horizon - Backend*" >nul 2>&1

:: Kill npm / vite (frontend)
taskkill /f /fi "WINDOWTITLE eq Smoke Horizon - Frontend*" >nul 2>&1

:: Also kill any lingering node/python on those ports
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8000"') do taskkill /f /pid %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5173"') do taskkill /f /pid %%a >nul 2>&1

echo Done. All servers stopped.
timeout /t 2 /nobreak >nul
