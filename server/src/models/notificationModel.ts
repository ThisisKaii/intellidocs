import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { Notification } from '../types/index'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

export async function createNotification(
  userId: string,
  type: string,
  title: string,
  message: string,
  metadata: Record<string, unknown> = {}
): Promise<Notification> {
  const { data, error } = await supabase
    .from('notifications')
    .insert({
      user_id: userId,
      type,
      title,
      message,
      metadata,
      read: false,
    })
    .select()
    .single()

  if (error) throw new Error(`Failed to create notification: ${error.message}`)
  return data
}

export async function getUserNotifications(
  userId: string
): Promise<Notification[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) throw new Error(`Failed to fetch notifications: ${error.message}`)
  return data || []
}

export async function markNotificationAsRead(
  notificationId: string,
  userId: string
): Promise<Notification> {
  const { data, error } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('notification_id', notificationId)
    .eq('user_id', userId)
    .select()
    .single()

  if (error) throw new Error(`Failed to mark notification as read: ${error.message}`)
  return data
}
