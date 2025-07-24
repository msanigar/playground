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
  
  // Simplified state - removed complex audio monitoring
  const [showAudioControls, setShowAudioControls] = useState(false);
  const [devicePreferences, setDevicePreferences] = useState<DevicePreferences>(() => {
    const preferences = loadDevicePreferences();
    return preferences;
  });
  const [speakerDevices, setSpeakerDevices] = useState<{deviceId: string, label: string}[]>([]);
  const [hasSetInitialDevices, setHasSetInitialDevices] = useState(false);
  
  // Initialize media - simplified to avoid stream conflicts
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

  // Simplified audio/video status - avoid conflicts with stream monitoring
  const actualMicEnabled = localParticipant?.isAudioEnabled ?? true;
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

  // Save device preference and update state
  const handleDeviceChange = (deviceType: keyof DevicePreferences, deviceId: string) => {
    const newPreferences = { ...devicePreferences, [deviceType]: deviceId };
    setDevicePreferences(newPreferences);
    saveDevicePreferences(newPreferences);
  };

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
      return;
    }
    
    // Apply preferences when everything is ready
    const applyDevicePreferences = async () => {
      try {
        // Apply camera preference if we have one and it's different from current
        if (cameraDeviceId && setCameraDevice && cameraDeviceId !== currentCameraDeviceId) {
          const cameraExists = cameraDevices.some(d => d.deviceId === cameraDeviceId);
          if (cameraExists) {
            await setCameraDevice(cameraDeviceId);
          } else {
            console.warn(`Preferred camera not found: ${cameraDeviceId}`);
          }
        }
        
        // Apply microphone preference if we have one and it's different from current
        if (microphoneDeviceId && setMicrophoneDevice && microphoneDeviceId !== 'default' && microphoneDeviceId !== currentMicrophoneDeviceId) {
          const micExists = microphoneDevices.some(d => d.deviceId === microphoneDeviceId);
          if (micExists) {
            await setMicrophoneDevice(microphoneDeviceId);
          } else {
            console.warn(`Preferred microphone not found: ${microphoneDeviceId}`);
          }
        }
        
        setHasSetInitialDevices(true);
      } catch (error) {
        console.error('Failed to apply device preferences:', error);
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
      // Detect potential multiple tab scenario
      const sameBrowserParticipants = remoteParticipants.filter(p => 
        p.displayName === displayName || p.displayName === localParticipant.displayName
      );
      
      if (sameBrowserParticipants.length > 0) {
        console.warn('Multiple tabs detected - disabling microphone to prevent feedback');
        
        // Instead of just muting tracks, completely disable microphone at the Whereby level
        if (localParticipant?.isAudioEnabled) {
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
            if (actions.toggleMicrophone) {
              actions.toggleMicrophone();
            }
            
            // Force cleanup of audio monitoring
            // cleanupAudioMonitoring(); // This was removed, so this line is removed
            // setLocalAudioLevel(0); // This was removed, so this line is removed
          } catch (error) {
            console.error('Error disabling microphone publishing:', error);
          }
        }
        
        // Auto-hide warning after 10 seconds
        setTimeout(() => {}, 10000); // This was removed, so this line is removed
      } else {
        // No duplicates detected, re-enable microphone if it was auto-disabled
        // if (isDirectlyMuted && sameBrowserParticipants.length === 0) { // This was removed, so this line is removed
        //   setIsDirectlyMuted(false); // This was removed, so this line is removed
          
        //   // Re-enable Whereby's audio publishing // This was removed, so this line is removed
        //   try { // This was removed, so this line is removed
        //     if (actions.toggleMicrophone && !localParticipant?.isAudioEnabled) { // This was removed, so this line is removed
        //       actions.toggleMicrophone(); // This was removed, so this line is removed
        //     } // This was removed, so this line is removed
            
        //     // Restart audio monitoring after a delay // This was removed, so this line is removed
        //     setTimeout(() => { // This was removed, so this line is removed
        //       setupAudioMonitoring(); // This was removed, so this line is removed
        //     }, 500); // This was removed, so this line is removed
        //   } catch (error) { // This was removed, so this line is removed
        //     console.error('Error re-enabling microphone publishing:', error); // This was removed, so this line is removed
        //   } // This was removed, so this line is removed
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

  // Cleanup media streams on unmount or navigation
  useEffect(() => {
    return () => {
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
  }, []); // Only run cleanup on unmount

  // Enhanced leave handler with cleanup
  const handleLeaveWithCleanup = useCallback(() => {
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
  }, [onLeave]);

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
                      {/* This section was removed, so this block is removed */}
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
                      {/* This section was removed, so this block is removed */}
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
                    // This section was removed, so this block is removed
                    
                  } catch (error) {
                    console.error('Error in mute control:', error);
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