import { BrowserRouter as Router, Routes, Route, NavLink, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import Now from './routes/Now';
import Next from './routes/Next';
import Notes from './routes/Notes';
import Focus from './routes/Focus';
import Canvas from './routes/Canvas';
import Video from './routes/Video';
import { useDarkMode } from './hooks/useDarkMode';
import { useEffect } from 'react';

export default function App() {
  const [darkMode, setDarkMode] = useDarkMode();

  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      root.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [darkMode]);

  return (
    <Router>
      <InnerApp darkMode={darkMode} setDarkMode={setDarkMode} />
    </Router>
  );
}

function InnerApp({
  darkMode,
  setDarkMode,
}: {
  darkMode: boolean;
  setDarkMode: (v: boolean) => void;
}) {
  const location = useLocation();

  return (
    <div className="min-h-screen transition-colors bg-white text-black dark:bg-gray-900 dark:text-white">
      {/* NAV */}
      <nav className="flex flex-wrap items-center justify-between gap-4 p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex gap-2 sm:gap-4">
          {['now', 'next', 'focus', 'canvas', 'notes', 'video'].map((path) => (
            <NavLink
              key={path}
              to={`/${path}`}
              className={({ isActive }) =>
                `px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-blue-600 text-white dark:bg-blue-500'
                    : 'text-blue-600 hover:bg-blue-100 dark:text-blue-300 dark:hover:bg-gray-800'
                }`
              }
            >
              {path.charAt(0).toUpperCase() + path.slice(1)}
            </NavLink>
          ))}
        </div>

        <button
          onClick={() => setDarkMode(!darkMode)}
          className="text-sm border px-3 py-2 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
        >
          {darkMode ? '☀️ Light Mode' : '🌙 Dark Mode'}
        </button>
      </nav>

      {/* ROUTES */}
      <main className="p-6">
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.25 }}
          >
            <Routes location={location} key={location.pathname}>
              <Route path="/" element={<Now />} />
              <Route path="/now" element={<Now />} />
              <Route path="/next" element={<Next />} />
              <Route path="/focus" element={<Focus />} />
              <Route path="/canvas" element={<Canvas />} />
              <Route path="/notes" element={<Notes />} />
              <Route path="/video" element={<Video />} />
              <Route path="*" element={<div>Pick a page</div>} />
            </Routes>
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
