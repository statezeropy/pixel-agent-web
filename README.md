# Pixel Agent Web

Pixel art office where AI agents come to life as animated characters. Now running as a standalone web application with multi-provider LLM support via LangChain.

## ✨ Features
- **Multi-LLM Support**: Built with LangChain to support Anthropic Claude, OpenAI GPT, and more.
- **Animated AI Agents**: Watch your agents walk around, sit at desks, and interact with the environment in real-time.
- **WebSocket Communication**: Instant status updates and tool execution visualization.
- **Docker Ready**: Deploy anywhere with a single `docker-compose up` command.

## 🚀 Getting Started

### Local Development

1. **Install dependencies**:
   ```bash
   npm run install:all
   ```

2. **Configure environment**:
   Create a `server/.env` file based on `server/.env.example`.
   ```bash
   LLM_PROVIDER=anthropic
   ANTHROPIC_API_KEY=your_key_here
   ```

3. **Start the application**:
   ```bash
   npm run start:web
   ```
   - Frontend: `http://localhost:5173`
   - Backend: `http://localhost:3001`

### Deployment with Docker

```bash
docker compose up --build -d
```

## 🛠️ Architecture
- **Frontend**: React (TypeScript), Vite, Socket.io-client
- **Backend**: Node.js (Express), LangChain, Socket.io
- **Assets**: 16x16 pixel art sprites and tilemaps

## 📄 License
MIT License
