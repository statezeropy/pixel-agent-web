# Pixel Agent Web

Pixel art office where AI agents come to life as animated characters. Standalone web application with LangGraph backend supporting multiple LLM providers.

## Features
- **Multi-LLM Support**: Anthropic Claude, OpenAI GPT, Google Gemini via LangGraph + LangChain
- **Animated AI Agents**: Watch agents walk, sit, type, and read in a pixel art office
- **Real-time Streaming**: WebSocket for instant tool execution and LLM token streaming
- **Layout Editor**: Customize the office with furniture, walls, and floor tiles
- **Docker Ready**: Full stack with `docker compose up`

## Architecture
- **Frontend**: React 19 + TypeScript + Vite + Canvas 2D game engine
- **Backend**: FastAPI + Python 3.13 + LangGraph
- **Database**: PostgreSQL (layouts, sessions)
- **Cache**: Redis (agent state, WebSocket sessions)
- **Infrastructure**: Docker Compose + Nginx reverse proxy

## Getting Started

### Prerequisites
- Python 3.13+
- Node.js 24+
- PostgreSQL 16+ (or use Docker)
- Redis 7+ (or use Docker)

### Local Development

1. **Install client dependencies**:
   ```bash
   cd client && npm install
   ```

2. **Install backend dependencies**:
   ```bash
   cd backend && pip install -r requirements.txt
   ```

3. **Configure environment**:
   ```bash
   cp .env.example .env
   # Edit .env with your API keys and database settings
   ```

4. **Start development servers**:
   ```bash
   # Terminal 1: Backend
   cd backend && uvicorn app.main:app --reload --port 8000

   # Terminal 2: Frontend
   cd client && npm run dev
   ```
   - Frontend: http://localhost:5173
   - Backend: http://localhost:8000

### Docker Deployment

```bash
cp .env.example .env
# Edit .env with production settings
docker compose up --build -d
```

## Project Structure
```
pixel-agent-web/
├── client/          # React frontend (Vite)
│   ├── src/
│   │   ├── api/     # WebSocket client
│   │   ├── hooks/   # React hooks (useWebSocket, useAssetLoader)
│   │   ├── office/  # Game engine (Canvas 2D, sprites, pathfinding)
│   │   └── components/
│   └── public/assets/  # Pixel art sprites
├── backend/         # FastAPI backend
│   ├── app/
│   │   ├── api/     # WebSocket + REST endpoints
│   │   ├── agent/   # LangGraph agent, tools, providers
│   │   └── models/  # SQLAlchemy models
│   └── alembic/     # DB migrations
└── docker-compose.yml
```
