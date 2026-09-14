"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  isServerSpeechAvailable,
  transcribeAudioBlob,
} from "@/lib/services/speech"

type SpeechRecognitionInstance = {
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: ((event: SpeechRecognitionResultEvent) => void) | null
  onerror: ((event: { error?: string }) => void) | null
  onend: (() => void) | null
  onstart: (() => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}

type SpeechRecognitionResultEvent = {
  results: {
    length: number
    [index: number]: {
      isFinal: boolean
      0: { transcript: string }
    }
  }
}

function getSpeechRecognition():
  | (new () => SpeechRecognitionInstance)
  | undefined {
  if (typeof window === "undefined") return undefined
  const w = window as Window & {
    SpeechRecognition?: new () => SpeechRecognitionInstance
    webkitSpeechRecognition?: new () => SpeechRecognitionInstance
  }
  return w.SpeechRecognition || w.webkitSpeechRecognition
}

function pickRecorderMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined
  for (const type of [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg",
  ]) {
    if (MediaRecorder.isTypeSupported(type)) return type
  }
  return undefined
}

type Options = {
  lang?: string
  /** Text already in the field when mic is pressed — preserved as prefix. */
  getPrefix: () => string
  onText: (value: string) => void
}

/**
 * Minimal live dictation: browser speech writes text as you talk.
 * Falls back to record → server Whisper only when browser STT is unavailable.
 */
export function useLiveDictation({ lang, getPrefix, onText }: Options) {
  const getPrefixRef = useRef(getPrefix)
  const onTextRef = useRef(onText)
  getPrefixRef.current = getPrefix
  onTextRef.current = onText

  const [listening, setListening] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null)
  const stoppingRef = useRef(false)
  const prefixRef = useRef("")
  const sessionRef = useRef("")
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const mediaChunksRef = useRef<Blob[]>([])
  const recorderMimeRef = useRef("audio/webm")
  const engineRef = useRef<"browser" | "server" | null>(null)
  const startServerRef = useRef<() => void>(() => {})

  const mergeAndApply = useCallback((session: string) => {
    sessionRef.current = session
    const prefix = prefixRef.current.trim()
    const merged = prefix && session ? `${prefix} ${session}`.trim() : session || prefix
    if (merged) onTextRef.current(merged)
  }, [])

  const releaseStream = useCallback(() => {
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop())
    mediaStreamRef.current = null
  }, [])

  const stopBrowser = useCallback(() => {
    const rec = recognitionRef.current
    recognitionRef.current = null
    if (!rec) return
    try {
      rec.stop()
    } catch {
      try {
        rec.abort()
      } catch {
        /* ignore */
      }
    }
  }, [])

  const stopAll = useCallback(() => {
    stoppingRef.current = true
    const spoken = sessionRef.current.trim()
    if (spoken) mergeAndApply(spoken)

    stopBrowser()

    const recorder = mediaRecorderRef.current
    if (recorder && recorder.state !== "inactive") {
      try {
        if (typeof recorder.requestData === "function") recorder.requestData()
        recorder.stop()
      } catch {
        /* ignore */
      }
    } else {
      releaseStream()
      mediaRecorderRef.current = null
      mediaChunksRef.current = []
      if (engineRef.current !== "server") {
        setListening(false)
        engineRef.current = null
      }
    }

    stoppingRef.current = false
  }, [mergeAndApply, releaseStream, stopBrowser])

  const startBrowser = useCallback(() => {
    const Ctor = getSpeechRecognition()
    if (!Ctor) return false

    prefixRef.current = getPrefixRef.current().trim()
    sessionRef.current = ""
    stoppingRef.current = false

    const recognition = new Ctor()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang =
      lang ||
      (typeof navigator !== "undefined" ? navigator.language : "") ||
      "en-IN"

    recognition.onresult = (event) => {
      let text = ""
      for (let i = 0; i < event.results.length; i += 1) {
        text += event.results[i]?.[0]?.transcript ?? ""
      }
      mergeAndApply(text.trim())
    }

    recognition.onerror = (event) => {
      if (event.error === "aborted" || stoppingRef.current) return
      recognitionRef.current = null
      engineRef.current = null
      if (event.error === "network") {
        startServerRef.current()
        return
      }
      if (event.error === "not-allowed") {
        setError("Microphone blocked. Allow mic access in browser settings.")
      } else if (event.error === "no-speech") {
        setError("No speech heard. Try again and speak clearly.")
      } else {
        setError("Voice input failed. Use Chrome or Edge.")
      }
      setListening(false)
    }

    recognition.onend = () => {
      if (stoppingRef.current || engineRef.current !== "browser") {
        setListening(false)
        engineRef.current = null
        recognitionRef.current = null
        return
      }
      try {
        recognition.start()
      } catch {
        setListening(false)
        engineRef.current = null
        recognitionRef.current = null
      }
    }

    recognition.onstart = () => {
      engineRef.current = "browser"
      setListening(true)
      setError(null)
    }

    try {
      recognition.start()
      recognitionRef.current = recognition
      return true
    } catch {
      setError("Could not start voice input. Tap the mic again.")
      return false
    }
  }, [lang, mergeAndApply])

  const startServer = useCallback(async () => {
    if (typeof MediaRecorder === "undefined") {
      setError("Voice recording is not supported in this browser.")
      return
    }

    const serverOk = await isServerSpeechAvailable()
    if (!serverOk) {
      setError("Server transcription is not configured.")
      return
    }

    prefixRef.current = getPrefixRef.current().trim()
    sessionRef.current = ""
    stoppingRef.current = false

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaStreamRef.current = stream
      mediaChunksRef.current = []

      const mimeType = pickRecorderMimeType()
      recorderMimeRef.current = mimeType ?? "audio/webm"
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream)

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) mediaChunksRef.current.push(event.data)
      }

      recorder.onstop = async () => {
        releaseStream()
        mediaRecorderRef.current = null
        engineRef.current = null
        setListening(false)

        const blob = new Blob(mediaChunksRef.current, {
          type: recorderMimeRef.current,
        })
        mediaChunksRef.current = []

        if (blob.size === 0) {
          setError("No audio recorded. Speak for at least 2 seconds.")
          return
        }

        setProcessing(true)
        try {
          const result = await transcribeAudioBlob(blob)
          if ("error" in result) {
            setError(result.error)
            return
          }
          mergeAndApply(result.text)
        } finally {
          setProcessing(false)
        }
      }

      recorder.start()
      mediaRecorderRef.current = recorder
      engineRef.current = "server"
      setListening(true)
      setError(null)
    } catch {
      setError("Microphone access blocked or unavailable.")
      releaseStream()
    }
  }, [mergeAndApply, releaseStream])

  startServerRef.current = () => {
    void startServer()
  }

  const start = useCallback(() => {
    setError(null)
    if (startBrowser()) return
    void startServer()
  }, [startBrowser, startServer])

  const toggle = useCallback(() => {
    if (processing) return
    if (listening) {
      stopAll()
    } else {
      start()
    }
  }, [listening, processing, start, stopAll])

  useEffect(
    () => () => {
      stoppingRef.current = true
      stopBrowser()
      releaseStream()
      const recorder = mediaRecorderRef.current
      if (recorder && recorder.state !== "inactive") {
        try {
          recorder.stop()
        } catch {
          /* ignore */
        }
      }
    },
    [releaseStream, stopBrowser],
  )

  return {
    listening,
    processing,
    error,
    toggle,
    stop: stopAll,
    clearError: () => setError(null),
  }
}
