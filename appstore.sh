#!/bin/bash
# ============================================================
# App Store Scraper - Shell Wrapper (Mac/Linux)
# ============================================================
#
# Usage:
#     ./appstore.sh us health-fitness 100
#     ./appstore.sh gb productivity 200
#     ./appstore.sh us games 100 --include-paid
#     ./appstore.sh --help
#     ./appstore.sh --list-categories
#     ./appstore.sh --list-countries
#
# Arguments:
#     1: Country code (us, gb, ca, au, etc.)
#     2: Category (health-fitness, productivity, games, etc.)
#     3: Limit (number of apps, default 100)
#     4+: Additional flags (--include-paid, --deep-search, etc.)
#
# ============================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Check if Python is available
if ! command -v python3 &> /dev/null; then
    if ! command -v python &> /dev/null; then
        echo "Error: Python is not installed"
        echo "Please install Python 3 from https://python.org"
        exit 1
    fi
    PYTHON=python
else
    PYTHON=python3
fi

# Check for required package
if ! $PYTHON -c "import requests" &> /dev/null; then
    echo "Installing required package: requests"
    pip3 install requests || pip install requests
fi

# Handle special flags
case "$1" in
    --help|-h)
        $PYTHON "$SCRIPT_DIR/appstore_scraper.py" --help
        exit 0
        ;;
    --list-categories)
        $PYTHON "$SCRIPT_DIR/appstore_scraper.py" --list-categories
        exit 0
        ;;
    --list-countries)
        $PYTHON "$SCRIPT_DIR/appstore_scraper.py" --list-countries
        exit 0
        ;;
esac

# Show usage if no arguments
if [ -z "$1" ]; then
    echo ""
    echo "App Store Scraper - Quick Usage:"
    echo "--------------------------------"
    echo "  ./appstore.sh [country] [category] [limit] [options]"
    echo ""
    echo "Examples:"
    echo "  ./appstore.sh us health-fitness"
    echo "  ./appstore.sh us health-fitness 200"
    echo "  ./appstore.sh gb productivity 100 --include-paid"
    echo "  ./appstore.sh us games 100 --deep-search"
    echo ""
    echo "Commands:"
    echo "  ./appstore.sh --list-categories   Show all category names"
    echo "  ./appstore.sh --list-countries    Show all country codes"
    echo "  ./appstore.sh --help              Full help documentation"
    echo ""
    exit 0
fi

# Parse arguments
COUNTRY="${1:-us}"
CATEGORY="${2:-health-fitness}"
LIMIT="${3:-100}"

# Get extra arguments (4th onwards)
shift 3 2>/dev/null || shift $#
EXTRA_ARGS="$@"

# Run the scraper
echo ""
echo "Running: python appstore_scraper.py --country $COUNTRY --category $CATEGORY --limit $LIMIT $EXTRA_ARGS"
echo ""
$PYTHON "$SCRIPT_DIR/appstore_scraper.py" --country "$COUNTRY" --category "$CATEGORY" --limit "$LIMIT" $EXTRA_ARGS
