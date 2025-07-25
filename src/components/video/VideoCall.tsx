import { useState, useEffect, useCallback } from 'react';
import { useRoomConnection, useLocalMedia, VideoView } from '@whereby.com/browser-sdk/react';
import { Mic, MicOff, Video, VideoOff, Phone, MessageCircle, Settings } from 'lucide-react';

interface VideoCallProps {
  roomUrl: string;
  displayName: string;
  onLeave: () => void;
}

interface DeviceInfo {
  deviceId: string;
  label: string;
}

// Device preference utilities (shared with MediaSetup)
const DEVICE_PREFERENCES_KEY = 'whereby-device-preferences';

interface DevicePreferences {
  cameraDeviceId?: string;
  microphoneDeviceId?: string;
  speakerDeviceId?: string;
}

const loadDevicePreferences = (): DevicePreferences => {
  try {
    const saved = localStorage.getItem(DEVICE_PREFERENCES_KEY);
    return saved ? JSON.parse(saved) : {};
  } catch (error) {
    console.warn('Failed to load device preferences:', error);
    return {};
  }
};

const saveDevicePreferences = (preferences: DevicePreferences) => {
  try {
    localStorage.setItem(DEVICE_PREFERENCES_KEY, JSON.stringify(preferences));
  } catch (error) {
    console.warn('Failed to save device preferences:', error);
  }
};

export default function VideoCall({ roomUrl, displayName, onLeave }: VideoCallProps) {
  const [showChat, setShowChat] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [showDeviceSettings, setShowDeviceSettings] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [devices, setDevices] = useState<{
    cameras: DeviceInfo[];
    microphones: DeviceInfo[];
    speakers: DeviceInfo[];
  }>({
    cameras: [],
    microphones: [],
    speakers: []
  });
  const [devicePreferences, setDevicePreferences] = useState<DevicePreferences>(() => loadDevicePreferences());
  
  // Initialize media with basic settings
  const localMedia = useLocalMedia({
    audio: true,
    video: true,
  });

  const connection = useRoomConnection(roomUrl, {
    displayName: displayName,
  });

  const { state, actions } = connection;
  const { localParticipant, remoteParticipants } = state;

  // Simplified audio/video status
  const actualMicEnabled = localParticipant?.isAudioEnabled ?? true;
  const actualVideoEnabled = localParticipant?.isVideoEnabled ?? true;

  // Load available devices
  useEffect(() => {
    const getDevices = async () => {
      try {
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
      } catch (error) {
        console.error('Error loading devices:', error);
      }
    };

    getDevices();
  }, []);

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
      default:
        return "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 mb-6";
    }
  };

  const getVideoClasses = () => {
    switch (totalParticipants) {
      case 0:
      case 1:
      case 2:
        return "aspect-video";
      default:
        return "aspect-[4/3]";
    }
  };

  const handleSendMessage = () => {
    if (chatInput.trim()) {
      try {
        if (actions.sendChatMessage) {
          actions.sendChatMessage(chatInput.trim());
        }
        setChatInput('');
      } catch (error) {
        console.error('Failed to send chat message:', error);
      }
    }
  };

  // Apply saved device preferences when local stream is ready
  useEffect(() => {
    const applyDevicePreferences = async () => {
      if (!localParticipant?.stream || !devicePreferences.cameraDeviceId) return;
      
      try {
        console.log('📹 Applying saved camera preference:', devicePreferences.cameraDeviceId);
        
        // Get new stream with preferred camera
        const constraints: MediaStreamConstraints = {
          video: { deviceId: { exact: devicePreferences.cameraDeviceId } },
          audio: devicePreferences.microphoneDeviceId 
            ? { deviceId: { exact: devicePreferences.microphoneDeviceId } }
            : true
        };
        
        const newStream = await navigator.mediaDevices.getUserMedia(constraints);
        
        // Replace video track in existing stream
        const videoTrack = newStream.getVideoTracks()[0];
        const audioTrack = newStream.getAudioTracks()[0];
        
        if (videoTrack && localParticipant.stream) {
          // Replace video track
          const oldVideoTrack = localParticipant.stream.getVideoTracks()[0];
          if (oldVideoTrack) {
            localParticipant.stream.removeTrack(oldVideoTrack);
            oldVideoTrack.stop();
          }
          localParticipant.stream.addTrack(videoTrack);
        }
        
        if (audioTrack && localParticipant.stream && devicePreferences.microphoneDeviceId) {
          // Replace audio track
          const oldAudioTrack = localParticipant.stream.getAudioTracks()[0];
          if (oldAudioTrack) {
            localParticipant.stream.removeTrack(oldAudioTrack);
            oldAudioTrack.stop();
          }
          localParticipant.stream.addTrack(audioTrack);
        }
        
        console.log('✅ Device preferences applied successfully');
        
      } catch (error) {
        console.error('❌ Failed to apply device preferences:', error);
      }
    };

    if (localParticipant?.stream && (devicePreferences.cameraDeviceId || devicePreferences.microphoneDeviceId)) {
      applyDevicePreferences();
    }
  }, [localParticipant?.stream, devicePreferences.cameraDeviceId, devicePreferences.microphoneDeviceId]);

  // Auto-join room when connection is ready
  useEffect(() => {
    if (state.connectionStatus === 'ready' && actions.joinRoom) {
      console.log('🚀 Auto-joining room...');
      actions.joinRoom();
    }
  }, [state.connectionStatus, actions.joinRoom]);

  // Enhanced leave handler with cleanup
  const handleLeave = useCallback(async () => {
    try {
      console.log('🚨 Leaving call - cleaning up media streams');
      
      // Stop all media tracks immediately
      if (localParticipant?.stream) {
        localParticipant.stream.getTracks().forEach(track => {
          track.stop();
        });
      }
      
      if (localMedia.state.localStream) {
        localMedia.state.localStream.getTracks().forEach(track => {
          track.stop();
        });
      }
      
      // Leave the room
      if (actions.leaveRoom) {
        await actions.leaveRoom();
      }
      
    } catch (error) {
      console.error('Error during cleanup:', error);
    } finally {
      onLeave();
    }
  }, [localParticipant?.stream, localMedia.state.localStream, actions.leaveRoom, onLeave]);

  // FIXED: Proper mute handling - don't stop tracks, just mute them
  const handleMicToggle = useCallback(async () => {
    try {
      console.log(`🎤 ${actualMicEnabled ? 'Muting' : 'Unmuting'} microphone...`);
      
      // Use Whereby's built-in toggle - this handles everything properly
      if (actions.toggleMicrophone) {
        actions.toggleMicrophone();
      }
      
    } catch (error) {
      console.error('Error in mute control:', error);
    }
  }, [actualMicEnabled, actions.toggleMicrophone]);

  // Handle device changes
  const handleDeviceChange = async (deviceType: keyof DevicePreferences, deviceId: string) => {
    const newPreferences = { ...devicePreferences, [deviceType]: deviceId };
    setDevicePreferences(newPreferences);
    saveDevicePreferences(newPreferences);

    // For now, just save preferences - actual device switching during call is complex
    console.log(`Device preference updated: ${deviceType} = ${deviceId}`);
  };

  // Add debug toggle functionality
  const toggleDebug = () => setShowDebug(!showDebug);

  if (state.connectionStatus === 'connecting') {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-white mx-auto"></div>
          <p className="mt-4 text-white text-xl">Connecting to room...</p>
        </div>
      </div>
    );
  }

  if (state.connectionStatus === 'disconnected') {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-500 text-6xl mb-4">❌</div>
          <p className="text-white text-xl mb-4">Failed to connect to room</p>
          <button
            onClick={handleLeave}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg"
          >
            Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-purple-900 to-indigo-900 flex items-center justify-center p-4">
      <div className={`backdrop-blur-xl bg-white/10 rounded-3xl shadow-2xl border border-white/20 w-full ${
        totalParticipants > 6 ? 'max-w-7xl p-4' : totalParticipants > 4 ? 'max-w-6xl p-6' : 'max-w-6xl p-8'
      }`}>
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-4">Video Call</h1>
          <p className="text-blue-200">Welcome, {displayName}!</p>
          <p className="text-blue-300 text-sm mt-2">
            {remoteParticipants.length + 1} participant{remoteParticipants.length !== 0 ? 's' : ''} • {state.connectionStatus}
          </p>
        </div>

        {state.connectionStatus === 'reconnecting' && (
          <div className="text-center py-8">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-white mb-4"></div>
            <p className="text-white">Reconnecting to room...</p>
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
            {/* Device Settings Panel */}
            {showDeviceSettings && (
              <div className="mb-4 p-4 bg-black/20 rounded-xl border border-white/10">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-white font-medium">Device Settings</h3>
                  <button
                    onClick={() => setShowDeviceSettings(false)}
                    className="text-gray-400 hover:text-white text-sm"
                  >
                    ✕
                  </button>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-blue-200 text-sm font-medium mb-2">Camera</label>
                    <select
                      value={devicePreferences.cameraDeviceId || ''}
                      onChange={(e) => handleDeviceChange('cameraDeviceId', e.target.value)}
                      className="w-full px-3 py-2 bg-gray-700 text-white rounded border border-gray-600 focus:border-blue-500 focus:outline-none text-sm"
                    >
                      {devices.cameras.map((camera) => (
                        <option key={camera.deviceId} value={camera.deviceId}>
                          {camera.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-blue-200 text-sm font-medium mb-2">Microphone</label>
                    <select
                      value={devicePreferences.microphoneDeviceId || ''}
                      onChange={(e) => handleDeviceChange('microphoneDeviceId', e.target.value)}
                      className="w-full px-3 py-2 bg-gray-700 text-white rounded border border-gray-600 focus:border-blue-500 focus:outline-none text-sm"
                    >
                      {devices.microphones.map((mic) => (
                        <option key={mic.deviceId} value={mic.deviceId}>
                          {mic.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-blue-200 text-sm font-medium mb-2">Speaker</label>
                    <select
                      value={devicePreferences.speakerDeviceId || ''}
                      onChange={(e) => handleDeviceChange('speakerDeviceId', e.target.value)}
                      className="w-full px-3 py-2 bg-gray-700 text-white rounded border border-gray-600 focus:border-blue-500 focus:outline-none text-sm"
                    >
                      {devices.speakers.map((speaker) => (
                        <option key={speaker.deviceId} value={speaker.deviceId}>
                          {speaker.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                
                <div className="mt-4 p-3 bg-blue-500/20 border border-blue-500/40 rounded">
                  <p className="text-blue-200 text-sm">
                    💡 Device changes will take effect on your next call. Current call uses devices selected during setup.
                  </p>
                </div>
              </div>
            )}

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
                    <div className="absolute bottom-2 left-2 right-2">
                      <div className="backdrop-blur-sm bg-black/30 rounded-lg px-3 py-2">
                        <div className="text-white truncate text-sm">
                          You ({localParticipant.displayName || displayName || 'Unknown'})
                        </div>
                      </div>
                    </div>
                    
                    {/* Audio/Video Status Indicators */}
                    <div className="absolute top-2 right-2 flex gap-2">
                      {!actualMicEnabled && (
                        <div className="bg-red-500/80 backdrop-blur-sm rounded-full p-1">
                          <MicOff className="w-3 h-3 text-white" />
                        </div>
                      )}
                      {!actualVideoEnabled && (
                        <div className="bg-red-500/80 backdrop-blur-sm rounded-full p-1">
                          <VideoOff className="w-3 h-3 text-white" />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Remote Participants */}
              {remoteParticipants.map((participant) => (
                <div key={participant.id} className="relative">
                  <div className={`rounded-2xl overflow-hidden bg-gray-900/50 ${getVideoClasses()}`}>
                    {participant.stream ? (
                      <VideoView
                        stream={participant.stream}
                        className="w-full h-full object-cover"
                      />
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
                    
                    {/* Audio/Video Status Indicators */}
                    <div className="absolute top-2 right-2 flex gap-2">
                      {!participant.isAudioEnabled && (
                        <div className="bg-red-500/80 backdrop-blur-sm rounded-full p-1">
                          <MicOff className="w-3 h-3 text-white" />
                        </div>
                      )}
                      {!participant.isVideoEnabled && (
                        <div className="bg-red-500/80 backdrop-blur-sm rounded-full p-1">
                          <VideoOff className="w-3 h-3 text-white" />
                        </div>
                      )}
                    </div>
                    
                    <div className="absolute bottom-2 left-2 right-2">
                      <div className="backdrop-blur-sm bg-black/30 rounded-lg px-3 py-2">
                        <div className="text-white truncate text-sm">
                          {participant.displayName || 'Unknown'}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}

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
                onClick={handleMicToggle}
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
                onClick={() => actions.toggleCamera?.()}
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
                onClick={() => setShowDeviceSettings(!showDeviceSettings)}
                className={`p-4 rounded-full transition-all duration-200 ${
                  showDeviceSettings 
                    ? 'bg-purple-500 hover:bg-purple-600' 
                    : 'bg-gray-600 hover:bg-gray-700'
                }`}
              >
                <Settings className="w-6 h-6 text-white" />
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
                onClick={toggleDebug}
                className={`p-4 rounded-full transition-all duration-200 ${
                  showDebug 
                    ? 'bg-orange-500 hover:bg-orange-600' 
                    : 'bg-gray-600 hover:bg-gray-700'
                }`}
                title="Debug Info"
              >
                <span className="text-white text-sm font-mono">DB</span>
              </button>

              <button
                onClick={handleLeave}
                className="p-4 rounded-full bg-red-500 hover:bg-red-600 transition-all duration-200"
              >
                <Phone className="w-6 h-6 text-white" />
              </button>
            </div>
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
            
            <div className="h-40 overflow-y-auto mb-4 space-y-2 bg-black/10 rounded-lg p-3">
              <p className="text-gray-400 text-sm text-center py-4">No messages yet. Start a conversation!</p>
            </div>
            
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
        {showDebug && (
          <div className="mt-6 p-4 bg-black/20 rounded-xl border border-white/10">
            <h3 className="text-white font-medium mb-4">Debug Info</h3>
            <div className="space-y-2 text-sm text-blue-200">
              <p><strong>Connection Status:</strong> {state.connectionStatus}</p>
              <p><strong>Room URL:</strong> {roomUrl}</p>
              <p><strong>Local Participant:</strong> {localParticipant ? 'exists' : 'none'}</p>
              <p><strong>Participant ID:</strong> {localParticipant?.id || 'none'}</p>
              <p><strong>Display Name:</strong> {localParticipant?.displayName || 'none'}</p>
              <p><strong>Audio Enabled (Whereby):</strong> {localParticipant?.isAudioEnabled ? 'yes' : 'no'}</p>
              <p><strong>Video Enabled (Whereby):</strong> {localParticipant?.isVideoEnabled ? 'yes' : 'no'}</p>
              <p><strong>Remote Participants:</strong> {remoteParticipants.length}</p>
              <p><strong>Has Stream:</strong> {localParticipant?.stream ? 'yes' : 'no'}</p>
              <p><strong>Device Preferences:</strong></p>
              <div className="ml-4 text-xs">
                <p>Camera: {devicePreferences.cameraDeviceId || 'default'}</p>
                <p>Microphone: {devicePreferences.microphoneDeviceId || 'default'}</p>
                <p>Speaker: {devicePreferences.speakerDeviceId || 'default'}</p>
              </div>
              <p><strong>Current Stream Info:</strong></p>
              <div className="ml-4 text-xs">
                <p>Video Tracks: {localParticipant?.stream?.getVideoTracks().length || 0}</p>
                <p>Audio Tracks: {localParticipant?.stream?.getAudioTracks().length || 0}</p>
                {localParticipant?.stream?.getVideoTracks().map((track, i) => (
                  <p key={i}>Video {i}: {track.label} ({track.getSettings().deviceId})</p>
                ))}
                {localParticipant?.stream?.getAudioTracks().map((track, i) => (
                  <p key={i}>Audio {i}: {track.label} ({track.getSettings().deviceId})</p>
                ))}
              </div>
              <p><strong>Available Actions:</strong></p>
              <div className="ml-4 text-xs">
                <p>toggleCamera: available</p>
                <p>toggleMicrophone: available</p>
                <p>Actions count: {Object.keys(actions).length}</p>
              </div>
            </div>
          </div>
        )}

        {/* Back to Setup Button */}
        <div className="mt-6 text-center">
          <button
            onClick={handleLeave}
            className="px-6 py-3 rounded-xl backdrop-blur-sm bg-white/10 border border-white/20 text-white hover:bg-white/20 transition-all duration-200 font-medium"
          >
            Back to Setup
          </button>
        </div>
      </div>
    </div>
  );
} 