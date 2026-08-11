'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertCircle, Camera, RotateCcw } from 'lucide-react'

interface Props {
  onCapture: (blob: Blob, dataUrl: string) => void
}

export default function FullBodyRearCamera({ onCapture }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [captured, setCaptured] = useState<string | null>(null)
  const [error, setError] = useState('')

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach(track => track.stop())
  }, [])

  const startCamera = useCallback(async () => {
    stop()
    setError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1080 },
          height: { ideal: 1920 },
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
      setError('Tidak bisa mengakses kamera belakang. Periksa izin kamera browser.')
    }
  }, [stop])

  useEffect(() => {
    void startCamera()
    return stop
  }, [startCamera, stop])

  function takePhoto() {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || !video.videoWidth || !video.videoHeight) return

    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

    const dataUrl = canvas.toDataURL('image/jpeg', 0.88)
    setCaptured(dataUrl)
    stop()

    canvas.toBlob(blob => {
      if (blob) onCapture(blob, dataUrl)
    }, 'image/jpeg', 0.88)
  }

  function retake() {
    setCaptured(null)
    void startCamera()
  }

  if (error) {
    return (
      <div className="bg-gray-900 rounded-xl min-h-[420px] flex flex-col items-center justify-center gap-2 px-4">
        <AlertCircle size={32} className="text-red-400" />
        <p className="text-white/70 text-xs text-center">{error}</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="bg-gray-900 rounded-xl overflow-hidden relative min-h-[420px] max-h-[70vh] aspect-[9/16] mx-auto">
        {captured ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={captured} alt="Foto full body absensi" className="w-full h-full object-cover" />
        ) : (
          <video ref={videoRef} playsInline muted className="w-full h-full object-cover" />
        )}
        <canvas ref={canvasRef} className="hidden" />
        {!captured && (
          <div className="absolute inset-x-4 top-4 bottom-4 border-2 border-dashed border-white/50 rounded-[40%] pointer-events-none">
            <span className="absolute bottom-3 inset-x-0 text-center text-[11px] text-white bg-black/40 mx-6 py-1 rounded">
              Pastikan seluruh badan terlihat
            </span>
          </div>
        )}
      </div>
      {!captured ? (
        <button type="button" onClick={takePhoto} className="btn-primary flex items-center justify-center gap-2">
          <Camera size={18} />
          Ambil Foto Full Body
        </button>
      ) : (
        <button type="button" onClick={retake} className="btn-secondary flex items-center justify-center gap-2">
          <RotateCcw size={16} />
          Ambil Ulang
        </button>
      )}
    </div>
  )
}
