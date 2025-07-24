import { useState, useEffect, useCallback } from 'react';
import { useRoomConnection, useLocalMedia, VideoView } from '@whereby.com/browser-sdk/react';
import { Mic, MicOff, Video, VideoOff, Phone, MessageCircle } from 'lucide-react';

interface VideoCallProps {
  roomUrl: string;
  displayName: string;
  onLeave: () => void;
}

export default function VideoCall({ roomUrl, displayName, onLeave }: VideoCallProps) {
  const [showChat, setShowChat] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [chatInput, setChatInput] = useState('');
  
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

  // Simplified audio/video status
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
      console.log('🚨 Page unload detected - stopping all media streams');
      
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

  // Helper function to get participant display name
  const getParticipantDisplayName = (participantId: string) => {
    if (localParticipant?.id === participantId) {
      return localParticipant.displayName || displayName || 'You';
    }
    
    const remoteParticipant = remoteParticipants.find(p => p.id === participantId);
    if (remoteParticipant) {
      return remoteParticipant.displayName || 'Unknown';
    }
    
    return participantId;
  };

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
    <div className="min-h-screen bg-black text-white p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Video Call</h1>
            <p className="text-gray-400">
              {remoteParticipants.length + 1} participant{remoteParticipants.length !== 0 ? 's' : ''}
            </p>
          </div>
          
          <div className="flex items-center gap-4">
            <button
              onClick={() => setShowChat(!showChat)}
              className="p-3 bg-gray-800 hover:bg-gray-700 rounded-lg"
            >
              <MessageCircle className="w-5 h-5" />
            </button>
            
            <button
              onClick={() => setShowDebug(!showDebug)}
              className="p-3 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm"
            >
              Debug
            </button>
          </div>
        </div>

        {/* Video Grid */}
        <div className={getGridClasses()}>
          {/* Local Participant */}
          {localParticipant?.stream && (
            <div className="relative group">
              <div className={`bg-gray-900 rounded-xl overflow-hidden ${getVideoClasses()}`}>
                <VideoView
                  stream={localParticipant.stream}
                  muted={true}
                  className="w-full h-full object-cover"
                />
                <div className="absolute bottom-2 left-2 right-2">
                  <div className="backdrop-blur-sm bg-black/30 rounded-lg px-3 py-2">
                    <span className="text-sm text-white font-medium">
                      {getParticipantDisplayName(localParticipant.id)} (You)
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Remote Participants */}
          {remoteParticipants.map((participant) => (
            <div key={participant.id} className="relative group">
              <div className={`bg-gray-900 rounded-xl overflow-hidden ${getVideoClasses()}`}>
                {participant.stream ? (
                  <VideoView
                    stream={participant.stream}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gray-800">
                    <div className="text-center">
                      <div className="w-16 h-16 bg-gray-600 rounded-full flex items-center justify-center mx-auto mb-2">
                        <span className="text-xl font-bold">
                          {(participant.displayName || 'U')[0].toUpperCase()}
                        </span>
                      </div>
                      <p className="text-sm text-gray-300">No video</p>
                    </div>
                  </div>
                )}
                <div className="absolute bottom-2 left-2 right-2">
                  <div className="backdrop-blur-sm bg-black/30 rounded-lg px-3 py-2">
                    <span className="text-sm text-white font-medium">
                      {getParticipantDisplayName(participant.id)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Controls */}
        <div className="flex items-center justify-center gap-4">
          <button
            onClick={() => actions.toggleMicrophone?.()}
            className={`p-4 rounded-full ${
              actualMicEnabled 
                ? 'bg-gray-800 hover:bg-gray-700' 
                : 'bg-red-600 hover:bg-red-700'
            }`}
          >
            {actualMicEnabled ? <Mic className="w-6 h-6" /> : <MicOff className="w-6 h-6" />}
          </button>

          <button
            onClick={() => actions.toggleCamera?.()}
            className={`p-4 rounded-full ${
              actualVideoEnabled 
                ? 'bg-gray-800 hover:bg-gray-700' 
                : 'bg-red-600 hover:bg-red-700'
            }`}
          >
            {actualVideoEnabled ? <Video className="w-6 h-6" /> : <VideoOff className="w-6 h-6" />}
          </button>

          <button
            onClick={handleLeave}
            className="p-4 bg-red-600 hover:bg-red-700 rounded-full"
          >
            <Phone className="w-6 h-6" />
          </button>
        </div>

        {/* Chat Panel */}
        {showChat && (
          <div className="fixed right-4 top-4 bottom-4 w-80 bg-gray-900 rounded-lg flex flex-col">
            <div className="p-4 border-b border-gray-700">
              <h3 className="font-semibold">Chat</h3>
            </div>
            <div className="flex-1 p-4 overflow-y-auto">
              <p className="text-gray-400 text-sm">No messages yet</p>
            </div>
            <div className="p-4 border-t border-gray-700">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                  placeholder="Type a message..."
                  className="flex-1 px-3 py-2 bg-gray-800 rounded-lg"
                />
                <button
                  onClick={handleSendMessage}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg"
                >
                  Send
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Debug Panel */}
        {showDebug && (
          <div className="fixed left-4 top-4 w-80 bg-gray-900 rounded-lg p-4 max-h-96 overflow-y-auto">
            <h3 className="font-semibold mb-4">Debug Info</h3>
            <div className="space-y-2 text-sm">
              <div>Connection Status: {state.connectionStatus}</div>
              <div>Room URL: {roomUrl}</div>
              <div>Local Participant: {localParticipant ? 'exists' : 'none'}</div>
              <div>Remote Participants: {remoteParticipants.length}</div>
              <div>Audio Enabled: {actualMicEnabled ? 'yes' : 'no'}</div>
              <div>Video Enabled: {actualVideoEnabled ? 'yes' : 'no'}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
} 