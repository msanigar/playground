import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type FocusSession = {
  id: string;
  type: 'focus' | 'break' | 'long-break';
  duration: number; // in seconds
  completed: boolean;
  startedAt: number;
  completedAt?: number;
};

export type TimerState = {
  isRunning: boolean;
  isPaused: boolean;
  timeLeft: number; // in seconds
  currentSession: FocusSession | null;
  currentCycle: number; // Track which pomodoro cycle we're on
};

export type FocusStats = {
  totalSessions: number;
  totalFocusTime: number; // in seconds
  todaysSessions: number;
  currentStreak: number;
};

// Simulated server data fetching with async/await patterns for use() hook
export async function fetchFocusStats(): Promise<FocusStats> {
  // Simulate network delay and server processing
  await new Promise(resolve => setTimeout(resolve, Math.random() * 1000 + 500));
  
  const sessions = JSON.parse(localStorage.getItem('focus-sessions') || '[]') as FocusSession[];
  const today = new Date().toDateString();
  
  const todaysSessions = sessions.filter(session => 
    session.completed && new Date(session.startedAt).toDateString() === today
  );
  
  const totalFocusTime = sessions
    .filter(s => s.completed && s.type === 'focus')
    .reduce((acc, s) => acc + s.duration, 0);
  
  return {
    totalSessions: sessions.filter(s => s.completed && s.type === 'focus').length,
    totalFocusTime,
    todaysSessions: todaysSessions.filter(s => s.type === 'focus').length,
    currentStreak: calculateStreak(sessions),
  };
}

function calculateStreak(sessions: FocusSession[]): number {
  const focusSessions = sessions
    .filter(s => s.completed && s.type === 'focus')
    .sort((a, b) => b.completedAt! - a.completedAt!);
  
  let streak = 0;
  let currentDate = new Date().toDateString();
  
  for (const session of focusSessions) {
    const sessionDate = new Date(session.completedAt!).toDateString();
    if (sessionDate === currentDate) {
      streak++;
      // Move to previous day
      const date = new Date(currentDate);
      date.setDate(date.getDate() - 1);
      currentDate = date.toDateString();
    } else {
      break;
    }
  }
  
  return streak;
}

// Server-sent events simulation for real-time updates
export class FocusEventStream {
  private eventSource: EventTarget;
  private interval: number | null = null;
  
  constructor() {
    this.eventSource = new EventTarget();
  }
  
  subscribe(callback: (data: { timestamp: number; activeUsers: number; globalSessions: number }) => void) {
    const handler = (event: Event) => {
      const customEvent = event as CustomEvent<{ timestamp: number; activeUsers: number; globalSessions: number }>;
      callback(customEvent.detail);
    };
    this.eventSource.addEventListener('focus-update', handler);
    
    // Simulate server-sent events
    this.interval = window.setInterval(() => {
      this.eventSource.dispatchEvent(new CustomEvent('focus-update', {
        detail: {
          timestamp: Date.now(),
          activeUsers: Math.floor(Math.random() * 50) + 10,
          globalSessions: Math.floor(Math.random() * 1000) + 500,
        }
      }));
    }, 5000);
    
    return () => {
      this.eventSource.removeEventListener('focus-update', handler);
      if (this.interval) {
        window.clearInterval(this.interval);
      }
    };
  }
}

type FocusStore = {
  sessions: FocusSession[];
  timer: TimerState;
  settings: {
    focusDuration: number; // 25 minutes default
    shortBreakDuration: number; // 5 minutes default
    longBreakDuration: number; // 15 minutes default
    longBreakInterval: number; // every 4 cycles
  };
  
  // Actions
  startSession: (type: FocusSession['type']) => void;
  pauseTimer: () => void;
  resumeTimer: () => void;
  stopTimer: () => void;
  completeSession: () => void;
  tick: () => void;
  updateSettings: (settings: Partial<FocusStore['settings']>) => void;
  
  // React 19 optimistic updates support
  optimisticSession: FocusSession | null;
  addOptimisticSession: (session: FocusSession) => void;
  clearOptimisticSession: () => void;
};

export const useFocusStore = create<FocusStore>()(
  persist(
    (set, get) => ({
      sessions: [],
      timer: {
        isRunning: false,
        isPaused: false,
        timeLeft: 25 * 60, // 25 minutes in seconds
        currentSession: null,
        currentCycle: 0,
      },
      settings: {
        focusDuration: 25 * 60,
        shortBreakDuration: 5 * 60,
        longBreakDuration: 15 * 60,
        longBreakInterval: 4,
      },
      optimisticSession: null,

      startSession: (type) => {
        const { settings, timer } = get();
        let duration: number;
        
        switch (type) {
          case 'focus':
            duration = settings.focusDuration;
            break;
          case 'break':
            duration = settings.shortBreakDuration;
            break;
          case 'long-break':
            duration = settings.longBreakDuration;
            break;
        }
        
        const session: FocusSession = {
          id: crypto.randomUUID(),
          type,
          duration,
          completed: false,
          startedAt: Date.now(),
        };
        
        set({
          timer: {
            ...timer,
            isRunning: true,
            isPaused: false,
            timeLeft: duration,
            currentSession: session,
            currentCycle: type === 'focus' ? timer.currentCycle + 1 : timer.currentCycle,
          }
        });
        
        // Broadcast to other tabs
        if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
          const channel = new BroadcastChannel('focus-timer');
          channel.postMessage({ type: 'session-started', session });
        }
      },

      pauseTimer: () => {
        set((state) => ({
          timer: { ...state.timer, isRunning: false, isPaused: true }
        }));
      },

      resumeTimer: () => {
        set((state) => ({
          timer: { ...state.timer, isRunning: true, isPaused: false }
        }));
      },

      stopTimer: () => {
        set((state) => ({
          timer: {
            ...state.timer,
            isRunning: false,
            isPaused: false,
            currentSession: null,
            timeLeft: state.settings.focusDuration,
          }
        }));
      },

      completeSession: () => {
        const { timer, sessions } = get();
        if (!timer.currentSession) return;
        
        const completedSession: FocusSession = {
          ...timer.currentSession,
          completed: true,
          completedAt: Date.now(),
        };
        
        set((state) => ({
          sessions: [...state.sessions, completedSession],
          timer: {
            ...state.timer,
            isRunning: false,
            isPaused: false,
            currentSession: null,
            timeLeft: state.settings.focusDuration,
          }
        }));
        
        // Persist to localStorage for stats
        const allSessions = [...sessions, completedSession];
        localStorage.setItem('focus-sessions', JSON.stringify(allSessions));
        
        // Broadcast completion
        if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
          const channel = new BroadcastChannel('focus-timer');
          channel.postMessage({ type: 'session-completed', session: completedSession });
        }
      },

      tick: () => {
        set((state) => {
          if (!state.timer.isRunning || state.timer.timeLeft <= 0) {
            return state;
          }
          
          const newTimeLeft = state.timer.timeLeft - 1;
          
          // Auto-complete when timer reaches 0
          if (newTimeLeft === 0) {
            const completedSession: FocusSession = {
              ...state.timer.currentSession!,
              completed: true,
              completedAt: Date.now(),
            };
            
            return {
              ...state,
              sessions: [...state.sessions, completedSession],
              timer: {
                ...state.timer,
                isRunning: false,
                isPaused: false,
                currentSession: null,
                timeLeft: state.settings.focusDuration,
              }
            };
          }
          
          return {
            ...state,
            timer: { ...state.timer, timeLeft: newTimeLeft }
          };
        });
      },

      updateSettings: (newSettings) => {
        set((state) => ({
          settings: { ...state.settings, ...newSettings }
        }));
      },

      addOptimisticSession: (session) => {
        set({ optimisticSession: session });
      },

      clearOptimisticSession: () => {
        set({ optimisticSession: null });
      },
    }),
    {
      name: 'focus-store',
      partialize: (state) => ({ 
        sessions: state.sessions, 
        settings: state.settings,
        timer: {
          ...state.timer,
          isRunning: false,
          isPaused: false,
          currentSession: null,
        }
      }),
    }
  )
); 