'use client'

import type React from 'react'
import { forwardRef } from 'react'
import { MessageCircle, SmilePlus } from 'lucide-react'
import clsx from 'clsx'
import type { ChatMessage, ChatMessageReaction, ChatPoll, ChatPollVote, UserProfile } from '@/types'
import type { DriverPayload, QueuePayload } from '@/lib/actionCardParser'
import WorkspaceCard from './WorkspaceCard'
import type { ActionMenu, ReadSummaryEntry } from './types'
import { PIN_ROLES } from './types'
import TimelineMessage from './TimelineMessage'

interface Props {
  messages: ChatMessage[]
  user: UserProfile
  reactions: Record<string, ChatMessageReaction[]>
  polls: Record<string, { poll: ChatPoll; votes: ChatPollVote[] }>
  readSummary: Record<string, ReadSummaryEntry>
  actionBusy: Record<string, boolean>
  registerMessageRef: (msgId: string, el: HTMLDivElement | null) => void
  onOpenLightbox: (url: string) => void
  onOpenReadersModal: (msgId: string) => void
  onVotePoll: (poll: ChatPoll, optionId: string) => void
  onClosePoll: (poll: ChatPoll) => void
  onToggleReaction: (messageId: string, emoji: string) => void
  onOpenActionMenu: (menu: ActionMenu) => void
  onStartLongPress: (msgId: string, isMe: boolean, content?: string) => void
  onCancelLongPress: () => void
  onDriverApprove: (msgId: string, payload: DriverPayload) => void
  onDriverReject: (msgId: string, payload: DriverPayload) => void
  onDriverActivate: (msgId: string, payload: DriverPayload) => void
  onQueueApprove: (msgId: string, payload: QueuePayload) => void
  onQueueReject: (msgId: string, payload: QueuePayload) => void
  onQueueComplete: (msgId: string, payload: QueuePayload) => void
  onTagSender?: (userId: string, fullName: string) => void
}

const WorkspaceTimeline = forwardRef<HTMLDivElement, Props>(function WorkspaceTimeline(props, bottomRef) {
  const { messages, user } = props
  const canPin = PIN_ROLES.includes(user.role)

  const groupedReactions = (msgId: string) => {
    const list = props.reactions[msgId] ?? []
    const map: Record<string, { count: number; mine: boolean }> = {}
    list.forEach(r => {
      if (!map[r.emoji]) map[r.emoji] = { count: 0, mine: false }
      map[r.emoji].count++
      if (r.user_id === user.id) map[r.emoji].mine = true
    })
    return Object.entries(map).map(([emoji, v]) => ({ emoji, ...v }))
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 bg-gray-50">
      {messages.length === 0 && (
        <div className="text-center py-10 text-gray-400">
          <MessageCircle size={32} className="mx-auto mb-2 opacity-30" />
          <p className="text-sm">Belum ada aktivitas di workspace ini</p>
        </div>
      )}
      {messages.map(msg => {
        const isMe = msg.sender_id === user.id
        const rxGroups = groupedReactions(msg.id)
        return (
          <div
            key={msg.id}
            ref={el => props.registerMessageRef(msg.id, el)}
            className={clsx('flex flex-col', isMe ? 'items-end' : 'items-start')}
          >
            {!isMe && (() => {
              const senderName = (msg as any).user_profiles?.full_name ?? 'Anggota'
              const senderRole = (msg as any).user_profiles?.role ?? ''
              const canTag = !!msg.sender_id && !!props.onTagSender
              return (
                <button
                  type="button"
                  disabled={!canTag}
                  onClick={() => msg.sender_id && props.onTagSender?.(msg.sender_id, senderName)}
                  className="text-[10px] font-bold text-primary ml-1 mb-0.5 capitalize hover:underline disabled:no-underline disabled:cursor-default text-left"
                  title={canTag ? `Ketuk untuk tag @${senderName}` : undefined}
                >
                  {senderName}{senderRole ? ` · ${senderRole}` : ''}
                </button>
              )
            })()}

            <WorkspaceCard
              isMe={isMe}
              isPinned={msg.is_pinned}
              onLongPressStart={() => props.onStartLongPress(msg.id, isMe, msg.content)}
              onLongPressEnd={props.onCancelLongPress}
              onContextMenu={(e: React.MouseEvent) => {
                e.preventDefault()
                props.onOpenActionMenu({ msgId: msg.id, isMe, content: msg.content })
              }}
            >
              <TimelineMessage
                msg={msg}
                isMe={isMe}
                user={user}
                canPin={canPin}
                polls={props.polls}
                readSummary={props.readSummary}
                actionBusy={props.actionBusy}
                onOpenLightbox={props.onOpenLightbox}
                onOpenReadersModal={props.onOpenReadersModal}
                onVotePoll={props.onVotePoll}
                onClosePoll={props.onClosePoll}
                onDriverApprove={props.onDriverApprove}
                onDriverReject={props.onDriverReject}
                onDriverActivate={props.onDriverActivate}
                onQueueApprove={props.onQueueApprove}
                onQueueReject={props.onQueueReject}
                onQueueComplete={props.onQueueComplete}
              />
            </WorkspaceCard>

            {rxGroups.length > 0 && (
              <div className={clsx('flex flex-wrap gap-1 mt-1', isMe ? 'justify-end' : 'justify-start')}>
                {rxGroups.map(({ emoji, count, mine }) => (
                  <button
                    key={emoji}
                    onClick={() => props.onToggleReaction(msg.id, emoji)}
                    className={clsx(
                      'flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold transition-colors',
                      mine
                        ? 'bg-primary/20 text-secondary ring-1 ring-primary/40'
                        : 'bg-white shadow-sm text-gray-600 hover:bg-gray-100'
                    )}
                  >
                    <span>{emoji}</span>
                    {count > 1 && <span>{count}</span>}
                  </button>
                ))}
                <button
                  onClick={() => props.onOpenActionMenu({ msgId: msg.id, isMe, content: msg.content })}
                  className="flex items-center px-1.5 py-0.5 rounded-full bg-gray-100 hover:bg-gray-200 transition-colors"
                  aria-label="Tambah reaksi"
                >
                  <SmilePlus size={12} className="text-gray-400" />
                </button>
              </div>
            )}
          </div>
        )
      })}
      <div ref={bottomRef} />
    </div>
  )
})

export default WorkspaceTimeline
