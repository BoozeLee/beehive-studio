# Beehive Studio Gateway API
FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    && rm -rf /var/lib/apt/lists/*

COPY --from=ghcr.io/astral-sh/uv:latest /uv /bin/uv

# Use the same lockfile as orchestrator for consistency
COPY services/agent-orchestrator/pyproject.toml services/agent-orchestrator/uv.lock ./
RUN uv sync --no-dev

COPY apps/api/ ./apps/api/

EXPOSE 9000

ENV PYTHONPATH=/app/apps/api
CMD ["uv", "run", "uvicorn", "apps.api.main:app", "--host", "0.0.0.0", "--port", "9000"]
