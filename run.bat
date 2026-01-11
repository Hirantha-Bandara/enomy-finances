@echo off
echo Starting Enomy-Finances Application...
echo.

cd backend
echo Starting Backend Server...
start cmd /k "npm start"
cd ..

timeout /t 5 /nobreak >nul

cd frontend
echo Starting Frontend Server...
start cmd /k "npm start"
cd ..

echo.
echo Application started!
echo Backend: http://localhost:8080
echo Frontend: http://localhost:3000
echo.
echo Press any key to stop...
pause >nul
taskkill /f /im node.exe >nul 2>nul