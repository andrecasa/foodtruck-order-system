#!/bin/bash
set -e

# Create a separate database for Evolution API
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -c "CREATE DATABASE evolution_db;"
