# ---- Build Stage ----
FROM python:3.12-slim AS builder
WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir --target=/app/deps -r requirements.txt

# ---- Production Stage ----
FROM python:3.12-slim
WORKDIR /app

# Create non-root user
RUN groupadd -g 1001 appgroup && \
    useradd -u 1001 -g appgroup -s /bin/bash -M appuser

# Copy dependencies and worker
COPY --from=builder /app/deps /app/deps
COPY worker.py ./

ENV PYTHONPATH="/app/deps"
ENV PYTHONUNBUFFERED=1

RUN chown -R appuser:appgroup /app

USER appuser

CMD ["python", "worker.py"]
