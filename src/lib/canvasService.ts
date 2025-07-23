import { supabase, type CanvasStroke, type CanvasCursor } from './supabase'
import type { DrawingStroke, Collaborator } from '../state/canvas'

export class CanvasService {
  private roomId: string
  private userId: string
  private userName: string
  private userColor: string
  private onStrokeAdded?: (stroke: DrawingStroke) => void
  private onStrokeDeleted?: (strokeId: string) => void
  private onCanvasCleared?: () => void
  private onCursorUpdated?: (userId: string, x: number, y: number, userName: string, userColor: string) => void
  private onCursorRemoved?: (userId: string) => void
  private onUserJoined?: (user: Collaborator) => void
  private onUserLeft?: (userId: string) => void

  private realtimeChannel: ReturnType<typeof supabase.channel> | null = null
  private cursorUpdateTimeout: NodeJS.Timeout | null = null

  constructor(roomId: string, userId: string, userName: string, userColor: string) {
    this.roomId = roomId
    this.userId = userId
    this.userName = userName
    this.userColor = userColor
  }

  // Set up event handlers
  onEvents(handlers: {
    onStrokeAdded?: (stroke: DrawingStroke) => void
    onStrokeDeleted?: (strokeId: string) => void
    onCanvasCleared?: () => void
    onCursorUpdated?: (userId: string, x: number, y: number, userName: string, userColor: string) => void
    onCursorRemoved?: (userId: string) => void
    onUserJoined?: (user: Collaborator) => void
    onUserLeft?: (userId: string) => void
  }) {
    Object.assign(this, handlers)
  }

  // Connect to real-time collaboration
  async connect(): Promise<boolean> {
    try {
      // Load existing strokes
      await this.loadExistingStrokes()

      // Set up real-time channel
      this.realtimeChannel = supabase
        .channel(`canvas-${this.roomId}`)
        .on(
          'postgres_changes',
          { 
            event: 'INSERT', 
            schema: 'public', 
            table: 'canvas_strokes',
            filter: `room_id=eq.${this.roomId}`
          },
          (payload) => {
            const stroke = this.convertToDrawingStroke(payload.new as CanvasStroke)
            if (stroke && payload.new.user_id !== this.userId) {
              this.onStrokeAdded?.(stroke)
            }
          }
        )
        .on(
          'postgres_changes',
          { 
            event: 'DELETE', 
            schema: 'public', 
            table: 'canvas_strokes',
            filter: `room_id=eq.${this.roomId}`
          },
          (payload) => {
            if (payload.old.user_id !== this.userId) {
              this.onStrokeDeleted?.(payload.old.id)
            }
          }
        )
        .on(
          'postgres_changes',
          { 
            event: '*', 
            schema: 'public', 
            table: 'canvas_cursors',
            filter: `room_id=eq.${this.roomId}`
          },
          (payload) => {
            if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
              const cursor = payload.new as CanvasCursor
              if (cursor.user_id !== this.userId) {
                this.onCursorUpdated?.(cursor.user_id, cursor.x, cursor.y, cursor.user_name, cursor.user_color)
              }
            } else if (payload.eventType === 'DELETE') {
              const cursor = payload.old as CanvasCursor
              if (cursor.user_id !== this.userId) {
                this.onCursorRemoved?.(cursor.user_id)
              }
            }
          }
        )
        .subscribe()

      // Announce our presence
      await this.updateCursor(0, 0) // Initial cursor position
      
      return true
    } catch (error) {
      console.error('Failed to connect to Canvas collaboration:', error)
      return false
    }
  }

  // Load existing strokes from database
  private async loadExistingStrokes() {
    const { data: strokes, error } = await supabase
      .from('canvas_strokes')
      .select('*')
      .eq('room_id', this.roomId)
      .order('created_at', { ascending: true })

    if (error) {
      console.error('Failed to load canvas strokes:', error)
      return
    }

    strokes?.forEach(stroke => {
      const drawingStroke = this.convertToDrawingStroke(stroke)
      if (drawingStroke) {
        this.onStrokeAdded?.(drawingStroke)
      }
    })
  }

  // Convert Supabase stroke to DrawingStroke
  private convertToDrawingStroke(supabaseStroke: CanvasStroke): DrawingStroke | null {
    try {
      return {
        id: supabaseStroke.id,
        points: supabaseStroke.stroke_data.points,
        color: supabaseStroke.stroke_data.color,
        size: supabaseStroke.stroke_data.size,
        tool: supabaseStroke.stroke_data.tool,
        userId: supabaseStroke.user_id,
        completed: true
      }
    } catch (error) {
      console.error('Failed to convert stroke:', error)
      return null
    }
  }

  // Add a stroke to the database
  async addStroke(stroke: DrawingStroke): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('canvas_strokes')
        .insert({
          id: stroke.id,
          room_id: this.roomId,
          user_id: this.userId,
          user_name: this.userName,
          user_color: this.userColor,
          stroke_data: {
            points: stroke.points,
            color: stroke.color,
            size: stroke.size,
            tool: stroke.tool
          }
        })

      if (error) {
        console.error('Failed to add stroke:', error)
        return false
      }

      return true
    } catch (error) {
      console.error('Failed to add stroke:', error)
      return false
    }
  }

  // Delete a stroke from the database
  async deleteStroke(strokeId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('canvas_strokes')
        .delete()
        .eq('id', strokeId)
        .eq('user_id', this.userId) // Only allow users to delete their own strokes

      if (error) {
        console.error('Failed to delete stroke:', error)
        return false
      }

      return true
    } catch (error) {
      console.error('Failed to delete stroke:', error)
      return false
    }
  }

  // Clear all strokes from the canvas
  async clearCanvas(): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('canvas_strokes')
        .delete()
        .eq('room_id', this.roomId)

      if (error) {
        console.error('Failed to clear canvas:', error)
        return false
      }

      return true
    } catch (error) {
      console.error('Failed to clear canvas:', error)
      return false
    }
  }

  // Update cursor position with debouncing
  async updateCursor(x: number, y: number) {
    // Clear existing timeout
    if (this.cursorUpdateTimeout) {
      clearTimeout(this.cursorUpdateTimeout)
    }

    // Debounce cursor updates to avoid too many database calls
    this.cursorUpdateTimeout = setTimeout(async () => {
      try {
        const { error } = await supabase
          .from('canvas_cursors')
          .upsert({
            user_id: this.userId,
            room_id: this.roomId,
            user_name: this.userName,
            user_color: this.userColor,
            x,
            y,
            updated_at: new Date().toISOString()
          })

        if (error) {
          console.error('Failed to update cursor:', error)
        }
      } catch (error) {
        console.error('Failed to update cursor:', error)
      }
    }, 50) // 50ms debounce
  }

  // Remove cursor when leaving
  async removeCursor() {
    try {
      if (this.cursorUpdateTimeout) {
        clearTimeout(this.cursorUpdateTimeout)
        this.cursorUpdateTimeout = null
      }

      const { error } = await supabase
        .from('canvas_cursors')
        .delete()
        .eq('user_id', this.userId)
        .eq('room_id', this.roomId)

      if (error) {
        console.error('Failed to remove cursor:', error)
      }
    } catch (error) {
      console.error('Failed to remove cursor:', error)
    }
  }

  // Disconnect from collaboration
  async disconnect() {
    if (this.realtimeChannel) {
      await supabase.removeChannel(this.realtimeChannel)
      this.realtimeChannel = null
    }

    await this.removeCursor()
  }
} 