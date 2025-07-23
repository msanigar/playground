import { useEffect, useRef, useState, useCallback } from 'react';
import PartySocket from 'partysocket';
import { useCanvasStore } from '../state/canvas';
import type { CanvasOperation } from '../state/canvas';

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
    applyOperation,
    confirmOptimisticOperation,
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
  
  const partySocketRef = useRef<PartySocket | null>(null);
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

  // Real PartyKit WebSocket connection
  useEffect(() => {
    const connectToPartyKit = async () => {
      try {
        setIsLoading(true);
        
        // Load canvas data first
        await loadCanvas(canvasId);
        
        // Check if we're in production/deployed environment
        const isProduction = import.meta.env.PROD || window.location.hostname !== 'localhost';
        
        if (isProduction) {
          console.log('🎨 Canvas running in offline mode (no real-time collaboration server configured)');
          setConnected(false);
          setIsLoading(false);
          return;
        }
        
        // Connect to PartyKit only in development
        const socket = new PartySocket({
          host: "localhost:1999", // Development server
          room: canvasId,
        });
        
        let connectionTimeout: number | null = null;
        let hasConnected = false;
        
        // Set a connection timeout
        connectionTimeout = setTimeout(() => {
          if (!hasConnected) {
            console.log('🎨 Canvas collaboration server not available, running in offline mode');
            socket.close();
            setConnected(false);
            setIsLoading(false);
          }
        }, 3000); // 3 second timeout
        
        socket.onopen = () => {
          hasConnected = true;
          if (connectionTimeout) {
            clearTimeout(connectionTimeout);
            connectionTimeout = null;
          }
          
          console.log(`🎨 Connected to Canvas room: ${canvasId}`);
          setConnected(true);
          
          // Announce ourselves to other collaborators
          const joinOperation: CanvasOperation = {
            type: 'user-join',
            user: {
              id: currentUser.id,
              name: currentUser.name,
              color: currentUser.color,
              isDrawing: false,
            }
          };
          
          socket.send(JSON.stringify(joinOperation));
        };

        socket.onmessage = (event) => {
          try {
            const operation: CanvasOperation = JSON.parse(event.data);
            
            // Don't process our own operations
            if ('userId' in operation && operation.userId === currentUser.id) {
              return;
            }
            
            // Apply the operation to our local state
            applyOperation(operation);
            
            // Handle specific operation types
            switch (operation.type) {
              case 'user-join':
                addCollaborator({
                  ...operation.user,
                  cursor: null,
                  lastSeen: Date.now(),
                });
                break;
              case 'user-leave':
                removeCollaborator(operation.userId);
                break;
              case 'cursor-move':
                updateCollaboratorCursor(operation.userId, operation.x, operation.y);
                break;
              case 'cursor-leave':
                // Handled by applyOperation above - no additional action needed
                break;
            }
          } catch (error) {
            console.error('Error processing Canvas operation:', error);
          }
        };
        
        socket.onclose = () => {
          if (hasConnected) {
            console.log('🔌 Disconnected from Canvas room');
          }
          setConnected(false);
          if (connectionTimeout) {
            clearTimeout(connectionTimeout);
          }
        };
        
        socket.onerror = (error) => {
          if (hasConnected) {
            console.error('❌ Canvas WebSocket error:', error);
          }
          setConnected(false);
          if (connectionTimeout) {
            clearTimeout(connectionTimeout);
            setIsLoading(false);
          }
        };
        
        partySocketRef.current = socket;
        setIsLoading(false);
        
      } catch (error) {
        console.error('❌ Failed to connect to Canvas collaboration:', error);
        setConnected(false);
        setIsLoading(false);
      }
    };
    
    connectToPartyKit();
    
    // Cleanup on unmount
    return () => {
      if (partySocketRef.current) {
        // Send leave message
        const leaveOperation: CanvasOperation = {
          type: 'user-leave',
          userId: currentUser.id,
        };
        partySocketRef.current.send(JSON.stringify(leaveOperation));
        partySocketRef.current.close();
        partySocketRef.current = null;
      }
      setConnected(false);
    };
  }, [canvasId, currentUser.id, currentUser.name, currentUser.color]);

  // Send operations to other collaborators
  const broadcastOperation = useCallback((operation: CanvasOperation) => {
    const socket = partySocketRef.current;
    if (!socket || socket.readyState !== socket.OPEN) {
      // Only log in development mode to avoid spam
      if (import.meta.env.DEV && socket) {
        console.warn('🔌 Socket not ready, operation will be local only');
      }
      return;
    }
    
    try {
      socket.send(JSON.stringify(operation));
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('❌ Failed to send Canvas operation:', error);
      }
    }
  }, []);

  // Watch for new optimistic operations and broadcast them
  useEffect(() => {
    const unsubscribe = useCanvasStore.subscribe(
      (state) => {
        // Find operations that need to be sent
        const operations = state.optimisticOperations;
        operations.forEach(op => {
          if (!op.confirmed) {
            broadcastOperation(op.operation);
            // Mark as confirmed (sent to server)
            confirmOptimisticOperation(op.id);
          }
        });
      }
    );
    
    return unsubscribe;
  }, [broadcastOperation, confirmOptimisticOperation]);

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
    
    // Broadcast cursor movement
    broadcastOperation({
      type: 'cursor-move',
      userId: currentUser.id,
      x,
      y,
    });
    
    if (isDrawing) {
      continueDrawing(x, y);
    }
  }, [getEventPosition, broadcastOperation, currentUser.id, isDrawing, continueDrawing]);
  
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
    broadcastOperation({
      type: 'cursor-leave',
      userId: currentUser.id,
    });
  }, [isDrawing, stopDrawing, broadcastOperation, currentUser.id]);

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
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white">
        <div className="px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <h1 className="text-lg font-medium text-gray-900">Canvas</h1>
              <div className="flex items-center space-x-2">
                <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
                <span className="text-sm text-gray-600">
                  {isConnected ? 'Connected' : 'Disconnected'}
                </span>
              </div>
            </div>
            
            {/* Collaborators */}
            <div className="flex items-center space-x-2">
              <span className="text-sm text-gray-600">
                {Array.from(collaborators.values()).length + 1} collaborator{Array.from(collaborators.values()).length === 0 ? '' : 's'}
              </span>
              <div className="flex -space-x-2">
                {/* Current user */}
                <div 
                  className="w-8 h-8 rounded-full border-2 border-white flex items-center justify-center text-xs font-medium text-white"
                  style={{ backgroundColor: currentUser.color }}
                  title={`${currentUser.name} (You)`}
                >
                  {currentUser.name.charAt(0)}
                </div>
                {/* Other collaborators */}
                {Array.from(collaborators.values()).map(collaborator => (
                  <div 
                    key={collaborator.id}
                    className="w-8 h-8 rounded-full border-2 border-white flex items-center justify-center text-xs font-medium text-white"
                    style={{ backgroundColor: collaborator.color }}
                    title={collaborator.name}
                  >
                    {collaborator.name.charAt(0)}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Canvas Area */}
      <div className="relative flex-1">
        <canvas
          ref={canvasRef}
          className="w-full h-full cursor-crosshair"
          width={settings.canvasWidth}
          height={settings.canvasHeight}
          onMouseDown={handleCanvasMouseDown}
          onMouseMove={handleCanvasMouseMove}
          onMouseUp={handleCanvasMouseUp}
          onMouseLeave={handleCanvasMouseLeave}
          style={{ minHeight: 'calc(100vh - 80px)' }}
        />
        
        {/* Drawing Toolbar */}
        <div className="absolute top-4 left-4 bg-white rounded-lg shadow-lg p-4 z-20">
          <div className="flex items-center space-x-4">
            {/* Tools */}
            <div className="flex space-x-2">
              <button
                onClick={() => setTool('brush')}
                className={`px-3 py-2 rounded ${settings.tool === 'brush' ? 'bg-blue-500 text-white' : 'bg-gray-100'}`}
                title="Brush"
              >
                🖌️
              </button>
              <button
                onClick={() => setTool('eraser')}
                className={`px-3 py-2 rounded ${settings.tool === 'eraser' ? 'bg-blue-500 text-white' : 'bg-gray-100'}`}
                title="Eraser"
              >
                🧹
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
                className="w-20"
              />
              <span className="text-sm text-gray-600 w-6">{settings.brushSize}</span>
            </div>
            
            {/* Color */}
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
                onClick={undoLastStroke}
                className="px-3 py-2 rounded bg-gray-100 hover:bg-gray-200"
                title="Undo Last Stroke"
              >
                ↩️
              </button>
              <button
                onClick={clearCanvas}
                className="px-3 py-2 rounded bg-red-500 text-white hover:bg-red-600"
                title="Clear Canvas"
              >
                🗑️
              </button>
            </div>
          </div>
        </div>
        
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
          <div>Status: {isConnected ? '🟢 Connected' : '🔴 Offline Mode'}</div>
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