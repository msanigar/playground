import { useState, useEffect, useCallback, useRef } from 'react';
import { useRoomConnection, useLocalMedia, VideoView } from '@whereby.com/browser-sdk/react';
import { Mic, MicOff, Video, VideoOff, Phone, MessageCircle } from 'lucide-react';

interface VideoCallProps {
  roomUrl: string;
  displayName: string;
  onLeave: () => void;
}

// Device preference utilities
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

export default function VideoCall({ roomUrl, displayName, onLeave }: VideoCallProps) {
  const [showChat, setShowChat] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [chatInput, setChatInput] = useState('');
  

  
  // Audio monitoring state
  const [localAudioLevel, setLocalAudioLevel] = useState(0);
  const [remoteAudioLevels, setRemoteAudioLevels] = useState<{[participantId: string]: number}>({});
  const [showAudioControls, setShowAudioControls] = useState(false);
  
  // Audio monitoring refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const localAnalyserRef = useRef<AnalyserNode | null>(null);
  const remoteAnalysersRef = useRef<{[participantId: string]: AnalyserNode}>({});
  const animationFrameRef = useRef<number | null>(null);
  const lastUpdateTimeRef = useRef<number>(0);
  const lastLocalLevelRef = useRef<number>(0);
  const lastRemoteLevelsRef = useRef<{[participantId: string]: number}>({});
  
  // Device preferences
  const [devicePreferences, setDevicePreferences] = useState<DevicePreferences>(() => {
    const preferences = loadDevicePreferences();
    console.log('🔧 Loaded device preferences:', preferences);
    return preferences;
  });
  const [speakerDevices, setSpeakerDevices] = useState<{deviceId: string, label: string}[]>([]);
  const [hasSetInitialDevices, setHasSetInitialDevices] = useState(false);
  const [showFeedbackWarning, setShowFeedbackWarning] = useState(false);
  const [isDirectlyMuted, setIsDirectlyMuted] = useState(false);
  const [deviceCollisionDetected, setDeviceCollisionDetected] = useState(false);
  
  // Stable tab ID for collision detection
  const tabIdRef = useRef<string>(`tab_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);

  const handleSendMessage = () => {
    if (chatInput.trim()) {
      try {
        // Use Whereby's built-in chat system
        if (actions.sendChatMessage) {
          actions.sendChatMessage(chatInput.trim());
        } else {
          console.warn('sendChatMessage action not available');
        }
        setChatInput('');
      } catch (error) {
        console.error('Failed to send chat message:', error);
      }
    }
  };
  
  // Save device preference and update state
  const handleDeviceChange = (deviceType: keyof DevicePreferences, deviceId: string) => {
    const newPreferences = { ...devicePreferences, [deviceType]: deviceId };
    setDevicePreferences(newPreferences);
    saveDevicePreferences(newPreferences);
  };

  // Helper function to check actual stream track states
  const getActualAudioVideoState = () => {
    const stream = localParticipant?.stream;
    if (!stream) return { hasAudio: false, hasVideo: false, audioEnabled: false, videoEnabled: false };
    
    const audioTracks = stream.getAudioTracks();
    const videoTracks = stream.getVideoTracks();
    
    return {
      hasAudio: audioTracks.length > 0,
      hasVideo: videoTracks.length > 0,
      audioEnabled: audioTracks.length > 0 && audioTracks[0].enabled,
      videoEnabled: videoTracks.length > 0 && videoTracks[0].enabled,
    };
  };

  // Helper function to get participant display name by ID
  const getParticipantDisplayName = (participantId: string) => {
    // Check if it's the local participant
    if (localParticipant?.id === participantId) {
      return localParticipant.displayName || displayName || 'You';
    }
    
    // Check remote participants
    const remoteParticipant = remoteParticipants.find(p => p.id === participantId);
    if (remoteParticipant) {
      return remoteParticipant.displayName || 'Unknown';
    }
    
    // Fallback to the ID if no match found
    return participantId;
  };

  // Initialize media - we'll apply preferences immediately after initialization  
  const localMedia = useLocalMedia({
    audio: true,
    video: true,
  });

  const connection = useRoomConnection(roomUrl, {
    localMediaOptions: {
      audio: true,
      video: true,
    },
    displayName: displayName,
  });

  const { state, actions } = connection;
  const { localParticipant, remoteParticipants } = state;

  // Use combination of Whereby's state and our direct control for mic/video status
  const actualMicEnabled = isDirectlyMuted ? false : (localParticipant?.isAudioEnabled ?? true);
  const actualVideoEnabled = localParticipant?.isVideoEnabled ?? true;

  // Calculate dynamic grid layout based on participant count
  const totalParticipants = (localParticipant?.stream ? 1 : 0) + remoteParticipants.length;
  
  const getGridClasses = () => {
    switch (totalParticipants) {
      case 0:
      case 1:
        return "grid grid-cols-1 gap-6 mb-6 max-w-2xl mx-auto";
      case 2:
        return "grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6";
      case 3:
      case 4:
        return "grid grid-cols-1 md:grid-cols-2 gap-4 mb-6";
      case 5:
      case 6:
        return "grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6";
      default:
        // 7+ participants: more compact grid
        return "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 mb-6";
    }
  };

  const getVideoClasses = () => {
    switch (totalParticipants) {
      case 0:
      case 1:
      case 2:
        return "aspect-video"; // Full 16:9 aspect ratio
      case 3:
      case 4:
        return "aspect-video"; // Still comfortable size
      case 5:
      case 6:
        return "aspect-[4/3]"; // Slightly more square for better fit
      default:
        // 7+ participants: more compact
        return "aspect-[4/3]"; // More square format
    }
  };

  const getAudioIndicatorSize = () => {
    return totalParticipants > 6 ? "text-[10px] px-2 py-0.5" : "text-xs px-3 py-1.5";
  };

  const getNameDisplaySize = () => {
    return totalParticipants > 6 ? "text-xs px-2 py-1" : "text-sm px-3 py-2";
  };

  // Device collision detection using localStorage
  const checkDeviceCollision = useCallback(() => {
    try {
      const currentMicDevice = localMedia.state.currentMicrophoneDeviceId || 'default';
      const tabId = tabIdRef.current; // Use stable tab ID
      const storageKey = `microphone_usage_${currentMicDevice}`;
      
      // Get existing usage data
      const existingData = localStorage.getItem(storageKey);
      const now = Date.now();
      
      if (existingData) {
        const parsed = JSON.parse(existingData);
        const timeDiff = now - parsed.timestamp;
        
        // If another tab used this device recently (within 5 seconds), it's a collision
        if (timeDiff < 5000 && parsed.tabId !== tabId) {
          console.warn(`🚨 Device collision detected! Another tab is using microphone: ${currentMicDevice}`);
          setDeviceCollisionDetected(true);
          setShowFeedbackWarning(true);
          
          // Auto-disable microphone in this tab to prevent feedback
          if (!isDirectlyMuted) {
            console.log(`🚫 Auto-disabling microphone due to device collision`);
            setIsDirectlyMuted(true);
            
            // Stop all audio tracks
            if (localParticipant?.stream) {
              localParticipant.stream.getAudioTracks().forEach(track => {
                track.enabled = false;
                track.stop();
              });
            }
            if (localMedia.state.localStream) {
              localMedia.state.localStream.getAudioTracks().forEach(track => {
                track.enabled = false;
                track.stop();
              });
            }
            
            // Disable Whereby's audio
            if (actions.toggleMicrophone && localParticipant?.isAudioEnabled) {
              actions.toggleMicrophone();
            }
            
            cleanupAudioMonitoring();
            setLocalAudioLevel(0);
          }
          
          return true;
        }
      }
      
      // Update usage data for this tab
      localStorage.setItem(storageKey, JSON.stringify({
        tabId,
        timestamp: now,
        deviceLabel: currentMicDevice
      }));
      
      // Clean up old entries periodically
      setTimeout(() => {
        try {
          const data = localStorage.getItem(storageKey);
          if (data) {
            const parsed = JSON.parse(data);
            if (parsed.tabId === tabId && Date.now() - parsed.timestamp > 10000) {
              localStorage.removeItem(storageKey);
            }
          }
        } catch {
          // Ignore cleanup errors
        }
      }, 15000);
      
      return false;
    } catch (error) {
      console.error('Error checking device collision:', error);
      return false;
    }
  }, [localMedia.state.currentMicrophoneDeviceId, localParticipant?.stream, localParticipant?.isAudioEnabled, isDirectlyMuted, actions]);



  // Audio monitoring functions - simplified to avoid interference
  const setupAudioMonitoring = useCallback(() => {
    try {
      // Cleanup previous monitoring
      cleanupAudioMonitoring();
      
      if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
        audioContextRef.current = new AudioContext();
      }

      // Resume audio context if suspended
      if (audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume();
      }

      // Always monitor local audio for the indicator (use a separate stream to avoid conflicts)
      // But only if microphone is actually enabled AND tracks are enabled
      if (actualMicEnabled && localMedia.state.localStream) {
        const audioTracks = localMedia.state.localStream.getAudioTracks();
        
        // Double-check that tracks are actually enabled and live
        const enabledTracks = audioTracks.filter(track => 
          track.enabled && track.readyState === 'live' && !track.muted
        );
        
        if (enabledTracks.length > 0) {
          try {
            // Clone the track to avoid conflicts - use the first enabled track
            const clonedTrack = enabledTracks[0].clone();
            // Ensure the cloned track is also enabled
            clonedTrack.enabled = true;
            
            const mediaStream = new MediaStream([clonedTrack]);
            const source = audioContextRef.current.createMediaStreamSource(mediaStream);
            localAnalyserRef.current = audioContextRef.current.createAnalyser();
            localAnalyserRef.current.fftSize = 256; // Smaller for less CPU usage
            localAnalyserRef.current.smoothingTimeConstant = 0.8;
            localAnalyserRef.current.minDecibels = -90;
            localAnalyserRef.current.maxDecibels = -10;
            source.connect(localAnalyserRef.current);
            
            console.log(`🎤 Audio monitoring setup: using track ${enabledTracks[0].label || enabledTracks[0].id}`);
            
            // Check for device collision after setting up monitoring
            checkDeviceCollision();
          } catch (error) {
            console.warn('Failed to setup local audio monitoring:', error);
            setLocalAudioLevel(0);
          }
        } else {
          console.log(`🔇 No enabled audio tracks found - skipping monitoring`);
          setLocalAudioLevel(0);
        }
      } else {
        // Clear local audio level when muted or no stream
        setLocalAudioLevel(0);
      }

      // Monitor remote audio only when Audio Levels panel is open
      if (showAudioControls) {
        remoteParticipants.forEach(participant => {
          if (participant.stream && participant.isAudioEnabled) {
            const audioTracks = participant.stream.getAudioTracks();
            if (audioTracks.length > 0) {
              const clonedTrack = audioTracks[0].clone();
              const mediaStream = new MediaStream([clonedTrack]);
              const source = audioContextRef.current!.createMediaStreamSource(mediaStream);
              const analyser = audioContextRef.current!.createAnalyser();
              analyser.fftSize = 256;
              analyser.smoothingTimeConstant = 0.8;
              analyser.minDecibels = -90;
              analyser.maxDecibels = -10;
              source.connect(analyser);
              remoteAnalysersRef.current[participant.id] = analyser;
            }
          }
        });
      }

      // Start monitoring loop
      updateAudioLevels();
    } catch (error) {
      console.error('Failed to setup audio monitoring:', error);
    }
  }, [actualMicEnabled, remoteParticipants, showAudioControls, localMedia.state.localStream]);

  const updateAudioLevels = useCallback(() => {
    const now = Date.now();
    const timeSinceLastUpdate = now - lastUpdateTimeRef.current;
    
    // Throttle updates to max 5 times per second (every 200ms) to reduce CPU usage
    const shouldUpdate = timeSinceLastUpdate >= 200;
    
    let localLevel = lastLocalLevelRef.current;
    const newRemoteLevels = { ...lastRemoteLevelsRef.current };
    
    // Always calculate local audio level for the indicator, but only if not muted
    if (localAnalyserRef.current && actualMicEnabled) {
      const bufferLength = localAnalyserRef.current.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      localAnalyserRef.current.getByteFrequencyData(dataArray);
      
      // Use frequency data instead of time domain for better audio level detection
      const average = dataArray.reduce((sum, value) => sum + value, 0) / bufferLength;
      localLevel = Math.min(Math.round(average * 1.5), 100); // Scale appropriately
    } else if (!actualMicEnabled) {
      // Force audio level to 0 when muted
      localLevel = 0;
    }

    // Only calculate remote audio levels when the panel is open
    if (showAudioControls) {
      Object.entries(remoteAnalysersRef.current).forEach(([participantId, analyser]) => {
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        analyser.getByteFrequencyData(dataArray);
        
        const average = dataArray.reduce((sum, value) => sum + value, 0) / bufferLength;
        const level = Math.min(Math.round(average * 1.5), 100);
        newRemoteLevels[participantId] = level;
      });
    }

    // Only update state if enough time has passed AND there's a meaningful change
    if (shouldUpdate) {
      const localLevelChanged = Math.abs(localLevel - lastLocalLevelRef.current) >= 5;
      const remoteLevelsChanged = showAudioControls && Object.keys(newRemoteLevels).some(
        participantId => Math.abs(newRemoteLevels[participantId] - (lastRemoteLevelsRef.current[participantId] || 0)) >= 5
      );
      
      if (localLevelChanged || remoteLevelsChanged) {
        setLocalAudioLevel(localLevel);
        if (showAudioControls) {
          setRemoteAudioLevels(newRemoteLevels);
        }
        lastUpdateTimeRef.current = now;
        lastLocalLevelRef.current = localLevel;
        if (showAudioControls) {
          lastRemoteLevelsRef.current = newRemoteLevels;
        }
      }
    }

    // Continue monitoring at 30fps for less CPU usage
    animationFrameRef.current = requestAnimationFrame(updateAudioLevels);
  }, [showAudioControls]);

  const cleanupAudioMonitoring = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    
    // Don't close the AudioContext immediately to avoid conflicts
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      // Instead of closing immediately, suspend it
      if (audioContextRef.current.state === 'running') {
        audioContextRef.current.suspend();
      }
    }
    
    localAnalyserRef.current = null;
    remoteAnalysersRef.current = {};
    
    // Reset throttling references
    lastUpdateTimeRef.current = 0;
    lastLocalLevelRef.current = 0;
    lastRemoteLevelsRef.current = {};
    
    setLocalAudioLevel(0);
    setRemoteAudioLevels({});
  }, []);

  // Monitor connection status changes (key events only)
  useEffect(() => {
    if (state.connectionStatus === 'connected' || state.connectionStatus === 'disconnected') {
      console.log(`🔗 Connection status: ${state.connectionStatus}`);
    }
  }, [state.connectionStatus]);

  // Lightweight participant change tracking
  const [previousParticipantCount, setPreviousParticipantCount] = useState(0);
  
  useEffect(() => {
    const currentCount = remoteParticipants.length;
    
    // Only log when participant count actually changes
    if (currentCount !== previousParticipantCount) {
      if (currentCount > previousParticipantCount) {
        console.log(`🎉 Participant joined (${previousParticipantCount} → ${currentCount})`);
      } else if (currentCount < previousParticipantCount) {
        console.log(`👋 Participant left (${previousParticipantCount} → ${currentCount})`);
      }
      setPreviousParticipantCount(currentCount);
    }
  }, [remoteParticipants.length, previousParticipantCount]);

  // Log major connection events only
  useEffect(() => {
    if (state.connectionStatus === 'ready') {
      console.log('✅ Room ready - auto-join will trigger');
    } else if (state.connectionStatus === 'connected') {
      console.log('🎉 Successfully connected to room!');
    }
  }, [state.connectionStatus]);

  // Apply preferred devices when Whereby's device state is actually populated
  useEffect(() => {
    const { cameraDeviceId, microphoneDeviceId } = devicePreferences;
    const { setCameraDevice, setMicrophoneDevice } = localMedia.actions;
    const { currentCameraDeviceId, currentMicrophoneDeviceId, cameraDevices, microphoneDevices } = localMedia.state;
    
    // Only run this once to avoid conflicts
    if (hasSetInitialDevices) return;
    
    // Wait for ALL conditions to be met:
    // 1. Connected to room
    // 2. Local participant exists with stream
    // 3. Whereby's device state is populated (not undefined)
    // 4. Device lists are available
    if (
      state.connectionStatus !== 'connected' || 
      !localParticipant?.stream ||
      currentCameraDeviceId === undefined ||
      currentMicrophoneDeviceId === undefined ||
      cameraDevices.length === 0 ||
      microphoneDevices.length === 0
    ) {
      console.log(`⏳ Waiting for device state: connected=${state.connectionStatus === 'connected'}, hasStream=${!!localParticipant?.stream}, camera=${currentCameraDeviceId}, mic=${currentMicrophoneDeviceId}, devices=${cameraDevices.length}/${microphoneDevices.length}`);
      return;
    }
    
    console.log(`🔧 Device state ready - applying preferences...`);
    
    // Apply preferences when everything is ready
    const applyDevicePreferences = async () => {
      let deviceChangeNeeded = false;
      
      try {
        // Apply camera preference if we have one and it's different from current
        if (cameraDeviceId && setCameraDevice && cameraDeviceId !== currentCameraDeviceId) {
          const cameraExists = cameraDevices.some(d => d.deviceId === cameraDeviceId);
          if (cameraExists) {
            console.log(`🎥 Applying preferred camera: ${cameraDeviceId}`);
            console.log(`🎥 Current camera before change: ${currentCameraDeviceId}`);
            await setCameraDevice(cameraDeviceId);
            deviceChangeNeeded = true;
            
            // Verify the change after a delay
            setTimeout(() => {
              console.log(`🎥 Current camera after change: ${localMedia.state.currentCameraDeviceId}`);
            }, 500);
          } else {
            console.warn(`🎥 Preferred camera not found: ${cameraDeviceId}`);
          }
        } else {
          console.log(`🎥 Skipping camera: saved=${cameraDeviceId}, current=${currentCameraDeviceId}, same=${cameraDeviceId === currentCameraDeviceId}`);
        }
        
        // Apply microphone preference if we have one and it's different from current
        if (microphoneDeviceId && setMicrophoneDevice && microphoneDeviceId !== 'default' && microphoneDeviceId !== currentMicrophoneDeviceId) {
          const micExists = microphoneDevices.some(d => d.deviceId === microphoneDeviceId);
          if (micExists) {
            console.log(`🎤 Applying preferred microphone: ${microphoneDeviceId}`);
            console.log(`🎤 Current microphone before change: ${currentMicrophoneDeviceId}`);
            await setMicrophoneDevice(microphoneDeviceId);
            deviceChangeNeeded = true;
            
            // Verify the change after a delay
            setTimeout(() => {
              console.log(`🎤 Current microphone after change: ${localMedia.state.currentMicrophoneDeviceId}`);
            }, 500);
          } else {
            console.warn(`🎤 Preferred microphone not found: ${microphoneDeviceId}`);
          }
        } else {
          console.log(`🎤 Skipping microphone: saved=${microphoneDeviceId}, current=${currentMicrophoneDeviceId}, same=${microphoneDeviceId === currentMicrophoneDeviceId}`);
        }
        
        if (deviceChangeNeeded) {
          console.log('✅ Device preferences applied successfully');
        } else {
          console.log('ℹ️ No device changes needed');
        }
        
        setHasSetInitialDevices(true);
      } catch (error) {
        console.error('❌ Failed to apply device preferences:', error);
        setHasSetInitialDevices(true);
      }
    };
    
    applyDevicePreferences();
  }, [
    state.connectionStatus,
    localParticipant?.stream,
    hasSetInitialDevices,
    devicePreferences.cameraDeviceId,
    devicePreferences.microphoneDeviceId,
    localMedia.actions.setCameraDevice,
    localMedia.actions.setMicrophoneDevice,
    localMedia.state.currentCameraDeviceId,
    localMedia.state.currentMicrophoneDeviceId,
    localMedia.state.cameraDevices.length,
    localMedia.state.microphoneDevices.length
  ]);

  // Log successful connection with media info (only once)
  useEffect(() => {
    if (state.connectionStatus === 'connected' && localParticipant && localParticipant.stream) {
      console.log('✅ Connection successful with media stream');
      
      // Detect potential multiple tab scenario
      const sameBrowserParticipants = remoteParticipants.filter(p => 
        p.displayName === displayName || p.displayName === localParticipant.displayName
      );
      
      if (sameBrowserParticipants.length > 0) {
        console.warn('⚠️ Multiple tabs detected with same user name - this may cause audio feedback!');
        console.warn('💡 Tip: This tab will disable microphone publishing to prevent feedback');
        setShowFeedbackWarning(true);
        
        // Instead of just muting tracks, completely disable microphone at the Whereby level
        if (!isDirectlyMuted) {
          console.log('🚫 Auto-disabling microphone publishing due to multiple tabs');
          setIsDirectlyMuted(true);
          
          // Stop all audio tracks AND disable Whereby's audio publishing
          try {
            // First, stop all local audio tracks completely
            if (localParticipant?.stream) {
              localParticipant.stream.getAudioTracks().forEach(track => {
                track.enabled = false;
                track.stop();
              });
            }
            if (localMedia.state.localStream) {
              localMedia.state.localStream.getAudioTracks().forEach(track => {
                track.enabled = false;
                track.stop();
              });
            }
            
            // Then tell Whereby to stop publishing audio completely
            if (actions.toggleMicrophone && localParticipant?.isAudioEnabled) {
              actions.toggleMicrophone();
            }
            
            // Force cleanup of audio monitoring
            cleanupAudioMonitoring();
            setLocalAudioLevel(0);
            
            console.log('🚫 Microphone publishing completely disabled for this tab');
          } catch (error) {
            console.error('Error disabling microphone publishing:', error);
          }
        }
        
        // Auto-hide warning after 10 seconds
        setTimeout(() => setShowFeedbackWarning(false), 10000);
      } else {
        // No duplicates detected, re-enable microphone if it was auto-disabled
        if (isDirectlyMuted && sameBrowserParticipants.length === 0) {
          console.log('🔊 Re-enabling microphone publishing - no duplicates detected');
          setIsDirectlyMuted(false);
          
          // Re-enable Whereby's audio publishing
          try {
            if (actions.toggleMicrophone && !localParticipant?.isAudioEnabled) {
              actions.toggleMicrophone();
            }
            
            // Restart audio monitoring after a delay
            setTimeout(() => {
              setupAudioMonitoring();
            }, 500);
            
            console.log('🎤 Microphone publishing re-enabled');
          } catch (error) {
            console.error('Error re-enabling microphone publishing:', error);
          }
        }
      }
    }
  }, [state.connectionStatus, localParticipant?.stream, remoteParticipants.length, displayName]);

  // Auto-join room when connection is ready
  useEffect(() => {
    if (state.connectionStatus === 'ready' && actions.joinRoom) {
      console.log('🚀 Auto-joining room...');
      
      // Add a small delay to ensure all initialization is complete
      const joinTimer = setTimeout(() => {
        try {
          actions.joinRoom();
        } catch (error) {
          console.error('❌ Auto-join failed:', error);
        }
      }, 100);

      return () => clearTimeout(joinTimer);
    }
  }, [state.connectionStatus]);

  // Test room URL validity (silent check)
  useEffect(() => {
    const testRoomUrl = async () => {
      try {
        await fetch(roomUrl, { method: 'HEAD', mode: 'no-cors' });
      } catch (error) {
        console.warn('Room URL accessibility check failed:', error);
      }
    };
    
    if (roomUrl) {
      testRoomUrl();
    }
  }, [roomUrl]);

  // Load speaker devices
  useEffect(() => {
    const loadSpeakerDevices = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const speakers = devices
          .filter(device => device.kind === 'audiooutput')
          .map(device => ({
            deviceId: device.deviceId,
            label: device.label || `Speaker ${device.deviceId.slice(0, 8)}`
          }));
        setSpeakerDevices(speakers);
      } catch (error) {
        console.error('Failed to load speaker devices:', error);
      }
    };
    
    loadSpeakerDevices();
  }, []);

  // Setup audio monitoring when connected (always for local, conditionally for remote)
  useEffect(() => {
    if (state.connectionStatus === 'connected' && localMedia.state.localStream && actualMicEnabled) {
      setupAudioMonitoring();
    } else {
      cleanupAudioMonitoring();
      if (!actualMicEnabled) {
        setLocalAudioLevel(0);
      }
    }
    
    return () => {
      cleanupAudioMonitoring();
    };
  }, [state.connectionStatus, localMedia.state.localStream, actualMicEnabled, showAudioControls, remoteParticipants.length, setupAudioMonitoring, cleanupAudioMonitoring]);

  // Cleanup media streams on unmount or navigation
  useEffect(() => {
    return () => {
      console.log('🧹 VideoCall cleanup initiated');
      
      // Cleanup audio monitoring
      cleanupAudioMonitoring();
      
      // Close audio context properly on unmount
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }
      
      // Stop local media tracks
      if (localParticipant?.stream) {
        localParticipant.stream.getTracks().forEach(track => track.stop());
      }
      
      // Also cleanup localMedia streams
      if (localMedia.state.localStream) {
        localMedia.state.localStream.getTracks().forEach(track => track.stop());
      }
      
      // Force cleanup by calling any available cleanup actions
      if (actions.leaveRoom) {
        try {
          actions.leaveRoom();
        } catch (error) {
          console.warn('Error leaving room during cleanup:', error);
        }
      }
    };
  }, [cleanupAudioMonitoring]); // Only run cleanup on unmount

  // Enhanced leave handler with cleanup
  const handleLeaveWithCleanup = useCallback(() => {
    console.log('🚪 Leaving call...');
    
    // Stop all media tracks immediately
    if (localParticipant?.stream) {
      localParticipant.stream.getTracks().forEach(track => track.stop());
    }
    
    if (localMedia.state.localStream) {
      localMedia.state.localStream.getTracks().forEach(track => track.stop());
    }
    
    // Leave the room
    if (actions.leaveRoom) {
      try {
        actions.leaveRoom();
      } catch (error) {
        console.warn('Error leaving room:', error);
      }
    }
    
    // Small delay to ensure cleanup, then navigate
    setTimeout(() => {
      onLeave();
    }, 100);
  }, [onLeave]); // Simplified dependencies

  // Enhanced debugging function for WebRTC state
  const logWebRTCState = useCallback((context: string) => {
    console.log(`🔬 [${context}] WebRTC State Analysis:`);
    
    // Track state in localParticipant stream
    if (localParticipant?.stream) {
      const audioTracks = localParticipant.stream.getAudioTracks();
      console.log(`  📡 localParticipant.stream:`);
      audioTracks.forEach((track, i) => {
        console.log(`    🎵 Track ${i}: ${track.label} | enabled=${track.enabled} | readyState=${track.readyState} | muted=${track.muted}`);
      });
    }
    
    // Track state in localMedia stream  
    if (localMedia.state.localStream) {
      const audioTracks = localMedia.state.localStream.getAudioTracks();
      console.log(`  📱 localMedia.localStream:`);
      audioTracks.forEach((track, i) => {
        console.log(`    🎵 Track ${i}: ${track.label} | enabled=${track.enabled} | readyState=${track.readyState} | muted=${track.muted}`);
      });
    }
    
    // Whereby's internal state
    console.log(`  🏢 Whereby State: isAudioEnabled=${localParticipant?.isAudioEnabled}, actualMicEnabled=${actualMicEnabled}, isDirectlyMuted=${isDirectlyMuted}`);
    
    // Browser tab info
    console.log(`  🌐 Browser: isIncognito=${window.navigator.webdriver}, tabHidden=${document.hidden}`);
    
    // Device collision state
    console.log(`  🚨 Collision: deviceCollisionDetected=${deviceCollisionDetected}, showFeedbackWarning=${showFeedbackWarning}`);
  }, [localParticipant, localMedia.state.localStream, actualMicEnabled, isDirectlyMuted, deviceCollisionDetected, showFeedbackWarning]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-purple-900 to-indigo-900 flex items-center justify-center p-4">
      <div className={`backdrop-blur-xl bg-white/10 rounded-3xl shadow-2xl border border-white/20 w-full ${
        totalParticipants > 6 ? 'max-w-7xl p-4' : totalParticipants > 4 ? 'max-w-6xl p-6' : 'max-w-6xl p-8'
      }`}>
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-4">Video Call</h1>
          <p className="text-blue-200">Welcome, {displayName}!</p>
        </div>

        {state.connectionStatus === 'connecting' && (
          <div className="text-center py-8">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-white mb-4"></div>
            <p className="text-white">Connecting to room...</p>
            <p className="text-blue-200 text-sm mt-2">Status: {state.connectionStatus}</p>
          </div>
        )}

        {state.connectionStatus === 'ready' && (
          <div className="text-center py-8">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-white mb-4"></div>
            <p className="text-white">Room is ready, joining automatically...</p>
            <p className="text-blue-200 text-sm mt-2">Status: {state.connectionStatus}</p>
          </div>
        )}

        {/* Audio Feedback Warning */}
        {showFeedbackWarning && (
          <div className="mb-4 p-4 bg-yellow-500/20 border border-yellow-500/40 rounded-xl backdrop-blur-sm">
            <div className="flex items-center gap-3">
              <div className="text-yellow-400 text-xl">⚠️</div>
              <div className="flex-1">
                <div className="text-yellow-100 font-medium">Multiple tabs detected!</div>
                <div className="text-yellow-200 text-sm">
                  {deviceCollisionDetected 
                    ? "Device collision detected - another tab is using this microphone." 
                    : isDirectlyMuted 
                    ? "Microphone publishing disabled in this tab to prevent feedback." 
                    : "Microphone publishing will be disabled automatically to prevent feedback."
                  }
                </div>
              </div>
              <button
                onClick={() => {
                  if (isDirectlyMuted) {
                    // Manually re-enable microphone
                    setIsDirectlyMuted(false);
                    if (actions.toggleMicrophone && !localParticipant?.isAudioEnabled) {
                      actions.toggleMicrophone();
                    }
                    setTimeout(() => setupAudioMonitoring(), 500);
                    console.log('🎤 Manually re-enabled microphone publishing');
                  } else {
                    // Manually disable microphone
                    setIsDirectlyMuted(true);
                    if (localParticipant?.stream) {
                      localParticipant.stream.getAudioTracks().forEach(track => {
                        track.enabled = false;
                        track.stop();
                      });
                    }
                    if (actions.toggleMicrophone && localParticipant?.isAudioEnabled) {
                      actions.toggleMicrophone();
                    }
                    cleanupAudioMonitoring();
                    setLocalAudioLevel(0);
                    console.log('🚫 Manually disabled microphone publishing');
                  }
                }}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors mr-2 ${
                  isDirectlyMuted 
                    ? 'bg-red-500 hover:bg-red-600 text-white' 
                    : 'bg-green-500 hover:bg-green-600 text-white'
                }`}
              >
                {isDirectlyMuted ? '🚫 Mic Publishing Off' : '🎤 Mic Publishing On'}
              </button>
              <button
                onClick={() => setShowFeedbackWarning(false)}
                className="text-yellow-300 hover:text-yellow-100"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        {(state.connectionStatus === 'connected' || state.connectionStatus === 'ready') && (
          <>
            {/* Video Grid */}
            <div className={getGridClasses()}>
                              {/* Local Participant */}
                {localParticipant?.stream && (
                  <div className="relative">
                    <div className={`rounded-2xl overflow-hidden bg-gray-900/50 ${getVideoClasses()}`}>
                                          <VideoView 
                      stream={localParticipant.stream} 
                      muted={true}
                      playsInline={true}
                      className="w-full h-full object-cover"
                    />
                                          {/* Dynamic Audio Indicator */}
                      {actualMicEnabled && (
                        <div className="absolute top-2 right-2">
                          <div className={`flex items-center gap-1 bg-green-500/80 backdrop-blur-sm rounded-full ${getAudioIndicatorSize()}`}>
                            <div className="flex items-center gap-1">
                              <div className="w-1 h-2 bg-white rounded-full" style={{
                                opacity: localAudioLevel > 20 ? 1 : 0.3,
                                transform: `scaleY(${Math.min(localAudioLevel / 50, 1)})`
                              }}></div>
                              <div className="w-1 h-3 bg-white rounded-full" style={{
                                opacity: localAudioLevel > 40 ? 1 : 0.3,
                                transform: `scaleY(${Math.min(localAudioLevel / 40, 1)})`
                              }}></div>
                              <div className="w-1 h-4 bg-white rounded-full" style={{
                                opacity: localAudioLevel > 60 ? 1 : 0.3,
                                transform: `scaleY(${Math.min(localAudioLevel / 30, 1)})`
                              }}></div>
                            </div>
                            <Mic className="w-3 h-3 text-white" />
                            <span className="text-white">{localAudioLevel}%</span>
                          </div>
                        </div>
                      )}
                      <div className="absolute bottom-2 left-2 right-2">
                        <div className={`backdrop-blur-sm bg-black/30 rounded-lg ${getNameDisplaySize()}`}>
                          <div className="text-white truncate">
                            You ({localParticipant.displayName || displayName || 'Unknown'})
                          </div>
                        </div>
                      </div>
                  </div>
                </div>
              )}

              {/* Remote Participants */}
              {remoteParticipants.map((participant) => {
                                  return (
                    <div key={participant.id} className="relative">
                      <div className={`rounded-2xl overflow-hidden bg-gray-900/50 ${getVideoClasses()}`}>
                        {participant.stream ? (
                          <>
                            <VideoView 
                              stream={participant.stream} 
                              className="w-full h-full object-cover"
                            />
                          <div className={`absolute top-1 left-1 bg-blue-500/80 text-white rounded ${getNameDisplaySize()}`}>
                            {totalParticipants > 6 ? participant.displayName?.[0]?.toUpperCase() || '?' : `Remote: ${participant.displayName}`}
                          </div>
                        </>
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-white">
                          <div className="text-center">
                            <div className="w-16 h-16 rounded-full bg-blue-500 flex items-center justify-center mx-auto mb-2">
                              <span className="text-xl font-bold">
                                {participant.displayName?.[0]?.toUpperCase() || '?'}
                              </span>
                            </div>
                            <p className="text-sm">{participant.displayName || 'Unknown'}</p>
                            <p className="text-xs text-red-300 mt-1">No video stream</p>
                          </div>
                        </div>
                      )}
                      {/* Dynamic Audio Indicator for Remote Participants */}
                      {participant.isAudioEnabled && (
                        <div className="absolute top-2 right-2">
                          <div className={`flex items-center gap-1 bg-blue-500/80 backdrop-blur-sm rounded-full ${getAudioIndicatorSize()}`}>
                            <div className="flex items-center gap-1">
                              {(() => {
                                const level = remoteAudioLevels[participant.id] || 0;
                                return (
                                  <>
                                    <div className="w-1 h-2 bg-white rounded-full" style={{
                                      opacity: level > 20 ? 1 : 0.3,
                                      transform: `scaleY(${Math.min(level / 50, 1)})`
                                    }}></div>
                                    <div className="w-1 h-3 bg-white rounded-full" style={{
                                      opacity: level > 40 ? 1 : 0.3,
                                      transform: `scaleY(${Math.min(level / 40, 1)})`
                                    }}></div>
                                    <div className="w-1 h-4 bg-white rounded-full" style={{
                                      opacity: level > 60 ? 1 : 0.3,
                                      transform: `scaleY(${Math.min(level / 30, 1)})`
                                    }}></div>
                                  </>
                                );
                              })()}
                            </div>
                            <Mic className="w-3 h-3 text-white" />
                            <span className="text-white">{remoteAudioLevels[participant.id] || 0}%</span>
                          </div>
                        </div>
                      )}
                      <div className="absolute bottom-2 left-2 right-2">
                        <div className={`backdrop-blur-sm bg-black/30 rounded-lg ${getNameDisplaySize()}`}>
                          <div className="text-white truncate">
                            {participant.displayName || 'Unknown'}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}

                              {/* Empty state for no remote participants */}
                {remoteParticipants.length === 0 && localParticipant?.stream && (
                  <div className="relative">
                    <div className={`rounded-2xl overflow-hidden bg-gray-900/50 ${getVideoClasses()} flex items-center justify-center`}>
                    <div className="text-center text-white">
                      <div className="w-16 h-16 rounded-full bg-gray-600 flex items-center justify-center mx-auto mb-4">
                        <span className="text-2xl">👥</span>
                      </div>
                      <p className="text-lg font-medium mb-2">Waiting for others</p>
                      <p className="text-sm text-blue-200">Share the room link to invite participants</p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Controls */}
            <div className="flex justify-center gap-4 mb-6">
              <button
                onClick={async () => {
                  try {
                    const wasEnabled = actualMicEnabled;
                    console.log(`🎤 Direct mute control: ${wasEnabled ? 'muting' : 'unmuting'}`);
                    
                    // DEBUG: Log state before any changes
                    logWebRTCState('BEFORE_MUTE_CHANGE');
                    
                    if (wasEnabled) {
                      // MUTING - Pure track control approach (no Whereby toggle)
                      console.log(`🔇 Pure track muting - bypassing Whereby API completely`);
                      
                      // 1. Stop audio monitoring immediately
                      cleanupAudioMonitoring();
                      setLocalAudioLevel(0);
                      
                      // 2. Only disable tracks (don't stop them to preserve for unmuting)
                      let mutedTrackCount = 0;
                      
                      if (localParticipant?.stream) {
                        const audioTracks = localParticipant.stream.getAudioTracks();
                        audioTracks.forEach((track, index) => {
                          track.enabled = false; // Only disable, don't stop
                          mutedTrackCount++;
                          console.log(`🔇 DISABLED localParticipant track ${index}: ${track.label || track.id}`);
                        });
                      }
                      
                      if (localMedia.state.localStream) {
                        const audioTracks = localMedia.state.localStream.getAudioTracks();
                        audioTracks.forEach((track, index) => {
                          track.enabled = false; // Only disable, don't stop
                          mutedTrackCount++;
                          console.log(`🔇 DISABLED localMedia track ${index}: ${track.label || track.id}`);
                        });
                      }
                      
                      console.log(`✅ Pure track mute completed - ${mutedTrackCount} tracks disabled`);
                      console.log(`✅ Audio level forced to: 0%`);
                      console.log(`ℹ️ Skipping Whereby toggle - using pure track control`);
                      
                      // Update our direct mute state
                      setIsDirectlyMuted(true);
                      
                      // DEBUG: Log state after muting
                      setTimeout(() => logWebRTCState('AFTER_MUTE'), 100);
                      
                    } else {
                      // UNMUTING - Pure track control approach (no Whereby toggle)
                      console.log(`🔊 Pure track unmuting - just re-enabling tracks`);
                      
                      try {
                        // Simply re-enable all audio tracks
                        let unmutedTrackCount = 0;
                        
                        if (localParticipant?.stream) {
                          const audioTracks = localParticipant.stream.getAudioTracks();
                          audioTracks.forEach((track, index) => {
                            if (track.readyState === 'live') {
                              track.enabled = true;
                              unmutedTrackCount++;
                              console.log(`🔊 ENABLED localParticipant track ${index}: ${track.label || track.id}`);
                            } else {
                              console.warn(`⚠️ Cannot enable dead track ${index}: ${track.readyState}`);
                            }
                          });
                        }
                        
                        if (localMedia.state.localStream) {
                          const audioTracks = localMedia.state.localStream.getAudioTracks();
                          audioTracks.forEach((track, index) => {
                            if (track.readyState === 'live') {
                              track.enabled = true;
                              unmutedTrackCount++;
                              console.log(`🔊 ENABLED localMedia track ${index}: ${track.label || track.id}`);
                            } else {
                              console.warn(`⚠️ Cannot enable dead track ${index}: ${track.readyState}`);
                            }
                          });
                        }
                        
                        console.log(`✅ Pure track unmute completed - ${unmutedTrackCount} tracks enabled`);
                        console.log(`ℹ️ Skipping Whereby toggle - using pure track control`);
                        
                        // Update our direct mute state
                        setIsDirectlyMuted(false);
                        
                        // DEBUG: Log state after unmuting
                        setTimeout(() => logWebRTCState('AFTER_UNMUTE'), 100);
                        
                        // Restart audio monitoring after a brief delay
                        setTimeout(() => {
                          if (unmutedTrackCount > 0) {
                            setupAudioMonitoring();
                            console.log(`✅ Audio monitoring restarted with ${unmutedTrackCount} tracks`);
                          } else {
                            console.warn(`⚠️ No tracks available for monitoring`);
                          }
                        }, 200);
                        
                      } catch (error) {
                        console.error(`❌ Error during pure track unmuting:`, error);
                        setIsDirectlyMuted(false); // Reset state even if error
                      }
                    }
                  
                  } catch (error) {
                    console.error('❌ Error in direct mute control:', error);
                  }
                }}
                className={`p-4 rounded-full transition-all duration-200 relative ${
                  actualMicEnabled 
                    ? 'bg-green-500 hover:bg-green-600' 
                    : 'bg-red-500 hover:bg-red-600 ring-2 ring-red-300'
                }`}
                title={actualMicEnabled ? 'Mute microphone' : 'Unmute microphone'}
              >
                {actualMicEnabled ? (
                  <Mic className="w-6 h-6 text-white" />
                ) : (
                  <>
                    <MicOff className="w-6 h-6 text-white" />
                    <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-400 rounded-full animate-pulse"></div>
                  </>
                )}
              </button>

              <button
                onClick={() => {
                  try {
                    actions.toggleCamera();
                  } catch (error) {
                    console.error('❌ Error toggling camera:', error);
                  }
                }}
                className={`p-4 rounded-full transition-all duration-200 ${
                  actualVideoEnabled 
                    ? 'bg-green-500 hover:bg-green-600' 
                    : 'bg-red-500 hover:bg-red-600'
                }`}
              >
                {actualVideoEnabled ? (
                  <Video className="w-6 h-6 text-white" />
                ) : (
                  <VideoOff className="w-6 h-6 text-white" />
                )}
              </button>

              <button
                onClick={() => setShowChat(!showChat)}
                className={`p-4 rounded-full transition-all duration-200 ${
                  showChat 
                    ? 'bg-blue-500 hover:bg-blue-600' 
                    : 'bg-gray-600 hover:bg-gray-700'
                }`}
              >
                <MessageCircle className="w-6 h-6 text-white" />
              </button>

              <button
                onClick={handleLeaveWithCleanup}
                className="p-4 rounded-full bg-red-500 hover:bg-red-600 transition-all duration-200"
              >
                <Phone className="w-6 h-6 text-white" />
              </button>
            </div>

            {/* Device Selection */}
            <div className="flex justify-center gap-4 mb-4 flex-wrap">
              {/* Camera Selection */}
              {localMedia.state.cameraDevices.length > 1 && (
                <select
                  value={localMedia.state.currentCameraDeviceId || ''}
                  onChange={(e) => {
                    const deviceId = e.target.value;
                    localMedia.actions.setCameraDevice(deviceId);
                    handleDeviceChange('cameraDeviceId', deviceId);
                  }}
                  className="px-4 py-2 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
                >
                  {localMedia.state.cameraDevices.map((device) => (
                    <option key={device.deviceId} value={device.deviceId}>
                      📹 {device.label || `Camera ${device.deviceId.slice(0, 8)}`}
                    </option>
                  ))}
                </select>
              )}
              
              {/* Microphone Selection */}
              {localMedia.state.microphoneDevices.length > 1 && (
                <select
                  value={localMedia.state.currentMicrophoneDeviceId || ''}
                  onChange={(e) => {
                    const deviceId = e.target.value;
                    localMedia.actions.setMicrophoneDevice(deviceId);
                    handleDeviceChange('microphoneDeviceId', deviceId);
                  }}
                  className="px-4 py-2 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
                >
                  {localMedia.state.microphoneDevices.map((device) => (
                    <option key={device.deviceId} value={device.deviceId}>
                      🎤 {device.label || `Microphone ${device.deviceId.slice(0, 8)}`}
                    </option>
                  ))}
                </select>
              )}

              {/* Speaker Selection */}
              {speakerDevices.length > 1 && (
                <select
                  value={devicePreferences.speakerDeviceId || ''}
                  onChange={(e) => {
                    const deviceId = e.target.value;
                    handleDeviceChange('speakerDeviceId', deviceId);
                  }}
                  className="px-4 py-2 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
                >
                  <option value="">🔊 Default Speaker</option>
                  {speakerDevices.map((speaker) => (
                    <option key={speaker.deviceId} value={speaker.deviceId}>
                      🔊 {speaker.label}
                    </option>
                  ))}
                </select>
              )}

              {/* Audio Levels Toggle */}
              <button
                onClick={() => setShowAudioControls(!showAudioControls)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all duration-200"
              >
                📊 Audio Levels
              </button>
            </div>

            {/* Audio Levels Panel */}
            {showAudioControls && (
              <div className="mb-4 p-4 bg-gray-800/50 rounded-xl backdrop-blur-sm border border-gray-600">
                <h3 className="text-white font-medium mb-3">Real-Time Audio Levels</h3>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-gray-300 w-20">Your Mic:</span>
                    <div className="flex-1 bg-gray-700 rounded-full h-3">
                      <div 
                        className="h-3 rounded-full transition-all duration-200" 
                        style={{ 
                          width: `${Math.min(localAudioLevel, 100)}%`,
                          backgroundColor: localAudioLevel > 30 ? '#22c55e' : localAudioLevel > 15 ? '#eab308' : '#6b7280'
                        }}
                      />
                    </div>
                    <span className="text-sm text-blue-200 min-w-[50px] font-mono">{localAudioLevel}%</span>
                    {localAudioLevel > 15 ? (
                      <span className="text-green-400 text-xs">🎤 Active</span>
                    ) : (
                      <span className="text-gray-400 text-xs">🔇 Silent</span>
                    )}
                  </div>
                  {remoteParticipants.map((participant) => {
                    const level = remoteAudioLevels[participant.id] || 0;
                    return (
                      <div key={participant.id} className="flex items-center gap-3">
                        <span className="text-sm text-gray-300 w-20 truncate">
                          {participant.displayName?.slice(0, 10) || 'Remote'}:
                        </span>
                        <div className="flex-1 bg-gray-700 rounded-full h-3">
                          <div 
                            className="h-3 rounded-full transition-all duration-200" 
                            style={{ 
                              width: `${Math.min(level, 100)}%`,
                              backgroundColor: level > 30 ? '#3b82f6' : level > 15 ? '#eab308' : '#6b7280'
                            }}
                          />
                        </div>
                        <span className="text-sm text-blue-200 min-w-[50px] font-mono">{level}%</span>
                        {level > 15 ? (
                          <span className="text-blue-400 text-xs">🗣️ Speaking</span>
                        ) : (
                          <span className="text-gray-400 text-xs">🔇 Silent</span>
                        )}
                      </div>
                    );
                  })}
                  {remoteParticipants.length === 0 && (
                    <div className="text-center text-gray-400 text-sm py-2">
                      No remote participants to monitor
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {/* Chat Panel */}
        {showChat && (state.connectionStatus === 'connected' || state.connectionStatus === 'ready') && (
          <div className="mt-6 p-4 bg-black/20 rounded-xl border border-white/10">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-medium">Chat</h3>
              <button
                onClick={() => setShowChat(false)}
                className="text-gray-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>
            
            {/* Chat Messages */}
            <div className="h-40 overflow-y-auto mb-4 space-y-2 bg-black/10 rounded-lg p-3">
              {state.chatMessages.length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-4">No messages yet. Start a conversation!</p>
              ) : (
                state.chatMessages.map((msg, index) => (
                  <div key={index} className="text-sm">
                    <div className="flex items-start gap-2">
                      <span className="text-blue-300 font-medium">{getParticipantDisplayName(msg.senderId)}:</span>
                      <span className="text-white flex-1">{msg.text}</span>
                    </div>
                    <div className="text-xs text-gray-400 ml-2 mt-1">
                      {new Date(msg.timestamp).toLocaleTimeString()}
                    </div>
                  </div>
                ))
              )}
            </div>
            
            {/* Chat Input */}
            <div className="flex gap-2">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                placeholder="Type a message..."
                className="flex-1 px-3 py-2 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none text-sm"
              />
              <button
                onClick={handleSendMessage}
                disabled={!chatInput.trim()}
                className="px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
              >
                Send
              </button>
            </div>
          </div>
        )}

        {/* Debug Panel */}
        <div className="mt-6 p-4 bg-black/20 rounded-xl border border-white/10">
          <button
            onClick={() => setShowDebug(!showDebug)}
            className="w-full text-left text-white font-medium mb-2 flex items-center justify-between"
          >
            Debug Info
            <span className="text-sm">{showDebug ? '▼' : '▶'}</span>
          </button>
          
          {showDebug && (
            <div className="space-y-2 text-sm text-blue-200">
              <p><strong>Connection Status:</strong> {state.connectionStatus}</p>
              <p><strong>Room URL:</strong> {roomUrl}</p>
              <p><strong>Local Participant:</strong> {localParticipant ? 'exists' : 'none'}</p>
              <p><strong>Participant ID:</strong> {localParticipant?.id || 'none'}</p>
              <p><strong>Display Name:</strong> {localParticipant?.displayName || 'none'}</p>
              <p><strong>Audio Enabled (Whereby):</strong> {localParticipant?.isAudioEnabled ? 'yes' : 'no'}</p>
              <p><strong>Audio Enabled (Actual):</strong> {actualMicEnabled ? 'yes' : 'no'}</p>
              <p><strong>Video Enabled (Whereby):</strong> {localParticipant?.isVideoEnabled ? 'yes' : 'no'}</p>
              <p><strong>Video Enabled (Actual):</strong> {actualVideoEnabled ? 'yes' : 'no'}</p>
              {localParticipant?.stream && (
                <p><strong>Stream Audio Tracks Enabled:</strong> {
                  localParticipant.stream.getAudioTracks().map(t => t.enabled).join(', ') || 'none'
                }</p>
              )}
              <p><strong>Local Audio Level:</strong> {localAudioLevel}%</p>
              <p><strong>Has Stream:</strong> {localParticipant?.stream ? 'yes' : 'no'}</p>
              <p><strong>Remote Participants:</strong> {remoteParticipants.length}</p>
              <p><strong>Chat Messages:</strong> {state.chatMessages.length}</p>
              {localParticipant?.stream && (
                <p><strong>Stream Tracks:</strong> {JSON.stringify(getActualAudioVideoState())}</p>
              )}
              <div className="mt-4 pt-2 border-t border-gray-600">
                <p><strong>Device Preferences:</strong></p>
                <p className="ml-2">Camera: {devicePreferences.cameraDeviceId || 'none'}</p>
                <p className="ml-2">Microphone: {devicePreferences.microphoneDeviceId || 'none'}</p>
                <p><strong>Available Devices:</strong></p>
                <p className="ml-2">Cameras: {localMedia.state.cameraDevices.length}</p>
                <p className="ml-2">Microphones: {localMedia.state.microphoneDevices.length}</p>
                <p><strong>Current Devices:</strong></p>
                <p className="ml-2">Camera: {localMedia.state.currentCameraDeviceId?.slice(0, 8) || 'none'}</p>
                <p className="ml-2">Microphone: {localMedia.state.currentMicrophoneDeviceId?.slice(0, 8) || 'none'}</p>
              </div>
              
              <div className="mt-4 pt-2 border-t border-gray-600">
                <p><strong>Connection Troubleshooting:</strong></p>
                <p className="ml-2 text-xs">Status: {state.connectionStatus}</p>
                <p className="ml-2 text-xs">Local Participant ID: {localParticipant?.id || 'none'}</p>
                <p className="ml-2 text-xs">Remote Count: {remoteParticipants.length}</p>
                <p className="ml-2 text-xs">Room URL Valid: {roomUrl ? '✅' : '❌'}</p>
                <p className="ml-2 text-xs">Auto-Join: {actions && 'joinRoom' in actions ? '✅ Available' : '❌ Not Available'}</p>
              </div>
            </div>
          )}
        </div>

        {/* Back to Setup Button */}
        <div className="mt-6 text-center">
          <button
            onClick={handleLeaveWithCleanup}
            className="px-6 py-3 rounded-xl backdrop-blur-sm bg-white/10 border border-white/20 text-white hover:bg-white/20 transition-all duration-200 font-medium"
          >
            Back to Setup
          </button>
        </div>
      </div>
    </div>
  );
} 