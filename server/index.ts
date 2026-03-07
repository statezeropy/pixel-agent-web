import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";
import { ChatAnthropic } from "@langchain/anthropic";
import { ChatOpenAI } from "@langchain/openai";
import { AgentCallbackHandler } from "./agent";
import { 
  loadFurnitureAssets, 
  loadDefaultLayout, 
  loadWallTiles, 
  loadFloorTiles, 
  loadCharacterSprites 
} from "./assetLoader";

dotenv.config();

const app = express();
app.use(cors());
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
  },
});

const PORT = process.env.PORT || 3001;

// Serve static assets from the client public directory (for dev) and build directory (for prod)
const publicPath = path.join(__dirname, "../../client/public");
const buildPath = path.join(__dirname, "../../client/dist");

app.use(express.static(publicPath));
if (fs.existsSync(buildPath)) {
  app.use(express.static(buildPath));
  console.log(`Serving client from ${buildPath}`);
} else {
  console.log(`Production build not found at ${buildPath}, running in dev mode.`);
}

// Redirect all non-API requests to the client index.html (SPA support)
app.get("*", (req, res) => {
  const indexPath = path.join(buildPath, "index.html");
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.send("Pixel Agent Server is running...");
  }
});

let agents = new Map<number, any>();
let nextAgentId = 1;

io.on("connection", (socket) => {
  console.log("Client connected");

  socket.on("message", async (msg) => {
    if (msg.type === "webviewReady") {
      // Send initial data
      const assetsRoot = path.join(__dirname, "../client/public");
      
      const charSprites = await loadCharacterSprites(assetsRoot);
      if (charSprites) socket.emit("message", { type: "characterSpritesLoaded", characters: charSprites.characters });

      const floorTiles = await loadFloorTiles(assetsRoot);
      if (floorTiles) socket.emit("message", { type: "floorTilesLoaded", sprites: floorTiles.sprites });

      const wallTiles = await loadWallTiles(assetsRoot);
      if (wallTiles) socket.emit("message", { type: "wallTilesLoaded", sprites: wallTiles.sprites });

      const furniture = await loadFurnitureAssets(assetsRoot);
      if (furniture) {
        const spritesObj: Record<string, string[][]> = {};
        for (const [id, spriteData] of furniture.sprites) {
          spritesObj[id] = spriteData;
        }
        socket.emit("message", { type: "furnitureAssetsLoaded", catalog: furniture.catalog, sprites: spritesObj });
      }

      const defaultLayout = loadDefaultLayout(assetsRoot);
      socket.emit("message", { type: "layoutLoaded", layout: defaultLayout });

      // Send existing agents
      const agentIds = Array.from(agents.keys());
      socket.emit("message", { type: "existingAgents", agents: agentIds });
    }

    if (msg.type === "openClaude") {
      const id = nextAgentId++;
      console.log(`Creating agent ${id}`);
      
      const provider = process.env.LLM_PROVIDER || "anthropic";
      let model;
      
      if (provider === "openai") {
        model = new ChatOpenAI({
          apiKey: process.env.OPENAI_API_KEY,
          modelName: "gpt-4-turbo",
          streaming: true,
        });
      } else {
        model = new ChatAnthropic({
          apiKey: process.env.ANTHROPIC_API_KEY,
          modelName: "claude-3-opus-20240229",
          streaming: true,
        });
      }

      const handler = new AgentCallbackHandler(io, id);
      
      socket.emit("message", { type: "agentCreated", id });

      // Simulate an agent task for demonstration
      (async () => {
        try {
          // In a real app, you'd use a more complex agent executor with tools.
          // For now, we'll demonstrate a simple streaming response that triggers the callback.
          await model.invoke("Hello! Introduce yourself as a Pixel Agent.", {
            callbacks: [handler],
          });
          
          // Emit final tool done to clean up animation
          io.emit("message", { type: "agentToolDone", id, toolId: "current" });
          io.emit("message", { type: "agentStatus", id, status: "waiting" });
        } catch (err) {
          console.error("Agent error:", err);
        }
      })();
    }
  });
});

httpServer.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
