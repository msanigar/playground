import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_KEY

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase environment variables. Please check your .env file.')
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  realtime: {
    params: {
      eventsPerSecond: 50 // Increased for canvas drawing
    }
  }
})

// Database schema types for Canvas
export type CanvasStroke = {
  id: string
  room_id: string
  user_id: string
  user_name: string
  user_color: string
  stroke_data: {
    points: Array<{ x: number; y: number; pressure?: number; timestamp: number }>
    color: string
    size: number
    tool: 'brush' | 'eraser'
  }
  created_at: string
}

export type CanvasCursor = {
  user_id: string
  room_id: string
  user_name: string
  user_color: string
  x: number
  y: number
  updated_at: string
}

// Canvas operations for real-time sync
export type CanvasRealtimeEvent = 
  | { type: 'stroke-add'; stroke: CanvasStroke }
  | { type: 'stroke-delete'; stroke_id: string }
  | { type: 'canvas-clear'; room_id: string }
  | { type: 'cursor-update'; cursor: CanvasCursor }
  | { type: 'cursor-remove'; user_id: string; room_id: string }
  | { type: 'user-join'; user: { id: string; name: string; color: string }; room_id: string }
  | { type: 'user-leave'; user_id: string; room_id: string } 