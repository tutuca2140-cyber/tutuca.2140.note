import { useCallback, useEffect, useRef, useState } from "react";

type RecognitionResultLike = {
  isFinal: boolean;
  0: { transcript: string };
};

type RecognitionEventLike = {
  results: ArrayLike<RecognitionResultLike>;
};

type RecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: RecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type RecognitionCtor = new () => RecognitionLike;

type SpeechWindow = Window & {
  SpeechRecognition?: RecognitionCtor;
  webkitSpeechRecognition?: RecognitionCtor;
};

const preferredVoiceScore = (voice: SpeechSynthesisVoice, lang: string) => {
  const name = voice.name.toLowerCase();
  let score = 0;
  if (voice.lang.toLowerCase().startsWith(lang.toLowerCase().split("-")[0])) score += 10;
  if (/francisca|luciana|maria|female|feminina|google português/.test(name)) score += 4;
  if (/natural|neural|premium/.test(name)) score += 2;
  if (voice.default) score += 1;
  return score;
};

export function useOliviaVoice(onFinalTranscript: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [voiceReplies, setVoiceReplies] = useState(true);
  const recognitionRef = useRef<RecognitionLike | null>(null);
  const callbackRef = useRef(onFinalTranscript);
  callbackRef.current = onFinalTranscript;

  const speechWindow = typeof window === "undefined" ? null : (window as SpeechWindow);
  const Recognition = speechWindow?.SpeechRecognition ?? speechWindow?.webkitSpeechRecognition;
  const listeningSupported = Boolean(Recognition);
  const speakingSupported = typeof window !== "undefined" && "speechSynthesis" in window;

  useEffect(() => () => {
    recognitionRef.current?.stop();
    window.speechSynthesis?.cancel();
  }, []);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setListening(false);
  }, []);

  const startListening = useCallback(() => {
    if (!Recognition || listening) return;
    const recognition = new Recognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    // Usa o idioma preferido do navegador. Os mecanismos modernos suportam dezenas de idiomas.
    recognition.lang = navigator.language || "pt-BR";
    recognition.onresult = event => {
      let finalText = "";
      for (let index = 0; index < event.results.length; index += 1) {
        const result = event.results[index];
        if (result.isFinal) finalText += result[0]?.transcript ?? "";
      }
      const text = finalText.trim();
      if (text) callbackRef.current(text);
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      setListening(false);
    };
    recognition.onerror = () => {
      recognitionRef.current = null;
      setListening(false);
    };
    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  }, [Recognition, listening]);

  const speak = useCallback((text: string, language?: string) => {
    if (!voiceReplies || !speakingSupported || !text.trim()) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const lang = language || navigator.language || "pt-BR";
    utterance.lang = lang;
    utterance.rate = 0.96;
    utterance.pitch = 1.08;
    utterance.volume = 0.95;
    const voices = window.speechSynthesis.getVoices();
    const voice = [...voices].sort(
      (a, b) => preferredVoiceScore(b, lang) - preferredVoiceScore(a, lang)
    )[0];
    if (voice) utterance.voice = voice;
    window.speechSynthesis.speak(utterance);
  }, [speakingSupported, voiceReplies]);

  return {
    listening,
    listeningSupported,
    speakingSupported,
    voiceReplies,
    setVoiceReplies,
    startListening,
    stopListening,
    speak,
  };
}
