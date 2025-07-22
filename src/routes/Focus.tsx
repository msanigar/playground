import { use, useEffect, useState, useRef, useMemo, Suspense } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useFocusStore, fetchFocusStats, FocusEventStream, type FocusStats } from '../state/focus';

// React 19 use() hook demonstration with server-like data fetching
function StatsPanel({ statsPromise }: { statsPromise: Promise<FocusStats> }) {
  // Using React 19's use() hook - this will suspend until the promise resolves
  const stats = use(statsPromise);
  
  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6"
    >
      <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow border border-gray-200 dark:border-gray-700">
        <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{stats.todaysSessions}</div>
        <div className="text-sm text-gray-500 dark:text-gray-400">Today's Sessions</div>
      </div>
      <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow border border-gray-200 dark:border-gray-700">
        <div className="text-2xl font-bold text-green-600 dark:text-green-400">{stats.totalSessions}</div>
        <div className="text-sm text-gray-500 dark:text-gray-400">Total Sessions</div>
      </div>
      <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow border border-gray-200 dark:border-gray-700">
        <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">{formatTime(stats.totalFocusTime)}</div>
        <div className="text-sm text-gray-500 dark:text-gray-400">Total Focus Time</div>
      </div>
      <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow border border-gray-200 dark:border-gray-700">
        <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">{stats.currentStreak}</div>
        <div className="text-sm text-gray-500 dark:text-gray-400">Day Streak</div>
      </div>
    </motion.div>
  );
}

// Loading component for Suspense fallback
function StatsLoading() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {[...Array(4)].map((_, i) => (
        <motion.div
          key={i}
          className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow border border-gray-200 dark:border-gray-700"
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 1.5, repeat: Infinity }}
        >
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded mb-2"></div>
          <div className="h-4 bg-gray-100 dark:bg-gray-600 rounded"></div>
        </motion.div>
      ))}
    </div>
  );
}

// Timer Circle Component with advanced animations
function TimerCircle({ timeLeft, totalTime, isRunning }: { timeLeft: number; totalTime: number; isRunning: boolean }) {
  const radius = 120;
  const circumference = 2 * Math.PI * radius;
  const progress = (totalTime - timeLeft) / totalTime;
  const strokeDashoffset = circumference - (progress * circumference);

  return (
    <div className="relative w-64 h-64 mx-auto">
      <motion.svg
        width="256"
        height="256"
        className="transform -rotate-90"
        animate={{ scale: isRunning ? 1.05 : 1 }}
        transition={{ duration: 0.3 }}
      >
        {/* Background circle */}
        <circle
          cx="128"
          cy="128"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="8"
          className="text-gray-200 dark:text-gray-700"
        />
        {/* Progress circle */}
        <motion.circle
          cx="128"
          cy="128"
          r={radius}
          fill="none"
          strokeWidth="8"
          strokeLinecap="round"
          className="text-blue-500"
          style={{
            strokeDasharray: circumference,
            strokeDashoffset,
          }}
          animate={{
            stroke: isRunning 
              ? ["#3b82f6", "#6366f1", "#8b5cf6", "#3b82f6"] 
              : "#3b82f6"
          }}
          transition={{ 
            duration: 4,
            repeat: isRunning ? Infinity : 0,
            ease: "linear"
          }}
        />
      </motion.svg>
      
      {/* Timer display */}
      <div className="absolute inset-0 flex items-center justify-center">
        <motion.div
          className="text-center"
          animate={{ scale: isRunning ? [1, 1.1, 1] : 1 }}
          transition={{ duration: 1, repeat: isRunning ? Infinity : 0 }}
        >
          <div className="text-4xl font-mono font-bold text-gray-900 dark:text-white">
            {Math.floor(timeLeft / 60).toString().padStart(2, '0')}:
            {(timeLeft % 60).toString().padStart(2, '0')}
          </div>
          <div className="text-sm text-gray-500 dark:text-gray-400 mt-2">
            {isRunning ? 'Focus Time' : 'Ready to Focus'}
          </div>
        </motion.div>
      </div>
    </div>
  );
}

// Real-time activity component using server-sent events simulation
function LiveActivity() {
  const [liveData, setLiveData] = useState<{ activeUsers: number; globalSessions: number } | null>(null);
  const eventStreamRef = useRef<FocusEventStream | null>(null);

  useEffect(() => {
    eventStreamRef.current = new FocusEventStream();
    const unsubscribe = eventStreamRef.current.subscribe((data) => {
      setLiveData({ activeUsers: data.activeUsers, globalSessions: data.globalSessions });
    });

    return unsubscribe;
  }, []);

  if (!liveData) {
    return (
      <motion.div
        className="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 p-4 rounded-lg border border-blue-200 dark:border-blue-800"
        animate={{ opacity: [0.5, 1, 0.5] }}
        transition={{ duration: 2, repeat: Infinity }}
      >
        <div className="text-sm text-blue-600 dark:text-blue-400">🌐 Connecting to live activity...</div>
      </motion.div>
    );
  }

  return (
    <motion.div
      key={liveData.activeUsers} // Re-animate when data changes
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      className="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 p-4 rounded-lg border border-blue-200 dark:border-blue-800"
    >
      <div className="flex items-center gap-3">
        <motion.div
          className="w-3 h-3 bg-green-500 rounded-full"
          animate={{ scale: [1, 1.2, 1] }}
          transition={{ duration: 2, repeat: Infinity }}
        />
        <div className="text-sm text-blue-600 dark:text-blue-400">
          🌐 <strong>{liveData.activeUsers}</strong> people focusing now • 
          <strong> {liveData.globalSessions}</strong> sessions today
        </div>
      </div>
    </motion.div>
  );
}

export default function Focus() {
  const { timer, startSession, pauseTimer, resumeTimer, stopTimer, settings, updateSettings } = useFocusStore();
  const [currentSessionType, setCurrentSessionType] = useState<'focus' | 'break' | 'long-break'>('focus');
  
  // Create a stable promise for the stats - this demonstrates React 19's use() hook pattern
  const statsPromise = useMemo(() => fetchFocusStats(), []);

  // Timer tick effect
  useEffect(() => {
    if (!timer.isRunning) return;
    
    const interval = setInterval(() => {
      useFocusStore.getState().tick();
    }, 1000);
    
    return () => clearInterval(interval);
  }, [timer.isRunning]);

  // Broadcast Channel for cross-tab sync (React 19 concurrent features work great with this)
  useEffect(() => {
    if (typeof window === 'undefined' || !('BroadcastChannel' in window)) return;

    const channel = new BroadcastChannel('focus-timer');
    
    channel.onmessage = (event) => {
      if (event.data.type === 'session-completed') {
        // Could trigger a celebration animation or update UI
        console.log('Session completed in another tab!', event.data.session);
      }
    };

    return () => channel.close();
  }, []);

  const formatTime = (seconds: number) => {
    return `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, '0')}`;
  };

  const nextSessionType = useMemo(() => {
    if (currentSessionType === 'focus') {
      return timer.currentCycle % settings.longBreakInterval === 0 ? 'long-break' : 'break';
    }
    return 'focus';
  }, [currentSessionType, timer.currentCycle, settings.longBreakInterval]);

  const handleStartSession = () => {
    startSession(currentSessionType);
  };

  const handleCompleteSession = () => {
    stopTimer();
    setCurrentSessionType(nextSessionType);
  };

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center"
      >
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
          Focus Timer
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          Boost your productivity with the Pomodoro Technique
        </p>
      </motion.div>

      {/* Live Activity - Server-sent events simulation */}
      <LiveActivity />

      {/* Stats Panel using React 19's use() hook */}
      <Suspense fallback={<StatsLoading />}>
        <StatsPanel statsPromise={statsPromise} />
      </Suspense>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-8">
        {/* Main Timer */}
        <div className="xl:col-span-3">
          <motion.div
            className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-6"
            layout
          >
            <div className="text-center mb-6">
              <motion.h2
                className="text-2xl font-semibold mb-2"
                animate={{ color: timer.isRunning ? '#3b82f6' : '#6b7280' }}
              >
                {currentSessionType === 'focus' ? '🎯 Focus Session' : 
                 currentSessionType === 'break' ? '☕ Short Break' : 
                 '🛋️ Long Break'}
              </motion.h2>
              <p className="text-gray-500 dark:text-gray-400">
                Session {timer.currentCycle} • Next: {nextSessionType === 'focus' ? 'Focus' : 'Break'}
              </p>
            </div>

            <TimerCircle 
              timeLeft={timer.timeLeft} 
              totalTime={timer.currentSession?.duration || settings.focusDuration}
              isRunning={timer.isRunning}
            />

            {/* Controls */}
            <div className="flex justify-center gap-4 mt-6">
              <AnimatePresence mode="wait">
                {!timer.isRunning && !timer.isPaused && (
                  <motion.button
                    key="start"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    onClick={handleStartSession}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-lg font-medium transition-colors shadow-lg"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    Start {currentSessionType === 'focus' ? 'Focus' : 'Break'}
                  </motion.button>
                )}
                
                {timer.isRunning && (
                  <motion.button
                    key="pause"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    onClick={pauseTimer}
                    className="bg-yellow-500 hover:bg-yellow-600 text-white px-8 py-3 rounded-lg font-medium transition-colors shadow-lg"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    Pause
                  </motion.button>
                )}
                
                {timer.isPaused && (
                  <motion.button
                    key="resume"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    onClick={resumeTimer}
                    className="bg-green-600 hover:bg-green-700 text-white px-8 py-3 rounded-lg font-medium transition-colors shadow-lg"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    Resume
                  </motion.button>
                )}
              </AnimatePresence>
              
              {(timer.isRunning || timer.isPaused) && (
                <motion.button
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  onClick={stopTimer}
                  className="bg-red-500 hover:bg-red-600 text-white px-6 py-3 rounded-lg font-medium transition-colors shadow-lg"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  Stop
                </motion.button>
              )}
              
              {timer.timeLeft === 0 && timer.currentSession && (
                <motion.button
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  onClick={handleCompleteSession}
                  className="bg-green-600 hover:bg-green-700 text-white px-8 py-3 rounded-lg font-medium transition-colors shadow-lg"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  Complete & Next
                </motion.button>
              )}
            </div>
          </motion.div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Session Type Selector */}
          <motion.div
            className="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700 p-6"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            layout
          >
            <h3 className="text-lg font-semibold mb-4">Quick Start</h3>
            <div className="space-y-3">
              {(['focus', 'break', 'long-break'] as const).map((type) => (
                <motion.button
                  key={type}
                  onClick={() => setCurrentSessionType(type)}
                  className={`w-full p-4 rounded-lg border-2 transition-colors text-left ${
                    currentSessionType === type
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                  }`}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium text-lg">
                        {type === 'focus' ? '🎯 Focus' : 
                         type === 'break' ? '☕ Break' : 
                         '🛋️ Long Break'}
                      </div>
                      <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                        {formatTime(
                          type === 'focus' ? settings.focusDuration :
                          type === 'break' ? settings.shortBreakDuration :
                          settings.longBreakDuration
                        )}
                      </div>
                    </div>
                    {currentSessionType === type && (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="text-blue-500"
                      >
                        ✓
                      </motion.div>
                    )}
                  </div>
                </motion.button>
              ))}
            </div>
          </motion.div>

          {/* Settings Panel */}
          <motion.div
            className="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700 p-6"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
          >
            <h3 className="text-lg font-semibold mb-4">Settings</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Focus Duration: {Math.floor(settings.focusDuration / 60)}m
                </label>
                <input
                  type="range"
                  min="300" // 5 minutes
                  max="3600" // 60 minutes
                  step="300" // 5 minute increments
                  value={settings.focusDuration}
                  onChange={(e) => updateSettings({ focusDuration: Number(e.target.value) })}
                  className="w-full"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Short Break: {Math.floor(settings.shortBreakDuration / 60)}m
                </label>
                <input
                  type="range"
                  min="60" // 1 minute
                  max="900" // 15 minutes
                  step="60" // 1 minute increments
                  value={settings.shortBreakDuration}
                  onChange={(e) => updateSettings({ shortBreakDuration: Number(e.target.value) })}
                  className="w-full"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Long Break: {Math.floor(settings.longBreakDuration / 60)}m
                </label>
                <input
                  type="range"
                  min="900" // 15 minutes
                  max="1800" // 30 minutes
                  step="300" // 5 minute increments
                  value={settings.longBreakDuration}
                  onChange={(e) => updateSettings({ longBreakDuration: Number(e.target.value) })}
                  className="w-full"
                />
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
} 