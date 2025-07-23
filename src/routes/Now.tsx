import { use, useEffect, useState, Suspense, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';

// Types for our data
type BackgroundData = {
  url: string;
  photographer: string;
  location: string;
};

type QuoteData = {
  text: string;
  author: string;
};

type WeatherData = {
  temperature: number;
  windspeed: number;
  condition: string;
  location: string;
};

type NowSettings = {
  showWeather: boolean;
  showQuote: boolean;
  autoRefresh: boolean;
  refreshInterval: number; // in minutes
  backgroundSource: 'unsplash' | 'local';
  quoteSource: 'zenquotes' | 'local';
};

// React 19 use() hook compatible data fetchers
async function fetchBackgroundImage(): Promise<BackgroundData> {
  const cached = localStorage.getItem('bg_cache');
  const cacheDate = localStorage.getItem('bg_cache_date');
  const today = new Date().toISOString().slice(0, 10);

  // Simulate network delay for demo
  await new Promise(resolve => setTimeout(resolve, Math.random() * 1000 + 500));

  if (cached && cacheDate === today) {
    try {
      return JSON.parse(cached);
    } catch {
      // Clear invalid cache
      localStorage.removeItem('bg_cache');
      localStorage.removeItem('bg_cache_date');
    }
  }

  try {
    const response = await axios.get('https://api.unsplash.com/photos/random', {
      params: {
        query: 'landscape,nature,mountain,ocean',
        orientation: 'landscape',
      },
      headers: {
        Authorization: `Client-ID ${import.meta.env.VITE_UNSPLASH_KEY}`,
      },
    });

    const backgroundData: BackgroundData = {
      url: response.data.urls.full,
      photographer: response.data.user.name,
      location: response.data.location?.name || 'Unknown',
    };

    localStorage.setItem('bg_cache', JSON.stringify(backgroundData));
    localStorage.setItem('bg_cache_date', today);
    
    return backgroundData;
  } catch {
    // Fallback background
    const fallback: BackgroundData = {
      url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?ixlib=rb-4.0.3&auto=format&fit=crop&w=2070&q=80',
      photographer: 'Fallback',
      location: 'Default',
    };
    return fallback;
  }
}

async function fetchDailyQuote(): Promise<QuoteData> {
  const cached = localStorage.getItem('quote_cache');
  const cachedAuthor = localStorage.getItem('quote_cache_author');
  const cacheDate = localStorage.getItem('quote_cache_date');
  const today = new Date().toISOString().slice(0, 10);

  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, Math.random() * 800 + 300));

  if (cached && cachedAuthor && cacheDate === today) {
    return { text: cached, author: cachedAuthor };
  }

  // Try multiple quote APIs with better error handling
  const quoteSources = [
    // ZenQuotes API - reliable alternative
    async () => {
      const response = await axios.get('https://zenquotes.io/api/random', {
        timeout: 8000
      });
      const data = response.data[0];
      return {
        text: data.q,
        author: data.a === 'zenquotes.io' ? 'Unknown' : data.a
      };
    },
    // Quotable API as backup (if certificate issues are resolved)
    async () => {
      const response = await axios.get('https://api.quotable.io/random', {
        params: {
          minLength: 50,
          maxLength: 200
        },
        timeout: 8000
      });
      return {
        text: response.data.content,
        author: response.data.author
      };
    }
  ];

  // Try each API source
  for (const [index, fetchSource] of quoteSources.entries()) {
    try {
      const quoteData = await fetchSource();
      
      if (quoteData.text && quoteData.author) {
        localStorage.setItem('quote_cache', quoteData.text);
        localStorage.setItem('quote_cache_author', quoteData.author);
        localStorage.setItem('quote_cache_date', today);
        return quoteData;
      }
    } catch (error) {
      // Only log the first API failure to reduce console spam
      if (index === 0) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.warn('Quote API failed, trying alternatives...', errorMessage);
      }
      continue; // Try next API
    }
  }
  
  // All APIs failed, use local fallback quotes
  const fallbackQuotes = [
    { text: "The future belongs to those who believe in the beauty of their dreams.", author: "Eleanor Roosevelt" },
    { text: "It is during our darkest moments that we must focus to see the light.", author: "Aristotle" },
    { text: "Success is not final, failure is not fatal: it is the courage to continue that counts.", author: "Winston Churchill" },
    { text: "The only way to do great work is to love what you do.", author: "Steve Jobs" },
    { text: "Innovation distinguishes between a leader and a follower.", author: "Steve Jobs" },
    { text: "Life is what happens to you while you're busy making other plans.", author: "John Lennon" },
    { text: "The future belongs to those who prepare for it today.", author: "Malcolm X" },
    { text: "Be yourself; everyone else is already taken.", author: "Oscar Wilde" },
    { text: "The only impossible journey is the one you never begin.", author: "Tony Robbins" },
    { text: "In the midst of winter, I found there was, within me, an invincible summer.", author: "Albert Camus" }
  ];
  
  const randomQuote = fallbackQuotes[Math.floor(Math.random() * fallbackQuotes.length)];
  return randomQuote;
}

async function fetchWeatherData(): Promise<WeatherData | null> {
  const cacheKey = 'weather_cache';
  const cacheDateKey = 'weather_cache_date';
  const today = new Date().toISOString().slice(0, 10);

  const cachedWeather = localStorage.getItem(cacheKey);
  const cacheDate = localStorage.getItem(cacheDateKey);

  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, Math.random() * 1200 + 400));

  if (cachedWeather && cacheDate === today) {
    try {
      return JSON.parse(cachedWeather);
    } catch {
      // Clear invalid cache
      localStorage.removeItem(cacheKey);
      localStorage.removeItem(cacheDateKey);
    }
  }

  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      console.warn('Geolocation not supported');
      resolve(null);
      return;
    }
    
    console.log('🌍 Requesting location permission...');
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        try {
          // Get weather data from open-meteo (free, no API key required, CORS enabled)
          const weatherResponse = await axios.get('https://api.open-meteo.com/v1/forecast', {
            params: {
              latitude: coords.latitude,
              longitude: coords.longitude,
              current_weather: true,
            },
            timeout: 10000 // 10 second timeout
          });

          if (!weatherResponse.data || !weatherResponse.data.current_weather) {
            resolve(null);
            return;
          }

          const data = weatherResponse.data.current_weather;
          let locationName = 'Current Location';
          
          // Try multiple location services for better reliability
          try {
            // First try: BigDataCloud (free, no API key, CORS enabled)
            const locationResponse = await axios.get(
              `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${coords.latitude}&longitude=${coords.longitude}&localityLanguage=en`,
              { timeout: 5000 }
            );
            
            if (locationResponse.data) {
              const location = locationResponse.data;
              if (location.city && location.countryName) {
                locationName = `${location.city}, ${location.countryName}`;
              } else if (location.locality && location.countryName) {
                locationName = `${location.locality}, ${location.countryName}`;
              } else if (location.countryName) {
                locationName = location.countryName;
              }
            }
          } catch (locationError) {
            console.warn('Primary location service failed, trying fallback:', locationError);
            
            try {
              // Fallback: Nominatim (OpenStreetMap's service - free, CORS enabled)
              const fallbackResponse = await axios.get(
                `https://nominatim.openstreetmap.org/reverse?format=json&lat=${coords.latitude}&lon=${coords.longitude}&zoom=10&addressdetails=1`,
                { 
                  timeout: 5000,
                  headers: {
                    'User-Agent': 'Now Dashboard App'
                  }
                }
              );
              
              if (fallbackResponse.data && fallbackResponse.data.address) {
                const addr = fallbackResponse.data.address;
                const city = addr.city || addr.town || addr.village || addr.hamlet;
                const country = addr.country;
                
                if (city && country) {
                  locationName = `${city}, ${country}`;
                } else if (country) {
                  locationName = country;
                }
              }
            } catch (fallbackError) {
              console.warn('Fallback location service also failed:', fallbackError);
              // Keep default 'Current Location'
            }
          }

          const weatherData: WeatherData = {
            temperature: data.temperature,
            windspeed: data.windspeed,
            condition: data.weathercode.toString(),
            location: locationName,
          };

          localStorage.setItem(cacheKey, JSON.stringify(weatherData));
          localStorage.setItem(cacheDateKey, today);
          
          resolve(weatherData);
        } catch (error) {
          console.warn('Weather data fetch failed:', error);
          resolve(null);
        }
      },
      (error) => {
        console.warn('🌍 Geolocation failed:', error.message || error);
        resolve(null);
      },
      {
        enableHighAccuracy: false,
        timeout: 10000,
        maximumAge: 300000, // 5 minutes
      }
    );
  });
}

// Loading components for Suspense
function BackgroundLoading() {
  return (
    <motion.div
      className="absolute inset-0 bg-gradient-to-br from-blue-400 via-purple-500 to-pink-500"
      animate={{
        background: [
          'linear-gradient(45deg, #3b82f6, #8b5cf6, #ec4899)',
          'linear-gradient(90deg, #8b5cf6, #ec4899, #3b82f6)',
          'linear-gradient(135deg, #ec4899, #3b82f6, #8b5cf6)',
          'linear-gradient(45deg, #3b82f6, #8b5cf6, #ec4899)',
        ],
      }}
      transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
    >
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center">
        <motion.div
          className="text-white text-lg"
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          Loading beautiful background...
        </motion.div>
      </div>
    </motion.div>
  );
}

function ContentLoading() {
  return (
    <motion.div
      className="bg-white/10 border border-white/20 rounded-lg p-4"
      animate={{ opacity: [0.5, 1, 0.5] }}
      transition={{ duration: 1.5, repeat: Infinity }}
    >
      <div className="h-6 bg-white/20 rounded mb-2"></div>
      <div className="h-4 bg-white/10 rounded w-3/4"></div>
    </motion.div>
  );
}

// Background component using React 19 use() hook
function Background({ backgroundPromise }: { backgroundPromise: Promise<BackgroundData> }) {
  const background = use(backgroundPromise);
  
  return (
    <motion.div
      className="absolute inset-0"
      style={{
        backgroundImage: `url(${background.url})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
      initial={{ scale: 1.1, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 1.5, ease: 'easeOut' }}
    >
      <motion.div 
        className="absolute inset-0 bg-black/40 backdrop-blur-[1px]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5, duration: 1 }}
      />
      
      {/* Photo credit */}
      <motion.div
        className="absolute bottom-4 right-4 text-white/60 text-xs"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1, duration: 0.8 }}
      >
        Photo by {background.photographer}
      </motion.div>
    </motion.div>
  );
}

// Quote component using React 19 use() hook
function QuoteSection({ quotePromise }: { quotePromise: Promise<QuoteData> }) {
  const quote = use(quotePromise);
  
  return (
    <motion.div
      className="text-center space-y-2"
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3, duration: 0.8 }}
    >
      <motion.p 
        className="text-lg sm:text-xl italic max-w-2xl text-white/90"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5, duration: 1 }}
      >
        "{quote.text}"
      </motion.p>
      <motion.p 
        className="text-sm sm:text-base text-blue-200 dark:text-blue-300"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.7, duration: 1 }}
      >
        – {quote.author}
      </motion.p>
    </motion.div>
  );
}

// Weather component using React 19 use() hook
function WeatherSection({ weatherPromise }: { weatherPromise: Promise<WeatherData | null> }) {
  const weather = use(weatherPromise);
  
  if (!weather) return null;
  
  return (
    <motion.div
      className="mt-6 px-6 py-3 bg-white/10 border border-white/20 rounded-lg backdrop-blur-sm"
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: 0.9, duration: 0.6 }}
      whileHover={{ scale: 1.05 }}
    >
      <div className="flex items-center justify-center gap-4 text-sm text-white/90">
        <div className="flex items-center gap-2">
          <span className="text-lg">🌡</span>
          <span className="font-semibold">{weather.temperature}°C</span>
        </div>
        <div className="w-px h-4 bg-white/30"></div>
        <div className="flex items-center gap-2">
          <span className="text-lg">💨</span>
          <span>{weather.windspeed} km/h</span>
        </div>
        <div className="w-px h-4 bg-white/30"></div>
        <div className="flex items-center gap-2">
          <span className="text-lg">📍</span>
          <span>{weather.location}</span>
        </div>
      </div>
    </motion.div>
  );
}

// Settings panel component
function SettingsPanel({ settings, onUpdate, isOpen, onClose }: {
  settings: NowSettings;
  onUpdate: (settings: Partial<NowSettings>) => void;
  isOpen: boolean;
  onClose: () => void;
}) {
  if (!isOpen) return null;

  return (
    <motion.div
      className="absolute top-4 right-4 bg-white/10 backdrop-blur-md border border-white/20 rounded-lg p-6 w-80 text-white z-50"
      initial={{ opacity: 0, scale: 0.9, x: 20 }}
      animate={{ opacity: 1, scale: 1, x: 0 }}
      exit={{ opacity: 0, scale: 0.9, x: 20 }}
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Settings</h3>
        <motion.button
          onClick={onClose}
          className="text-white/60 hover:text-white p-1 bg-white/10 hover:bg-white/20 rounded border border-white/20"
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
        >
          ✕
        </motion.button>
      </div>
      
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <label className="text-sm">Show Weather</label>
          <motion.button
            onClick={() => onUpdate({ showWeather: !settings.showWeather })}
            className={`w-12 h-6 rounded-full ${settings.showWeather ? 'bg-blue-500' : 'bg-gray-600'} relative transition-colors`}
            whileTap={{ scale: 0.95 }}
          >
            <motion.div
              className="w-5 h-5 bg-white rounded-full absolute top-0.5"
              animate={{ x: settings.showWeather ? 24 : 2 }}
              transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            />
          </motion.button>
        </div>
        
        <div className="flex items-center justify-between">
          <label className="text-sm">Show Quote</label>
          <motion.button
            onClick={() => onUpdate({ showQuote: !settings.showQuote })}
            className={`w-12 h-6 rounded-full ${settings.showQuote ? 'bg-blue-500' : 'bg-gray-600'} relative transition-colors`}
            whileTap={{ scale: 0.95 }}
          >
            <motion.div
              className="w-5 h-5 bg-white rounded-full absolute top-0.5"
              animate={{ x: settings.showQuote ? 24 : 2 }}
              transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            />
          </motion.button>
        </div>
        
        <div className="flex items-center justify-between">
          <label className="text-sm">Auto Refresh</label>
          <motion.button
            onClick={() => onUpdate({ autoRefresh: !settings.autoRefresh })}
            className={`w-12 h-6 rounded-full ${settings.autoRefresh ? 'bg-blue-500' : 'bg-gray-600'} relative transition-colors`}
            whileTap={{ scale: 0.95 }}
          >
            <motion.div
              className="w-5 h-5 bg-white rounded-full absolute top-0.5"
              animate={{ x: settings.autoRefresh ? 24 : 2 }}
              transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            />
          </motion.button>
        </div>
        
        {settings.autoRefresh && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            <label className="text-sm block mb-2">Refresh Every (minutes)</label>
            <input
              type="range"
              min="5"
              max="60"
              step="5"
              value={settings.refreshInterval}
              onChange={(e) => onUpdate({ refreshInterval: Number(e.target.value) })}
              className="w-full"
            />
            <div className="text-xs text-center mt-1">{settings.refreshInterval} minutes</div>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}

export default function Now() {
  const [time, setTime] = useState(new Date());
  const [settings, setSettings] = useState<NowSettings>({
    showWeather: true,
    showQuote: true,
    autoRefresh: false,
    refreshInterval: 30,
    backgroundSource: 'unsplash',
    quoteSource: 'zenquotes',
  });
  const [showSettings, setShowSettings] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // Create stable promises for React 19 use() hook
  const backgroundPromise = useMemo(() => fetchBackgroundImage(), [refreshKey]);
  const quotePromise = useMemo(() => fetchDailyQuote(), [refreshKey]);
  const weatherPromise = useMemo(() => fetchWeatherData(), [refreshKey]);

  // Clock update
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Auto refresh
  useEffect(() => {
    if (!settings.autoRefresh) return;
    
    const interval = setInterval(() => {
      setRefreshKey(prev => prev + 1);
    }, settings.refreshInterval * 60 * 1000);
    
    return () => clearInterval(interval);
  }, [settings.autoRefresh, settings.refreshInterval]);

  const formattedTime = time.toLocaleString(undefined, {
    dateStyle: 'full',
    timeStyle: 'medium',
  });

  const handleRefresh = () => {
    // Clear all caches to force fresh data
    localStorage.removeItem('bg_cache');
    localStorage.removeItem('bg_cache_date');
    localStorage.removeItem('quote_cache');
    localStorage.removeItem('quote_cache_author');
    localStorage.removeItem('quote_cache_date');
    localStorage.removeItem('weather_cache');
    localStorage.removeItem('weather_cache_date');
    
    setRefreshKey(prev => prev + 1);
  };

  const updateSettings = (newSettings: Partial<NowSettings>) => {
    setSettings(prev => ({ ...prev, ...newSettings }));
  };

  return (
    <div className="relative w-full h-[calc(100vh-7.5rem)] rounded-xl overflow-hidden shadow-lg">
      {/* Background with Suspense */}
      <Suspense fallback={<BackgroundLoading />}>
        <Background backgroundPromise={backgroundPromise} />
      </Suspense>

      {/* Main Content */}
      <div className="relative z-10 h-full flex flex-col justify-center items-center text-center space-y-6 p-6">
        {/* Time Display */}
        <motion.div
          initial={{ opacity: 0, y: -30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
        >
          <motion.h1 
            className="text-3xl sm:text-5xl lg:text-6xl font-bold text-white mb-2"
            key={formattedTime} // Re-animate on time change
            initial={{ scale: 0.95 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.3 }}
          >
            {time.toLocaleTimeString(undefined, { timeStyle: 'short' })}
          </motion.h1>
          <motion.p 
            className="text-lg sm:text-xl text-white/80"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.8 }}
          >
            {time.toLocaleDateString(undefined, { 
              weekday: 'long', 
              year: 'numeric', 
              month: 'long', 
              day: 'numeric' 
            })}
          </motion.p>
        </motion.div>

        {/* Quote Section with Suspense */}
        {settings.showQuote && (
          <Suspense fallback={<ContentLoading />}>
            <QuoteSection quotePromise={quotePromise} />
          </Suspense>
        )}

        {/* Weather Section with Suspense */}
        {settings.showWeather && (
          <Suspense fallback={<ContentLoading />}>
            <WeatherSection weatherPromise={weatherPromise} />
          </Suspense>
        )}
      </div>

      {/* Controls */}
      <div className="absolute top-4 left-4 flex gap-2 z-50">
        <motion.button
          onClick={handleRefresh}
          className="p-3 bg-white/10 hover:bg-white/20 backdrop-blur-sm border border-white/20 rounded-lg text-white transition-colors"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          title="Refresh"
        >
          <motion.span
            animate={{ rotate: refreshKey * 360 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
          >
            🔄
          </motion.span>
        </motion.button>
        
        <motion.button
          onClick={() => setShowSettings(!showSettings)}
          className="p-3 bg-white/10 hover:bg-white/20 backdrop-blur-sm border border-white/20 rounded-lg text-white transition-colors"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          title="Settings"
        >
          ⚙️
        </motion.button>
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
