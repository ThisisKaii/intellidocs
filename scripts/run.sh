
echo "Starting IntelliDocs..."

# Start express server
cd server && npm run dev:ml &

# Start frontend
cd frontend && npm run dev &

# Start ml server
export BASE_MODEL_PATH=ml/models/base_model.pkl
ml/venv/bin/python ml/src/main.py

wait
