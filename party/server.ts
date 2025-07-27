import type * as Party from "partykit/server";

export default class CanvasServer implements Party.Server {
  constructor(readonly room: Party.Room) {}

  onConnect(conn: Party.Connection, ctx: Party.ConnectionContext) {
    // A user connected to the Canvas room
    void ctx; // Mark as used to avoid TypeScript warning
    console.log(`User ${conn.id} connected to Canvas room ${this.room.id}`);
    
    // Notify existing connections about the new user
    this.room.broadcast(
      JSON.stringify({
        type: "user-connected",
        connectionId: conn.id,
        timestamp: Date.now(),
      }),
      [conn.id] // Exclude the newly connected user
    );
  }

  onMessage(message: string, sender: Party.Connection) {
    try {
      const data = JSON.parse(message);
      
      // Broadcast drawing operations to all other connections
      this.room.broadcast(
        JSON.stringify({
          ...data,
          connectionId: sender.id,
          timestamp: Date.now(),
        }),
        [sender.id] // Exclude the sender
      );
      
      console.log(`Broadcasting ${data.type} from ${sender.id} to Canvas room ${this.room.id}`);
    } catch (error) {
      console.error("Error parsing message:", error);
    }
  }

  onClose(conn: Party.Connection) {
    console.log(`User ${conn.id} disconnected from Canvas room ${this.room.id}`);
    
    // Notify remaining connections about the user leaving
    this.room.broadcast(
      JSON.stringify({
        type: "user-disconnected",
        connectionId: conn.id,
        timestamp: Date.now(),
      })
    );
  }

  onError(conn: Party.Connection, error: Error) {
    console.error(`Connection error for ${conn.id}:`, error);
  }
} 