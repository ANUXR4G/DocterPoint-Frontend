"use client"

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react"
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition"
import MicButton from "@/components/inputs/MicButton"

type VoiceTextInputProps = {
  id?: string
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  required?: boolean
  disabled?: boolean
  multiline?: boolean
  rows?: number
  className?: string
  inputClassName?: string
  micAriaLabel?: string
  listeningHint?: string
  voiceHint?: string
}

export type VoiceTextInputHandle = {
  stopVoice: () => void
}

const VoiceTextInput = forwardRef<VoiceTextInputHandle, VoiceTextInputProps>(
  function VoiceTextInput(
    {
      id,
      label,
      value,
      onChange,
      placeholder,
      required,
      disabled,
      multiline = false,
      rows = 3,
      className = "",
      inputClassName = "",
      micAriaLabel = "Dictate by voice",
      listeningHint = "Listening… speak now, tap mic again to stop",
      voiceHint = "Tap mic and speak — text appears as you talk. Tap mic again to stop.",
    },
    ref,
  ) {
    const textareaRef = useRef<HTMLTextAreaElement>(null)
    const inputRef = useRef<HTMLInputElement>(null)
    /** Text already in the field when mic was pressed — preserved while dictating. */
    const baseRef = useRef("")
    const onChangeRef = useRef(onChange)
    onChangeRef.current = onChange

    const [fieldValue, setFieldValue] = useState(value)

    const applyText = useCallback((text: string) => {
      setFieldValue(text)
      onChangeRef.current(text)
      const el = multiline ? textareaRef.current : inputRef.current
      if (el && el.value !== text) {
        el.value = text
      }
    }, [multiline])

    const {
      listening,
      processing,
      error: voiceError,
      notice: voiceNotice,
      toggle: toggleVoice,
      stop: stopVoice,
      clearError: clearVoiceError,
      clearNotice: clearVoiceNotice,
    } = useSpeechRecognition({
      continuous: multiline,
      liveTranscript: true,
      onInterimTranscript: (text) => {
        const base = baseRef.current.trim()
        applyText(base ? `${base} ${text}`.trim() : text)
      },
      onFinalTranscript: (text) => {
        if (!text.trim()) return
        const base = baseRef.current.trim()
        const merged = base ? `${base} ${text}`.trim() : text.trim()
        baseRef.current = merged
        applyText(merged)
      },
    })

    useEffect(() => {
      if (!listening && !processing) {
        baseRef.current = value
        setFieldValue(value)
      }
    }, [value, listening, processing])

    useImperativeHandle(ref, () => ({ stopVoice }), [stopVoice])

    function handleChange(next: string) {
      clearVoiceError()
      clearVoiceNotice()
      baseRef.current = next
      setFieldValue(next)
      onChange(next)
    }

    function handleMicClick() {
      clearVoiceError()
      clearVoiceNotice()
      if (!listening && !processing) {
        baseRef.current = value.trim()
        setFieldValue(value)
      }
      if (multiline) textareaRef.current?.focus()
      else inputRef.current?.focus()
      toggleVoice()
    }

    const inputClass = `form-input min-h-11 flex-1 rounded-lg px-3 py-2 ${inputClassName}${
      listening ? " ring-1 ring-red-300 dark:ring-red-800" : ""
    }`

    return (
      <label className={`gg-muted block text-sm ${className}`}>
        {label}
        <div className="mt-1 flex items-start gap-2">
          {multiline ? (
            <textarea
              ref={textareaRef}
              id={id}
              value={fieldValue}
              onChange={(e) => handleChange(e.target.value)}
              placeholder={placeholder}
              required={required}
              disabled={disabled || processing}
              rows={rows}
              className={inputClass}
            />
          ) : (
            <input
              ref={inputRef}
              id={id}
              value={fieldValue}
              onChange={(e) => handleChange(e.target.value)}
              placeholder={placeholder}
              required={required}
              disabled={disabled || processing}
              className={inputClass}
            />
          )}
          <MicButton
            listening={listening || processing}
            disabled={disabled || processing}
            onClick={handleMicClick}
            ariaLabel={micAriaLabel}
          />
        </div>
        {processing ? (
          <p className="mt-2 text-xs font-medium text-neutral-600 dark:text-neutral-300">
            Transcribing…
          </p>
        ) : listening ? (
          <p className="mt-2 flex items-center gap-2 text-xs font-medium text-red-600 dark:text-red-400">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex size-2 rounded-full bg-red-500" />
            </span>
            {listeningHint}
          </p>
        ) : null}
        {voiceNotice ? (
          <p className="mt-2 text-xs leading-relaxed text-sky-800 dark:text-sky-300">
            {voiceNotice}
          </p>
        ) : null}
        {voiceError ? (
          <p className="mt-2 text-xs font-medium text-amber-700 dark:text-amber-300">
            {voiceError}
          </p>
        ) : null}
        {!listening && !processing && !voiceError && !voiceNotice && voiceHint ? (
          <p className="mt-1 text-[11px] text-neutral-500 dark:text-neutral-400">
            {voiceHint}
          </p>
        ) : null}
      </label>
    )
  },
)

export default VoiceTextInput
