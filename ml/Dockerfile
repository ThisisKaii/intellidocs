FROM python:3.11-slim

WORKDIR /app

# Install CPU-only PyTorch first (keeps image ~200MB vs ~2GB)
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu

# Install remaining dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code and model files
COPY . .

ENV PYTHONPATH=/app
ENV BASE_MODEL_PATH=/app/models/base_model.pkl

# Render routes traffic to $PORT (10000 unless set); 8000 is the local/compose default.
EXPOSE 8000 10000

# Shell form so $PORT expands; exec keeps uvicorn as PID 1 so it receives SIGTERM on redeploy.
CMD ["sh", "-c", "exec uvicorn src.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
