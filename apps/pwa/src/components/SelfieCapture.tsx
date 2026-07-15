'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { Camera, RotateCcw, AlertCircle } from 'lucide-react'

interface Props {
  onCapture: (blob: Blob, dataUrl: string) => void
}

export default function SelfieCapture({ onCapture }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [captured, setCaptured] = useState<string | null>(null)
  const [error, setError] = useState('')

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: 480, height: 480 },
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
    } catch {
      setError('Tidak bisa mengakses kamera depan. Periksa izin kamera.')
    }
  }, [])

  useEffect(() => {
    startCamera()
    return () => {
      streamRef.current?.getTracks().forEach(t => t.stop())
    }
  }, [startCamera])

  function takePhoto() {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return

    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.translate(canvas.width, 0)
    ctx.scale(-1, 1)
    ctx.drawImage(video, 0, 0)

    const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
    setCaptured(dataUrl)
    streamRef.current?.getTracks().forEach(t => t.stop())

    canvas.toBlob(blob => {
      if (blob) onCapture(blob, dataUrl)
    }, 'image/jpeg', 0.85)
  }

  function retake() {
    setCaptured(null)
    startCamera()
  }

  if (error) {
    return (
      <div className="bg-gray-900 rounded-xl h-64 flex flex-col items-center justify-center gap-2 px-4">
        <AlertCircle size={32} className="text-red-400" />
        <p className="text-white/70 text-xs text-center">{error}</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="bg-gray-900 rounded-xl overflow-hidden relative h-64 flex items-center justify-center">
        {captured ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={captured} alt="Selfie" className="w-full h-full object-cover" />
        ) : (
          <video
            ref={videoRef}
            playsInline
            muted
            className="w-full h-full object-cover -scale-x-100"
          />
        )}
        <canvas ref={canvasRef} className="hidden" />
      </div>

      {!captured ? (
        <button
          type="button"
          onClick={takePhoto}
          className="btn-primary flex items-center justify-center gap-2"
        >
          <Camera size={18} />
          Ambil Foto
        </button>
      ) : (
        <button
          type="button"
          onClick={retake}
          className="btn-secondary flex items-center justify-center gap-2"
        >
          <RotateCcw size={16} />
          Ambil Ulang
        </button>
      )}
    </div>
  )
}
