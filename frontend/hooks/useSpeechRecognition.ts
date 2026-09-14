"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  clearServerSpeechCache,
  isServerSpeechAvailable,
  transcribeAudioBlob,
} from "@/lib/services/speech"

type SpeechRecognitionLike = {
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: ((event: { error?: string; message?: string }) => void) | null
  onend: (() => void) | null
  onstart: (() => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}

type SpeechRecognitionEventLike = {
  resultIndex: number
  results: {
    length: number
    [index: number]: {
      isFinal: boolean
      0: { transcript: string }
    }
  }
}

function getSpeechRecognitionCtor():
  | (new () => SpeechRecognitionLike)
  | undefined {
  if (typeof window === "undefined") return undefined
  const w = window as Window & {
    SpeechRecognition?: new () => SpeechRecognitionLike
    webkitSpeechRecognition?: new () => SpeechRecognitionLike
  }
  return w.SpeechRecognition || w.webkitSpeechRecognition
}

function preferredLanguages(requested?: string): string[] {
  const langs = new Set<string>()
  if (requested?.trim()) langs.add(requested.trim())
  if (typeof navigator !== "undefined") {
    if (navigator.language) langs.add(navigator.language)
    for (const lang of navigator.languages ?? []) {
      if (lang) langs.add(lang)
    }
  }
  langs.add("en-IN")
  langs.add("en-US")
  langs.add("en")
  return [...langs]
}

const LIVE_SERVER_SEGMENT_MS = 2200
const BROWSER_RESULT_TIMEOUT_MS = 2500

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

function speechErrorMessage(code?: string): string {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
      return "Microphone access was blocked. Allow mic permission for this site in browser settings, then try again."
    case "no-speech":
      return "No speech detected. Tap the mic and speak clearly, then tap again to stop."
    case "network":
      return "Live voice needs Chrome or Edge with internet access. If this keeps failing, allow Google speech services or disable VPN/ad blockers."
    case "audio-capture":
      return "Microphone unavailable. Close other apps using the mic, then try again."
    case "language-not-supported":
      return "This language is not supported for voice input. Try speaking in English."
    case "aborted":
      return ""
    default:
      return code
        ? `Voice input failed (${code}). Use Chrome or Edge and allow mic access.`
        : "Voice input failed. Use Chrome or Edge and allow mic access."
  }
}

/** Brave (and similar) block Google Web Speech — server STT is reliable there. */
async function prefersServerSpeech(): Promise<boolean> {
  if (typeof navigator === "undefined") return false
  if (/Brave/i.test(navigator.userAgent)) return true
  try {
    const nav = navigator as Navigator & {
      brave?: { isBrave?: () => Promise<boolean> }
    }
    if (nav.brave?.isBrave) return await nav.brave.isBrave()
  } catch {
    /* ignore */
  }
  return false
}

async function ensureMicrophoneAccess(): Promise<string | null> {
  if (typeof navigator === "undefined") return "Voice input is not available."
  if (!window.isSecureContext) {
    return "Voice input requires HTTPS or localhost. Open the site on a secure URL."
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    return "Microphone access is not supported in this browser."
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    stream.getTracks().forEach((track) => track.stop())
    return null
  } catch (err) {
    if (err instanceof DOMException) {
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        return "Microphone access was blocked. Allow mic permission in browser settings."
      }
      if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
        return "No microphone found. Connect a mic or use a device with one built in."
      }
      if (err.name === "NotReadableError" || err.name === "TrackStartError") {
        return "Microphone is in use by another app. Close it and try again."
      }
    }
    return "Could not access the microphone. Check browser permissions and try again."
  }
}

type Options = {
  lang?: string
  continuous?: boolean
  liveTranscript?: boolean
  onFinalTranscript?: (text: string) => void
  onInterimTranscript?: (text: string) => void
}

/**
 * Browser Web Speech = instant live text.
 * Server Whisper fallback = record then transcribe (used only when browser STT unavailable).
 */
export function useSpeechRecognition(options: Options = {}) {
  const { lang, continuous = false, liveTranscript = true } = options
  const [supported, setSupported] = useState(false)
  const [listening, setListening] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const mediaChunksRef = useRef<Blob[]>([])
  const recorderMimeRef = useRef<string>("audio/webm")
  const engineRef = useRef<"browser" | "server" | null>(null)
  const intentionalStopRef = useRef(false)
  const sessionRef = useRef(0)
  const browserRetriesRef = useRef(0)
  const browserSessionRef = useRef("")
  const browserGotResultRef = useRef(false)
  const browserWatchdogRef = useRef<number | null>(null)
  const serverLoopActiveRef = useRef(false)
  const stopRequestedRef = useRef(false)
  const sessionTranscriptRef = useRef("")
  const sessionHadLiveRef = useRef(false)
  const callbacksRef = useRef(options)
  callbacksRef.current = options

  const clearBrowserWatchdog = useCallback(() => {
    if (browserWatchdogRef.current) {
      clearTimeout(browserWatchdogRef.current)
      browserWatchdogRef.current = null
    }
  }, [])

  useEffect(() => {
    const browser = Boolean(getSpeechRecognitionCtor())
    const recorder = typeof MediaRecorder !== "undefined"
    setSupported(browser || recorder)
  }, [])

  const releaseMediaStream = useCallback(() => {
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop())
    mediaStreamRef.current = null
  }, [])

  const stop = useCallback(
    (invalidateSession = true) => {
      const engine = engineRef.current
      clearBrowserWatchdog()

      if (serverLoopActiveRef.current) {
        stopRequestedRef.current = true
        serverLoopActiveRef.current = false
      }

      const spoken = browserSessionRef.current.trim()
      if (engine === "browser" && spoken) {
        callbacksRef.current.onFinalTranscript?.(spoken)
        browserSessionRef.current = ""
      }

      if (invalidateSession) sessionRef.current += 1
      intentionalStopRef.current = true

      const rec = recognitionRef.current
      recognitionRef.current = null
      if (rec) {
        try {
          rec.abort()
        } catch {
          try {
            rec.stop()
          } catch {
            /* ignore */
          }
        }
      }

    const recorder = mediaRecorderRef.current
    if (recorder && recorder.state !== "inactive") {
      try {
        if (typeof recorder.requestData === "function") {
          recorder.requestData()
        }
        recorder.stop()
      } catch {
        /* ignore */
      }
    } else if (invalidateSession) {
        releaseMediaStream()
        mediaRecorderRef.current = null
        mediaChunksRef.current = []
      }

      if (!processing && engine !== "server" && !serverLoopActiveRef.current) {
        setListening(false)
        setStarting(false)
      }
      if (invalidateSession) engineRef.current = null
    },
    [clearBrowserWatchdog, processing, releaseMediaStream],
  )

  const transcribeChunk = useCallback(async (blob: Blob, session: number) => {
    try {
      const result = await transcribeAudioBlob(blob)
      if (session !== sessionRef.current) return null
      if ("error" in result) return null
      return result.text
    } catch {
      return null
    }
  }, [])

  const recordOneSegment = useCallback(
    async (session: number, maxMs: number): Promise<Blob | null> => {
      if (typeof MediaRecorder === "undefined") return null
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        if (session !== sessionRef.current || !serverLoopActiveRef.current) {
          stream.getTracks().forEach((track) => track.stop())
          return null
        }

        const mimeType = pickRecorderMimeType()
        const mime = mimeType ?? "audio/webm"
        const chunks: Blob[] = []

        return await new Promise((resolve) => {
          const recorder = mimeType
            ? new MediaRecorder(stream, { mimeType })
            : new MediaRecorder(stream)

          recorder.ondataavailable = (event) => {
            if (event.data.size > 0) chunks.push(event.data)
          }

          recorder.onstop = () => {
            stream.getTracks().forEach((track) => track.stop())
            resolve(
              chunks.length > 0 ? new Blob(chunks, { type: mime }) : null,
            )
          }

          recorder.onerror = () => {
            stream.getTracks().forEach((track) => track.stop())
            resolve(null)
          }

          recorder.start()
          window.setTimeout(() => {
            if (recorder.state === "inactive") return
            try {
              if (typeof recorder.requestData === "function") {
                recorder.requestData()
              }
              recorder.stop()
            } catch {
              resolve(null)
            }
          }, maxMs)
        })
      } catch {
        return null
      }
    },
    [],
  )

  const startServerLiveLoop = useCallback(
    async (session: number) => {
      stopRequestedRef.current = false
      serverLoopActiveRef.current = true
      sessionTranscriptRef.current = ""
      sessionHadLiveRef.current = false
      engineRef.current = "server"
      setListening(true)
      setStarting(false)
      setError(null)

      while (
        serverLoopActiveRef.current &&
        session === sessionRef.current &&
        !stopRequestedRef.current
      ) {
        const blob = await recordOneSegment(session, LIVE_SERVER_SEGMENT_MS)
        if (!blob || session !== sessionRef.current) break

        const text = await transcribeChunk(blob, session)
        if (!text?.trim() || session !== sessionRef.current) continue

        sessionHadLiveRef.current = true
        const merged = sessionTranscriptRef.current
          ? `${sessionTranscriptRef.current} ${text.trim()}`
          : text.trim()
        sessionTranscriptRef.current = merged
        callbacksRef.current.onInterimTranscript?.(merged)
      }

      if (session !== sessionRef.current) return

      serverLoopActiveRef.current = false
      setListening(false)
      engineRef.current = null

      const finalText = sessionTranscriptRef.current.trim()
      if (finalText) {
        callbacksRef.current.onFinalTranscript?.(finalText)
        return
      }

      if (!sessionHadLiveRef.current) {
        setError(
          "No speech detected. Tap the mic, speak clearly for a few seconds, then tap again to stop.",
        )
      }
    },
    [recordOneSegment, transcribeChunk],
  )

  const transcribeRecording = useCallback(async (blob: Blob, session: number) => {
    setProcessing(true)
    setListening(false)
    setStarting(false)
    try {
      const result = await transcribeAudioBlob(blob)
      if (session !== sessionRef.current) return
      if ("error" in result) {
        setError(result.error)
        return
      }
      callbacksRef.current.onFinalTranscript?.(result.text)
    } catch {
      if (session === sessionRef.current) {
        setError("Transcription failed. Check your connection and try again.")
      }
    } finally {
      if (session === sessionRef.current) {
        setProcessing(false)
        engineRef.current = null
      }
    }
  }, [])

  const startServerRecording = useCallback(
    async (session: number) => {
      if (typeof MediaRecorder === "undefined") {
        setError("Voice recording is not supported in this browser.")
        setStarting(false)
        return
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        if (session !== sessionRef.current) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }

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

        recorder.onstop = () => {
          releaseMediaStream()
          mediaRecorderRef.current = null
          engineRef.current = null
          if (session !== sessionRef.current) return

          const blob = new Blob(mediaChunksRef.current, {
            type: recorderMimeRef.current,
          })
          mediaChunksRef.current = []

          if (blob.size === 0) {
            setError(
              "No audio recorded. Tap the mic and speak, then tap again to stop.",
            )
            setListening(false)
            setStarting(false)
            return
          }

          void transcribeRecording(blob, session)
        }

        recorder.onerror = () => {
          if (session !== sessionRef.current) return
          setError("Recording failed. Try again.")
          setListening(false)
          setStarting(false)
          engineRef.current = null
          releaseMediaStream()
          mediaRecorderRef.current = null
        }

        recorder.start()
        mediaRecorderRef.current = recorder
        engineRef.current = "server"
        intentionalStopRef.current = false
        setListening(true)
        setStarting(false)
      } catch (err) {
        if (session !== sessionRef.current) return
        if (err instanceof DOMException) {
          if (
            err.name === "NotAllowedError" ||
            err.name === "PermissionDeniedError"
          ) {
            setError(
              "Microphone access was blocked. Allow mic permission in browser settings.",
            )
            setStarting(false)
            return
          }
        }
        setError("Could not start recording. Check mic permissions and try again.")
        setStarting(false)
      }
    },
    [releaseMediaStream, transcribeRecording],
  )

  const beginBrowserRecognition = useCallback(
    (languages: string[], index: number, session: number) => {
      const Ctor = getSpeechRecognitionCtor()
      if (!Ctor) {
        setError("Voice input is not supported in this browser. Try Chrome or Edge.")
        setStarting(false)
        return
      }

      const recognition = new Ctor()
      recognition.continuous = callbacksRef.current.continuous ?? false
      recognition.interimResults = true
      recognition.lang = languages[index] ?? "en-US"

      recognition.onresult = (event) => {
        browserGotResultRef.current = true
        clearBrowserWatchdog()

        let interim = ""
        let finals = ""
        for (let i = 0; i < event.results.length; i += 1) {
          const piece = event.results[i]?.[0]?.transcript ?? ""
          if (event.results[i]?.isFinal) finals += piece
          else interim += piece
        }

        const live = `${finals}${interim}`.trim()
        browserSessionRef.current = live
        if (live && (callbacksRef.current.liveTranscript ?? true)) {
          callbacksRef.current.onInterimTranscript?.(live)
        }
      }

      recognition.onerror = (event) => {
        if (session !== sessionRef.current) return
        if (intentionalStopRef.current || event.error === "aborted") {
          intentionalStopRef.current = false
          return
        }

        if (event.error === "network") {
          if (browserRetriesRef.current < 2) {
            browserRetriesRef.current += 1
            try {
              recognition.stop()
            } catch {
              /* ignore */
            }
            window.setTimeout(() => {
              if (session === sessionRef.current) {
                beginBrowserRecognition(languages, index, session)
              }
            }, 350)
            return
          }

          clearServerSpeechCache()
          void isServerSpeechAvailable(true).then((serverOk) => {
            if (serverOk && session === sessionRef.current) {
              setError(
                "Live browser voice unavailable — keep speaking, text will appear every few seconds.",
              )
              try {
                recognition.abort()
              } catch {
                /* ignore */
              }
              recognitionRef.current = null
              engineRef.current = null
              clearBrowserWatchdog()
              void startServerLiveLoop(session)
              return
            }
            const message = speechErrorMessage(event.error)
            if (message) setError(message)
            setListening(false)
            setStarting(false)
            recognitionRef.current = null
            engineRef.current = null
          })
          return
        }

        if (
          event.error === "language-not-supported" &&
          index + 1 < languages.length
        ) {
          try {
            recognition.abort()
          } catch {
            /* ignore */
          }
          recognitionRef.current = null
          beginBrowserRecognition(languages, index + 1, session)
          return
        }

        const message = speechErrorMessage(event.error)
        if (message) setError(message)
        setListening(false)
        setStarting(false)
        recognitionRef.current = null
        engineRef.current = null
      }

      recognition.onend = () => {
        if (session !== sessionRef.current) return
        if (
          !intentionalStopRef.current &&
          (callbacksRef.current.continuous ?? false) &&
          engineRef.current === "browser"
        ) {
          try {
            recognition.start()
            return
          } catch {
            /* fall through */
          }
        }

        browserSessionRef.current = ""

        if (!intentionalStopRef.current) {
          setListening(false)
        }
        intentionalStopRef.current = false
        recognitionRef.current = null
        setStarting(false)
        if (engineRef.current === "browser") engineRef.current = null
      }

      recognition.onstart = () => {
        if (session !== sessionRef.current) return
        engineRef.current = "browser"
        browserGotResultRef.current = false
        setListening(true)
        setStarting(false)
        setError(null)

        clearBrowserWatchdog()
        browserWatchdogRef.current = window.setTimeout(() => {
          if (
            session !== sessionRef.current ||
            browserGotResultRef.current ||
            engineRef.current !== "browser"
          ) {
            return
          }
          clearServerSpeechCache()
          void isServerSpeechAvailable(true).then((serverOk) => {
            if (!serverOk || session !== sessionRef.current) return
            try {
              recognition.abort()
            } catch {
              /* ignore */
            }
            recognitionRef.current = null
            engineRef.current = null
            setError(
              "Switching to server voice — keep speaking, text will appear shortly.",
            )
            void startServerLiveLoop(session)
          })
        }, BROWSER_RESULT_TIMEOUT_MS)
      }

      try {
        recognition.start()
        recognitionRef.current = recognition
      } catch {
        setError("Could not start voice input. Wait a moment and tap the mic again.")
        setListening(false)
        setStarting(false)
        recognitionRef.current = null
      }
    },
    [clearBrowserWatchdog, startServerLiveLoop, startServerRecording],
  )

  const start = useCallback(async () => {
    if (!supported) {
      setError("Voice input is not supported in this browser.")
      return
    }

    stop()
    intentionalStopRef.current = false
    browserRetriesRef.current = 0
    browserSessionRef.current = ""
    const session = sessionRef.current
    setError(null)
    setNotice(null)
    setStarting(true)

    const permissionError = await ensureMicrophoneAccess()
    if (permissionError) {
      setError(permissionError)
      setStarting(false)
      return
    }

    if (session !== sessionRef.current) return

    const serverStt = await isServerSpeechAvailable()
    if (session !== sessionRef.current) return

    const skipBrowserStt = await prefersServerSpeech()

    if (skipBrowserStt) {
      if (typeof MediaRecorder !== "undefined" && serverStt) {
        setNotice(
          "Brave blocks Google live voice — GlucoGuide transcribes on our server instead. Speak in short phrases; text appears every few seconds.",
        )
        await startServerLiveLoop(session)
        return
      }
      setError(
        "Brave blocks browser voice recognition. Turn off Shields for this site, or use Chrome/Edge. Ensure the backend has HF_TOKEN for server transcription.",
      )
      setStarting(false)
      return
    }

    const browserAvailable = Boolean(getSpeechRecognitionCtor())
    const languages = preferredLanguages(lang ?? callbacksRef.current.lang)

    if (browserAvailable) {
      beginBrowserRecognition(languages, 0, session)
      return
    }

    if (typeof MediaRecorder !== "undefined" && serverStt) {
      await startServerLiveLoop(session)
      return
    }

    setError("Voice input is not supported in this browser. Try Chrome or Edge.")
    setStarting(false)
  }, [beginBrowserRecognition, lang, startServerLiveLoop, stop, supported])

  const toggle = useCallback(() => {
    if (processing) return
    if (listening || starting) {
      if (serverLoopActiveRef.current) {
        stopRequestedRef.current = true
        serverLoopActiveRef.current = false
        stop(false)
        return
      }
      stop(engineRef.current !== "server")
    } else {
      void start()
    }
  }, [listening, processing, starting, start, stop])

  useEffect(() => () => stop(), [stop])

  return {
    supported,
    listening: listening || starting,
    processing,
    error,
    start,
    stop,
    toggle,
    clearError: () => setError(null),
    notice,
    clearNotice: () => setNotice(null),
  }
}
