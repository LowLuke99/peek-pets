@echo off
rem Builds (quick when nothing changed, so a git pull is picked up) and launches the Peek Pets Companion.
cd /d "%~dp0"
set EXE=companion\bin\Debug\net8.0-windows\PeekPets.Companion.exe
echo Building Peek Pets Companion...
dotnet build companion -v q -nologo || (echo Build failed. Is the .NET 8 SDK installed? & pause & exit /b 1)
start "" "%EXE%"
