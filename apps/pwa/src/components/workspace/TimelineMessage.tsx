'use client'

import {
  BarChart2, Check, CheckCheck, CheckSquare, Download, FileText, Lock,
  MapPin, Mic, Square,
} from 'lucide-react'
import clsx from 'clsx'
import type { ChatMessage, ChatPoll, ChatPollVote, UserProfile } from '@/types'
import { parseActionCard, type DriverPayload, type QueuePayload } from '@/lib/actionCardParser'
import {
  SaldoRequestCard,
  QueueCard,
  DriverCard,
  WorkflowCard,
  TaskCard,
} from '@/components/business-cards'
import type { ReadSummaryEntry } from './types'

interface Props {
  msg: ChatMessage
  isMe: boolean
  user: UserProfile
  canPin: boolean
  polls: Record<string, { poll: ChatPoll; votes: ChatPollVote[] }>
  readSummary: Record<string, ReadSummaryEntry>
  actionBusy: Record<string, boolean>
  onOpenLightbox: (url: string) => void
  onOpenReadersModal: (msgId: string) => void
  onVotePoll: (poll: ChatPoll, optionId: string) => void
  onClosePoll: (poll: ChatPoll) => void
  onDriverApprove: (msgId: string, payload: DriverPayload) => void
  onDriverReject: (msgId: string, payload: DriverPayload) => void
  onDriverActivate: (msgId: string, payload: DriverPayload) => void
  onQueueApprove: (msgId: string, payload: QueuePayload) => void
  onQueueReject: (msgId: string, payload: QueuePayload) => void
  onQueueComplete: (msgId: string, payload: QueuePayload) => void
}

export default function TimelineMessage(props: Props) {
  const { msg, isMe, user, canPin, polls, readSummary, actionBusy } = props
  const actionCard = msg.content ? parseActionCard(msg.content) : null
  const isDriverAction = msg.type === 'driver' || actionCard?.kind === 'driver'
  const isQueueAction = msg.type === 'queue' || actionCard?.kind === 'queue'

  return (
    <>
      {/* IMAGE */}
      {msg.type === 'image' && msg.media_url && (
        <button onClick={() => props.onOpenLightbox(msg.media_url!)} className="block mb-1.5 rounded-xl overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={msg.media_url} alt={msg.content || 'Gambar'} className="max-w-[200px] w-full object-cover rounded-xl" />
        </button>
      )}

      {/* FILE */}
      {msg.type === 'file' && msg.media_url && (
        <a
          href={msg.media_url} target="_blank" rel="noopener noreferrer" download
          className={clsx('flex items-center gap-2.5 rounded-xl px-3 py-2 mb-1.5 transition-colors',
            isMe ? 'bg-white/10 hover:bg-white/20' : 'bg-gray-100 hover:bg-gray-200')}
        >
          <FileText size={20} className={clsx('flex-shrink-0', isMe ? 'text-primary' : 'text-blue-500')} />
          <div className="min-w-0">
            <p className="text-xs font-semibold truncate max-w-[140px]">{msg.content || 'File'}</p>
            <p className={clsx('text-[10px]', isMe ? 'text-white/50' : 'text-gray-400')}>Ketuk untuk unduh</p>
          </div>
          <Download size={14} className={isMe ? 'text-white/50' : 'text-gray-400'} />
        </a>
      )}

      {/* AUDIO */}
      {msg.type === 'audio' && msg.media_url && (
        <div className={clsx('flex items-center gap-2 rounded-xl px-3 py-2 mb-1.5',
          isMe ? 'bg-white/10' : 'bg-gray-100')}>
          <Mic size={16} className={clsx('flex-shrink-0', isMe ? 'text-primary' : 'text-red-500')} />
          <audio controls preload="metadata" src={msg.media_url}
            className="h-8 min-w-[160px] max-w-[200px]" />
          <a href={msg.media_url} download target="_blank" rel="noopener noreferrer"
            className={clsx('flex-shrink-0', isMe ? 'text-white/60 hover:text-white' : 'text-gray-400 hover:text-gray-600')}
            title="Unduh pesan suara">
            <Download size={14} />
          </a>
        </div>
      )}

      {/* LOCATION */}
      {msg.type === 'location' && (() => {
        let loc = { lat: 0, lng: 0, accuracy: 0 }
        try { loc = JSON.parse(msg.content ?? '{}') } catch {}
        const mapsUrl = `https://www.google.com/maps?q=${loc.lat},${loc.lng}`
        return (
          <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
            className={clsx(
              'flex items-start gap-2.5 rounded-xl px-3 py-2.5 mb-1 transition-colors no-underline',
              isMe ? 'bg-white/10 hover:bg-white/20' : 'bg-gray-50 hover:bg-gray-100'
            )}>
            <MapPin size={18} className={clsx('mt-0.5 flex-shrink-0', isMe ? 'text-primary' : 'text-red-500')} />
            <div className="min-w-0">
              <p className={clsx('text-xs font-bold', isMe ? 'text-white' : 'text-gray-800')}>
                📍 Lokasi Saat Ini
              </p>
              <p className={clsx('text-[10px] mt-0.5', isMe ? 'text-white/60' : 'text-gray-500')}>
                {loc.lat.toFixed(6)}, {loc.lng.toFixed(6)}
              </p>
              {loc.accuracy > 0 && (
                <p className={clsx('text-[9px] mt-0.5', isMe ? 'text-white/40' : 'text-gray-400')}>
                  Akurasi ±{loc.accuracy} m
                </p>
              )}
              <p className={clsx('text-[9px] mt-1 font-semibold', isMe ? 'text-primary' : 'text-blue-500')}>
                Ketuk untuk buka Maps →
              </p>
            </div>
          </a>
        )
      })()}

      {/* POLL */}
      {msg.type === 'poll' && (() => {
        const entry = polls[msg.id]
        if (!entry) {
          return (
            <div className="flex items-center gap-2 py-1 opacity-60">
              <BarChart2 size={14} /><span className="text-xs">Polling</span>
            </div>
          )
        }
        const { poll, votes } = entry
        const totalVotes = votes.length
        const myVotes = votes.filter(v => v.voter_id === user.id).map(v => v.option_id)
        const canClose = !poll.is_closed && (poll.creator_id === user.id || canPin)
        return (
          <div className={clsx(
            'rounded-xl overflow-hidden mb-1 min-w-[200px]',
            isMe ? 'bg-white/10' : 'bg-gray-50 border border-gray-100'
          )}>
            <div className="px-3 pt-2.5 pb-1">
              <div className="flex items-start gap-1.5 mb-2">
                <BarChart2 size={13} className={clsx('mt-0.5 flex-shrink-0', isMe ? 'text-primary' : 'text-secondary')} />
                <p className={clsx('text-xs font-bold leading-tight', isMe ? 'text-white' : 'text-gray-800')}>
                  {poll.question}
                </p>
              </div>
              {poll.options.map(opt => {
                const count = votes.filter(v => v.option_id === opt.id).length
                const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0
                const voted = myVotes.includes(opt.id)
                return (
                  <button key={opt.id} disabled={poll.is_closed}
                    onClick={() => !poll.is_closed && props.onVotePoll(poll, opt.id)}
                    className={clsx(
                      'w-full text-left mb-1.5 rounded-lg overflow-hidden transition-opacity',
                      poll.is_closed ? 'cursor-default' : 'active:opacity-70'
                    )}>
                    <div className={clsx(
                      'relative px-2.5 py-1.5',
                      isMe
                        ? (voted ? 'bg-primary/30' : 'bg-white/10')
                        : (voted ? 'bg-secondary/10' : 'bg-gray-100')
                    )}>
                      <div
                        className={clsx(
                          'absolute inset-0 origin-left transition-all duration-500',
                          isMe ? 'bg-primary/20' : 'bg-secondary/10'
                        )}
                        style={{ transform: `scaleX(${pct / 100})` }}
                      />
                      <div className="relative flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          {voted
                            ? <CheckSquare size={12} className={isMe ? 'text-primary flex-shrink-0' : 'text-secondary flex-shrink-0'} />
                            : <Square size={12} className={clsx('flex-shrink-0', isMe ? 'text-white/40' : 'text-gray-400')} />}
                          <span className={clsx('text-[11px] font-semibold truncate', isMe ? 'text-white' : 'text-gray-700')}>
                            {opt.text}
                          </span>
                        </div>
                        <span className={clsx('text-[10px] font-bold flex-shrink-0', isMe ? 'text-primary' : 'text-secondary')}>
                          {pct}%
                        </span>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
            <div className={clsx(
              'px-3 py-1.5 flex items-center justify-between',
              isMe ? 'bg-white/5' : 'bg-gray-100/80'
            )}>
              <span className={clsx('text-[9px]', isMe ? 'text-white/40' : 'text-gray-400')}>
                {totalVotes} suara · {poll.is_multiple_choice ? 'multi pilihan' : '1 pilihan'}
              </span>
              {poll.is_closed
                ? <span className="flex items-center gap-0.5 text-[9px] text-red-400 font-semibold">
                    <Lock size={8} /> Ditutup
                  </span>
                : canClose && (
                    <button onClick={() => props.onClosePoll(poll)}
                      className={clsx('text-[9px] font-semibold', isMe ? 'text-primary' : 'text-secondary')}>
                      Tutup Polling
                    </button>
                  )}
            </div>
          </div>
        )
      })()}

      {/* TEXT with @mention highlighting */}
      {msg.type === 'text' && (() => {
        const content = msg.content ?? ''
        const parts = content.split(/(@[A-Za-z][A-Za-z0-9._\- ]*?(?=\s|$|[.,!?]))/g)
        return (
          <p className="leading-relaxed whitespace-pre-wrap break-words">
            {parts.map((chunk, i) => chunk.startsWith('@')
              ? <span key={i} className={clsx('font-semibold rounded px-0.5', isMe ? 'text-primary bg-white/10' : 'text-secondary bg-secondary/10')}>{chunk}</span>
              : chunk)}
          </p>
        )
      })()}

      {/* DRIVER APPROVAL CARD */}
      {isDriverAction && (
        <DriverCard
          rawContent={msg.content ?? ''}
          currentRole={user.role}
          busy={actionBusy[msg.id] ?? false}
          onApprove={payload => props.onDriverApprove(msg.id, payload)}
          onReject={payload => props.onDriverReject(msg.id, payload)}
          onActivate={payload => props.onDriverActivate(msg.id, payload)}
        />
      )}

      {/* QUEUE APPROVAL CARD */}
      {isQueueAction && (
        <QueueCard
          rawContent={msg.content ?? ''}
          variant="action"
          currentRole={user.role}
          busy={actionBusy[msg.id] ?? false}
          onApprove={payload => props.onQueueApprove(msg.id, payload)}
          onReject={payload => props.onQueueReject(msg.id, payload)}
          onComplete={payload => props.onQueueComplete(msg.id, payload)}
        />
      )}

      {/* SALDO REQUEST CARD */}
      {msg.type === 'saldo_request' && (
        <SaldoRequestCard
          raw={msg.content ?? ''}
          messageId={msg.id}
          currentUserId={user.id}
          currentUserRole={user.role}
        />
      )}

      {/* DRIVER QUEUE EVENT CARD */}
      {msg.type === 'driver_queue' && (
        <QueueCard rawContent={msg.content ?? ''} variant="event" />
      )}

      {/* WORKFLOW CARD (opt-in payload) */}
      {msg.type === 'workflow' && <WorkflowCard raw={msg.content ?? ''} />}

      {/* TASK CARD (opt-in payload) */}
      {msg.type === 'task' && <TaskCard raw={msg.content ?? ''} />}

      <div className={clsx('flex items-center gap-1 mt-1', isMe ? 'justify-end' : 'justify-start')}>
        <p className={clsx('text-[9px]', isMe ? 'text-white/50' : 'text-gray-300')}>
          {new Date(msg.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
        </p>
        {isMe && (() => {
          const summ = readSummary[msg.id]
          const total = summ?.total_recipients ?? 0
          const read = summ?.read_count ?? 0
          const allRead = total > 0 && read >= total
          const partial = read > 0 && !allRead
          return (
            <button
              onClick={(e) => { e.stopPropagation(); props.onOpenReadersModal(msg.id) }}
              className="flex items-center hover:opacity-80"
              title={total > 0 ? `${read}/${total} sudah baca` : 'Terkirim'}
            >
              {allRead
                ? <CheckCheck size={11} className="text-sky-300" />
                : partial
                  ? <CheckCheck size={11} className="text-white/50" />
                  : <Check size={11} className="text-white/50" />}
            </button>
          )
        })()}
      </div>
    </>
  )
}
