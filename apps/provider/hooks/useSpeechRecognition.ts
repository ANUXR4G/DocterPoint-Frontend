import {
  AudioModule,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  type AudioRecorder,
} from "expo-audio";
import * as FileSystem from "expo-file-system/legacy";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from "@/lib/speechNative";
import {
  clearServerSpeechCache,
  isServerSpeechAvailable,
  transcribeAudioBase64,
} from "@/lib/speech";

type Options = {
  lang?: string;
  continuous?: boolean;
  liveTranscript?: boolean;
  onFinalTranscript?: (text: string) => void;
  onInterimTranscript?: (text: string) => void;
};

const LIVE_SERVER_SEGMENT_MS = 2200;

function mimeFromUri(uri: string): string {
  if (uri.endsWith(".caf")) return "audio/x-caf";
  if (uri.endsWith(".m4a")) return "audio/mp4";
  if (uri.endsWith(".3gp")) return "audio/3gpp";
  return "audio/mp4";
}

export function useSpeechRecognition(options: Options = {}) {
  const { lang = "en-IN", liveTranscript = true } = options;
  const callbacksRef = useRef(options);
  callbacksRef.current = options;

  const [listening, setListening] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const engineRef = useRef<"device" | "server" | null>(null);
  const recordingRef = useRef<AudioRecorder | null>(null);
  const sessionRef = useRef(0);
  const stopRequestedRef = useRef(false);
  const serverLoopActiveRef = useRef(false);
  const sessionTranscriptRef = useRef("");
  const sessionHadLiveRef = useRef(false);
  const intentionalStopRef = useRef(false);

  const deviceOptions = useCallback(
    () => ({
      lang,
      interimResults: liveTranscript,
      continuous: callbacksRef.current.continuous ?? false,
      maxAlternatives: 1,
    }),
    [lang, liveTranscript],
  );

  useSpeechRecognitionEvent("start", () => {
    if (engineRef.current === "device") setListening(true);
  });
  useSpeechRecognitionEvent("end", () => {
    if (engineRef.current !== "device") return;
    if (
      !intentionalStopRef.current &&
      (callbacksRef.current.continuous ?? false)
    ) {
      try {
        ExpoSpeechRecognitionModule.start(deviceOptions());
        return;
      } catch {
        /* fall through */
      }
    }
    setListening(false);
    engineRef.current = null;
  });
  useSpeechRecognitionEvent("result", (event) => {
    if (engineRef.current !== "device") return;
    const transcript = event.results[0]?.transcript ?? "";
    if (!transcript.trim()) return;
    if (event.isFinal) {
      callbacksRef.current.onFinalTranscript?.(transcript.trim());
    } else if (liveTranscript) {
      callbacksRef.current.onInterimTranscript?.(transcript.trim());
    }
  });
  useSpeechRecognitionEvent("error", (event) => {
    if (event.error === "aborted") return;
    if (engineRef.current !== "device") return;

    const session = sessionRef.current;
    clearServerSpeechCache();
    void isServerSpeechAvailable(true).then((serverOk) => {
      if (session !== sessionRef.current) return;
      if (serverOk) {
        setError(null);
        void startServerLiveLoop(session);
        return;
      }
      const message =
        event.error === "not-allowed"
          ? "Microphone access was blocked. Allow mic permission in settings."
          : event.error === "no-speech"
            ? "No speech detected. Try again."
            : "Could not capture voice. Try again.";
      setError(message);
      setListening(false);
      engineRef.current = null;
    });
  });

  const stopDeviceRecognition = useCallback(() => {
    intentionalStopRef.current = true;
    try {
      ExpoSpeechRecognitionModule.stop();
    } catch {
      /* ignore */
    }
    intentionalStopRef.current = false;
  }, []);

  const releaseRecording = useCallback(async () => {
    const rec = recordingRef.current;
    recordingRef.current = null;
    if (!rec) return;
    try {
      await rec.stop();
    } catch {
      /* ignore */
    }
  }, []);

  const transcribeUri = useCallback(
    async (
      uri: string,
      mimeType: string,
      session: number,
      opts?: { showProcessing?: boolean },
    ) => {
      const showProcessing = opts?.showProcessing !== false;
      if (showProcessing) {
        setProcessing(true);
        setListening(false);
        setStarting(false);
      }
      try {
        const base64 = await FileSystem.readAsStringAsync(uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        const result = await transcribeAudioBase64(base64, mimeType);
        if (session !== sessionRef.current) return null;
        if ("error" in result) {
          if (!sessionHadLiveRef.current) setError(result.error);
          return null;
        }
        return result.text;
      } catch {
        if (session === sessionRef.current && !sessionHadLiveRef.current) {
          setError("Transcription failed. Check your connection and try again.");
        }
        return null;
      } finally {
        if (showProcessing && session === sessionRef.current) {
          setProcessing(false);
        }
      }
    },
    [],
  );

  const waitForSegmentEnd = useCallback(
    (session: number, maxMs: number) =>
      new Promise<void>((resolve) => {
        const deadline = Date.now() + maxMs;
        const tick = () => {
          if (
            stopRequestedRef.current ||
            session !== sessionRef.current ||
            !serverLoopActiveRef.current
          ) {
            resolve();
            return;
          }
          if (Date.now() >= deadline) {
            resolve();
            return;
          }
          setTimeout(tick, 80);
        };
        tick();
      }),
    [],
  );

  const recordOneSegment = useCallback(
    async (session: number, maxMs: number) => {
      try {
        const permission = await requestRecordingPermissionsAsync();
        if (!permission.granted) {
          setError("Microphone access was blocked. Allow mic permission in settings.");
          return null;
        }
        if (session !== sessionRef.current || !serverLoopActiveRef.current) {
          return null;
        }

        await setAudioModeAsync({
          allowsRecording: true,
          playsInSilentMode: true,
        });

        const recording = new AudioModule.AudioRecorder(
          RecordingPresets.HIGH_QUALITY,
        );
        await recording.prepareToRecordAsync();
        recording.record();
        recordingRef.current = recording;

        await waitForSegmentEnd(session, maxMs);

        await recording.stop();
        const uri = recording.uri;
        recordingRef.current = null;
        if (!uri || session !== sessionRef.current) return null;
        return { uri, mimeType: mimeFromUri(uri) };
      } catch {
        recordingRef.current = null;
        return null;
      }
    },
    [waitForSegmentEnd],
  );

  const startServerLiveLoop = useCallback(
    async (session: number) => {
      stopRequestedRef.current = false;
      serverLoopActiveRef.current = true;
      sessionTranscriptRef.current = "";
      sessionHadLiveRef.current = false;
      engineRef.current = "server";
      setListening(true);
      setStarting(false);

      while (
        serverLoopActiveRef.current &&
        session === sessionRef.current &&
        !stopRequestedRef.current
      ) {
        const segment = await recordOneSegment(session, LIVE_SERVER_SEGMENT_MS);
        if (!segment || session !== sessionRef.current) break;

        const text = await transcribeUri(segment.uri, segment.mimeType, session, {
          showProcessing: false,
        });
        if (!text?.trim() || session !== sessionRef.current) continue;

        sessionHadLiveRef.current = true;
        const merged = sessionTranscriptRef.current
          ? `${sessionTranscriptRef.current} ${text.trim()}`
          : text.trim();
        sessionTranscriptRef.current = merged;
        callbacksRef.current.onInterimTranscript?.(merged);
      }

      if (session !== sessionRef.current) return;

      serverLoopActiveRef.current = false;
      setListening(false);
      engineRef.current = null;

      const finalText = sessionTranscriptRef.current.trim();
      if (finalText) {
        callbacksRef.current.onFinalTranscript?.(finalText);
        return;
      }

      if (!sessionHadLiveRef.current) {
        setError("No speech detected. Tap the mic and speak, then tap again to stop.");
      }
    },
    [recordOneSegment, transcribeUri],
  );

  const stop = useCallback(
    (invalidateSession = true) => {
      if (invalidateSession) sessionRef.current += 1;
      stopRequestedRef.current = true;
      serverLoopActiveRef.current = false;

      if (engineRef.current === "device") {
        stopDeviceRecognition();
        if (invalidateSession) engineRef.current = null;
        if (!processing) {
          setListening(false);
          setStarting(false);
        }
        return;
      }

      if (engineRef.current === "server") {
        void releaseRecording();
        if (!processing) {
          setListening(false);
          setStarting(false);
        }
        if (invalidateSession) engineRef.current = null;
        return;
      }

      void releaseRecording();
      if (!processing) {
        setListening(false);
        setStarting(false);
      }
      if (invalidateSession) engineRef.current = null;
    },
    [processing, releaseRecording, stopDeviceRecognition],
  );

  const startDeviceRecognition = useCallback(
    async (session: number) => {
      const available = ExpoSpeechRecognitionModule.isRecognitionAvailable();
      if (!available) return false;

      const permission =
        await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!permission.granted) {
        setError("Microphone access was blocked. Allow mic permission in settings.");
        setStarting(false);
        return true;
      }
      if (session !== sessionRef.current) return true;

      try {
        engineRef.current = "device";
        intentionalStopRef.current = false;
        ExpoSpeechRecognitionModule.start(deviceOptions());
        setListening(true);
        setStarting(false);
        return true;
      } catch {
        engineRef.current = null;
        return false;
      }
    },
    [deviceOptions],
  );

  const start = useCallback(async () => {
    stop();
    const session = sessionRef.current;
    setError(null);
    setStarting(true);
    stopRequestedRef.current = false;

    const deviceStarted = await startDeviceRecognition(session);
    if (session !== sessionRef.current) return;
    if (deviceStarted) return;

    const serverStt = await isServerSpeechAvailable();
    if (session !== sessionRef.current) return;
    if (serverStt) {
      await startServerLiveLoop(session);
      return;
    }

    setError("Voice input is not supported on this device.");
    setStarting(false);
  }, [startDeviceRecognition, startServerLiveLoop, stop]);

  const toggle = useCallback(() => {
    if (processing) return;
    if (listening || starting) {
      stop(engineRef.current !== "server");
    } else {
      void start();
    }
  }, [listening, processing, starting, start, stop]);

  useEffect(
    () => () => {
      sessionRef.current += 1;
      stopRequestedRef.current = true;
      serverLoopActiveRef.current = false;
      stopDeviceRecognition();
      void releaseRecording();
    },
    [releaseRecording, stopDeviceRecognition],
  );

  return {
    listening: listening || starting,
    processing,
    error,
    start,
    stop,
    toggle,
    clearError: () => setError(null),
  };
}
