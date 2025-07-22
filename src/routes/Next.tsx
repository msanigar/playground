// src/routes/Next.tsx
import { useState, useMemo } from 'react';
import { useEventStore, type Event } from '../state/events';
import { Dialog } from '@headlessui/react';
import { motion, AnimatePresence } from 'framer-motion';

// Enhanced event item with inline editing
function EventItem({ event, onUpdate, onToggle, onDelete }: { 
  event: Event; 
  onUpdate: (id: string, field: string, value: string) => void;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(event.title);
  const [editDate, setEditDate] = useState(event.date);
  const [editTime, setEditTime] = useState(event.time === '--:--' ? '' : event.time);

  const handleSave = () => {
    onUpdate(event.id, 'title', editTitle);
    onUpdate(event.id, 'date', editDate);
    onUpdate(event.id, 'time', editTime || '--:--');
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditTitle(event.title);
    setEditDate(event.date);
    setEditTime(event.time === '--:--' ? '' : event.time);
    setIsEditing(false);
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    
    if (date.toDateString() === today.toDateString()) return 'Today';
    if (date.toDateString() === tomorrow.toDateString()) return 'Tomorrow';
    
    const isThisYear = date.getFullYear() === today.getFullYear();
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: isThisYear ? undefined : 'numeric'
    });
  };

  const timeUntil = useMemo(() => {
    const eventDate = new Date(`${event.date}T${event.time === '--:--' ? '00:00' : event.time}`);
    const now = new Date();
    const diff = eventDate.getTime() - now.getTime();
    
    if (diff < 0) return 'Past';
    
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    
    if (days > 0) return `${days}d`;
    if (hours > 0) return `${hours}h`;
    return 'Soon';
  }, [event.date, event.time]);

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className={`group p-4 rounded-lg border transition-all duration-200 ${
        event.completed 
          ? 'bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700 opacity-60' 
          : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-600'
      }`}
      whileHover={{ scale: isEditing ? 1 : 1.01 }}
    >
      {isEditing ? (
        <div className="space-y-3">
          <input
            type="text"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            className="w-full px-3 py-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            placeholder="Event title"
            autoFocus
          />
          <div className="flex gap-2">
            <input
              type="date"
              value={editDate}
              onChange={(e) => setEditDate(e.target.value)}
              className="flex-1 px-3 py-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
            <input
              type="time"
              value={editTime}
              onChange={(e) => setEditTime(e.target.value)}
              className="flex-1 px-3 py-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              placeholder="Optional"
            />
          </div>
          <div className="flex gap-2">
            <motion.button
              onClick={handleSave}
              className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              Save
            </motion.button>
            <motion.button
              onClick={handleCancel}
              className="px-3 py-1 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded text-sm hover:bg-gray-300 dark:hover:bg-gray-600"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              Cancel
            </motion.button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3">
              <motion.button
                onClick={() => onToggle(event.id)}
                className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                  event.completed
                    ? 'bg-green-500 border-green-500 text-white'
                    : 'border-gray-300 dark:border-gray-600 hover:border-green-500'
                }`}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
              >
                {event.completed && <span className="text-xs">✓</span>}
              </motion.button>
              
              <div className="flex-1 min-w-0">
                <h3 className={`font-medium truncate ${
                  event.completed 
                    ? 'text-gray-500 dark:text-gray-400 line-through' 
                    : 'text-gray-900 dark:text-gray-100'
                }`}>
                  {event.title}
                </h3>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    {formatDate(event.date)}
                  </span>
                  {event.time !== '--:--' && (
                    <>
                      <span className="text-gray-300 dark:text-gray-600">•</span>
                      <span className="text-sm text-gray-500 dark:text-gray-400">
                        {event.time}
                      </span>
                    </>
                  )}
                  {!event.completed && (
                    <>
                      <span className="text-gray-300 dark:text-gray-600">•</span>
                      <span className={`text-xs px-2 py-1 rounded-full ${
                        timeUntil === 'Past' ? 'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400' :
                        timeUntil === 'Soon' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400' :
                        'bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400'
                      }`}>
                        {timeUntil}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <motion.button
              onClick={() => setIsEditing(true)}
              className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              title="Edit"
            >
              ✏️
            </motion.button>
            <motion.button
              onClick={() => onDelete(event.id)}
              className="p-2 text-gray-400 hover:text-red-600"
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              title="Delete"
            >
              🗑️
            </motion.button>
          </div>
        </div>
      )}
    </motion.li>
  );
}

// Quick date selector component
function QuickDateSelector({ onDateSelect }: { onDateSelect: (date: string) => void }) {
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const nextWeek = new Date(today);
  nextWeek.setDate(today.getDate() + 7);

  const quickDates = [
    { label: 'Today', date: today.toISOString().split('T')[0], icon: '📅' },
    { label: 'Tomorrow', date: tomorrow.toISOString().split('T')[0], icon: '⏰' },
    { label: 'Next Week', date: nextWeek.toISOString().split('T')[0], icon: '📈' },
  ];

  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">Quick Add</h4>
      <div className="space-y-1">
        {quickDates.map(({ label, date, icon }) => (
          <motion.button
            key={label}
            onClick={() => onDateSelect(date)}
            className="w-full flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50 hover:bg-blue-50 dark:hover:bg-blue-900/20 text-left transition-colors"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <span className="text-lg">{icon}</span>
            <div>
              <div className="font-medium text-sm text-gray-900 dark:text-gray-100">{label}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">{date}</div>
            </div>
          </motion.button>
        ))}
      </div>
    </div>
  );
}

export default function Next() {
  const { events, addEvent, updateEvent, toggleEvent, deleteEvent } = useEventStore();
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<'all' | 'pending' | 'completed'>('all');

  const handleUpdateEvent = (id: string, field: string, value: string) => {
    updateEvent(id, { [field]: value });
  };

  const handleQuickAdd = (selectedDate: string) => {
    setDate(selectedDate);
    setOpen(true);
  };

  const sortedEvents = useMemo(() => {
    let filtered = events;
    
    if (filter === 'pending') {
      filtered = events.filter(e => !e.completed);
    } else if (filter === 'completed') {
      filtered = events.filter(e => e.completed);
    }
    
    return [...filtered].sort((a, b) => {
      const aTime = a.time === '--:--' ? '00:00' : a.time;
      const bTime = b.time === '--:--' ? '00:00' : b.time;
      return new Date(`${a.date}T${aTime}`).getTime() - new Date(`${b.date}T${bTime}`).getTime();
    });
  }, [events, filter]);

  const stats = useMemo(() => {
    const total = events.length;
    const completed = events.filter(e => e.completed).length;
    const pending = total - completed;
    const today = new Date().toISOString().split('T')[0];
    const todayEvents = events.filter(e => e.date === today).length;
    
    return { total, completed, pending, todayEvents };
  }, [events]);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center"
      >
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
          Upcoming Events
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          Plan and track your upcoming events and tasks
        </p>
      </motion.div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        {/* Main Events List */}
        <div className="xl:col-span-3 space-y-4">
          {/* Filter Tabs */}
          <div className="flex items-center justify-between">
            <div className="flex gap-1 p-1 bg-gray-100 dark:bg-gray-800 rounded-lg">
              {(['all', 'pending', 'completed'] as const).map((f) => (
                <motion.button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    filter === f
                      ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                  }`}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                  {f === 'all' && <span className="ml-2 text-xs">({stats.total})</span>}
                  {f === 'pending' && <span className="ml-2 text-xs">({stats.pending})</span>}
                  {f === 'completed' && <span className="ml-2 text-xs">({stats.completed})</span>}
                </motion.button>
              ))}
            </div>
            
            <motion.button
              onClick={() => setOpen(true)}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg shadow hover:bg-blue-700 transition-colors"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              + Add Event
            </motion.button>
          </div>

          {/* Events List */}
          <motion.div
            className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            {sortedEvents.length > 0 ? (
              <ul className="divide-y divide-gray-200 dark:divide-gray-700">
                <AnimatePresence>
                  {sortedEvents.map((event) => (
                    <EventItem
                      key={event.id}
                      event={event}
                      onUpdate={handleUpdateEvent}
                      onToggle={toggleEvent}
                      onDelete={deleteEvent}
                    />
                  ))}
                </AnimatePresence>
              </ul>
            ) : (
              <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                <div className="text-4xl mb-2">📅</div>
                <p>No events found</p>
                <p className="text-sm mt-1">Add your first event to get started!</p>
              </div>
            )}
          </motion.div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Stats Panel */}
          <motion.div
            className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
          >
            <h3 className="text-lg font-semibold mb-4">Overview</h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-gray-600 dark:text-gray-400">Total Events</span>
                <span className="font-semibold text-lg">{stats.total}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600 dark:text-gray-400">Pending</span>
                <span className="font-semibold text-lg text-orange-600 dark:text-orange-400">{stats.pending}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600 dark:text-gray-400">Completed</span>
                <span className="font-semibold text-lg text-green-600 dark:text-green-400">{stats.completed}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600 dark:text-gray-400">Today</span>
                <span className="font-semibold text-lg text-blue-600 dark:text-blue-400">{stats.todayEvents}</span>
              </div>
            </div>
          </motion.div>

          {/* Quick Date Selector */}
          <motion.div
            className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
          >
            <QuickDateSelector onDateSelect={handleQuickAdd} />
          </motion.div>
        </div>
      </div>

      {/* Add Event Modal */}
      <Dialog open={open} onClose={() => setOpen(false)} className="relative z-50">
        <motion.div 
          className="fixed inset-0 bg-black/50" 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <Dialog.Panel 
            as={motion.div}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="bg-white dark:bg-gray-900 rounded-lg p-6 w-full max-w-md shadow-xl border border-gray-300 dark:border-gray-700"
          >
            <Dialog.Title className="text-lg font-bold mb-4 dark:text-white">
              Add New Event
            </Dialog.Title>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!title || !date) return;
                addEvent(title, date, time || '--:--');
                setTitle('');
                setDate('');
                setTime('');
                setOpen(false);
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Event Title
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="What's happening?"
                  className="w-full px-3 py-2 rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Date
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full px-3 py-2 rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Time (Optional)
                </label>
                <input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="w-full px-3 py-2 rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                />
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <motion.button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="px-4 py-2 rounded bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  Cancel
                </motion.button>
                <motion.button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={!title || !date}
                  whileHover={{ scale: title && date ? 1.02 : 1 }}
                  whileTap={{ scale: title && date ? 0.98 : 1 }}
                >
                  Add Event
                </motion.button>
              </div>
            </form>
          </Dialog.Panel>
        </div>
      </Dialog>
    </div>
  );
}
