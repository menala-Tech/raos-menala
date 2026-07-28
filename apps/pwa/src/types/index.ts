export type UserRole = 'direksi' | 'admin' | 'management' | 'koordinator' | 'staff' | 'driver_manager'

export interface Branch {
  id: string
  code: string
  name: string
  is_active: boolean
}

export interface PickupPoint {
  id: string
  branch_id: string
  code: string
  name: string
  latitude: number
  longitude: number
  radius_meters: number
  is_active: boolean
}

export interface UserProfile {
  id: string
  staff_id: string
  full_name: string
  role: UserRole
  branch_id: string
  phone?: string
  avatar_url?: string
  is_active: boolean
  source?: 'manual' | 'ssot_master_staff'
  ssot_synced_at?: string
  branches?: Branch
}

export interface Attendance {
  id: string
  staff_id: string
  branch_id: string
  pickup_point_id: string
  shift_id: string
  date: string
  check_in_at?: string
  check_out_at?: string
  selfie_in_url?: string
  selfie_out_url?: string
  status: 'hadir' | 'terlambat' | 'tidak_hadir' | 'sakit' | 'izin'
  is_location_valid: boolean
}

export interface Driver {
  id: string
  driver_id: string
  name: string
  phone?: string
  vehicle_type?: string
  vehicle_plate?: string
  branch_id: string
  barcode?: string
  is_active: boolean
  source?: 'manual' | 'ssot_driver_airport'
}

export interface ScanOrder {
  id: string
  scan_id: string
  driver_id: string
  staff_id: string
  pickup_point_id: string
  scanned_at: string
  latitude?: number
  longitude?: number
  status: 'pending' | 'valid' | 'rejected'
  koordinator_id?: string
  validated_at?: string
  admin_checked: boolean
  gmv: number
  incentive: number
  drivers?: Driver
}

export interface ChatRoom {
  id: string
  name: string
  category: string
  branch_id?: string
  description?: string
  auto_delete_days?: number
  is_active: boolean
}

/** Return type dari RPC get_chat_rooms_for_user() */
export interface ChatRoomWithMeta extends ChatRoom {
  last_message_content: string | null
  last_message_at: string | null
  last_message_sender: string | null
  unread_count: number
}

export interface ChatMessage {
  id: string
  room_id: string
  sender_id: string
  type: string
  content?: string
  media_url?: string
  is_pinned?: boolean
  pinned_at?: string
  pinned_by?: string
  created_at: string
  user_profiles?: UserProfile
}

export interface ChatPollOption {
  id: string
  text: string
}

export interface ChatPoll {
  id: string
  room_id: string
  message_id: string
  creator_id: string
  question: string
  options: ChatPollOption[]
  is_multiple_choice: boolean
  is_closed: boolean
  closed_at?: string
  created_at: string
}

export interface ChatPollVote {
  id: string
  poll_id: string
  voter_id: string
  option_id: string
  created_at: string
}

export interface ChatMessageReaction {
  id: string
  message_id: string
  room_id: string
  user_id: string
  emoji: string
  created_at: string
}

export interface Notification {
  id: string
  user_id: string
  title: string
  body: string
  type: string
  is_read: boolean
  created_at: string
}

export type Database = {
  public: {
    Tables: {
      user_profiles: { Row: UserProfile }
      branches: { Row: Branch }
      pickup_points: { Row: PickupPoint }
      attendance: { Row: Attendance }
      scan_orders: { Row: ScanOrder }
      drivers: { Row: Driver }
      chat_rooms: { Row: ChatRoom }
      chat_messages: { Row: ChatMessage }
      notifications: { Row: Notification }
    }
  }
}
