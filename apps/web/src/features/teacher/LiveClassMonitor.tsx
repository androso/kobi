import { useState, useEffect, useRef } from "react";
import {
  Mic,
  Mic2,
  Pause,
  StopCircle,
  Sparkles,
  AlertTriangle,
  Leaf,
  Copy,
  FileDown,
  ChevronDown,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Sidebar } from "./components/Sidebar";
import { WaveformVisualizer } from "./components/WaveformVisualizer";

// ---------------------------------------------------------------------------
// Mock session data — replace with real-time backend data when transcription
// is implemented.
// ---------------------------------------------------------------------------
const MOCK_INSIGHTS = {
  totalSeconds: 29 * 60 + 41,
  detectedTopic: "Ecosystems",
  currentObjective: "Analyze the flow of energy through trophic levels.",
  keywords: ["Photosynthesis", "Decomposers", "Trophic Levels", "Energy Pyramid"],
  highlightedKeyword: "Trophic Levels",
  misconceptions: [
    {
      title: "Confusing Energy vs Matter",
      description:
        '3 students asked if energy is "recycled" like water. Common confusion with the Law of Conservation of Matter.',
    },
  ],
  engagementPulse: [40, 65, 85, 70, 95, 60, 45],
  suggestedActivity: "Energy Web Game",
};

// Transcript entries — final text plus an optional trailing "interim" segment
// (still being recognized) that renders faded. Backend will stream these.
const MOCK_TRANSCRIPT: Array<{
  time: string;
  text: string;
  interim?: string;
}> = [
  {
    time: "10:48",
    text:
      "Alright everyone, today we're looking at how energy moves through an ecosystem — not matter, energy specifically.",
  },
  {
    time: "10:50",
    text:
      "So the sun is our starting point. The energy from sunlight is converted into chemical energy through photosynthesis, powering almost all life on Earth.",
  },
  {
    time: "10:52",
    text:
      "As we move up each trophic level, remember that a large portion of that energy is lost as heat, which is why the",
    interim: " energy pyramid gets smaller",
  },
];

const LANGUAGE = "English";

// ---------------------------------------------------------------------------

function formatTime(seconds: number) {
  const m = Math.floor(Math.abs(seconds) / 60)
    .toString()
    .padStart(2, "0");
  const s = (Math.abs(seconds) % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

// -- Sub-components ----------------------------------------------------------

function LiveMonitorHeader() {
  const navigate = useNavigate();

  return (
    <header className="flex justify-between items-center w-full px-6 py-3 border-b border-slate-200 bg-white/75 backdrop-blur z-50 sticky top-0 shrink-0">
      <span className="text-xl font-bold text-[#004ac6] sm:text-2xl">
        Kobi Learning Labs
      </span>

      <nav className="hidden md:flex items-center gap-6">
        {[
          { label: "Dashboard", path: "/teacher" },
          { label: "Live Monitor", path: "/teacher/monitor", active: true },
          { label: "Analytics", path: "/teacher/analytics" },
        ].map(({ label, path, active }) => (
          <button
            key={label}
            onClick={() => navigate(path)}
            className={`text-xs font-bold tracking-wide uppercase transition-colors pb-0.5 ${
              active
                ? "text-[#004ac6] border-b-2 border-[#004ac6]"
                : "text-slate-500 hover:text-slate-900"
            }`}
            type="button"
          >
            {label}
          </button>
        ))}
      </nav>

      <div className="flex items-center gap-2">
        <div className="flex gap-1 mr-2 text-slate-500">
          <button className="p-2 hover:bg-slate-100 rounded-full transition-all active:scale-90" type="button">
            <Mic className="h-5 w-5" />
          </button>
          <button className="p-2 hover:bg-slate-100 rounded-full transition-all active:scale-90" type="button">
            <Mic2 className="h-5 w-5" />
          </button>
        </div>
        <button className="bg-[#dce9ff] text-[#004ac6] px-4 py-2 rounded-lg text-xs font-bold hover:shadow-md transition-all active:scale-95" type="button">
          Class Selector
        </button>
      </div>
    </header>
  );
}

function NotificationBar() {
  return (
    <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex items-center justify-between shrink-0">
      <div className="flex items-center gap-2">
        <Sparkles className="h-5 w-5 text-violet-500 animate-bounce" />
        <span className="text-sm text-slate-600">
          Kobi is searching repositories / preparing 3 activities...
        </span>
      </div>
      <div className="flex gap-1">
        <div className="w-2 h-2 rounded-full bg-violet-300" />
        <div className="w-2 h-2 rounded-full bg-violet-400" />
        <div className="w-2 h-2 rounded-full bg-violet-600" />
      </div>
    </div>
  );
}

function TranscriptPlayerCard({
  elapsed,
  remaining,
}: {
  elapsed: number;
  remaining: number;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Keep the newest line in view as the transcript grows
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  return (
    <div className="bg-white rounded-[20px] shadow-sm border border-slate-200 overflow-hidden flex flex-col flex-1 min-h-0">
      {/* Transcript header */}
      <div className="flex items-center justify-between px-6 pt-5 pb-3 shrink-0">
        <span className="text-[10px] font-bold tracking-widest uppercase text-slate-400">
          Live Transcript
        </span>
        <span className="flex items-center gap-1.5 text-[10px] font-bold tracking-widest uppercase text-emerald-600">
          <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
          Live
        </span>
      </div>

      {/* Transcript body (scrollable) */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-6 flex flex-col gap-4">
        {MOCK_TRANSCRIPT.map((entry, i) => (
          <div key={i} className="flex gap-4 items-start">
            <span className="text-xs font-semibold text-slate-400 tabular-nums shrink-0 mt-0.5 w-10">
              {entry.time}
            </span>
            <p className="text-slate-700 text-[15px] leading-relaxed">
              {entry.text}
              {entry.interim && (
                <span className="text-slate-400">{entry.interim}</span>
              )}
            </p>
          </div>
        ))}
      </div>

      {/* Actions row: copy / export + language */}
      <div className="flex items-center justify-between px-6 py-3 shrink-0">
        <div className="flex items-center gap-2">
          <button
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wide text-slate-500 hover:bg-slate-100 transition-colors active:scale-95"
            type="button"
          >
            <Copy className="h-3.5 w-3.5" />
            Copy
          </button>
          <button
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wide text-slate-500 hover:bg-slate-100 transition-colors active:scale-95"
            type="button"
          >
            <FileDown className="h-3.5 w-3.5" />
            Export
          </button>
        </div>
        <button
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-bold uppercase tracking-wide text-slate-600 hover:bg-slate-50 transition-colors"
          type="button"
        >
          {LANGUAGE}
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Waveform strip */}
      <div className="h-24 bg-[#f8f7f5] border-y border-slate-200 px-4 shrink-0">
        <WaveformVisualizer />
      </div>

      {/* Playback controls */}
      <div className="bg-slate-50 px-6 py-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <span className="text-sm font-bold text-slate-500 tabular-nums">
            {formatTime(elapsed)}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <button
            className="w-11 h-11 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-50 transition-all active:scale-90"
            type="button"
          >
            <Pause className="h-5 w-5" />
          </button>
          <button
            className="bg-red-600 hover:bg-red-700 text-white rounded-xl px-5 py-2.5 flex items-center gap-3 font-bold text-sm transition-all hover:shadow-lg active:scale-95"
            type="button"
          >
            <StopCircle className="h-5 w-5" />
            <span>
              STOP{" "}
              <span className="opacity-75 font-normal">{formatTime(remaining)}</span>
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

function InsightsPanel() {
  return (
    <div className="bg-white rounded-[28px] p-6 border border-slate-200 shadow-sm h-full flex flex-col gap-6 overflow-y-auto">
      {/* Detected Topic */}
      <div className="flex flex-col gap-2">
        <label className="text-[10px] font-bold tracking-widest uppercase text-slate-400">
          Detected Topic
        </label>
        <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full border-2 border-emerald-600 text-emerald-700 bg-emerald-50 font-bold text-base w-fit">
          <Leaf className="h-4 w-4" />
          {MOCK_INSIGHTS.detectedTopic}
        </span>
      </div>

      {/* Current Objective */}
      <div className="flex flex-col gap-2">
        <label className="text-[10px] font-bold tracking-widest uppercase text-slate-400">
          Current Objective
        </label>
        <div className="bg-slate-50 rounded-2xl p-4 border-l-4 border-violet-500">
          <p className="text-sm text-slate-700 italic font-medium">
            "{MOCK_INSIGHTS.currentObjective}"
          </p>
        </div>
      </div>

      {/* Keywords */}
      <div className="flex flex-col gap-2">
        <label className="text-[10px] font-bold tracking-widest uppercase text-slate-400">
          Keywords Detected
        </label>
        <div className="flex flex-wrap gap-2">
          {MOCK_INSIGHTS.keywords.map((kw) => (
            <span
              key={kw}
              className={`px-3 py-1 rounded-lg text-xs font-bold border transition-colors ${
                kw === MOCK_INSIGHTS.highlightedKeyword
                  ? "border-[#004ac6] text-[#004ac6] bg-blue-50"
                  : "border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              {kw}
            </span>
          ))}
        </div>
      </div>

      {/* Misconceptions */}
      <div className="flex flex-col gap-2">
        <label className="text-[10px] font-bold tracking-widest uppercase text-slate-400">
          Misconceptions Caught
        </label>
        {MOCK_INSIGHTS.misconceptions.map((m) => (
          <div
            key={m.title}
            className="bg-red-50 rounded-2xl p-4 border border-red-100 flex gap-3"
          >
            <AlertTriangle className="h-5 w-5 text-red-500 mt-0.5 shrink-0" />
            <div className="flex flex-col gap-1">
              <h4 className="font-bold text-red-800 text-sm">{m.title}</h4>
              <p className="text-red-700 text-xs leading-relaxed opacity-80">
                {m.description}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Engagement Pulse */}
      <div className="flex flex-col gap-2">
        <label className="text-[10px] font-bold tracking-widest uppercase text-slate-400">
          Engagement Pulse
        </label>
        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
          <div className="flex justify-between items-end h-20 gap-1.5 px-2">
            {MOCK_INSIGHTS.engagementPulse.map((pct, i) => (
              <div
                key={i}
                className="flex-1 rounded-t-full bg-gradient-to-t from-violet-600 to-violet-400"
                style={{ height: `${pct}%` }}
              />
            ))}
          </div>
          <div className="flex justify-between text-[10px] font-bold text-slate-400 uppercase px-2 mt-2">
            <span>T-20m</span>
            <span>T-10m</span>
            <span>NOW</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function SuggestedActivityFAB({ activity }: { activity: string }) {
  return (
    <div className="fixed bottom-6 right-6 z-50">
      <button className="bg-violet-600 text-white px-5 py-3 rounded-full shadow-2xl flex items-center gap-2 hover:scale-105 transition-all active:scale-95 font-bold text-sm" type="button">
        <Sparkles className="h-4 w-4" />
        Suggested Activity: {activity}
      </button>
    </div>
  );
}

// -- Page --------------------------------------------------------------------

export function LiveClassMonitor() {
  // Start at 12:41 to match design; will start from 0 when session begins for real
  const [elapsed, setElapsed] = useState(12 * 60 + 41);

  useEffect(() => {
    const id = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const remaining = MOCK_INSIGHTS.totalSeconds - elapsed;

  return (
    <main className="min-h-screen bg-[#eef3fb] overflow-hidden">
      <div className="grid min-h-screen w-full lg:grid-cols-[240px_minmax(0,1fr)] bg-[#eef3fb]">
        <Sidebar />
        <div className="flex flex-col p-3 sm:p-4 lg:p-5 h-screen">
          <div className="flex-1 flex flex-col bg-[#f8f9ff] rounded-[30px] border border-slate-200/50 overflow-hidden shadow-sm min-h-0">
            <LiveMonitorHeader />
            <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-5 min-h-0">
              <NotificationBar />
              <div className="grid grid-cols-12 gap-5 flex-1 min-h-0">
                <div className="col-span-7 flex flex-col min-h-0">
                  <TranscriptPlayerCard elapsed={elapsed} remaining={remaining} />
                </div>
                <div className="col-span-5 min-h-0">
                  <InsightsPanel />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <SuggestedActivityFAB activity={MOCK_INSIGHTS.suggestedActivity} />
    </main>
  );
}
