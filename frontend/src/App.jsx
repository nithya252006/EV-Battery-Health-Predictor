import React, { useState, useMemo, useRef, useEffect, useCallback } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, ReferenceLine
} from "recharts";
import {
  Zap, AlertTriangle, CheckCircle2, MessageCircle, X, Send,
  TrendingDown, Radio, WifiOff, ChevronRight, Loader2
} from "lucide-react";

// ---------------------------------------------------------------------------
// Backend base URL — point this at your deployed API when you go live.
// (e.g. set it from an env var: import.meta.env.VITE_API_BASE)
// ---------------------------------------------------------------------------
const API_BASE = "http://localhost:8000";

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
// Helpers
// ---------------------------------------------------------------------------
function deriveStatus(soh) {
  if (soh == null) return { label: "No data", color: C.textFaint };
  if (soh < 60) return { label: "Critical", color: C.danger };
  if (soh < 80) return { label: "Watch", color: C.warn };
  return { label: "Healthy", color: C.good };
}

// Cycles (voltage/temp) and predictions (SoH/RUL) are two separate tables on
// the backend. /ingest always writes one of each together, in order, so we
// zip them by position to build one row per cycle for the chart.
function mergeCyclesAndPredictions(cyclesData, predictionsData) {
  const len = Math.min(cyclesData.length, predictionsData.length);
  const rows = [];
  for (let i = 0; i < len; i++) {
    rows.push({
      cycle: cyclesData[i].cycle_number,
      voltage: cyclesData[i].voltage_avg,
      tempMax: cyclesData[i].temperature_max,
      soh: predictionsData[i].soh_percent,
      rul: predictionsData[i].rul_cycles,
      anomaly: predictionsData[i].anomaly_flag,
    });
  }
  return rows;
}

async function safeFetchJson(url, options) {
  const res = await fetch(url, options);
  if (!res.ok) {
    if (res.status === 404) return null; // e.g. no predictions yet for a fresh vehicle
    throw new Error(`${res.status} ${res.statusText}`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Signature element: vertical battery-cell gauge
// ---------------------------------------------------------------------------
function BatteryGauge({ percent, color, size = 56 }) {
  const w = size * 0.52;
  const h = size;
  const pct = percent == null ? 0 : percent;
  const fillH = (Math.max(0, Math.min(100, pct)) / 100) * (h - 10);
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
// Chat widget — now calls our own backend's /chat route instead of hitting
// api.anthropic.com directly from the browser (keeps the API key server-side).
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

    try {
      const response = await fetch(`${API_BASE}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vehicle_id: vehicle.id, question }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.detail || `Request failed (${response.status})`);
      }
      const data = await response.json();
      setMessages((m) => [...m, { role: "assistant", text: data.answer }]);
    } catch (e) {
      setError(e.message || "Couldn't reach the assistant. Try again.");
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
// Main dashboard — all data now comes from the FastAPI backend.
// ---------------------------------------------------------------------------
export default function VoltGuardDashboard() {
  const [vehicles, setVehicles] = useState([]);
  const [fleetLatest, setFleetLatest] = useState({});   // vehicle_id -> latest prediction (or null)
  const [selectedId, setSelectedId] = useState(null);
  const [cycles, setCycles] = useState([]);              // merged chart rows for the selected vehicle
  const [alerts, setAlerts] = useState([]);
  const [loadingVehicles, setLoadingVehicles] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  // --- Load the fleet list, then each vehicle's latest SoH for the grid ---
  useEffect(() => {
    let cancelled = false;

    async function loadFleet() {
      setLoadingVehicles(true);
      setErrorMsg(null);
      try {
        const vehicleList = await safeFetchJson(`${API_BASE}/vehicles`);
        if (cancelled) return;
        setVehicles(vehicleList || []);
        if (vehicleList && vehicleList.length > 0) {
          setSelectedId((prev) => prev || vehicleList[0].id);

          const entries = await Promise.all(
            vehicleList.map(async (v) => {
              const latest = await safeFetchJson(`${API_BASE}/vehicles/${v.id}/predictions/latest`);
              return [v.id, latest];
            })
          );
          if (!cancelled) setFleetLatest(Object.fromEntries(entries));
        }
      } catch (e) {
        if (!cancelled) setErrorMsg(`Couldn't reach the backend at ${API_BASE}. Is it running?`);
      } finally {
        if (!cancelled) setLoadingVehicles(false);
      }
    }

    loadFleet();
    return () => { cancelled = true; };
  }, []);

  // --- Load active alerts once, refreshed whenever the selection changes ---
  const loadAlerts = useCallback(async () => {
    try {
      const data = await safeFetchJson(`${API_BASE}/alerts?resolved=false`);
      setAlerts(data || []);
    } catch {
      // non-fatal — leave whatever alerts we already have
    }
  }, []);

  useEffect(() => { loadAlerts(); }, [loadAlerts, selectedId]);

  // --- Load cycle + prediction history for the selected vehicle ---
  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;

    async function loadDetail() {
      setLoadingDetail(true);
      try {
        const [cyclesData, predsData] = await Promise.all([
          safeFetchJson(`${API_BASE}/vehicles/${selectedId}/cycles`),
          safeFetchJson(`${API_BASE}/vehicles/${selectedId}/predictions/history`),
        ]);
        if (!cancelled) setCycles(mergeCyclesAndPredictions(cyclesData || [], predsData || []));
      } catch (e) {
        if (!cancelled) setErrorMsg("Couldn't load telemetry for this vehicle.");
      } finally {
        if (!cancelled) setLoadingDetail(false);
      }
    }

    loadDetail();
    return () => { cancelled = true; };
  }, [selectedId]);

  const selected = vehicles.find((v) => v.id === selectedId) || null;
  const selLatestRow = cycles.length > 0 ? cycles[cycles.length - 1] : null;
  const selStatus = deriveStatus(selLatestRow?.soh);

  const alertRows = useMemo(
    () =>
      alerts.map((a) => ({
        ...a,
        vehicleName: vehicles.find((v) => v.id === a.vehicle_id)?.name || "Unknown vehicle",
      })),
    [alerts, vehicles]
  );

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
          <span className="vg-mono">Live backend: {API_BASE}</span>
        </div>
      </header>

      <main className="px-6 py-6 max-w-6xl mx-auto">
        {errorMsg && (
          <div
            className="mb-5 rounded-lg px-4 py-3 text-sm"
            style={{ background: "rgba(248,113,113,0.08)", border: `1px solid ${C.danger}`, color: C.danger }}
          >
            {errorMsg}
          </div>
        )}

        {/* Fleet grid */}
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold" style={{ color: C.textDim }}>FLEET OVERVIEW</h2>
          <span className="text-xs vg-mono" style={{ color: C.textFaint }}>
            {vehicles.length} vehicles registered
          </span>
        </div>

        {loadingVehicles ? (
          <div className="flex items-center gap-2 text-sm mb-8" style={{ color: C.textDim }}>
            <Loader2 size={16} className="animate-spin" /> Loading fleet…
          </div>
        ) : vehicles.length === 0 ? (
          <p className="text-sm mb-8" style={{ color: C.textDim }}>
            No vehicles yet — run <code className="vg-mono">python seed.py</code> on the backend.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
            {vehicles.map((v) => {
              const latest = fleetLatest[v.id];
              const status = deriveStatus(latest?.soh_percent);
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
                  <BatteryGauge percent={latest?.soh_percent} color={status.color} size={44} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{v.name}</p>
                    <p className="text-xs mb-1" style={{ color: C.textDim }}>{v.model}</p>
                    <div className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: status.color }} />
                      <span className="text-xs vg-mono" style={{ color: status.color }}>
                        {latest ? `${latest.soh_percent}% · ${status.label}` : "No data yet"}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Detail panel */}
          <div
            className="lg:col-span-2 rounded-xl p-5"
            style={{ background: C.panel, border: `1px solid ${C.borderSoft}` }}
          >
            {!selected ? (
              <p className="text-sm" style={{ color: C.textDim }}>Select a vehicle to see details.</p>
            ) : (
              <>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="vg-display text-base font-semibold">{selected.name}</h3>
                    <p className="text-xs" style={{ color: C.textDim }}>{selected.model}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl vg-mono font-semibold" style={{ color: selStatus.color }}>
                      {selLatestRow ? `${selLatestRow.soh}%` : "—"}
                    </p>
                    <p className="text-xs" style={{ color: C.textDim }}>State of Health</p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3 mb-5">
                  <StatBox label="Est. RUL" value={selLatestRow ? `${selLatestRow.rul} cyc` : "—"} icon={<TrendingDown size={14} />} />
                  <StatBox label="Last voltage" value={selLatestRow ? `${selLatestRow.voltage}V` : "—"} icon={<Zap size={14} />} />
                  <StatBox label="Peak temp" value={selLatestRow ? `${selLatestRow.tempMax}°C` : "—"} icon={<AlertTriangle size={14} />} />
                </div>

                {loadingDetail ? (
                  <div className="flex items-center gap-2 text-sm py-10 justify-center" style={{ color: C.textDim }}>
                    <Loader2 size={16} className="animate-spin" /> Loading telemetry…
                  </div>
                ) : cycles.length === 0 ? (
                  <p className="text-sm py-10 text-center" style={{ color: C.textDim }}>
                    No cycles yet for this vehicle — run{" "}
                    <code className="vg-mono">python edge_simulator.py {selected.id}</code>.
                  </p>
                ) : (
                  <>
                    <ResponsiveContainer width="100%" height={220}>
                      <LineChart data={cycles}>
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
                  </>
                )}
              </>
            )}
          </div>

          {/* Alerts panel */}
          <div
            className="rounded-xl p-5"
            style={{ background: C.panel, border: `1px solid ${C.borderSoft}` }}
          >
            <h3 className="text-sm font-semibold mb-4" style={{ color: C.textDim }}>ACTIVE ALERTS</h3>
            {alertRows.length === 0 && (
              <div className="flex items-center gap-2 text-sm" style={{ color: C.good }}>
                <CheckCircle2 size={16} />
                All vehicles nominal
              </div>
            )}
            <div className="space-y-2.5">
              {alertRows.map((a) => (
                <button
                  key={a.id}
                  onClick={() => setSelectedId(a.vehicle_id)}
                  className="w-full text-left rounded-lg p-3 flex items-start gap-2.5"
                  style={{ background: C.panelAlt, border: `1px solid ${C.borderSoft}` }}
                >
                  <AlertTriangle
                    size={15}
                    style={{ color: a.severity === "high" ? C.danger : C.warn, marginTop: 2 }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium truncate">{a.vehicleName}</span>
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
                Predictions run on the edge device and sync to this dashboard
                when connectivity is available.
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
