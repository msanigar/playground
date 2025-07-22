import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Note = {
  id: string;
  text: string;
  createdAt: number;
};

type NotesStore = {
  notes: Note[];
  history: Note[][];
  future: Note[][];
  addNote: (text: string) => void;
  updateNote: (id: string, text: string) => void;
  deleteNote: (id: string) => void;
  reorderNotes: (newOrder: Note[]) => void;
  undo: () => void;
  redo: () => void;
  clearNotes: () => void;
  pushHistory: () => void;
};

export const useNotesStore = create<NotesStore>()(
  persist(
    (set, get) => ({
      notes: [],
      history: [],
      future: [],

      pushHistory() {
        const { notes, history } = get();
        set({ history: [...history, notes], future: [] });
      },

      addNote: (text) => {
        get().pushHistory();
        const newNote: Note = {
          id: crypto.randomUUID(),
          text,
          createdAt: Date.now(),
        };
        set((s) => ({ notes: [newNote, ...s.notes] }));
      },

      updateNote: (id, text) => {
        get().pushHistory();
        set((s) => ({
          notes: s.notes.map((n) => (n.id === id ? { ...n, text } : n)),
        }));
      },

      deleteNote: (id) => {
        get().pushHistory();
        set((s) => ({
          notes: s.notes.filter((n) => n.id !== id),
        }));
      },

      reorderNotes: (newOrder) => {
        get().pushHistory();
        set({ notes: newOrder });
      },

      undo: () => {
        const { history, notes, future } = get();
        if (history.length === 0) return;
        const prev = history[history.length - 1];
        set({
          notes: prev,
          history: history.slice(0, -1),
          future: [notes, ...future],
        });
      },

      redo: () => {
        const { future, history, notes } = get();
        if (future.length === 0) return;
        const next = future[0];
        set({
          notes: next,
          future: future.slice(1),
          history: [...history, notes],
        });
      },

      clearNotes: () => {
        get().pushHistory();
        set({ notes: [] });
      },
    }),
    {
      name: 'keep-notes',
      partialize: (state) => ({ notes: state.notes }),
    },
  ),
);
