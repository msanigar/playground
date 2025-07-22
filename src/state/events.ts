// src/state/events.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Event = {
  id: string;
  title: string;
  date: string;
  time: string;
  completed: boolean;
};

type EventStore = {
  events: Event[];
  addEvent: (title: string, date: string, time: string) => void;
  updateEvent: (id: string, updates: Partial<Event>) => void;
  toggleEvent: (id: string) => void;
  deleteEvent: (id: string) => void;
};

export const useEventStore = create<EventStore>()(
  persist(
    (set) => ({
      events: [],
      addEvent: (title, date, time: string = '--:--') =>
        set((state) => ({
          events: [
            ...state.events,
            { id: crypto.randomUUID(), title, date, time, completed: false },
          ],
        })),
      updateEvent: (id, updates) =>
        set((state) => ({
          events: state.events.map((e) => (e.id === id ? { ...e, ...updates } : e)),
        })),
      toggleEvent: (id) =>
        set((state) => ({
          events: state.events.map((e) => (e.id === id ? { ...e, completed: !e.completed } : e)),
        })),
      deleteEvent: (id) =>
        set((state) => ({
          events: state.events.filter((e) => e.id !== id),
        })),
    }),
    { name: 'events-storage' },
  ),
);
