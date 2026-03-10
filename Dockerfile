# Use docker-compose.yml for the full stack.
# See client/Dockerfile and backend/Dockerfile for individual builds.
#
# For quick local dev without docker-compose:
FROM python:3.13-slim
WORKDIR /app
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ .
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
