@echo off
rem Tagatrend: build the dashboard and serve it to your tailnet.
rem
rem   deploy.bat           build the frontend, then serve to the tailnet on port 18723
rem   deploy.bat direct    skip Tailscale Serve; bind the Tailscale IP instead (http://100.x.y.z:18723)
rem   deploy.bat stop      remove the Tailscale Serve proxies (the server itself stops with Ctrl+C)
rem
rem The server is waitress (production WSGI) on 127.0.0.1:18723. Tailscale Serve publishes it on the
rem tailnet as http://<machine>:18723 and https://<machine>.<tailnet>.ts.net, so nothing is exposed
rem on the LAN and no firewall rule is needed.
setlocal EnableExtensions
cd /d "%~dp0"

set "PORT=18723"
set "PY=%~dp0.venv\Scripts\python.exe"
set "TS=tailscale"
where tailscale >nul 2>&1 || set "TS=%ProgramFiles%\Tailscale\tailscale.exe"
set "MODE=%~1"

if /i "%MODE%"=="stop" goto stop

rem ---- Python environment --------------------------------------------------------------
if exist "%PY%" goto have_python
echo No .venv found. Create it first (see README.md):
echo   uv venv --python 3.12 .venv
echo   uv pip install --python .venv torch --index-url https://download.pytorch.org/whl/cu130
echo   uv pip install --python .venv -r requirements.txt
exit /b 1
:have_python
"%PY%" -c "import waitress" >nul 2>&1
if not errorlevel 1 goto have_waitress
echo Installing waitress...
uv pip install --python "%PY%" "waitress>=3.0" >nul 2>&1 || "%PY%" -m pip install "waitress>=3.0" || exit /b 1
:have_waitress

rem ---- Frontend build ------------------------------------------------------------------
where npm >nul 2>&1
if errorlevel 1 (
    echo Node.js and npm are required to build web\.
    exit /b 1
)
pushd web
if exist node_modules goto have_modules
echo Installing frontend packages...
call npm ci
if errorlevel 1 goto build_failed
:have_modules
echo Building the frontend...
call npm run build
if errorlevel 1 goto build_failed
popd

rem ---- Tailscale -----------------------------------------------------------------------
set "HOSTS=--host 127.0.0.1"
set "URL="
set "TSIP="
for /f "delims=" %%i in ('call "%TS%" ip -4 2^>nul') do if not defined TSIP set "TSIP=%%i"
if defined TSIP goto have_tailscale
echo Tailscale is not running or not logged in; serving on this machine only.
goto serve

:have_tailscale
if /i "%MODE%"=="direct" goto direct
rem The same port on the Tailscale address (TCP forwarding works for the IP and any hostname;
rem HTTP serve would match the MagicDNS name only), plus HTTPS on the MagicDNS name.
call "%TS%" serve --bg --tcp=%PORT% tcp://127.0.0.1:%PORT% >nul 2>&1
if errorlevel 1 goto no_serve
call "%TS%" serve --bg --https=443 http://127.0.0.1:%PORT% >nul 2>&1
set "URL=http://%TSIP%:%PORT%/"
set "NAME="
for /f "delims=" %%n in ('call "%PY%" scripts\tailnet_name.py "%TS%"') do set "NAME=%%n"
if defined NAME set "URL=http://%TSIP%:%PORT%/  or  https://%NAME%/"
goto serve

:no_serve
echo Tailscale Serve is not available on this tailnet; binding the Tailscale IP instead.

:direct
rem Listen on the Tailscale address too, and let only tailnet peers (100.64.0.0/10) through.
set "HOSTS=--host 127.0.0.1 --host %TSIP%"
set "URL=http://%TSIP%:%PORT%/"
netsh advfirewall firewall show rule name="Tagatrend (Tailscale)" >nul 2>&1
if not errorlevel 1 goto serve
netsh advfirewall firewall add rule name="Tagatrend (Tailscale)" dir=in action=allow protocol=TCP localport=%PORT% remoteip=100.64.0.0/10 >nul 2>&1
if errorlevel 1 echo Could not add a firewall rule. Run "deploy.bat direct" once as administrator.

:serve
echo.
echo   Local:    http://127.0.0.1:%PORT%/
if defined URL echo   Tailnet:  %URL%
echo   Stop the server with Ctrl+C. "deploy.bat stop" removes the Tailscale proxies.
echo.
"%PY%" server\app.py --prod %HOSTS% --port %PORT%
exit /b %errorlevel%

:stop
call "%TS%" serve --tcp=%PORT% off >nul 2>&1
call "%TS%" serve --https=443 off >nul 2>&1
echo Tailscale Serve proxies removed.
exit /b 0

:build_failed
popd
echo The frontend build failed.
exit /b 1
