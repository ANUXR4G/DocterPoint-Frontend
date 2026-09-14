/**
 * expo-speech-recognition is a custom native module (not in Expo Go).
 * Load it safely so Expo Go can still run with server STT fallback.
 */

type SpeechEventName = "start" | "end" | "result" | "error" | string;

type SpeechModuleApi = {
  isRecognitionAvailable: () => boolean;
  start: (options: Record<string, unknown>) => void;
  stop: () => void;
  requestPermissionsAsync: () => Promise<{ granted: boolean }>;
};

type UseSpeechRecognitionEvent = (
  eventName: SpeechEventName,
  listener: (event: any) => void,
) => void;

const stubModule: SpeechModuleApi = {
  isRecognitionAvailable: () => false,
  start: () => {},
  stop: () => {},
  requestPermissionsAsync: async () => ({ granted: false }),
};

const stubHook: UseSpeechRecognitionEvent = () => {
  /* no native events in Expo Go */
};

function loadNative(): {
  module: SpeechModuleApi;
  useEvent: UseSpeechRecognitionEvent;
  available: boolean;
} {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("expo-speech-recognition") as {
      ExpoSpeechRecognitionModule: SpeechModuleApi;
      useSpeechRecognitionEvent: UseSpeechRecognitionEvent;
    };
    void mod.ExpoSpeechRecognitionModule.isRecognitionAvailable();
    return {
      module: mod.ExpoSpeechRecognitionModule,
      useEvent: mod.useSpeechRecognitionEvent,
      available: true,
    };
  } catch {
    return { module: stubModule, useEvent: stubHook, available: false };
  }
}

const loaded = loadNative();

export const speechRecognitionAvailable = loaded.available;
export const ExpoSpeechRecognitionModule = loaded.module;
export const useSpeechRecognitionEvent = loaded.useEvent;
