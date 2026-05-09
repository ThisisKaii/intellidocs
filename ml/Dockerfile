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

EXPOSE 8000

CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000"]
