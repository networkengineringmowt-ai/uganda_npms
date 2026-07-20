FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    NPMS_HOST=0.0.0.0 \
    NPMS_PORT=8000

WORKDIR /app

RUN addgroup --system npms && adduser --system --ingroup npms npms

COPY backend/requirements-runtime.txt ./

RUN python -m pip install --upgrade pip && python -m pip install --requirement requirements-runtime.txt

COPY backend/pms_backend ./pms_backend
COPY backend/sync_supabase.py ./sync_supabase.py
COPY backend/sql ./sql
COPY supabase /supabase

USER npms
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=3)"

CMD ["python", "-m", "pms_backend", "serve", "--host", "0.0.0.0", "--port", "8000"]
