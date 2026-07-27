#!/usr/bin/env bash
# IntelliDocs — Start all services (Linux/macOS)
# Usage: bash scripts/run.sh

echo "Starting IntelliDocs..."

# Start express server
cd server && npm run dev &

# Start frontend
cd frontend && npm run dev &

# Start ML server
export BASE_MODEL_PATH=ml/models/base_model.pkl
ml/venv/bin/python ml/src/main.py

wait
