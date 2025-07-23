import { useEffect, useRef, useState, useCallback } from 'react';
import { useCanvasStore } from '../state/canvas';
import { CanvasService } from '../lib/canvasService';
import type { DrawingStroke } from '../state/canvas';

export default function Canvas() {
  const {
    collaborators,
    settings,
    strokes,
    isConnected,
    isDrawing,
    setConnected,
    addCollaborator,
    removeCollaborator,
    updateCollaboratorCursor,
    loadCanvas,
    currentUser,
    startDrawing,
    continueDrawing,
    stopDrawing,
    setTool,
    setBrushSize,
    setBrushColor,
    clearCanvas,
    undoLastStroke,
  } = useCanvasStore();
  
  const canvasServiceRef = useRef<CanvasService | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [canvasId] = useState(() => {
    // Get room from URL or use default
    const params = new URLSearchParams(window.location.search);
    return params.get('room') || 'default-canvas';
  });
  const [isLoading, setIsLoading] = useState(true);

  // Redraw canvas whenever strokes change
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw all strokes
    strokes.forEach(stroke => {
      if (stroke.points.length < 2) return;
      
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.size;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.globalCompositeOperation = stroke.tool === 'eraser' ? 'destination-out' : 'source-over';
      
      ctx.beginPath();
      
      // Use quadratic curves for smooth lines
      ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
      
      for (let i = 1; i < stroke.points.length - 1; i++) {
        const current = stroke.points[i];
        const next = stroke.points[i + 1];
        const cpx = (current.x + next.x) / 2;
        const cpy = (current.y + next.y) / 2;
        ctx.quadraticCurveTo(current.x, current.y, cpx, cpy);
      }
      
      // Draw the last point
      if (stroke.points.length > 1) {
        const lastPoint = stroke.points[stroke.points.length - 1];
        ctx.lineTo(lastPoint.x, lastPoint.y);
      }
      
      ctx.stroke();
    });
    
    // Reset composite operation
    ctx.globalCompositeOperation = 'source-over';
  }, [strokes]);

  // Supabase Canvas collaboration
  useEffect(() => {
    const connectToSupabase = async () => {
      try {
        setIsLoading(true);
        
        // Check if Supabase is configured
        const hasSupabaseConfig = import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_KEY;
        
        if (!hasSupabaseConfig) {
          console.log('🎨 Canvas running in offline mode (Supabase not configured)');
          setConnected(false);
          setIsLoading(false);
          await loadCanvas(canvasId);
          return;
        }
        
        // Create Supabase canvas service
        const canvasService = new CanvasService(
          canvasId,
          currentUser.id,
          currentUser.name,
          currentUser.color
        );
        
        // Set up event handlers
        canvasService.onEvents({
          onStrokeAdded: (stroke: DrawingStroke) => {
            // Add stroke to local state (from other users)
            useCanvasStore.setState((state) => ({
              strokes: [...state.strokes, stroke]
            }));
          },
          onStrokeDeleted: (strokeId: string) => {
            // Remove stroke from local state
            useCanvasStore.setState((state) => ({
              strokes: state.strokes.filter(s => s.id !== strokeId)
            }));
          },
          onCursorUpdated: (userId: string, x: number, y: number, userName: string, userColor: string) => {
            // Update collaborator cursor
            updateCollaboratorCursor(userId, x, y);
            
            // Add collaborator if not exists
            const collaborator = collaborators.get(userId);
            if (!collaborator) {
              addCollaborator({
                id: userId,
                name: userName,
                color: userColor,
                cursor: { x, y },
                lastSeen: Date.now(),
                isDrawing: false
              });
            }
          },
          onCursorRemoved: (userId: string) => {
            // Remove collaborator cursor
            const collaborator = collaborators.get(userId);
            if (collaborator) {
              updateCollaboratorCursor(userId, 0, 0);
              // Remove after a delay
              setTimeout(() => removeCollaborator(userId), 1000);
            }
          }
        });
        
        // Connect to Supabase
        const connected = await canvasService.connect();
        
        if (connected) {
          console.log(`🎨 Connected to Canvas room: ${canvasId}`);
          setConnected(true);
        } else {
          console.log('🎨 Failed to connect to Supabase, running in offline mode');
          setConnected(false);
          await loadCanvas(canvasId);
        }
        
        canvasServiceRef.current = canvasService;
        setIsLoading(false);
        
      } catch (error) {
        console.error('❌ Failed to connect to Canvas collaboration:', error);
        setConnected(false);
        setIsLoading(false);
        await loadCanvas(canvasId);
      }
    };
    
    connectToSupabase();
    
    // Cleanup on unmount
    return () => {
      if (canvasServiceRef.current) {
        canvasServiceRef.current.disconnect();
        canvasServiceRef.current = null;
      }
      setConnected(false);
    };
  }, [canvasId, currentUser.id, currentUser.name, currentUser.color]);

  // Handle completed strokes - save to Supabase (prevent duplicate saves)
  const savedStrokeIds = useRef<Set<string>>(new Set());
  
  useEffect(() => {
    const unsubscribe = useCanvasStore.subscribe(
      (state) => {
        const completedStrokes = state.strokes.filter(s => 
          s.completed && 
          s.userId === currentUser.id && 
          !s.id.includes('temp-') && // Skip temporary strokes
          !savedStrokeIds.current.has(s.id) // Skip already saved strokes
        );
        
        completedStrokes.forEach(async (stroke) => {
          if (canvasServiceRef.current && isConnected) {
            // Mark as being saved to prevent duplicates
            savedStrokeIds.current.add(stroke.id);
            
            const success = await canvasServiceRef.current.addStroke(stroke);
            if (!success) {
              console.warn('Failed to save stroke to Supabase');
              // Remove from saved set if it failed, so we can retry
              savedStrokeIds.current.delete(stroke.id);
            }
          }
        });
      }
    );
    
    return unsubscribe;
  }, [currentUser.id, isConnected]);

  // Canvas mouse/touch event handlers
  const getEventPosition = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }, []);

  const handleCanvasMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const { x, y } = getEventPosition(e);
    startDrawing(x, y);
  }, [getEventPosition, startDrawing]);

  const handleCanvasMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const { x, y } = getEventPosition(e);
    
    // Update cursor position in Supabase
    if (canvasServiceRef.current && isConnected) {
      canvasServiceRef.current.updateCursor(x, y);
    }
    
    if (isDrawing) {
      continueDrawing(x, y);
    }
  }, [getEventPosition, isConnected, isDrawing, continueDrawing]);
  
  const handleCanvasMouseUp = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (isDrawing) {
      stopDrawing();
    }
  }, [isDrawing, stopDrawing]);
  
  const handleCanvasMouseLeave = useCallback(() => {
    if (isDrawing) {
      stopDrawing();
    }
    
    // Remove cursor from Supabase
    if (canvasServiceRef.current && isConnected) {
      canvasServiceRef.current.removeCursor();
    }
  }, [isDrawing, stopDrawing, isConnected]);

  const handleClearCanvas = useCallback(async () => {
    if (canvasServiceRef.current && isConnected) {
      const success = await canvasServiceRef.current.clearCanvas();
      if (success) {
        clearCanvas();
        // Clear saved stroke tracking when canvas is cleared
        savedStrokeIds.current.clear();
      }
    } else {
      clearCanvas();
      // Clear saved stroke tracking when canvas is cleared
      savedStrokeIds.current.clear();
    }
  }, [isConnected, clearCanvas]);

  const handleUndoLastStroke = useCallback(async () => {
    const userStrokes = strokes.filter(s => s.userId === currentUser.id && s.completed);
    const lastStroke = userStrokes[userStrokes.length - 1];
    
    if (lastStroke && canvasServiceRef.current && isConnected) {
      const success = await canvasServiceRef.current.deleteStroke(lastStroke.id);
      if (success) {
        undoLastStroke();
        // Remove from saved tracking when stroke is deleted
        savedStrokeIds.current.delete(lastStroke.id);
      }
    } else {
      undoLastStroke();
      // Remove from saved tracking when stroke is deleted locally
      if (lastStroke) {
        savedStrokeIds.current.delete(lastStroke.id);
      }
    }
  }, [strokes, currentUser.id, isConnected, undoLastStroke]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Connecting to Canvas room...</p>
          <p className="text-sm text-gray-500">Room: {canvasId}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 relative overflow-hidden">
      {/* Collaborators Panel */}
      <div className="absolute top-4 left-4 z-20">
        <div className="bg-white rounded-lg shadow-lg p-4 min-w-[200px]">
          <h3 className="font-semibold text-gray-900 mb-3">Collaborators</h3>
          <div className="space-y-2">
            {/* Current User */}
            <div className="flex items-center space-x-2">
              <div 
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: currentUser.color }}
              />
              <span className="text-sm text-gray-700">{currentUser.name} (You)</span>
            </div>
            
            {/* Other Collaborators */}
            {Array.from(collaborators.values()).map(collaborator => (
              <div key={collaborator.id} className="flex items-center space-x-2">
                <div 
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: collaborator.color }}
                />
                <span className="text-sm text-gray-700">{collaborator.name}</span>
                {collaborator.isDrawing && (
                  <span className="text-xs text-blue-600">✏️</span>
                )}
              </div>
            ))}
            
            {Array.from(collaborators.values()).length === 0 && (
              <p className="text-sm text-gray-500">No other collaborators</p>
            )}
          </div>
        </div>
      </div>

      {/* Drawing Toolbar */}
      <div className="absolute top-4 right-4 z-20">
        <div className="bg-white rounded-lg shadow-lg p-4 space-y-4">
          {/* Tools */}
          <div className="flex space-x-2">
            <button
              onClick={() => setTool('brush')}
              className={`px-3 py-2 rounded ${
                settings.tool === 'brush'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100 hover:bg-gray-200'
              }`}
              title="Brush Tool"
            >
              🖌️
            </button>
            <button
              onClick={() => setTool('eraser')}
              className={`px-3 py-2 rounded ${
                settings.tool === 'eraser'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100 hover:bg-gray-200'
              }`}
              title="Eraser Tool"
            >
              🧽
            </button>
          </div>
          
          {/* Brush Size */}
          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-600">Size:</span>
            <input
              type="range"
              min="1"
              max="50"
              value={settings.brushSize}
              onChange={(e) => setBrushSize(Number(e.target.value))}
              className="flex-1"
            />
            <span className="text-sm text-gray-600 w-8">{settings.brushSize}</span>
          </div>
          
          {/* Color Picker */}
          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-600">Color:</span>
            <input
              type="color"
              value={settings.brushColor}
              onChange={(e) => setBrushColor(e.target.value)}
              className="w-8 h-8 rounded border border-gray-300"
            />
          </div>
          
          {/* Actions */}
          <div className="flex space-x-2">
            <button
              onClick={handleUndoLastStroke}
              className="px-3 py-2 rounded bg-gray-100 hover:bg-gray-200"
              title="Undo Last Stroke"
            >
              ↩️
            </button>
            <button
              onClick={handleClearCanvas}
              className="px-3 py-2 rounded bg-red-500 text-white hover:bg-red-600"
              title="Clear Canvas"
            >
              🗑️
            </button>
          </div>
        </div>
      </div>

      {/* Canvas */}
      <div className="relative w-full h-screen">
        <canvas
          ref={canvasRef}
          width={settings.canvasWidth}
          height={settings.canvasHeight}
          className="absolute inset-0 w-full h-full cursor-crosshair bg-white"
          onMouseDown={handleCanvasMouseDown}
          onMouseMove={handleCanvasMouseMove}
          onMouseUp={handleCanvasMouseUp}
          onMouseLeave={handleCanvasMouseLeave}
        />
        
        {/* Collaborator cursors */}
        {Array.from(collaborators.values()).map(collaborator => (
          collaborator.cursor && (
            <div
              key={`cursor-${collaborator.id}`}
              className="absolute pointer-events-none z-10"
              style={{
                left: collaborator.cursor.x,
                top: collaborator.cursor.y,
                transform: 'translate(-2px, -2px)',
              }}
            >
              <div 
                className="w-4 h-4 rounded-full border-2 border-white shadow-lg"
                style={{ backgroundColor: collaborator.color }}
              />
              <div 
                className="absolute top-5 left-0 px-2 py-1 rounded text-xs text-white whitespace-nowrap shadow-lg"
                style={{ backgroundColor: collaborator.color }}
              >
                {collaborator.name}
              </div>
            </div>
          )
        ))}
      </div>

      {/* Development Info */}
      {import.meta.env.DEV && (
        <div className="fixed bottom-4 right-4 bg-black bg-opacity-75 text-white p-3 rounded text-xs">
          <div>Room: {canvasId}</div>
          <div>Status: {isConnected ? '🟢 Supabase Connected' : '🔴 Offline Mode'}</div>
          <div>Collaborators: {Array.from(collaborators.values()).length}</div>
          <div className="mt-2 text-gray-300">
            {isConnected ? 'Real-time collaboration active' : 'Local canvas only'}
          </div>
          <div className="text-gray-300">
            Add ?room=your-room-name to URL to change rooms
          </div>
        </div>
      )}
    </div>
  );
} 