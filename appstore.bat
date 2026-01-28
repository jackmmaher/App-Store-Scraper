@echo off
REM ============================================================
REM App Store Scraper - Windows Batch Wrapper
REM ============================================================
REM 
REM Usage:
REM     appstore.bat us health-fitness 100
REM     appstore.bat gb productivity 200
REM     appstore.bat us games 100 --include-paid
REM     appstore.bat --help
REM     appstore.bat --list-categories
REM     appstore.bat --list-countries
REM
REM Arguments:
REM     1: Country code (us, gb, ca, au, etc.)
REM     2: Category (health-fitness, productivity, games, etc.)
REM     3: Limit (number of apps, default 100)
REM     4+: Additional flags (--include-paid, --deep-search, etc.)
REM
REM ============================================================

setlocal enabledelayedexpansion

REM Check if Python is available
where python >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo Error: Python is not installed or not in PATH
    echo Please install Python from https://python.org
    exit /b 1
)

REM Check for required package
python -c "import requests" >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo Installing required package: requests
    pip install requests
)

REM Get the directory where this batch file is located
set "SCRIPT_DIR=%~dp0"

REM Handle special flags that don't need country/category
if "%~1"=="--help" (
    python "%SCRIPT_DIR%appstore_scraper.py" --help
    exit /b 0
)
if "%~1"=="-h" (
    python "%SCRIPT_DIR%appstore_scraper.py" --help
    exit /b 0
)
if "%~1"=="--list-categories" (
    python "%SCRIPT_DIR%appstore_scraper.py" --list-categories
    exit /b 0
)
if "%~1"=="--list-countries" (
    python "%SCRIPT_DIR%appstore_scraper.py" --list-countries
    exit /b 0
)

REM Check for minimum arguments
if "%~1"=="" (
    echo.
    echo App Store Scraper - Quick Usage:
    echo --------------------------------
    echo   appstore.bat [country] [category] [limit] [options]
    echo.
    echo Examples:
    echo   appstore.bat us health-fitness
    echo   appstore.bat us health-fitness 200
    echo   appstore.bat gb productivity 100 --include-paid
    echo   appstore.bat us games 100 --deep-search
    echo.
    echo Commands:
    echo   appstore.bat --list-categories   Show all category names
    echo   appstore.bat --list-countries    Show all country codes
    echo   appstore.bat --help              Full help documentation
    echo.
    exit /b 0
)

REM Parse arguments
set "COUNTRY=%~1"
set "CATEGORY=%~2"
set "LIMIT=%~3"

REM Default values
if "%CATEGORY%"=="" set "CATEGORY=health-fitness"
if "%LIMIT%"=="" set "LIMIT=100"

REM Build additional arguments (4th argument onwards)
set "EXTRA_ARGS="
shift
shift
shift
:loop
if "%~1"=="" goto endloop
set "EXTRA_ARGS=!EXTRA_ARGS! %~1"
shift
goto loop
:endloop

REM Run the scraper
echo.
echo Running: python appstore_scraper.py --country %COUNTRY% --category %CATEGORY% --limit %LIMIT% %EXTRA_ARGS%
echo.
python "%SCRIPT_DIR%appstore_scraper.py" --country %COUNTRY% --category %CATEGORY% --limit %LIMIT% %EXTRA_ARGS%

endlocal
