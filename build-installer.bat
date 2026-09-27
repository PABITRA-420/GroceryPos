@echo off
title Building Grocery POS Installer
powershell -ExecutionPolicy Bypass -File "%~dp0build-installer.ps1"
pause
