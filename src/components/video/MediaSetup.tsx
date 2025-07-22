import { useState, useEffect, useRef } from 'react';

interface MediaSetupProps {
  onComplete: () => void;
  onBack: () => void;
  userName: string;
}

interface DeviceInfo {
  deviceId: string;
  label: string;
}

// Device preference utilities (shared with VideoCall)
const DEVICE_PREFERENCES_KEY = 'whereby-device-preferences';

interface DevicePreferences {
  cameraDeviceId?: string;
  microphoneDeviceId?: string;
  speakerDeviceId?: string;
}

const saveDevicePreferences = (preferences: DevicePreferences) => {
  try {
    localStorage.setItem(DEVICE_PREFERENCES_KEY, JSON.stringify(preferences));
  } catch (error) {
    console.warn('Failed to save device preferences:', error);
  }
};

const loadDevicePreferences = (): DevicePreferences => {
  try {
    const saved = localStorage.getItem(DEVICE_PREFERENCES_KEY);
    return saved ? JSON.parse(saved) : {};
  } catch (error) {
    console.warn('Failed to load device preferences:', error);
    return {};
  }
};

export default function MediaSetup({ onComplete, onBack, userName }: MediaSetupProps) {
  const [selectedCamera, setSelectedCamera] = useState<string>('');
  const [selectedMicrophone, setSelectedMicrophone] = useState<string>('');
  const [selectedSpeaker, setSelectedSpeaker] = useState<string>('');
  const [audioLevel, setAudioLevel] = useState(0);
  const [devices, setDevices] = useState<{
    cameras: DeviceInfo[];
    microphones: DeviceInfo[];
    speakers: DeviceInfo[];
  }>({
    cameras: [],
    microphones: [],
    speakers: []
  });
  
  // Load device preferences
  const [devicePreferences] = useState<DevicePreferences>(() => loadDevicePreferences());

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  
  // Save device preference and update state
  const handleDeviceChange = (deviceType: keyof DevicePreferences, deviceId: string) => {
    const newPreferences = { ...devicePreferences, [deviceType]: deviceId };
    saveDevicePreferences(newPreferences);
  };

  useEffect(() => {
    async function getDevices() {
      try {
        // Request permissions first
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: true, 
          audio: true 
        });
        
        // Store stream for cleanup
        streamRef.current = stream;
        
        // Show video preview
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }

        // Set up simple audio level monitoring
        setupAudioMonitoring(stream);

        // Get available devices
        const deviceList = await navigator.mediaDevices.enumerateDevices();
        
        const cameras = deviceList
          .filter(device => device.kind === 'videoinput')
          .map(device => ({
            deviceId: device.deviceId,
            label: device.label || `Camera ${device.deviceId.slice(0, 8)}`
          }));

        const microphones = deviceList
          .filter(device => device.kind === 'audioinput')
          .map(device => ({
            deviceId: device.deviceId,
            label: device.label || `Microphone ${device.deviceId.slice(0, 8)}`
          }));

        const speakers = deviceList
          .filter(device => device.kind === 'audiooutput')
          .map(device => ({
            deviceId: device.deviceId,
            label: device.label || `Speaker ${device.deviceId.slice(0, 8)}`
          }));

        setDevices({ cameras, microphones, speakers });

        // Set defaults using saved preferences or fallback to first device
        const preferredCamera = devicePreferences.cameraDeviceId && 
          cameras.find(c => c.deviceId === devicePreferences.cameraDeviceId);
        const preferredMic = devicePreferences.microphoneDeviceId && 
          microphones.find(m => m.deviceId === devicePreferences.microphoneDeviceId);
        const preferredSpeaker = devicePreferences.speakerDeviceId && 
          speakers.find(s => s.deviceId === devicePreferences.speakerDeviceId);

        if (preferredCamera) {
          setSelectedCamera(preferredCamera.deviceId);
        } else if (cameras.length > 0) {
          setSelectedCamera(cameras[0].deviceId);
        }
        
        if (preferredMic) {
          setSelectedMicrophone(preferredMic.deviceId);
        } else if (microphones.length > 0) {
          setSelectedMicrophone(microphones[0].deviceId);
        }
        
        if (preferredSpeaker) {
          setSelectedSpeaker(preferredSpeaker.deviceId);
        } else if (speakers.length > 0) {
          setSelectedSpeaker(speakers[0].deviceId);
        }

      } catch (error) {
        console.error('Error accessing media devices:', error);
      }
    }

    getDevices();

    // Cleanup function
    return () => {
      cleanupAudio();
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
    };
  }, []);

  // Simple audio level monitoring
  const setupAudioMonitoring = (stream: MediaStream) => {
    try {
      audioContextRef.current = new AudioContext();
      analyserRef.current = audioContextRef.current.createAnalyser();
      const microphone = audioContextRef.current.createMediaStreamSource(stream);
      microphone.connect(analyserRef.current);
      
      analyserRef.current.fftSize = 256;
      analyserRef.current.smoothingTimeConstant = 0.8;
      
      const bufferLength = analyserRef.current.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const updateAudioLevel = () => {
        if (!analyserRef.current) return;
        
        analyserRef.current.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((sum, value) => sum + value, 0) / bufferLength;
        setAudioLevel(Math.round(average));
        
        // Only update every 200ms to prevent excessive re-renders
        setTimeout(() => {
          if (analyserRef.current) {
            requestAnimationFrame(updateAudioLevel);
          }
        }, 200);
      };

      updateAudioLevel();
    } catch (error) {
      console.error('Failed to setup audio monitoring:', error);
    }
  };

  const cleanupAudio = () => {
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close();
    }
    audioContextRef.current = null;
    analyserRef.current = null;
  };

  // Update video when camera changes
  useEffect(() => {
    if (selectedCamera) {
      updateVideoStream();
    }
  }, [selectedCamera, selectedMicrophone]);

  const updateVideoStream = async () => {
    try {
      // Stop existing stream
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }

      // Create new stream with selected devices
      const constraints: MediaStreamConstraints = {
        video: selectedCamera ? { deviceId: { exact: selectedCamera } } : true,
        audio: selectedMicrophone ? { deviceId: { exact: selectedMicrophone } } : true
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      // Restart audio monitoring with new stream
      cleanupAudio();
      setupAudioMonitoring(stream);
    } catch (error) {
      console.error('Error updating video stream:', error);
    }
  };

  const handleJoinCall = () => {
    // Clean up preview stream before joining
    cleanupAudio();
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    // Add a small delay to ensure streams are fully stopped before Whereby initializes
    setTimeout(() => {
      onComplete();
    }, 300); // Give enough time for stream cleanup
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-purple-900 to-indigo-900 flex items-center justify-center p-4">
      <div className="backdrop-blur-xl bg-white/10 rounded-3xl p-8 shadow-2xl border border-white/20 w-full max-w-4xl">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-4">Setup Your Media</h1>
          <p className="text-blue-200">Hi {userName}! Configure your camera and microphone before joining</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Video Preview */}
          <div className="space-y-6">
            <div className="relative rounded-2xl overflow-hidden bg-gray-900/50 aspect-video">
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                className="w-full h-full object-cover"
              />
              <div className="absolute bottom-4 left-4 right-4">
                <div className="backdrop-blur-sm bg-black/30 rounded-lg px-3 py-2">
                  <div className="text-white text-sm">Video Preview</div>
                </div>
              </div>
            </div>
          </div>

          {/* Controls */}
          <div className="space-y-6">
            {/* Device Selection */}
            <div className="space-y-4">
              <div>
                <label className="block text-blue-200 text-sm font-medium mb-2">
                  Camera
                </label>
                <select
                  value={selectedCamera}
                  onChange={(e) => {
                    const deviceId = e.target.value;
                    setSelectedCamera(deviceId);
                    handleDeviceChange('cameraDeviceId', deviceId);
                  }}
                  className="w-full px-4 py-3 rounded-xl backdrop-blur-sm bg-white/10 border border-white/20 text-white focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition-all duration-200"
                >
                  {devices.cameras.map((camera) => (
                    <option key={camera.deviceId} value={camera.deviceId} className="bg-gray-800">
                      {camera.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-blue-200 text-sm font-medium mb-2">
                  Microphone
                </label>
                <select
                  value={selectedMicrophone}
                  onChange={(e) => {
                    const deviceId = e.target.value;
                    setSelectedMicrophone(deviceId);
                    handleDeviceChange('microphoneDeviceId', deviceId);
                  }}
                  className="w-full px-4 py-3 rounded-xl backdrop-blur-sm bg-white/10 border border-white/20 text-white focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition-all duration-200"
                >
                  {devices.microphones.map((mic) => (
                    <option key={mic.deviceId} value={mic.deviceId} className="bg-gray-800">
                      {mic.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-blue-200 text-sm font-medium mb-2">
                  Speaker
                </label>
                <select
                  value={selectedSpeaker}
                  onChange={(e) => {
                    const deviceId = e.target.value;
                    setSelectedSpeaker(deviceId);
                    handleDeviceChange('speakerDeviceId', deviceId);
                  }}
                  className="w-full px-4 py-3 rounded-xl backdrop-blur-sm bg-white/10 border border-white/20 text-white focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition-all duration-200"
                >
                  {devices.speakers.map((speaker) => (
                    <option key={speaker.deviceId} value={speaker.deviceId} className="bg-gray-800">
                      {speaker.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Audio Level Indicator */}
              <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/20">
                <div className="text-blue-200 text-sm mb-2">Microphone Test</div>
                <div className="flex items-center gap-2">
                  <span className="text-blue-200">🎤</span>
                  <div className="flex-1 bg-gray-700 rounded-full h-2">
                    <div 
                      className="h-2 rounded-full transition-all duration-300" 
                      style={{ 
                        width: `${Math.min(audioLevel * 2, 100)}%`,
                        backgroundColor: audioLevel > 20 ? '#22c55e' : audioLevel > 10 ? '#eab308' : '#6b7280'
                      }}
                    />
                  </div>
                  <span className="text-blue-200 text-xs min-w-[60px]">
                    {audioLevel > 10 ? 'Speaking' : 'Speak now'}
                  </span>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-4 pt-4">
              <button
                onClick={onBack}
                className="flex-1 px-6 py-3 rounded-xl backdrop-blur-sm bg-white/10 border border-white/20 text-white hover:bg-white/20 transition-all duration-200 font-medium"
              >
                Back
              </button>
              <button
                onClick={handleJoinCall}
                className="flex-1 px-6 py-3 rounded-xl bg-gradient-to-r from-blue-500 to-purple-600 text-white font-medium hover:from-blue-600 hover:to-purple-700 transition-all duration-200 shadow-lg"
              >
                Join Call
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 