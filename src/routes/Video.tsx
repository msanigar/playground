import { useState, useCallback, useEffect } from 'react';
import { WherebyProvider } from '@whereby.com/browser-sdk/react';
import MediaSetup from '../components/video/MediaSetup';
import VideoCall from '../components/video/VideoCall';

interface CheckInData {
  name: string;
}

export default function Video() {
  const [step, setStep] = useState<'checkin' | 'setup' | 'call'>('checkin');
  const [checkInData, setCheckInData] = useState<CheckInData | null>(null);
  const [roomUrl, setRoomUrl] = useState<string>('');

  const handleNameSubmit = useCallback((name: string) => {
    setCheckInData({ name });
    setStep('setup');
  }, []);

  const handleSetupComplete = useCallback(() => {
    // Use environment variable for room URL
    const envRoomUrl = import.meta.env.VITE_DEFAULT_ROOM_URL;
    
    if (!envRoomUrl) {
      console.error('VITE_DEFAULT_ROOM_URL not found in environment variables!');
      alert('Room URL not configured. Please set VITE_DEFAULT_ROOM_URL in your .env file.');
      return;
    }
    
    const roomUrl = envRoomUrl.trim(); // Clean any whitespace/quotes
    setRoomUrl(roomUrl);
    setStep('call');
  }, []);

  const handleBackToCheckin = useCallback(() => {
    setStep('checkin');
    setCheckInData(null);
  }, []);

  const handleLeave = useCallback(() => {
    setStep('checkin');
    setCheckInData(null);
  }, []);

  // Cleanup media on page unload/navigation (browser-level protection)
  useEffect(() => {
    const handleBeforeUnload = () => {
      console.log('🚨 Page unload detected - stopping all media streams');
      // Get all active media streams and stop them
      navigator.mediaDevices.getUserMedia({ video: false, audio: false })
        .catch(() => {
          // This is expected to fail, but will trigger cleanup of existing streams
        });
    };

    // Add event listener for page unload
    window.addEventListener('beforeunload', handleBeforeUnload);
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      // Additional cleanup when component unmounts
      handleBeforeUnload();
    };
  }, []);

  // Name input step
  if (step === 'checkin') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-900 via-purple-900 to-indigo-900 flex items-center justify-center p-4">
        <div className="backdrop-blur-xl bg-white/10 rounded-3xl p-8 shadow-2xl border border-white/20 w-full max-w-md">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-white mb-4">Join Video Call</h1>
            <p className="text-blue-200">Enter your name to get started</p>
          </div>

          <form onSubmit={(e) => {
            e.preventDefault();
            const formData = new FormData(e.currentTarget);
            const name = formData.get('name') as string;
            if (name?.trim()) {
              handleNameSubmit(name.trim());
            }
          }} className="space-y-6">
            <div>
              <label className="block text-blue-200 text-sm font-medium mb-2">
                Name
              </label>
              <input
                name="name"
                type="text"
                className="w-full px-4 py-3 rounded-xl backdrop-blur-sm bg-white/10 border border-white/20 text-white placeholder-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition-all duration-200"
                placeholder="Enter your name"
                autoFocus
                required
              />
            </div>

            <button
              type="submit"
              className="w-full px-6 py-3 rounded-xl bg-gradient-to-r from-blue-500 to-purple-600 text-white font-medium hover:from-blue-600 hover:to-purple-700 transition-all duration-200 shadow-lg"
            >
              Continue
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Media setup step
  if (step === 'setup' && checkInData) {
    return (
      <MediaSetup 
        onComplete={handleSetupComplete}
        onBack={handleBackToCheckin}
        userName={checkInData.name}
      />
    );
  }

  // Video call step
  if (step === 'call' && checkInData && roomUrl) {
    return (
      <WherebyProvider>
        <VideoCall 
          roomUrl={roomUrl}
          displayName={checkInData.name}
          onLeave={handleLeave}
        />
      </WherebyProvider>
    );
  }

  return null;
} 