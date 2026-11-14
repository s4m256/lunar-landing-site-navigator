import { useEffect, useRef, useState } from "react";

type SpeechControlProps = {
  text: string;
};

function portugueseVoice(voices: SpeechSynthesisVoice[]) {
  return (
    voices.find((voice) => voice.lang.toLowerCase() === "pt-br") ??
    voices.find((voice) => /^pt(?:-|$)/i.test(voice.lang))
  );
}

/** Optional, user-initiated speech for the full dialogue text. */
export function SpeechControl({ text }: SpeechControlProps) {
  const [supported, setSupported] = useState(false);
  const [voice, setVoice] = useState<SpeechSynthesisVoice>();
  const [playing, setPlaying] = useState(false);
  const [message, setMessage] = useState("");
  const active = useRef<SpeechSynthesisUtterance | null>(null);
  const startTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearStartTimer() {
    if (startTimer.current !== null) {
      clearTimeout(startTimer.current);
      startTimer.current = null;
    }
  }

  useEffect(() => {
    if (
      !("speechSynthesis" in window) ||
      !("SpeechSynthesisUtterance" in window)
    ) {
      setMessage(
        "A fala não está disponível neste navegador. Leia o texto acima.",
      );
      return;
    }
    const synthesis = window.speechSynthesis;
    setSupported(true);
    const updateVoices = () => {
      const nextVoice = portugueseVoice(synthesis.getVoices());
      setVoice(nextVoice);
      setMessage((current) =>
        nextVoice
          ? current.startsWith("Nenhuma voz")
            ? ""
            : current
          : "Nenhuma voz em português disponível neste dispositivo ou navegador. Leia o texto acima.",
      );
    };
    updateVoices();
    synthesis.addEventListener("voiceschanged", updateVoices);
    return () => synthesis.removeEventListener("voiceschanged", updateVoices);
  }, []);

  useEffect(() => {
    return () => {
      clearStartTimer();
      if (active.current) {
        active.current = null;
        window.speechSynthesis.cancel();
      }
    };
  }, [text]);

  // A changed dialogue must not retain the previous playback state or error.
  useEffect(() => {
    setPlaying(false);
    setMessage((current) =>
      current.startsWith("Não foi possível") ||
      current === "Preparando fala…" ||
      current === "Reproduzindo fala."
        ? ""
        : current,
    );
  }, [text]);

  function toggleSpeech() {
    if (active.current) {
      clearStartTimer();
      active.current = null;
      window.speechSynthesis.cancel();
      setPlaying(false);
      setMessage("");
      return;
    }
    if (!supported || !voice || !text) return;
    try {
      const synthesis = window.speechSynthesis;
      const utterance = new window.SpeechSynthesisUtterance(text);
      utterance.lang = "pt-BR";
      utterance.voice = voice;
      utterance.onstart = () => {
        if (active.current === utterance) {
          clearStartTimer();
          setMessage("Reproduzindo fala.");
        }
      };
      utterance.onend = () => {
        if (active.current !== utterance) return;
        clearStartTimer();
        active.current = null;
        setPlaying(false);
        setMessage("");
      };
      utterance.onerror = () => {
        if (active.current !== utterance) return;
        clearStartTimer();
        active.current = null;
        setPlaying(false);
        setMessage(
          "Não foi possível reproduzir a fala. Leia o texto acima ou tente novamente.",
        );
      };
      synthesis.cancel();
      active.current = utterance;
      setPlaying(true);
      setMessage("Preparando fala…");
      startTimer.current = setTimeout(() => {
        if (active.current !== utterance) return;
        startTimer.current = null;
        active.current = null;
        synthesis.cancel();
        setPlaying(false);
        setMessage(
          "Não foi possível iniciar a fala. Leia o texto acima ou tente novamente.",
        );
      }, 10_000);
      synthesis.speak(utterance);
    } catch {
      clearStartTimer();
      active.current = null;
      setPlaying(false);
      setMessage(
        "Não foi possível reproduzir a fala. Leia o texto acima ou tente novamente.",
      );
    }
  }

  return (
    <div className="speech-control">
      <button
        className="speech-toggle"
        type="button"
        onClick={toggleSpeech}
        disabled={!supported || (!voice && !playing) || !text}
      >
        {playing ? "Parar fala" : "Ouvir fala"}
      </button>
      <span className="speech-control__status" role="status">
        {supported && !voice && !playing
          ? "Nenhuma voz em português disponível neste dispositivo ou navegador. Leia o texto acima."
          : message}
      </span>
    </div>
  );
}
