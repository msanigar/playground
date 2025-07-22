interface WherebyRoom {
  roomUrl: string;
  roomName: string;
  startDate: string;
  endDate: string;
}

interface CreateRoomResponse {
  roomUrl: string;
  roomName: string;
  startDate: string;
  endDate: string;
  hostRoomUrl?: string;
}

class WherebyService {
  private readonly apiKey: string;
  private readonly apiUrl = 'https://api.whereby.dev/v1';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async createRoom(endDate?: string): Promise<CreateRoomResponse> {
    // Default to 24 hours from now if no end date provided
    const defaultEndDate = new Date();
    defaultEndDate.setHours(defaultEndDate.getHours() + 24);
    
    const requestBody = {
      endDate: endDate || defaultEndDate.toISOString(),
      fields: ['hostRoomUrl'] // Request host room URL for better functionality
    };

    const response = await fetch(`${this.apiUrl}/meetings`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to create Whereby room: ${response.status} ${errorText}`);
    }

    const roomData: CreateRoomResponse = await response.json();
    console.log('Created Whereby room:', roomData.roomUrl);
    
    return roomData;
  }

  async deleteRoom(roomName: string): Promise<void> {
    const response = await fetch(`${this.apiUrl}/meetings/${encodeURIComponent(roomName)}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to delete Whereby room: ${response.status} ${errorText}`);
    }

    console.log('Deleted Whereby room:', roomName);
  }
}

// Create a singleton instance
const getWherebyService = () => {
  const apiKey = import.meta.env.VITE_WHEREBY_API_KEY;
  
  if (!apiKey) {
    console.warn('VITE_WHEREBY_API_KEY not found in environment variables. Using fallback room creation.');
    return null;
  }
  
  return new WherebyService(apiKey);
};

export { WherebyService, getWherebyService };
export type { WherebyRoom, CreateRoomResponse }; 