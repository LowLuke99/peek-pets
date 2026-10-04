@echo off
rem Builds (first run only, or after code changes) and launches the Peek Pets Companion.
cd /d "%~dp0"
set EXE=companion\bin\Debug\net8.0-windows\PeekPets.Companion.exe
if not exist "%EXE%" (
  echo Building Peek Pets Companion...
  dotnet build companion -v q || (echo Build failed. Is the .NET 8 SDK installed? & pause & exit /b 1)
)
start "" "%EXE%"
