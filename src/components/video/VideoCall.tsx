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
  const [devicePreferences, setDevicePreferences] = useState<DevicePreferences>(() => loadDevicePreferences());
  const [speakerDevices, setSpeakerDevices] = useState<{deviceId: string, label: string}[]>([]);

  const handleSendMessage = () => {
    if (chatInput.trim()) {
      try {
        // Use Whereby's built-in chat system
        if (actions.sendChatMessage) {
          actions.sendChatMessage(chatInput.trim());
          console.log('📤 Sent chat message via Whereby:', chatInput.trim());
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

  // Initialize media
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

  // Use Whereby's state as source of truth for mic/video status
  const actualMicEnabled = localParticipant?.isAudioEnabled ?? true;
  const actualVideoEnabled = localParticipant?.isVideoEnabled ?? true;

  // Audio monitoring functions
  const setupAudioMonitoring = useCallback(() => {
    try {
      // Cleanup previous monitoring
      cleanupAudioMonitoring();
      
      console.log('🎤 Setting up audio monitoring...');
      
      if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
        audioContextRef.current = new AudioContext();
      }

      // Resume audio context if suspended
      if (audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume();
      }

      // Monitor local audio - use localMedia stream but respect mute state
      // Only show audio levels when microphone is not muted
      if (localMedia.state.localStream && actualMicEnabled) {
        const audioTracks = localMedia.state.localStream.getAudioTracks();
        console.log(`🎵 Found ${audioTracks.length} local audio tracks from localMedia stream`);
        
        if (audioTracks.length > 0 && audioTracks[0].enabled) {
          const mediaStream = new MediaStream([audioTracks[0]]);
          const source = audioContextRef.current.createMediaStreamSource(mediaStream);
          localAnalyserRef.current = audioContextRef.current.createAnalyser();
          localAnalyserRef.current.fftSize = 512;
          localAnalyserRef.current.smoothingTimeConstant = 0.3;
          localAnalyserRef.current.minDecibels = -90;
          localAnalyserRef.current.maxDecibels = -10;
          source.connect(localAnalyserRef.current);
          console.log(`✅ Local audio monitoring connected to localMedia stream`);
        } else {
          console.log('❌ No enabled local audio tracks found in localMedia stream');
        }
      } else if (!actualMicEnabled) {
        console.log('🔇 Local audio monitoring disabled - microphone is muted');
      } else {
        console.log('❌ No localMedia stream available for audio monitoring');
      }

      // Monitor remote audio
      remoteParticipants.forEach(participant => {
        if (participant.stream && participant.isAudioEnabled) {
          const audioTracks = participant.stream.getAudioTracks();
          if (audioTracks.length > 0) {
            const mediaStream = new MediaStream([audioTracks[0]]);
            const source = audioContextRef.current!.createMediaStreamSource(mediaStream);
            const analyser = audioContextRef.current!.createAnalyser();
            analyser.fftSize = 512;
            analyser.smoothingTimeConstant = 0.3;
            analyser.minDecibels = -90;
            analyser.maxDecibels = -10;
            source.connect(analyser);
            remoteAnalysersRef.current[participant.id] = analyser;
            console.log(`✅ Remote audio monitoring connected for ${participant.displayName}`);
          }
        }
      });

      // Start monitoring loop
      updateAudioLevels();
    } catch (error) {
      console.error('Failed to setup audio monitoring:', error);
    }
  }, [localMedia.state.localStream, actualMicEnabled, remoteParticipants]);

  const updateAudioLevels = useCallback(() => {
    const now = Date.now();
    const timeSinceLastUpdate = now - lastUpdateTimeRef.current;
    
    // Throttle updates to max 10 times per second (every 100ms)
    const shouldUpdate = timeSinceLastUpdate >= 100;
    
    let localLevel = lastLocalLevelRef.current;
    const newRemoteLevels = { ...lastRemoteLevelsRef.current };
    
    // Calculate local audio level
    if (localAnalyserRef.current) {
      const bufferLength = localAnalyserRef.current.fftSize;
      const dataArray = new Uint8Array(bufferLength);
      localAnalyserRef.current.getByteTimeDomainData(dataArray);
      
      // Calculate RMS (Root Mean Square) for better audio level detection
      let sum = 0;
      for (let i = 0; i < bufferLength; i++) {
        const sample = (dataArray[i] - 128) / 128; // Convert to -1 to 1 range
        sum += sample * sample;
      }
      const rms = Math.sqrt(sum / bufferLength);
      localLevel = Math.min(Math.round(rms * 100 * 8), 100);
    }

    // Calculate remote audio levels
    Object.entries(remoteAnalysersRef.current).forEach(([participantId, analyser]) => {
      const bufferLength = analyser.fftSize;
      const dataArray = new Uint8Array(bufferLength);
      analyser.getByteTimeDomainData(dataArray);
      
      let sum = 0;
      for (let i = 0; i < bufferLength; i++) {
        const sample = (dataArray[i] - 128) / 128;
        sum += sample * sample;
      }
      const rms = Math.sqrt(sum / bufferLength);
      const level = Math.min(Math.round(rms * 100 * 8), 100);
      newRemoteLevels[participantId] = level;
    });

    // Only update state if enough time has passed AND there's a meaningful change
    if (shouldUpdate) {
      const localLevelChanged = Math.abs(localLevel - lastLocalLevelRef.current) >= 3;
      const remoteLevelsChanged = Object.keys(newRemoteLevels).some(
        participantId => Math.abs(newRemoteLevels[participantId] - (lastRemoteLevelsRef.current[participantId] || 0)) >= 3
      );
      
      if (localLevelChanged || remoteLevelsChanged) {
        setLocalAudioLevel(localLevel);
        setRemoteAudioLevels(newRemoteLevels);
        lastUpdateTimeRef.current = now;
        lastLocalLevelRef.current = localLevel;
        lastRemoteLevelsRef.current = newRemoteLevels;
      }
    }

    // Continue monitoring at 60fps for smooth calculations, but only update state when needed
    animationFrameRef.current = requestAnimationFrame(updateAudioLevels);
  }, []);

  const cleanupAudioMonitoring = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close();
    }
    audioContextRef.current = null;
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



  // Auto-select preferred camera when devices become available
  useEffect(() => {
    const { cameraDeviceId } = devicePreferences;
    const { cameraDevices, currentCameraDeviceId } = localMedia.state;
    
    // If we have a preferred camera and it's available, but not currently selected
    if (cameraDeviceId && 
        cameraDevices.some(device => device.deviceId === cameraDeviceId) &&
        currentCameraDeviceId !== cameraDeviceId) {
      console.log('Auto-selecting preferred camera:', cameraDeviceId);
      localMedia.actions.setCameraDevice(cameraDeviceId);
    }
  }, [localMedia.state.cameraDevices, localMedia.state.currentCameraDeviceId, devicePreferences.cameraDeviceId]);

  // Auto-select preferred microphone when devices become available
  useEffect(() => {
    const { microphoneDeviceId } = devicePreferences;
    const { microphoneDevices, currentMicrophoneDeviceId } = localMedia.state;
    
    // If we have a preferred microphone and it's available, but not currently selected
    if (microphoneDeviceId && 
        microphoneDevices.some(device => device.deviceId === microphoneDeviceId) &&
        currentMicrophoneDeviceId !== microphoneDeviceId) {
      console.log('Auto-selecting preferred microphone:', microphoneDeviceId);
      localMedia.actions.setMicrophoneDevice(microphoneDeviceId);
    }
  }, [localMedia.state.microphoneDevices, localMedia.state.currentMicrophoneDeviceId, devicePreferences.microphoneDeviceId]);

  // Log successful connection with media info
  useEffect(() => {
    if (state.connectionStatus === 'connected' && localParticipant) {
      console.log('✅ Connection successful! Participant has stream:', !!localParticipant.stream);
    }
  }, [state.connectionStatus, localParticipant?.stream]);

  // Auto-join room when connection is ready
  useEffect(() => {
    if (state.connectionStatus === 'ready' && actions.joinRoom) {
      console.log('🚀 Auto-joining room (status: ready)...');
      console.log('Debug auto-join conditions:', {
        connectionStatus: state.connectionStatus,
        hasJoinRoomAction: !!actions.joinRoom,
        localParticipant: !!localParticipant,
        localParticipantStream: !!localParticipant?.stream,
        localMediaStream: !!localMedia.state.localStream
      });
      
      // Add a small delay to ensure all initialization is complete
      const joinTimer = setTimeout(() => {
        try {
          actions.joinRoom();
          console.log('✅ Room join initiated successfully');
        } catch (error) {
          console.error('❌ Auto-join failed:', error);
        }
      }, 100);

      return () => clearTimeout(joinTimer);
    } else if (state.connectionStatus === 'ready') {
      console.log('⚠️ Ready but cannot auto-join:', {
        connectionStatus: state.connectionStatus,
        hasJoinRoomAction: !!actions.joinRoom,
        actionsAvailable: Object.keys(actions)
      });
    }
  }, [state.connectionStatus]);

  // Test room URL validity
  useEffect(() => {
    const testRoomUrl = async () => {
      try {
        console.log('🔍 Testing room URL accessibility...');
        await fetch(roomUrl, { method: 'HEAD', mode: 'no-cors' });
        console.log('✅ Room URL is accessible');
      } catch (error) {
        console.log('❌ Room URL test failed:', error);
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

  // Setup audio monitoring when media or connection changes
  useEffect(() => {
    if (state.connectionStatus === 'connected' && (localMedia.state.localStream || remoteParticipants.length > 0)) {
      console.log('🎤 Setting up audio monitoring...');
      setupAudioMonitoring();
    }
    
    return () => {
      cleanupAudioMonitoring();
    };
  }, [state.connectionStatus, localMedia.state.localStream, actualMicEnabled, remoteParticipants.length, setupAudioMonitoring, cleanupAudioMonitoring]);

  // Cleanup media streams on unmount or navigation
  useEffect(() => {
    return () => {
      console.log('🧹 VideoCall cleanup: Stopping all media streams...');
      
      // Cleanup audio monitoring
      cleanupAudioMonitoring();
      
      // Stop local media tracks
      if (localParticipant?.stream) {
        localParticipant.stream.getTracks().forEach(track => {
          console.log(`🛑 Stopping ${track.kind} track:`, track.id);
          track.stop();
        });
      }
      
      // Also cleanup localMedia streams
      if (localMedia.state.localStream) {
        localMedia.state.localStream.getTracks().forEach(track => {
          console.log(`🛑 Stopping localMedia ${track.kind} track:`, track.id);
          track.stop();
        });
      }
      
      // Force cleanup by calling any available cleanup actions
      if (actions.leaveRoom) {
        try {
          actions.leaveRoom();
          console.log('✅ Left room via actions.leaveRoom');
        } catch (error) {
          console.log('⚠️ Error leaving room:', error);
        }
      }
      
      console.log('✅ VideoCall cleanup completed');
    };
  }, [cleanupAudioMonitoring]); // Only run cleanup on unmount

  // Enhanced leave handler with cleanup
  const handleLeaveWithCleanup = useCallback(() => {
    console.log('🚪 Leaving call with cleanup...');
    
    // Stop all media tracks immediately
    if (localParticipant?.stream) {
      localParticipant.stream.getTracks().forEach(track => {
        console.log(`🛑 Manually stopping ${track.kind} track during leave`);
        track.stop();
      });
    }
    
    if (localMedia.state.localStream) {
      localMedia.state.localStream.getTracks().forEach(track => {
        console.log(`🛑 Manually stopping localMedia ${track.kind} track during leave`);
        track.stop();
      });
    }
    
    // Leave the room
    if (actions.leaveRoom) {
      try {
        actions.leaveRoom();
        console.log('✅ Left room successfully');
      } catch (error) {
        console.log('⚠️ Error leaving room:', error);
      }
    }
    
    // Small delay to ensure cleanup, then navigate
    setTimeout(() => {
      onLeave();
    }, 100);
  }, [onLeave]); // Simplified dependencies

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-purple-900 to-indigo-900 flex items-center justify-center p-4">
      <div className="backdrop-blur-xl bg-white/10 rounded-3xl p-8 shadow-2xl border border-white/20 w-full max-w-6xl">
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
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              {/* Local Participant */}
              {localParticipant?.stream && (
                <div className="relative">
                  <div className="rounded-2xl overflow-hidden bg-gray-900/50 aspect-video">
                    <VideoView 
                      stream={localParticipant.stream} 
                      muted 
                      className="w-full h-full object-cover"
                    />
                    {/* Dynamic Audio Indicator */}
                    {actualMicEnabled && (
                      <div className="absolute top-4 right-4">
                        <div className="flex items-center gap-2 bg-green-500/80 backdrop-blur-sm rounded-full px-3 py-1.5">
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
                          <Mic className="w-4 h-4 text-white" />
                          <span className="text-xs text-white">{localAudioLevel}%</span>
                        </div>
                      </div>
                    )}
                    <div className="absolute bottom-4 left-4 right-4">
                      <div className="backdrop-blur-sm bg-black/30 rounded-lg px-3 py-2">
                        <div className="text-white text-sm">
                          You ({localParticipant.displayName || displayName || 'Unknown'})
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Remote Participants */}
              {remoteParticipants.map((participant) => {
                // Debug logging for each remote participant
                console.log('🎭 Rendering remote participant:', {
                  id: participant.id,
                  displayName: participant.displayName,
                  hasStream: !!participant.stream,
                  streamId: participant.stream?.id,
                  videoTracks: participant.stream?.getVideoTracks().length || 0,
                  audioTracks: participant.stream?.getAudioTracks().length || 0
                });
                
                return (
                  <div key={participant.id} className="relative">
                    <div className="rounded-2xl overflow-hidden bg-gray-900/50 aspect-video">
                      {participant.stream ? (
                        <>
                          <VideoView 
                            stream={participant.stream} 
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute top-2 left-2 bg-blue-500/80 text-white text-xs px-2 py-1 rounded">
                            Remote: {participant.displayName}
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
                        <div className="absolute top-4 right-4">
                          <div className="flex items-center gap-2 bg-blue-500/80 backdrop-blur-sm rounded-full px-3 py-1.5">
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
                            <Mic className="w-4 h-4 text-white" />
                            <span className="text-xs text-white">{remoteAudioLevels[participant.id] || 0}%</span>
                          </div>
                        </div>
                      )}
                      <div className="absolute bottom-4 left-4 right-4">
                        <div className="backdrop-blur-sm bg-black/30 rounded-lg px-3 py-2">
                          <div className="text-white text-sm">
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
                  <div className="rounded-2xl overflow-hidden bg-gray-900/50 aspect-video flex items-center justify-center">
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
                onClick={() => {
                  console.log('Mic button clicked. Current state:', {
                    wherebyState: localParticipant?.isAudioEnabled,
                    actualMicEnabled,
                    hasActions: !!actions.toggleMicrophone
                  });
                  try {
                    actions.toggleMicrophone();
                    console.log('toggleMicrophone called successfully');
                  } catch (error) {
                    console.error('Error toggling microphone:', error);
                  }
                }}
                className={`p-4 rounded-full transition-all duration-200 ${
                  actualMicEnabled 
                    ? 'bg-green-500 hover:bg-green-600' 
                    : 'bg-red-500 hover:bg-red-600'
                }`}
              >
                {actualMicEnabled ? (
                  <Mic className="w-6 h-6 text-white" />
                ) : (
                  <MicOff className="w-6 h-6 text-white" />
                )}
              </button>

              <button
                onClick={() => {
                  console.log('Video button clicked. Current state:', {
                    wherebyState: localParticipant?.isVideoEnabled,
                    actualVideoEnabled,
                    hasActions: !!actions.toggleCamera
                  });
                  try {
                    actions.toggleCamera();
                    console.log('toggleCamera called successfully');
                  } catch (error) {
                    console.error('Error toggling camera:', error);
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
                    console.log('Camera changed to:', deviceId);
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
                    console.log('Microphone changed to:', deviceId);
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
                    console.log('Speaker changed to:', deviceId);
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