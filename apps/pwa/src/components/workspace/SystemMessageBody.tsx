'use client'

import { Bot, ExternalLink } from 'lucide-react'
import type { ChatMessage } from '@/types'
import { parseSystemMessage, systemCategoryLabel } from '@/lib/systemMessage'

interface Props {
  msg: ChatMessage
}

export default function SystemMessageBody({ msg }: Props) {
  const parsed = parseSystemMessage(msg.content ?? '')

  return (
    <div className="min-w-[190px]">
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-bold text-amber-800">
          <Bot size={10} aria-hidden="true" />
          {systemCategoryLabel(parsed.envelope?.category)}
        </span>
      </div>

      <p className="leading-relaxed whitespace-pre-wrap break-words text-gray-800">
        {parsed.content}
      </p>

      {parsed.deepLink && (
        <a
          href={parsed.deepLink}
          target={parsed.deepLink.startsWith('https://') ? '_blank' : undefined}
          rel={parsed.deepLink.startsWith('https://') ? 'noopener noreferrer' : undefined}
          className="mt-2 inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-1.5 text-[10px] font-bold text-secondary shadow-sm ring-1 ring-gray-200"
        >
          Buka detail <ExternalLink size={10} aria-hidden="true" />
        </a>
      )}

      <p className="text-[9px] text-gray-400 mt-1">
        {new Date(msg.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
      </p>
    </div>
  )
}
