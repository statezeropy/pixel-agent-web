import { io, Socket } from "socket.io-client";

class WebviewApiMock {
  private socket: Socket;

  constructor() {
    // Connect to the backend server (defaulting to localhost:3001)
    const serverUrl = window.location.origin.includes("localhost") 
      ? "http://localhost:3001" 
      : window.location.origin;
    
    this.socket = io(serverUrl);
    
    this.socket.on("message", (msg) => {
      window.postMessage(msg, "*");
    });
  }

  postMessage(msg: any) {
    this.socket.emit("message", msg);
  }
}

export const vscode = new WebviewApiMock();
