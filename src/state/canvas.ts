import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type DrawingPoint = {
  x: number;
  y: number;
  pressure?: number;
  timestamp: number;
};

export type DrawingStroke = {
  id: string;
  points: DrawingPoint[];
  color: string;
  size: number;
  tool: 'brush' | 'eraser';
  userId: string;
  completed: boolean;
};

export type Collaborator = {
  id: string;
  name: string;
  cursor: { x: number; y: number } | null;
  color: string;
  lastSeen: number;
  isDrawing: boolean;
};

export type CanvasSettings = {
  brushSize: number;
  brushColor: string;
  tool: 'brush' | 'eraser';
  showGrid: boolean;
  showCollaborators: boolean;
  canvasWidth: number;
  canvasHeight: number;
};

// Canvas operation types for real-time sync
export type CanvasOperation = 
  | { type: 'stroke-start'; stroke: Omit<DrawingStroke, 'points' | 'completed'>; point: DrawingPoint }
  | { type: 'stroke-update'; strokeId: string; point: DrawingPoint }
  | { type: 'stroke-complete'; strokeId: string }
  | { type: 'cursor-move'; userId: string; x: number; y: number }
  | { type: 'cursor-leave'; userId: string }
  | { type: 'user-join'; user: Omit<Collaborator, 'cursor' | 'lastSeen'> }
  | { type: 'user-leave'; userId: string }
  | { type: 'clear-canvas' }
  | { type: 'undo-stroke'; strokeId: string };

// Optimistic updates for React 19 patterns
export type OptimisticOperation = {
  id: string;
  operation: CanvasOperation;
  timestamp: number;
  confirmed: boolean;
};

// Generate random colors for collaborators
const COLLABORATOR_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899'
];

function generateRandomColor(): string {
  return COLLABORATOR_COLORS[Math.floor(Math.random() * COLLABORATOR_COLORS.length)];
}

function generateUserId(): string {
  return `user-${Math.random().toString(36).substr(2, 9)}`;
}

function generateUserName(): string {
  const adjectives = ['Creative', 'Artistic', 'Bold', 'Brilliant', 'Swift', 'Clever'];
  const nouns = ['Artist', 'Painter', 'Designer', 'Creator', 'Sketcher', 'Drawer'];
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  return `${adj} ${noun}`;
}

// React 19 use() hook compatible promise for loading canvas data
export async function loadCanvasData(canvasId: string): Promise<{ strokes: DrawingStroke[]; collaborators: Collaborator[] }> {
  // Simulate loading from server/storage
  await new Promise(resolve => setTimeout(resolve, Math.random() * 500 + 200));
  
  const stored = localStorage.getItem(`canvas-${canvasId}`);
  const strokes = stored ? JSON.parse(stored) : [];
  
  return {
    strokes: strokes.filter((s: DrawingStroke) => s.completed), // Only completed strokes
    collaborators: [], // Will be populated by real-time connection
  };
}

type CanvasStore = {
  // Canvas state
  strokes: DrawingStroke[];
  collaborators: Map<string, Collaborator>;
  settings: CanvasSettings;
  currentUser: Collaborator;
  
  // Current drawing state
  isDrawing: boolean;
  currentStroke: DrawingStroke | null;
  
  // Real-time state
  isConnected: boolean;
  roomId: string;
  
  // React 19 optimistic updates
  optimisticOperations: OptimisticOperation[];
  
  // Canvas operations
  startDrawing: (x: number, y: number, pressure?: number) => void;
  continueDrawing: (x: number, y: number, pressure?: number) => void;
  stopDrawing: () => void;
  
  // Tool operations
  setTool: (tool: CanvasSettings['tool']) => void;
  setBrushSize: (size: number) => void;
  setBrushColor: (color: string) => void;
  toggleGrid: () => void;
  toggleCollaborators: () => void;
  
  // Canvas operations
  clearCanvas: () => void;
  undoLastStroke: () => void;
  exportCanvas: () => string; // Returns data URL
  
  // Collaboration
  updateCursor: (x: number, y: number) => void;
  leaveCursor: () => void;
  addCollaborator: (collaborator: Collaborator) => void;
  removeCollaborator: (userId: string) => void;
  updateCollaboratorCursor: (userId: string, x: number, y: number) => void;
  
  // Real-time operations
  applyOperation: (operation: CanvasOperation) => void;
  addOptimisticOperation: (operation: CanvasOperation) => void;
  confirmOptimisticOperation: (operationId: string) => void;
  
  // Connection state
  setConnected: (connected: boolean) => void;
  setRoomId: (roomId: string) => void;
  
  // Canvas management
  loadCanvas: (canvasId: string) => Promise<void>;
  saveCanvas: () => void;
};

export const useCanvasStore = create<CanvasStore>()(
  persist(
    (set, get) => ({
      // Initial state
      strokes: [],
      collaborators: new Map(),
      settings: {
        brushSize: 5,
        brushColor: '#000000',
        tool: 'brush',
        showGrid: false,
        showCollaborators: true,
        canvasWidth: 1200,
        canvasHeight: 800,
      },
      currentUser: {
        id: generateUserId(),
        name: generateUserName(),
        cursor: null,
        color: generateRandomColor(),
        lastSeen: Date.now(),
        isDrawing: false,
      },
      
      isDrawing: false,
      currentStroke: null,
      isConnected: false,
      roomId: 'default-room',
      optimisticOperations: [],

      startDrawing: (x, y, pressure = 1) => {
        const { settings, currentUser } = get();
        const strokeId = `stroke-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const point: DrawingPoint = { x, y, pressure, timestamp: Date.now() };
        
        const stroke: DrawingStroke = {
          id: strokeId,
          points: [point],
          color: settings.brushColor,
          size: settings.brushSize,
          tool: settings.tool,
          userId: currentUser.id,
          completed: false,
        };
        
        set((state) => ({
          isDrawing: true,
          currentStroke: stroke,
          strokes: [...state.strokes, stroke],
          currentUser: { ...state.currentUser, isDrawing: true },
        }));
        
        // Emit to collaborators
        const operation: CanvasOperation = {
          type: 'stroke-start',
          stroke: {
            id: strokeId,
            color: settings.brushColor,
            size: settings.brushSize,
            tool: settings.tool,
            userId: currentUser.id,
          },
          point,
        };
        
        get().addOptimisticOperation(operation);
      },

      continueDrawing: (x, y, pressure = 1) => {
        const { currentStroke, isDrawing } = get();
        if (!isDrawing || !currentStroke) return;
        
        const point: DrawingPoint = { x, y, pressure, timestamp: Date.now() };
        
        set((state) => ({
          strokes: state.strokes.map(stroke =>
            stroke.id === currentStroke.id
              ? { ...stroke, points: [...stroke.points, point] }
              : stroke
          ),
          currentStroke: currentStroke ? { ...currentStroke, points: [...currentStroke.points, point] } : null,
        }));
        
        // Emit to collaborators
        const operation: CanvasOperation = {
          type: 'stroke-update',
          strokeId: currentStroke.id,
          point,
        };
        
        get().addOptimisticOperation(operation);
      },

      stopDrawing: () => {
        const { currentStroke } = get();
        if (!currentStroke) return;
        
        set((state) => ({
          isDrawing: false,
          currentStroke: null,
          strokes: state.strokes.map(stroke =>
            stroke.id === currentStroke.id
              ? { ...stroke, completed: true }
              : stroke
          ),
          currentUser: { ...state.currentUser, isDrawing: false },
        }));
        
        // Emit completion to collaborators
        const operation: CanvasOperation = {
          type: 'stroke-complete',
          strokeId: currentStroke.id,
        };
        
        get().addOptimisticOperation(operation);
        get().saveCanvas(); // Auto-save on stroke completion
      },

      setTool: (tool) => {
        set((state) => ({
          settings: { ...state.settings, tool }
        }));
      },

      setBrushSize: (brushSize) => {
        set((state) => ({
          settings: { ...state.settings, brushSize }
        }));
      },

      setBrushColor: (brushColor) => {
        set((state) => ({
          settings: { ...state.settings, brushColor }
        }));
      },

      toggleGrid: () => {
        set((state) => ({
          settings: { ...state.settings, showGrid: !state.settings.showGrid }
        }));
      },

      toggleCollaborators: () => {
        set((state) => ({
          settings: { ...state.settings, showCollaborators: !state.settings.showCollaborators }
        }));
      },

      clearCanvas: () => {
        set({ strokes: [], currentStroke: null, isDrawing: false });
        
        const operation: CanvasOperation = { type: 'clear-canvas' };
        get().addOptimisticOperation(operation);
        get().saveCanvas();
      },

      undoLastStroke: () => {
        const { strokes, currentUser } = get();
        const userStrokes = strokes.filter(s => s.userId === currentUser.id && s.completed);
        const lastStroke = userStrokes[userStrokes.length - 1];
        
        if (lastStroke) {
          set((state) => ({
            strokes: state.strokes.filter(s => s.id !== lastStroke.id)
          }));
          
          const operation: CanvasOperation = {
            type: 'undo-stroke',
            strokeId: lastStroke.id,
          };
          
          get().addOptimisticOperation(operation);
          get().saveCanvas();
        }
      },

      exportCanvas: () => {
        // This will be implemented when we have the canvas element
        return '';
      },

      updateCursor: (x, y) => {
        const { currentUser } = get();
        set((state) => ({
          currentUser: { ...state.currentUser, cursor: { x, y }, lastSeen: Date.now() }
        }));
        
        const operation: CanvasOperation = {
          type: 'cursor-move',
          userId: currentUser.id,
          x,
          y,
        };
        
        get().addOptimisticOperation(operation);
      },

      leaveCursor: () => {
        const { currentUser } = get();
        set((state) => ({
          currentUser: { ...state.currentUser, cursor: null }
        }));
        
        const operation: CanvasOperation = {
          type: 'cursor-leave',
          userId: currentUser.id,
        };
        
        get().addOptimisticOperation(operation);
      },

      addCollaborator: (collaborator) => {
        set((state) => {
          const newCollaborators = new Map(state.collaborators);
          newCollaborators.set(collaborator.id, { ...collaborator, lastSeen: Date.now() });
          return { collaborators: newCollaborators };
        });
      },

      removeCollaborator: (userId) => {
        set((state) => {
          const newCollaborators = new Map(state.collaborators);
          newCollaborators.delete(userId);
          return { collaborators: newCollaborators };
        });
      },

      updateCollaboratorCursor: (userId, x, y) => {
        set((state) => {
          const collaborator = state.collaborators.get(userId);
          if (!collaborator) return state;
          
          const newCollaborators = new Map(state.collaborators);
          newCollaborators.set(userId, {
            ...collaborator,
            cursor: { x, y },
            lastSeen: Date.now(),
          });
          return { collaborators: newCollaborators };
        });
      },

      applyOperation: (operation) => {
        switch (operation.type) {
          case 'stroke-start': {
            const stroke: DrawingStroke = {
              ...operation.stroke,
              points: [operation.point],
              completed: false,
            };
            set((state) => ({
              strokes: [...state.strokes, stroke]
            }));
            break;
          }
          
          case 'stroke-update': {
            set((state) => ({
              strokes: state.strokes.map(stroke =>
                stroke.id === operation.strokeId
                  ? { ...stroke, points: [...stroke.points, operation.point] }
                  : stroke
              )
            }));
            break;
          }
          
          case 'stroke-complete': {
            set((state) => ({
              strokes: state.strokes.map(stroke =>
                stroke.id === operation.strokeId
                  ? { ...stroke, completed: true }
                  : stroke
              )
            }));
            break;
          }
          
          case 'cursor-move': {
            get().updateCollaboratorCursor(operation.userId, operation.x, operation.y);
            break;
          }
          
          case 'cursor-leave': {
            set((state) => {
              const collaborator = state.collaborators.get(operation.userId);
              if (!collaborator) return state;
              
              const newCollaborators = new Map(state.collaborators);
              newCollaborators.set(operation.userId, { ...collaborator, cursor: null });
              return { collaborators: newCollaborators };
            });
            break;
          }
          
          case 'clear-canvas': {
            set({ strokes: [] });
            break;
          }
          
          case 'undo-stroke': {
            set((state) => ({
              strokes: state.strokes.filter(s => s.id !== operation.strokeId)
            }));
            break;
          }
        }
      },

      addOptimisticOperation: (operation) => {
        const optimisticOp: OptimisticOperation = {
          id: `op-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          operation,
          timestamp: Date.now(),
          confirmed: false,
        };
        
        set((state) => ({
          optimisticOperations: [...state.optimisticOperations, optimisticOp]
        }));
        
        return optimisticOp.id;
      },

      confirmOptimisticOperation: (operationId) => {
        set((state) => ({
          optimisticOperations: state.optimisticOperations.map(op =>
            op.id === operationId ? { ...op, confirmed: true } : op
          )
        }));
      },

      setConnected: (isConnected) => {
        set({ isConnected });
      },

      setRoomId: (roomId) => {
        set({ roomId });
      },

      loadCanvas: async (canvasId) => {
        try {
          const data = await loadCanvasData(canvasId);
          set({ 
            strokes: data.strokes,
            roomId: canvasId,
          });
        } catch (error) {
          console.error('Failed to load canvas:', error);
        }
      },

      saveCanvas: () => {
        const { strokes, roomId } = get();
        const completedStrokes = strokes.filter(s => s.completed);
        localStorage.setItem(`canvas-${roomId}`, JSON.stringify(completedStrokes));
      },
    }),
    {
      name: 'canvas-store',
      partialize: (state) => ({
        settings: state.settings,
        currentUser: {
          ...state.currentUser,
          cursor: null, // Don't persist cursor position
        },
      }),
    }
  )
); 