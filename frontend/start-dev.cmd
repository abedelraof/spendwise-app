@echo off
SET PATH=C:\Program Files\nodejs;%PATH%
cd /d D:\FlutterApp\frontend
"C:\Program Files\nodejs\node.exe" node_modules\vite\bin\vite.js --host 0.0.0.0
