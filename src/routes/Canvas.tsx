import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import PartySocket from 'partysocket';
import { 
  useCanvasStore,
  type Collaborator 
} from '../state/canvas';

// Simple loading component
function CanvasLoading() {
  return (
    <motion.div
      className="flex items-center justify-center h-96 bg-gray-50 dark:bg-gray-800 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600"
      animate={{ opacity: [0.5, 1, 0.5] }}
      transition={{ duration: 2, repeat: Infinity }}
    >
      <div className="text-center">
        <div className="text-2xl mb-2">🎨</div>
        <div className="text-gray-600 dark:text-gray-400">Loading canvas...</div>
      </div>
    </motion.div>
  );
}

// Collaborative cursor component
function CollaboratorCursor({ collaborator }: { collaborator: Collaborator }) {
  if (!collaborator.cursor) return null;
  
  return (
    <motion.div
      className="absolute pointer-events-none z-50"
      initial={{ opacity: 0, scale: 0 }}
      animate={{ 
        opacity: 1, 
        scale: 1,
        x: collaborator.cursor.x,
        y: collaborator.cursor.y,
      }}
      exit={{ opacity: 0, scale: 0 }}
      transition={{ type: "spring", damping: 30, stiffness: 400 }}
    >
      {/* Cursor pointer */}
      <svg width="20" height="20" viewBox="0 0 20 20" className="relative">
        <path
          d="M3 3l14 5-6 2-2 6z"
          fill={collaborator.color}
          stroke="white"
          strokeWidth="1"
        />
      </svg>
      
      {/* User name tag */}
      <motion.div
        className="absolute top-5 left-2 px-2 py-1 text-xs text-white rounded shadow-lg"
        style={{ backgroundColor: collaborator.color }}
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        {collaborator.name}
        {collaborator.isDrawing && (
          <motion.span
            className="ml-1"
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ duration: 0.5, repeat: Infinity }}
          >
            ✏️
          </motion.span>
        )}
      </motion.div>
    </motion.div>
  );
}

// Drawing canvas component
function DrawingCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const {
    strokes,
    settings,
    isDrawing,
    startDrawing,
    continueDrawing,
    stopDrawing,
    updateCursor,
    leaveCursor,
  } = useCanvasStore();

  // Canvas drawing functions
  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw grid if enabled
    if (settings.showGrid) {
      ctx.strokeStyle = '#e5e7eb';
      ctx.lineWidth = 0.5;
      const gridSize = 20;
      
      for (let x = 0; x <= canvas.width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      }
      
      for (let y = 0; y <= canvas.height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }
    }
    
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
  }, [strokes, settings.showGrid]);

  // Redraw canvas when strokes change
  useEffect(() => {
    redrawCanvas();
  }, [redrawCanvas]);

  // Mouse/touch event handlers
  const getEventPosition = useCallback((e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    let clientX: number, clientY: number;
    
    if ('touches' in e) {
      // Touch event
      const touch = e.touches[0] || e.changedTouches[0];
      clientX = touch.clientX;
      clientY = touch.clientY;
    } else {
      // Mouse event
      clientX = e.clientX;
      clientY = e.clientY;
    }
    
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  }, []);

  // Type guard for pointer events with pressure
  const getPressure = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>): number => {
    if ('pressure' in e) {
      const pointerEvent = e as React.PointerEvent<HTMLCanvasElement>;
      return typeof pointerEvent.pressure === 'number' ? pointerEvent.pressure : 1;
    }
    return 1;
  };

  const handleStart = useCallback((e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const { x, y } = getEventPosition(e);
    const pressure = getPressure(e);
    startDrawing(x, y, pressure);
  }, [getEventPosition, startDrawing]);

  const handleMove = useCallback((e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const { x, y } = getEventPosition(e);
    const pressure = getPressure(e);
    
    // Update cursor position for collaboration
    updateCursor(x, y);
    
    if (isDrawing) {
      continueDrawing(x, y, pressure);
    }
  }, [getEventPosition, updateCursor, isDrawing, continueDrawing]);

  const handleEnd = useCallback((e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (isDrawing) {
      stopDrawing();
    }
  }, [isDrawing, stopDrawing]);

  const handleLeave = useCallback(() => {
    if (isDrawing) {
      stopDrawing();
    }
    leaveCursor();
  }, [isDrawing, stopDrawing, leaveCursor]);

  return (
    <div className="relative border-2 border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden bg-white dark:bg-gray-900">
      <canvas
        ref={canvasRef}
        width={settings.canvasWidth}
        height={settings.canvasHeight}
        className="block cursor-crosshair touch-none"
        onMouseDown={handleStart}
        onMouseMove={handleMove}
        onMouseUp={handleEnd}
        onMouseLeave={handleLeave}
        onTouchStart={handleStart}
        onTouchMove={handleMove}
        onTouchEnd={handleEnd}
        style={{
          width: '100%',
          height: 'auto',
          maxHeight: '70vh',
        }}
      />
    </div>
  );
}

// Toolbar component
function CanvasToolbar() {
  const {
    settings,
    setTool,
    setBrushSize,
    setBrushColor,
    toggleGrid,
    toggleCollaborators,
    clearCanvas,
    undoLastStroke,
    isConnected,
  } = useCanvasStore();

  const colors = [
    '#000000', '#ef4444', '#f97316', '#eab308', 
    '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899'
  ];

  return (
    <motion.div
      className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 shadow-lg"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
    >
      <h3 className="text-lg font-semibold mb-4">Drawing Tools</h3>
      
      <div className="space-y-4">
        {/* Connection status */}
        <div className="flex items-center gap-2">
          <motion.div
            className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}
            animate={{ scale: isConnected ? [1, 1.2, 1] : 1 }}
            transition={{ duration: 2, repeat: isConnected ? Infinity : 0 }}
          />
          <span className="text-sm text-gray-600 dark:text-gray-400">
            {isConnected ? 'Connected' : 'Connecting...'}
          </span>
        </div>

        {/* Tools */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Tool
          </label>
          <div className="flex gap-2">
            <motion.button
              onClick={() => setTool('brush')}
              className={`flex-1 p-2 rounded ${settings.tool === 'brush' ? 'bg-blue-500 text-white' : 'bg-gray-100 dark:bg-gray-700'}`}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              title="Brush"
            >
              🖌️ Brush
            </motion.button>
            <motion.button
              onClick={() => setTool('eraser')}
              className={`flex-1 p-2 rounded ${settings.tool === 'eraser' ? 'bg-blue-500 text-white' : 'bg-gray-100 dark:bg-gray-700'}`}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              title="Eraser"
            >
              🧹 Eraser
            </motion.button>
          </div>
        </div>

        {/* Brush size */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Size: {settings.brushSize}px
          </label>
          <input
            type="range"
            min="1"
            max="50"
            value={settings.brushSize}
            onChange={(e) => setBrushSize(Number(e.target.value))}
            className="w-full"
          />
        </div>

        {/* Colors */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Color
          </label>
          <div className="grid grid-cols-5 gap-2 mb-2">
            {colors.map(color => (
              <motion.button
                key={color}
                onClick={() => setBrushColor(color)}
                className={`w-8 h-8 rounded border-2 ${settings.brushColor === color ? 'border-gray-800 dark:border-white' : 'border-gray-300'}`}
                style={{ backgroundColor: color }}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
              />
            ))}
          </div>
          <input
            type="color"
            value={settings.brushColor}
            onChange={(e) => setBrushColor(e.target.value)}
            className="w-full h-8 rounded border border-gray-300"
          />
        </div>

        {/* View options */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            View Options
          </label>
          <div className="space-y-2">
            <motion.button
              onClick={toggleGrid}
              className={`w-full px-3 py-2 rounded text-sm ${settings.showGrid ? 'bg-blue-500 text-white' : 'bg-gray-100 dark:bg-gray-700'}`}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              {settings.showGrid ? '✅' : '⬜'} Grid
            </motion.button>
            <motion.button
              onClick={toggleCollaborators}
              className={`w-full px-3 py-2 rounded text-sm ${settings.showCollaborators ? 'bg-blue-500 text-white' : 'bg-gray-100 dark:bg-gray-700'}`}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              {settings.showCollaborators ? '👥' : '👤'} Show Cursors
            </motion.button>
          </div>
        </div>

        {/* Actions */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Actions
          </label>
          <div className="space-y-2">
            <motion.button
              onClick={undoLastStroke}
              className="w-full px-3 py-2 rounded text-sm bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              ↩️ Undo Last
            </motion.button>
            <motion.button
              onClick={clearCanvas}
              className="w-full px-3 py-2 rounded text-sm bg-red-500 text-white hover:bg-red-600"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              🗑️ Clear Canvas
            </motion.button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// Collaborators panel
function CollaboratorsPanel() {
  const { collaborators, settings, currentUser } = useCanvasStore();
  const collaboratorsList = Array.from(collaborators.values());

  if (!settings.showCollaborators) return null;

  return (
    <motion.div
      className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
    >
      <h3 className="text-lg font-semibold mb-3">Collaborators</h3>
      
      {/* Current user */}
      <div className="flex items-center gap-2 mb-2 p-2 bg-blue-50 dark:bg-blue-900/20 rounded">
        <div 
          className="w-4 h-4 rounded-full border-2 border-white"
          style={{ backgroundColor: currentUser.color }}
        />
        <span className="font-medium">{currentUser.name} (You)</span>
        {currentUser.isDrawing && <span className="text-blue-500">✏️</span>}
      </div>
      
      {/* Other collaborators */}
      <AnimatePresence>
        {collaboratorsList.map(collaborator => (
          <motion.div
            key={collaborator.id}
            className="flex items-center gap-2 mb-2 p-2 rounded"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
          >
            <div 
              className="w-4 h-4 rounded-full border-2 border-white"
              style={{ backgroundColor: collaborator.color }}
            />
            <span>{collaborator.name}</span>
            {collaborator.isDrawing && (
              <motion.span
                className="text-green-500"
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ duration: 0.5, repeat: Infinity }}
              >
                ✏️
              </motion.span>
            )}
          </motion.div>
        ))}
      </AnimatePresence>
      
      {collaboratorsList.length === 0 && (
        <div className="text-gray-500 dark:text-gray-400 text-sm">
          No other collaborators yet. Share this room to collaborate!
        </div>
      )}
    </motion.div>
  );
}

export default function Canvas() {
  const {
    collaborators,
    settings,
    setConnected,
    addCollaborator,
    loadCanvas,
  } = useCanvasStore();
  
  const partySocketRef = useRef<PartySocket | null>(null);
  const [canvasId] = useState(() => {
    // Get room from URL or use default
    const params = new URLSearchParams(window.location.search);
    return params.get('room') || 'default-canvas';
  });
  const [isLoading, setIsLoading] = useState(true);

  // Load canvas data on mount
  useEffect(() => {
    const loadCanvasData = async () => {
      try {
        setIsLoading(true);
        await loadCanvas(canvasId);
        setConnected(true);
        setIsLoading(false);
        
        // Simulate some collaborators joining after a delay
        setTimeout(() => {
          if (Math.random() > 0.5) {
            addCollaborator({
              id: 'demo-user-1',
              name: 'Creative Artist',
              color: '#ef4444',
              cursor: null,
              lastSeen: Date.now(),
              isDrawing: false,
            });
          }
        }, 2000);
      } catch (error) {
        console.error('Failed to load canvas:', error);
        setIsLoading(false);
        setConnected(true); // Still allow drawing even if load failed
      }
    };

    loadCanvasData();

    return () => {
      if (partySocketRef.current) {
        partySocketRef.current.close();
      }
    };
  }, [canvasId, setConnected, addCollaborator, loadCanvas]);

  const collaboratorsList = Array.from(collaborators.values());

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto space-y-6">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center"
        >
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Collaborative Canvas
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Draw together in real-time • Room: <code className="bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">{canvasId}</code>
          </p>
        </motion.div>
        <CanvasLoading />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center"
      >
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
          Collaborative Canvas
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          Draw together in real-time • Room: <code className="bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">{canvasId}</code>
        </p>
      </motion.div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        {/* Canvas */}
        <div className="xl:col-span-3 relative">
          <DrawingCanvas />
          
          {/* Collaborative cursors */}
          {settings.showCollaborators && (
            <AnimatePresence>
              {collaboratorsList.map(collaborator => (
                <CollaboratorCursor key={collaborator.id} collaborator={collaborator} />
              ))}
            </AnimatePresence>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Toolbar moved to sidebar */}
          <CanvasToolbar />
          <CollaboratorsPanel />
        </div>
      </div>
    </div>
  );
} 