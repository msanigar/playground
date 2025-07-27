import { useNotesStore } from '../state/notes';
import { useState, useMemo, Suspense, use, startTransition } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
} from '@dnd-kit/core';
import type { DragStartEvent, DragEndEvent, DragOverEvent } from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { motion, AnimatePresence } from 'framer-motion';
import type { Note } from '../state/notes';

// Types for React 19 patterns
type NotesSettings = {
  viewMode: 'grid' | 'list' | 'masonry';
  showTimestamps: boolean;
  autoSave: boolean;
  sortBy: 'created' | 'updated' | 'alphabetical';
  exportFormat: 'json' | 'markdown' | 'plain';
};

type NotesStats = {
  totalNotes: number;
  totalWords: number;
  avgWordsPerNote: number;
  oldestNote: string;
  newestNote: string;
};

// React 19 use() hook compatible data processors
async function processNotesStats(notes: Note[]): Promise<NotesStats> {
  // Simulate async processing for React 19 demo
  await new Promise(resolve => setTimeout(resolve, 300));
  
  if (notes.length === 0) {
    return {
      totalNotes: 0,
      totalWords: 0,
      avgWordsPerNote: 0,
      oldestNote: 'None',
      newestNote: 'None',
    };
  }

  const totalWords = notes.reduce((sum, note) => sum + note.text.split(/\s+/).filter(w => w).length, 0);
  const sortedByDate = [...notes].sort((a, b) => a.createdAt - b.createdAt);
  
  return {
    totalNotes: notes.length,
    totalWords,
    avgWordsPerNote: Math.round(totalWords / notes.length),
    oldestNote: new Date(sortedByDate[0].createdAt).toLocaleDateString(),
    newestNote: new Date(sortedByDate[sortedByDate.length - 1].createdAt).toLocaleDateString(),
  };
}

async function searchNotes(notes: Note[], query: string): Promise<Note[]> {
  // Simulate async search for React 19 patterns
  await new Promise(resolve => setTimeout(resolve, 150));
  
  if (!query.trim()) return notes;
  
  const lowercaseQuery = query.toLowerCase();
  return notes.filter(note => 
    note.text.toLowerCase().includes(lowercaseQuery)
  );
}

// Enhanced SortableNote with better animations and features
function SortableNote({ 
  note, 
  isDragging, 
  isOver, 
  onUpdate, 
  onDelete, 
  viewMode,
  showTimestamps 
}: { 
  note: Note;
  isDragging: boolean; 
  isOver: boolean;
  onUpdate: (id: string, text: string) => void;
  onDelete: (id: string) => void;
  viewMode: 'grid' | 'list' | 'masonry';
  showTimestamps: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging: sortableIsDragging } = useSortable({
    id: note.id,
  });

  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(note.text);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const handleSave = () => {
    onUpdate(note.id, editText);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditText(note.text);
    setIsEditing(false);
  };

  const wordCount = note.text.split(/\s+/).filter(w => w).length;

  return (
    <motion.div
      ref={setNodeRef}
      style={style}
      className={`
        relative group overflow-hidden rounded-xl transition-all duration-300
        ${viewMode === 'list' ? 'w-full' : ''}
        ${sortableIsDragging ? 'z-50 shadow-2xl scale-105 rotate-1 border-2 border-blue-400 dark:border-blue-500' : 'shadow-lg hover:shadow-xl'}
        ${isDragging && !sortableIsDragging ? 'scale-95 opacity-60' : ''}
        ${isOver && !sortableIsDragging ? 'border-2 border-green-400 bg-green-50/50 dark:border-green-500 dark:bg-green-900/30' : ''}
        bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm border border-gray-200/50 dark:border-gray-700/50
      `}
      layout={!sortableIsDragging}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20, scale: 0.8 }}
      whileHover={{ scale: sortableIsDragging ? 1.05 : 1.02 }}
      transition={{ duration: 0.3 }}
    >
      {/* Drag Handle */}
      <motion.div
        {...attributes}
        {...listeners}
        className="absolute top-2 left-2 p-1.5 rounded-md bg-gray-100/80 hover:bg-gray-200/80 
                   dark:bg-gray-700/80 dark:hover:bg-gray-600/80
                   opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing z-10"
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
      >
        <div className="flex flex-col gap-0.5">
          <div className="flex gap-0.5">
            <div className="w-1 h-1 bg-gray-500 dark:bg-gray-400 rounded-full"></div>
            <div className="w-1 h-1 bg-gray-500 dark:bg-gray-400 rounded-full"></div>
            <div className="w-1 h-1 bg-gray-500 dark:bg-gray-400 rounded-full"></div>
          </div>
          <div className="flex gap-0.5">
            <div className="w-1 h-1 bg-gray-500 dark:bg-gray-400 rounded-full"></div>
            <div className="w-1 h-1 bg-gray-500 dark:bg-gray-400 rounded-full"></div>
            <div className="w-1 h-1 bg-gray-500 dark:bg-gray-400 rounded-full"></div>
          </div>
        </div>
      </motion.div>

      {/* Delete Button */}
      <motion.button
        onClick={() => onDelete(note.id)}
        className="absolute top-2 right-2 p-1.5 rounded-md bg-red-100/80 hover:bg-red-200/80
                   dark:bg-red-900/80 dark:hover:bg-red-800/80
                   opacity-0 group-hover:opacity-100 transition-opacity z-10"
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
      >
        <svg className="w-4 h-4 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </motion.button>

      {/* Content */}
      <div className="p-6 pt-8">
        {isEditing ? (
          <div className="space-y-3">
            <textarea
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              className="w-full p-3 rounded-lg border border-gray-300 dark:border-gray-600 
                         bg-white dark:bg-gray-700 text-gray-900 dark:text-white
                         resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
              rows={4}
              autoFocus
            />
            <div className="flex gap-2">
              <motion.button
                onClick={handleSave}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                Save
              </motion.button>
              <motion.button
                onClick={handleCancel}
                className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                Cancel
              </motion.button>
            </div>
          </div>
        ) : (
          <div 
            className="cursor-pointer"
            onClick={() => setIsEditing(true)}
          >
            <p className="text-gray-800 dark:text-gray-200 leading-relaxed whitespace-pre-wrap break-words">
              {note.text}
            </p>
            
            {/* Metadata */}
            <div className="mt-4 pt-3 border-t border-gray-200/50 dark:border-gray-600/50 flex justify-between items-center text-xs text-gray-500 dark:text-gray-400">
              <span>{wordCount} word{wordCount !== 1 ? 's' : ''}</span>
              {showTimestamps && (
                <span>
                  {new Date(note.createdAt).toLocaleDateString()}
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Hover overlay for better interaction feedback */}
      <motion.div
        className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
        initial={{ opacity: 0 }}
        whileHover={{ opacity: 1 }}
      />
    </motion.div>
  );
}

// Stats Panel Component using React 19 Suspense
function StatsPanel({ statsPromise }: { statsPromise: Promise<NotesStats> }) {
  const stats = use(statsPromise);
  
  return (
    <motion.div
      className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-xl border border-gray-200/50 dark:border-gray-700/50 p-4 lg:p-6 space-y-4"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4">Statistics</h3>
      
      <div className="grid grid-cols-2 lg:grid-cols-2 gap-3 lg:gap-4 text-sm">
        <div className="text-center p-2 lg:p-3 bg-blue-50 dark:bg-blue-900/30 rounded-lg">
          <div className="text-xl lg:text-2xl font-bold text-blue-600 dark:text-blue-400">{stats.totalNotes}</div>
          <div className="text-gray-600 dark:text-gray-400 text-xs lg:text-sm">Notes</div>
        </div>
        
        <div className="text-center p-2 lg:p-3 bg-green-50 dark:bg-green-900/30 rounded-lg">
          <div className="text-xl lg:text-2xl font-bold text-green-600 dark:text-green-400">{stats.totalWords}</div>
          <div className="text-gray-600 dark:text-gray-400 text-xs lg:text-sm">Words</div>
        </div>
        
        <div className="text-center p-2 lg:p-3 bg-purple-50 dark:bg-purple-900/30 rounded-lg">
          <div className="text-xl lg:text-2xl font-bold text-purple-600 dark:text-purple-400">{stats.avgWordsPerNote}</div>
          <div className="text-gray-600 dark:text-gray-400 text-xs lg:text-sm">Avg/Note</div>
        </div>
        
        <div className="text-center p-2 lg:p-3 bg-orange-50 dark:bg-orange-900/30 rounded-lg">
          <div className="text-lg lg:text-xl font-bold text-orange-600 dark:text-orange-400">📝</div>
          <div className="text-gray-600 dark:text-gray-400 text-xs lg:text-sm">Active</div>
        </div>
      </div>

      <div className="pt-4 border-t border-gray-200/50 dark:border-gray-600/50 space-y-2 text-xs text-gray-600 dark:text-gray-400">
        <div>📅 Oldest: {stats.oldestNote}</div>
        <div>🆕 Newest: {stats.newestNote}</div>
      </div>
    </motion.div>
  );
}

// Settings Panel Component
function SettingsPanel({ 
  settings, 
  onUpdate, 
  isOpen, 
  onClose 
}: {
  settings: NotesSettings;
  onUpdate: (settings: Partial<NotesSettings>) => void;
  isOpen: boolean;
  onClose: () => void;
}) {
  if (!isOpen) return null;

  return (
    <motion.div
      className="absolute top-4 right-4 bg-white/95 dark:bg-gray-800/95 backdrop-blur-md border border-gray-200/50 dark:border-gray-700/50 rounded-xl p-6 w-80 z-50 shadow-xl"
      initial={{ opacity: 0, scale: 0.9, x: 20 }}
      animate={{ opacity: 1, scale: 1, x: 0 }}
      exit={{ opacity: 0, scale: 0.9, x: 20 }}
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">Settings</h3>
        <motion.button
          onClick={onClose}
          className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 
                     p-1 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 
                     rounded border border-gray-200 dark:border-gray-600"
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
        >
          ✕
        </motion.button>
      </div>
      
      <div className="space-y-4">
        {/* View Mode */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">View Mode</label>
          <div className="flex gap-2">
            {(['grid', 'list', 'masonry'] as const).map((mode) => (
              <motion.button
                key={mode}
                onClick={() => onUpdate({ viewMode: mode })}
                className={`px-3 py-2 rounded-lg text-xs capitalize transition-colors ${
                  settings.viewMode === mode 
                    ? 'bg-blue-500 text-white' 
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                {mode}
              </motion.button>
            ))}
          </div>
        </div>

        {/* Toggles */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-700">Show Timestamps</span>
            <motion.button
              onClick={() => onUpdate({ showTimestamps: !settings.showTimestamps })}
              className={`w-10 h-6 rounded-full relative transition-colors ${
                settings.showTimestamps ? 'bg-blue-500' : 'bg-gray-300'
              }`}
              whileTap={{ scale: 0.95 }}
            >
              <motion.div
                className="w-4 h-4 bg-white rounded-full absolute top-1"
                animate={{ x: settings.showTimestamps ? 20 : 4 }}
                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
              />
            </motion.button>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-700">Auto Save</span>
            <motion.button
              onClick={() => onUpdate({ autoSave: !settings.autoSave })}
              className={`w-10 h-6 rounded-full relative transition-colors ${
                settings.autoSave ? 'bg-blue-500' : 'bg-gray-300'
              }`}
              whileTap={{ scale: 0.95 }}
            >
              <motion.div
                className="w-4 h-4 bg-white rounded-full absolute top-1"
                animate={{ x: settings.autoSave ? 20 : 4 }}
                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
              />
            </motion.button>
          </div>
        </div>

        {/* Sort Options */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Sort By</label>
          <select
            value={settings.sortBy}
            onChange={(e) => onUpdate({ sortBy: e.target.value as NotesSettings['sortBy'] })}
            className="w-full p-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="created">Date Created</option>
            <option value="updated">Last Updated</option>
            <option value="alphabetical">Alphabetical</option>
          </select>
        </div>
      </div>
    </motion.div>
  );
}

// Loading component for Suspense
function StatsLoading() {
  return (
    <motion.div
      className="bg-white/80 backdrop-blur-sm rounded-xl border border-gray-200/50 p-6"
      animate={{ opacity: [0.5, 1, 0.5] }}
      transition={{ duration: 1.5, repeat: Infinity }}
    >
      <div className="h-6 bg-gray-200 rounded mb-4 w-24"></div>
      <div className="grid grid-cols-2 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="p-3 bg-gray-100 rounded-lg">
            <div className="h-8 bg-gray-200 rounded mb-2"></div>
            <div className="h-4 bg-gray-200 rounded w-16"></div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

export default function Notes() {
  const notes = useNotesStore((s) => s.notes);
  const addNote = useNotesStore((s) => s.addNote);
  const updateNote = useNotesStore((s) => s.updateNote);
  const deleteNote = useNotesStore((s) => s.deleteNote);
  const reorder = useNotesStore((s) => s.reorderNotes);
  const undo = useNotesStore((s) => s.undo);
  const redo = useNotesStore((s) => s.redo);
  const canUndo = useNotesStore((s) => s.history.length > 0);
  const canRedo = useNotesStore((s) => s.future.length > 0);

  const [settings, setSettings] = useState<NotesSettings>({
    viewMode: 'grid',
    showTimestamps: true,
    autoSave: true,
    sortBy: 'created',
    exportFormat: 'json',
  });
  const [showSettings, setShowSettings] = useState(false);
  const [newText, setNewText] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  // React 19 patterns with use() hook
  const statsPromise = useMemo(() => processNotesStats(notes), [notes]);
  const filteredNotesPromise = useMemo(() => searchNotes(notes, searchQuery), [notes, searchQuery]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragOver = (event: DragOverEvent) => {
    setOverId(event.over?.id as string || null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    setOverId(null);

    if (active.id !== over?.id) {
      const oldIndex = notes.findIndex((n) => n.id === active.id);
      const newIndex = notes.findIndex((n) => n.id === over?.id);
      reorder(arrayMove(notes, oldIndex, newIndex));
    }
  };

  const handleAddNote = () => {
    if (!newText.trim()) return;
    
    startTransition(() => {
      addNote(newText.trim());
      setNewText('');
    });
  };

  const updateSettings = (newSettings: Partial<NotesSettings>) => {
    setSettings(prev => ({ ...prev, ...newSettings }));
  };

  return (
    <div className="relative w-full h-[calc(100vh-7.5rem)] flex flex-col lg:flex-row gap-4 lg:gap-6">
      {/* Main Content Area */}
      <div className="flex-1 flex flex-col space-y-4 lg:space-y-6 min-h-0">
        {/* Header with Add Note Form */}
        <motion.div
          className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-xl border border-gray-200/50 dark:border-gray-700/50 p-6 shadow-lg"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="flex flex-col space-y-4">
            <div className="flex items-center justify-between">
              <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-200">Notes</h1>
              <div className="flex gap-2">
                {/* Undo/Redo Controls */}
                <motion.button
                  onClick={undo}
                  disabled={!canUndo}
                  className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 
                             text-gray-700 dark:text-gray-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  whileHover={{ scale: canUndo ? 1.05 : 1 }}
                  whileTap={{ scale: canUndo ? 0.95 : 1 }}
                  title="Undo"
                >
                  ↶
                </motion.button>
                <motion.button
                  onClick={redo}
                  disabled={!canRedo}
                  className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 
                             text-gray-700 dark:text-gray-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  whileHover={{ scale: canRedo ? 1.05 : 1 }}
                  whileTap={{ scale: canRedo ? 0.95 : 1 }}
                  title="Redo"
                >
                  ↷
                </motion.button>
                <motion.button
                  onClick={() => setShowSettings(!showSettings)}
                  className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 
                             text-gray-700 dark:text-gray-300 transition-colors"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  title="Settings"
                >
                  ⚙️
                </motion.button>
              </div>
            </div>

            {/* Add Note Form */}
            <div className="flex gap-3">
              <textarea
                value={newText}
                onChange={(e) => setNewText(e.target.value)}
                placeholder="What's on your mind?"
                className="flex-1 p-4 rounded-lg border border-gray-300 dark:border-gray-600 
                           bg-white dark:bg-gray-700 text-gray-900 dark:text-white
                           placeholder-gray-500 dark:placeholder-gray-400
                           resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 transition-shadow"
                rows={3}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    handleAddNote();
                  }
                }}
              />
              <motion.button
                onClick={handleAddNote}
                className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors font-medium"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                disabled={!newText.trim()}
              >
                Add Note
              </motion.button>
            </div>

            {/* Search Bar */}
            <div className="relative">
                              <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search notes..."
                  className="w-full p-3 pl-10 rounded-lg border border-gray-300 dark:border-gray-600 
                             bg-white dark:bg-gray-700 text-gray-900 dark:text-white
                             placeholder-gray-500 dark:placeholder-gray-400
                             focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 transition-shadow"
                />
                              <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
          </div>
        </motion.div>

        {/* Notes Grid with Suspense */}
        <div className="flex-1 overflow-hidden">
          <Suspense fallback={
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(6)].map((_, i) => (
                <motion.div
                  key={i}
                  className="bg-white/60 rounded-xl h-48 animate-pulse"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.1 }}
                />
              ))}
            </div>
          }>
            <NotesGrid
              notesPromise={filteredNotesPromise}
              settings={settings}
              activeId={activeId}
              overId={overId}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragEnd={handleDragEnd}
              onUpdate={updateNote}
              onDelete={deleteNote}
              sensors={sensors}
            />
          </Suspense>
        </div>
      </div>

      {/* Sidebar - Responsive */}
      <div className="lg:w-80 space-y-4 lg:space-y-6 order-first lg:order-last">
        {/* Statistics Panel with Suspense */}
        <Suspense fallback={<StatsLoading />}>
          <StatsPanel statsPromise={statsPromise} />
        </Suspense>

        {/* Quick Actions - Mobile Optimized */}
        <motion.div
          className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-xl border border-gray-200/50 dark:border-gray-700/50 p-4 lg:p-6"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4">Quick Actions</h3>
          <div className="flex lg:flex-col gap-3">
            <motion.button
              onClick={() => console.log('Export notes')}
              className="flex-1 lg:w-full p-3 text-center lg:text-left text-blue-700 dark:text-blue-300
                         bg-gradient-to-r from-blue-50 to-blue-100 hover:from-blue-100 hover:to-blue-200 
                         dark:from-blue-900/30 dark:to-blue-800/30 dark:hover:from-blue-800/40 dark:hover:to-blue-700/40
                         rounded-lg transition-colors text-sm lg:text-base"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              📤 Export Notes
            </motion.button>
            <motion.button
              onClick={() => console.log('Clear all notes')}
              className="flex-1 lg:w-full p-3 text-center lg:text-left text-red-700 dark:text-red-300
                         bg-gradient-to-r from-red-50 to-red-100 hover:from-red-100 hover:to-red-200 
                         dark:from-red-900/30 dark:to-red-800/30 dark:hover:from-red-800/40 dark:hover:to-red-700/40
                         rounded-lg transition-colors text-sm lg:text-base"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              🗑️ Clear All
            </motion.button>
          </div>
        </motion.div>
      </div>

      {/* Settings Panel */}
      <AnimatePresence>
        <SettingsPanel
          settings={settings}
          onUpdate={updateSettings}
          isOpen={showSettings}
          onClose={() => setShowSettings(false)}
        />
      </AnimatePresence>
    </div>
  );
}

// Separate component for notes grid to work with Suspense
function NotesGrid({ 
  notesPromise, 
  settings, 
  activeId, 
  overId, 
  onDragStart, 
  onDragOver, 
  onDragEnd, 
  onUpdate, 
  onDelete,
  sensors 
}: {
  notesPromise: Promise<Note[]>;
  settings: NotesSettings;
  activeId: string | null;
  overId: string | null;
  onDragStart: (event: DragStartEvent) => void;
  onDragOver: (event: DragOverEvent) => void;
  onDragEnd: (event: DragEndEvent) => void;
  onUpdate: (id: string, text: string) => void;
  onDelete: (id: string) => void;
  sensors: ReturnType<typeof useSensors>;
}) {
  const notes = use(notesPromise);
  const activeNote = activeId ? notes.find(note => note.id === activeId) : null;

  const gridClass = {
    grid: 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4',
    list: 'flex flex-col gap-4',
    masonry: 'columns-1 md:columns-2 lg:columns-3 gap-4',
  }[settings.viewMode];

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
    >
      <SortableContext items={notes.map((n) => n.id)} strategy={verticalListSortingStrategy}>
        <motion.div 
          className={`${gridClass} h-full overflow-y-auto pb-6`}
          layout
        >
          <AnimatePresence mode="popLayout">
            {notes.map((note, index) => (
              <motion.div
                key={note.id}
                layout
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20, scale: 0.8 }}
                transition={{ 
                  duration: 0.3,
                  delay: index * 0.05,
                  layout: { duration: 0.2 }
                }}
                className={settings.viewMode === 'masonry' ? 'break-inside-avoid mb-4' : ''}
              >
                <SortableNote 
                  note={note}
                  isDragging={!!activeId}
                  isOver={overId === note.id}
                  onUpdate={onUpdate}
                  onDelete={onDelete}
                  viewMode={settings.viewMode}
                  showTimestamps={settings.showTimestamps}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      </SortableContext>

      <DragOverlay>
        {activeId && activeNote ? (
          <motion.div
            className="bg-white border-2 border-blue-400 p-4 rounded-xl shadow-2xl scale-105 rotate-2 opacity-90"
            initial={{ scale: 1, rotate: 0 }}
            animate={{ scale: 1.05, rotate: 2 }}
            transition={{ duration: 0.2 }}
          >
            <p className="text-gray-800 leading-relaxed whitespace-pre-wrap break-words">
              {activeNote.text}
            </p>
          </motion.div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
