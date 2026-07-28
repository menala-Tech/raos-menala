'use client'

import type React from 'react'
import { FileText, Loader2, Mic, Send, StopCircle, Trash, Truck, X } from 'lucide-react'
import WorkspaceQuickAction from './WorkspaceQuickAction'
import { formatFileSize, type WorkspaceMember } from './types'

interface MentionDropdownState {
  open: boolean
  query: string
  startPos: number
}

interface Props {
  text: string
  onTextChange: (val: string, caret: number) => void
  disabled: boolean
  sending: boolean
  uploading: boolean
  sendingLocation: boolean
  pollSending: boolean
  uploadingAudio: boolean
  recording: boolean
  recSeconds: number
  voiceMaxSeconds: number
  pendingFile: File | null
  pendingPreview: string | null
  fileInputRef: React.RefObject<HTMLInputElement>
  textInputRef: React.RefObject<HTMLInputElement>
  showSaldoRequestButton: boolean
  showQueueRequestButton: boolean
  showPollButton: boolean
  mentionDropdown: MentionDropdownState
  roomMembers: WorkspaceMember[]
  roomDrivers: Array<{ id: string; driver_id: string; name: string }>
  currentUserId: string | undefined
  onPickFile: () => void
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void
  onClearPendingFile: () => void
  onSendLocation: () => void
  onOpenPoll: () => void
  onOpenSaldo: () => void
  onOpenQueue: () => void
  onStartRecording: () => void
  onStopRecording: () => void
  onCancelRecording: () => void
  onSubmit: () => void
  onSubmitAttachment: () => void
  onInsertMention: (name: string, extraSuffix: string, userId?: string) => void
  onCloseMentionDropdown: () => void
}

export default function WorkspaceComposer(props: Props) {
  const {
    text, onTextChange, disabled, sending, uploading, sendingLocation, pollSending, uploadingAudio,
    recording, recSeconds, voiceMaxSeconds, pendingFile, pendingPreview,
    fileInputRef, textInputRef,
    showSaldoRequestButton, showQueueRequestButton, showPollButton,
    mentionDropdown, roomMembers, roomDrivers, currentUserId,
    onPickFile, onFileSelect, onClearPendingFile, onSendLocation, onOpenPoll, onOpenSaldo, onOpenQueue,
    onStartRecording, onStopRecording, onCancelRecording,
    onSubmit, onSubmitAttachment, onInsertMention, onCloseMentionDropdown,
  } = props

  const quickActionsDisabled = uploading || sendingLocation || pollSending || uploadingAudio

  return (
    <>
      {pendingFile && (
        <div className="bg-gray-50 border-t border-gray-200 px-3 py-2 flex-shrink-0">
          {pendingPreview ? (
            <div className="relative w-20 h-20">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={pendingPreview} alt="preview" className="w-full h-full object-cover rounded-xl shadow" />
              <button
                onClick={onClearPendingFile}
                aria-label="Hapus preview"
                className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center shadow"
              >
                <X size={11} strokeWidth={3} />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 bg-white rounded-xl px-3 py-2 shadow-sm max-w-xs">
              <FileText size={18} className="text-blue-500 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-gray-700 truncate">{pendingFile.name}</p>
                <p className="text-[10px] text-gray-400">{formatFileSize(pendingFile.size)}</p>
              </div>
              <button onClick={onClearPendingFile} aria-label="Hapus file">
                <X size={14} className="text-gray-400" />
              </button>
            </div>
          )}
        </div>
      )}

      {recording ? (
        <div className="bg-red-50 border-t border-red-100 px-4 py-3 flex items-center gap-3 flex-shrink-0">
          <button onClick={onCancelRecording}
            className="text-red-500 hover:text-red-700 flex-shrink-0"
            title="Batal rekam">
            <Trash size={22} />
          </button>
          <div className="flex-1 flex items-center gap-2 text-red-700 font-semibold">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
            </span>
            <span className="text-sm tabular-nums">
              {String(Math.floor(recSeconds / 60)).padStart(2, '0')}:
              {String(recSeconds % 60).padStart(2, '0')}
            </span>
            <span className="text-xs text-red-500">
              / {String(Math.floor(voiceMaxSeconds / 60)).padStart(2, '0')}:
              {String(voiceMaxSeconds % 60).padStart(2, '0')}
            </span>
          </div>
          <button
            onClick={onStopRecording}
            className="bg-red-500 hover:bg-red-600 text-white p-2.5 rounded-2xl flex-shrink-0"
            title="Kirim rekaman"
          >
            <StopCircle size={20} />
          </button>
        </div>
      ) : (
        <div className="bg-white border-t border-gray-100 px-3 py-2.5 flex items-center gap-2 flex-shrink-0">
          <WorkspaceQuickAction
            disabled={quickActionsDisabled}
            sendingLocation={sendingLocation}
            showSaldoRequestButton={showSaldoRequestButton}
            showQueueRequestButton={showQueueRequestButton}
            showPollButton={showPollButton}
            onPickFile={onPickFile}
            onSendLocation={onSendLocation}
            onOpenPoll={onOpenPoll}
            onOpenSaldo={onOpenSaldo}
            onOpenQueue={onOpenQueue}
          />
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
            className="hidden"
            onChange={onFileSelect}
          />
          <div className="flex-1 relative">
            {mentionDropdown.open && (() => {
              const q = mentionDropdown.query.toLowerCase()
              const staffCand = roomMembers
                .filter(m => m.user_id !== currentUserId)
                .filter(m => (m.user_profiles?.full_name ?? '').toLowerCase().includes(q))
                .slice(0, 6)
              const driverCand = roomDrivers
                .filter(d => (d.name ?? '').toLowerCase().includes(q))
                .slice(0, 4)
              if (staffCand.length === 0 && driverCand.length === 0) return null

              return (
                <div className="absolute bottom-full left-0 right-0 mb-1 bg-white rounded-xl shadow-lg border border-gray-100 max-h-72 overflow-y-auto z-10">
                  {staffCand.length > 0 && (
                    <div className="px-3 pt-1.5 pb-0.5 text-[9px] font-bold text-gray-400 uppercase">Staff</div>
                  )}
                  {staffCand.map(m => {
                    const p = m.user_profiles
                    return (
                      <button
                        key={`s-${m.user_id}`}
                        onClick={() => onInsertMention(p?.full_name ?? 'Staff', '', m.user_id)}
                        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 text-left"
                      >
                        <div className="w-7 h-7 rounded-full bg-primary/15 text-primary flex items-center justify-center text-xs font-bold flex-shrink-0">
                          {(p?.full_name ?? '?').charAt(0)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-gray-800 truncate">{p?.full_name ?? 'Staff'}</p>
                          <p className="text-[9px] text-gray-400 capitalize">{p?.role ?? ''}</p>
                        </div>
                      </button>
                    )
                  })}
                  {driverCand.length > 0 && (
                    <div className="px-3 pt-2 pb-0.5 text-[9px] font-bold text-gray-400 uppercase border-t border-gray-50 mt-1">
                      Driver Cabang Ini
                    </div>
                  )}
                  {driverCand.map(d => (
                    <button
                      key={`d-${d.id}`}
                      onClick={() => onInsertMention(d.name, ` (${d.driver_id})`)}
                      className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 text-left"
                    >
                      <div className="w-7 h-7 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center flex-shrink-0">
                        <Truck size={12} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-gray-800 truncate">{d.name}</p>
                        <p className="text-[9px] text-gray-400">ID {d.driver_id} · Driver</p>
                      </div>
                    </button>
                  ))}
                </div>
              )
            })()}
            <input
              ref={textInputRef}
              type="text"
              placeholder={pendingFile ? 'Tambah caption (opsional)...' : 'Ketik pesan... (@nama untuk tag)'}
              value={text}
              onChange={e => onTextChange(e.target.value, e.target.selectionStart ?? e.target.value.length)}
              onKeyDown={e => {
                if (e.key === 'Escape' && mentionDropdown.open) {
                  onCloseMentionDropdown()
                  return
                }
                if (e.key !== 'Enter') return
                if (pendingFile) onSubmitAttachment(); else onSubmit()
              }}
              className="w-full bg-gray-100 rounded-2xl px-4 py-2.5 text-sm focus:outline-none"
              disabled={disabled}
            />
          </div>
          {(text.trim() || pendingFile) ? (
            <button
              onClick={() => (pendingFile ? onSubmitAttachment() : onSubmit())}
              disabled={sending || uploading}
              className="bg-primary text-secondary p-2.5 rounded-2xl disabled:opacity-40 transition-opacity flex-shrink-0"
              aria-label="Kirim"
            >
              {uploading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} strokeWidth={2.5} />}
            </button>
          ) : (
            <button
              onClick={onStartRecording}
              disabled={uploadingAudio}
              className="bg-primary text-secondary p-2.5 rounded-2xl disabled:opacity-40 transition-opacity flex-shrink-0"
              title="Rekam suara"
            >
              {uploadingAudio ? <Loader2 size={18} className="animate-spin" /> : <Mic size={18} strokeWidth={2.5} />}
            </button>
          )}
        </div>
      )}
    </>
  )
}
