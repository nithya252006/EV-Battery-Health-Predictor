import React, { useState, useMemo, useRef, useEffect } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, ReferenceLine
} from "recharts";
import {
  Zap, AlertTriangle, CheckCircle2, MessageCircle, X, Send,
  TrendingDown, Radio, WifiOff, ChevronRight
} from "lucide-react";

// ---------------------------------------------------------------------------
// Design tokens
// ---------------------------------------------------------------------------
const C = {
  bg: "#0A0E13",
  panel: "#121824",
  panelAlt: "#0E141D",
  border: "#1E2A38",
  borderSoft: "#182231",
  accent: "#2DD4BF",      // charge-teal
  accentDim: "#0F766E",
  good: "#34D399",
  warn: "#FBBF24",
  danger: "#F87171",
  text: "#E7EDF3",
  textDim: "#7C8B9B",
  textFaint: "#4B5A69",
};

// ---------------------------------------------------------------------------
// Mock fleet + cycle data (stand-in for the FastAPI /vehicles /predictions endpoints)
// ---------------------------------------------------------------------------
function genCycles(startSoh, degradePerCycle, noise, n, anomalyAt) {
  const rows = [];
  let soh = startSoh;
  for (let i = 1; i <= n; i++) {
    soh -= degradePerCycle + (Math.random() - 0.5) * noise;
    if (anomalyAt && i === anomalyAt) soh -= 6;
    rows.push({
      cycle: i,
      soh: Math.max(20, Math.round(soh * 10) / 10),
      voltage: (370 + (Math.random() - 0.5) * 4).toFixed(1),
      tempMax: Math.round(34 + (i === anomalyAt ? 14 : 0) + Math.random() * 6),
    });
  }
  return rows;
}

const FLEET = [
  {
    id: "v1", name: "Fleet Van 04", model: "Tata Ace EV",
    cycles: genCycles(100, 0.55, 1.2, 42, null),
  },
  {
    id: "v2", name: "Fleet Van 11", model: "Tata Ace EV",
    cycles: genCycles(100, 0.9, 1.6, 42, 30),
  },
  {
    id: "v3", name: "Cab 27", model: "Tigor EV",
    cycles: genCycles(100, 1.4, 1.8, 42, 22),
  },
  {
    id: "v4", name: "Cab 09", model: "Tigor EV",
    cycles: genCycles(100, 0.35, 0.9, 42, null),
  },
];

function deriveStatus(soh) {
  if (soh < 60) return { label: "Critical", color: C.danger };
  if (soh < 80) return { label: "Watch", color: C.warn };
  return { label: "Healthy", color: C.good };
}

function estimateRUL(cycles) {
  const last = cycles[cycles.length - 1].soh;
  const prev = cycles[Math.max(0, cycles.length - 8)].soh;
  const ratePerCycle = Math.max(0.05, (prev - last) / 8);
  const cyclesToEOL = (last - 70) / ratePerCycle; // treat 70% as replacement threshold
  return Math.max(0, Math.round(cyclesToEOL));
}

// ---------------------------------------------------------------------------
// Signature element: vertical battery-cell gauge
// ---------------------------------------------------------------------------
function BatteryGauge({ percent, color, size = 56 }) {
  const w = size * 0.52;
  const h = size;
  const fillH = (Math.max(0, Math.min(100, percent)) / 100) * (h - 10);
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <rect x={w * 0.28} y={0} width={w * 0.44} height={h * 0.06} rx={1.5} fill={C.textFaint} />
      <rect
        x={1} y={h * 0.06} width={w - 2} height={h * 0.94 - 1} rx={4}
        fill="none" stroke={C.border} strokeWidth="2"
      />
      <rect
        x={4}
        y={h - 4 - fillH}
        width={w - 8}
        height={fillH}
        rx={2}
        fill={color}
        opacity="0.9"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Chat widget — calls the live Claude API using the vehicle's telemetry as context
// ---------------------------------------------------------------------------
function ChatWidget({ vehicle }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, open]);

  const ask = async (question) => {
    if (!question.trim() || !vehicle) return;
    setError(null);
    const nextMessages = [...messages, { role: "user", text: question }];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);

    const latest = vehicle.cycles[vehicle.cycles.length - 1];
    const rul = estimateRUL(vehicle.cycles);
    const status = deriveStatus(latest.soh);

    const contextPrompt = `You are the on-device diagnostic assistant for an EV fleet battery-health system called VoltGuard.
Vehicle: ${vehicle.name} (${vehicle.model})
Current State of Health: ${latest.soh}%
Status: ${status.label}
Estimated Remaining Useful Life: ${rul} cycles
Latest cycle voltage: ${latest.voltage}V, peak temperature: ${latest.tempMax}C

Answer the fleet manager's question in 2-4 short sentences, in plain, non-technical language. Be direct and practical.
Question: ${question}`;

    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 300,
          messages: [{ role: "user", content: contextPrompt }],
        }),
      });
      const data = await response.json();
      const answer =
        data?.content?.map((b) => b.text || "").join("\n").trim() ||
        "I couldn't generate an explanation right now.";
      setMessages((m) => [...m, { role: "assistant", text: answer }]);
    } catch (e) {
      setError("Couldn't reach the assistant. Try again.");
    } finally {
      setLoading(false);
    }
  };

  if (!vehicle) return null;

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end">
      {open && (
        <div
          className="mb-3 w-80 sm:w-96 rounded-xl overflow-hidden shadow-2xl flex flex-col"
          style={{ background: C.panel, border: `1px solid ${C.border}`, maxHeight: 440 }}
        >
          <div
            className="flex items-center justify-between px-4 py-3"
            style={{ borderBottom: `1px solid ${C.borderSoft}` }}
          >
            <div>
              <p className="text-sm font-semibold" style={{ color: C.text }}>Ask VoltGuard</p>
              <p className="text-xs" style={{ color: C.textDim }}>{vehicle.name} · live diagnostics</p>
            </div>
            <button onClick={() => setOpen(false)} style={{ color: C.textDim }}>
              <X size={18} />
            </button>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3" style={{ minHeight: 160 }}>
            {messages.length === 0 && (
              <p className="text-xs leading-relaxed" style={{ color: C.textDim }}>
                Ask why this vehicle is flagged, what's driving its SoH trend, or what to do next.
              </p>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`text-sm ${m.role === "user" ? "text-right" : "text-left"}`}>
                <span
                  className="inline-block px-3 py-2 rounded-lg max-w-[85%]"
                  style={{
                    background: m.role === "user" ? C.accentDim : C.panelAlt,
                    color: C.text,
                    border: m.role === "user" ? "none" : `1px solid ${C.borderSoft}`,
                  }}
                >
                  {m.text}
                </span>
              </div>
            ))}
            {loading && <p className="text-xs" style={{ color: C.textDim }}>Thinking…</p>}
            {error && <p className="text-xs" style={{ color: C.danger }}>{error}</p>}
          </div>

          <div className="p-3 flex gap-2" style={{ borderTop: `1px solid ${C.borderSoft}` }}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && ask(input)}
              placeholder="Why is this vehicle flagged?"
              className="flex-1 text-sm px-3 py-2 rounded-lg outline-none"
              style={{ background: C.panelAlt, color: C.text, border: `1px solid ${C.borderSoft}` }}
            />
            <button
              onClick={() => ask(input)}
              disabled={loading}
              className="px-3 rounded-lg flex items-center justify-center"
              style={{ background: C.accent, color: "#04201D" }}
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      )}

      <button
        onClick={() => setOpen((o) => !o)}
        className="w-14 h-14 rounded-full flex items-center justify-center shadow-lg"
        style={{ background: C.accent, color: "#04201D" }}
      >
        <MessageCircle size={22} />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main dashboard
// ---------------------------------------------------------------------------
export default function VoltGuardDashboard() {
  const [selectedId, setSelectedId] = useState(FLEET[0].id);
  const selected = FLEET.find((v) => v.id === selectedId);

  const alerts = useMemo(() => {
    const list = [];
    FLEET.forEach((v) => {
      const latest = v.cycles[v.cycles.length - 1];
      const status = deriveStatus(latest.soh);
      if (status.label !== "Healthy") {
        list.push({
          vehicle: v.name,
          id: v.id,
          severity: status.label === "Critical" ? "High" : "Medium",
          message:
            status.label === "Critical"
              ? `SoH dropped to ${latest.soh}% — schedule service immediately`
              : `SoH trending down (${latest.soh}%) — monitor closely`,
        });
      }
    });
    return list;
  }, []);

  const selLatest = selected.cycles[selected.cycles.length - 1];
  const selStatus = deriveStatus(selLatest.soh);
  const selRUL = estimateRUL(selected.cycles);

  return (
    <div className="min-h-screen w-full" style={{ background: C.bg, color: C.text }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
        .vg-display { font-family: 'Space Grotesk', sans-serif; }
        .vg-mono { font-family: 'JetBrains Mono', monospace; }
      `}</style>

      {/* Header */}
      <header
        className="flex items-center justify-between px-6 py-4"
        style={{ borderBottom: `1px solid ${C.borderSoft}` }}
      >
        <div className="flex items-center gap-2.5">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center"
            style={{ background: C.accentDim }}
          >
            <Zap size={18} style={{ color: C.accent }} />
          </div>
          <div>
            <h1 className="vg-display text-lg font-semibold leading-tight">VoltGuard</h1>
            <p className="text-xs" style={{ color: C.textDim }}>Edge AI Battery Health Predictor</p>
          </div>
        </div>
        <div
          className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full text-xs"
          style={{ background: C.panel, border: `1px solid ${C.borderSoft}`, color: C.good }}
        >
          <Radio size={13} />
          <span className="vg-mono">Edge inference active</span>
        </div>
      </header>

      <main className="px-6 py-6 max-w-6xl mx-auto">
        {/* Fleet grid */}
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold" style={{ color: C.textDim }}>FLEET OVERVIEW</h2>
          <span className="text-xs vg-mono" style={{ color: C.textFaint }}>{FLEET.length} vehicles monitored</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
          {FLEET.map((v) => {
            const latest = v.cycles[v.cycles.length - 1];
            const status = deriveStatus(latest.soh);
            const active = v.id === selectedId;
            return (
              <button
                key={v.id}
                onClick={() => setSelectedId(v.id)}
                className="text-left rounded-xl p-4 flex items-center gap-3 transition"
                style={{
                  background: active ? C.panelAlt : C.panel,
                  border: `1px solid ${active ? C.accentDim : C.borderSoft}`,
                }}
              >
                <BatteryGauge percent={latest.soh} color={status.color} size={44} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{v.name}</p>
                  <p className="text-xs mb-1" style={{ color: C.textDim }}>{v.model}</p>
                  <div className="flex items-center gap-1.5">
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ background: status.color }}
                    />
                    <span className="text-xs vg-mono" style={{ color: status.color }}>
                      {latest.soh}% · {status.label}
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Detail panel */}
          <div
            className="lg:col-span-2 rounded-xl p-5"
            style={{ background: C.panel, border: `1px solid ${C.borderSoft}` }}
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="vg-display text-base font-semibold">{selected.name}</h3>
                <p className="text-xs" style={{ color: C.textDim }}>{selected.model}</p>
              </div>
              <div className="text-right">
                <p className="text-2xl vg-mono font-semibold" style={{ color: selStatus.color }}>
                  {selLatest.soh}%
                </p>
                <p className="text-xs" style={{ color: C.textDim }}>State of Health</p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 mb-5">
              <StatBox label="Est. RUL" value={`${selRUL} cyc`} icon={<TrendingDown size={14} />} />
              <StatBox label="Last voltage" value={`${selLatest.voltage}V`} icon={<Zap size={14} />} />
              <StatBox label="Peak temp" value={`${selLatest.tempMax}°C`} icon={<AlertTriangle size={14} />} />
            </div>

            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={selected.cycles}>
                <CartesianGrid stroke={C.borderSoft} vertical={false} />
                <XAxis dataKey="cycle" stroke={C.textFaint} fontSize={11} tickLine={false} />
                <YAxis domain={[40, 100]} stroke={C.textFaint} fontSize={11} tickLine={false} width={32} />
                <ReferenceLine y={70} stroke={C.warn} strokeDasharray="4 4" strokeOpacity={0.5} />
                <Tooltip
                  contentStyle={{ background: C.panelAlt, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: C.textDim }}
                />
                <Line type="monotone" dataKey="soh" stroke={C.accent} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
            <p className="text-xs mt-2" style={{ color: C.textFaint }}>
              Dashed line marks the 70% replacement-planning threshold.
            </p>
          </div>

          {/* Alerts panel */}
          <div
            className="rounded-xl p-5"
            style={{ background: C.panel, border: `1px solid ${C.borderSoft}` }}
          >
            <h3 className="text-sm font-semibold mb-4" style={{ color: C.textDim }}>ACTIVE ALERTS</h3>
            {alerts.length === 0 && (
              <div className="flex items-center gap-2 text-sm" style={{ color: C.good }}>
                <CheckCircle2 size={16} />
                All vehicles nominal
              </div>
            )}
            <div className="space-y-2.5">
              {alerts.map((a, i) => (
                <button
                  key={i}
                  onClick={() => setSelectedId(a.id)}
                  className="w-full text-left rounded-lg p-3 flex items-start gap-2.5"
                  style={{ background: C.panelAlt, border: `1px solid ${C.borderSoft}` }}
                >
                  <AlertTriangle
                    size={15}
                    style={{ color: a.severity === "High" ? C.danger : C.warn, marginTop: 2 }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium truncate">{a.vehicle}</span>
                      <ChevronRight size={13} style={{ color: C.textFaint }} />
                    </div>
                    <p className="text-xs mt-0.5" style={{ color: C.textDim }}>{a.message}</p>
                  </div>
                </button>
              ))}
            </div>

            <div
              className="mt-5 pt-4 flex items-start gap-2"
              style={{ borderTop: `1px solid ${C.borderSoft}` }}
            >
              <WifiOff size={14} style={{ color: C.textFaint, marginTop: 1 }} />
              <p className="text-xs leading-relaxed" style={{ color: C.textFaint }}>
                Predictions run fully on-device. This fleet view syncs when connectivity
                is available — it is not required for detection.
              </p>
            </div>
          </div>
        </div>
      </main>

      <ChatWidget vehicle={selected} />
    </div>
  );
}

function StatBox({ label, value, icon }) {
  return (
    <div className="rounded-lg p-3" style={{ background: C.panelAlt, border: `1px solid ${C.borderSoft}` }}>
      <div className="flex items-center gap-1.5 mb-1" style={{ color: C.textFaint }}>
        {icon}
        <span className="text-[10px] uppercase tracking-wide">{label}</span>
      </div>
      <p className="vg-mono text-sm font-medium">{value}</p>
    </div>
  );
}
