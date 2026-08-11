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
    setError('')
    try {
      streamRef.current?.getTracks().forEach(t => t.stop())
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 720 },
          height: { ideal: 1280 },
          aspectRatio: { ideal: 9 / 16 },
        },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
    } catch {
      setError('Tidak bisa mengakses kamera belakang. Periksa izin kamera lalu coba lagi.')
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
    if (!video || !canvas || !video.videoWidth || !video.videoHeight) return

    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    // Kamera belakang tidak dimirror. Foto disimpan sesuai orientasi sensor/video.
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

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
      <div className="bg-gray-900 rounded-xl min-h-[28rem] flex flex-col items-center justify-center gap-2 px-4">
        <AlertCircle size={32} className="text-red-400" />
        <p className="text-white/70 text-xs text-center">{error}</p>
        <button type="button" onClick={startCamera} className="btn-secondary mt-2">
          Coba Kamera Lagi
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="bg-gray-900 rounded-xl overflow-hidden relative min-h-[28rem] max-h-[70vh] aspect-[9/16] mx-auto flex items-center justify-center">
        {captured ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={captured} alt="Foto full body absensi" className="w-full h-full object-cover" />
        ) : (
          <video
            ref={videoRef}
            playsInline
            muted
            className="w-full h-full object-cover"
          />
        )}
        <canvas ref={canvasRef} className="hidden" />
        {!captured && (
          <div className="absolute bottom-3 left-3 right-3 rounded-lg bg-black/55 px-3 py-2 text-center text-xs text-white">
            Gunakan kamera belakang dan pastikan badan terlihat penuh di dalam frame.
          </div>
        )}
      </div>

      {!captured ? (
        <button
          type="button"
          onClick={takePhoto}
          className="btn-primary flex items-center justify-center gap-2"
        >
          <Camera size={18} />
          Ambil Foto Full Body
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
