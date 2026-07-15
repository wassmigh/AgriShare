import React, { useState, useEffect, useRef } from 'react';
import mqtt from 'mqtt';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { ThermometerSun, Leaf, Sun, FlaskConical, Droplets, Wifi, WifiOff, Loader2, Activity, Cpu, ExternalLink, Fan, Wind, LogOut } from 'lucide-react';
import AiAdvisor from './AiAdvisor';
import Login from './Login';
import Register from './Register';


function useAnimatedValue(target, duration = 600) {
  const [displayed, setDisplayed] = useState(target ?? 0);
  const animRef  = useRef(null);
  const fromRef  = useRef(target ?? 0);
  const startRef = useRef(null);

  useEffect(() => {
    if (target == null) return;
    if (animRef.current) cancelAnimationFrame(animRef.current);

    const from = fromRef.current;
    const to   = target;
    startRef.current = null;

    const step = (timestamp) => {
      if (!startRef.current) startRef.current = timestamp;
      const elapsed  = timestamp - startRef.current;
      const progress = Math.min(elapsed / duration, 1);
      const eased    = 1 - Math.pow(1 - progress, 3);
      const current  = from + (to - from) * eased;
      fromRef.current = current;
      setDisplayed(current);
      if (progress < 1) {
        animRef.current = requestAnimationFrame(step);
      } else {
        fromRef.current = to;
      }
    };

    animRef.current = requestAnimationFrame(step);
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [target, duration]);

  return displayed;
}

// ---------------------------------------------------------------------------
// Helpers globaux
const val = (v, fixed = 1) =>
  v != null ? (typeof v === 'number' && !Number.isInteger(v) ? v.toFixed(fixed) : v) : '--';

// ---------------------------------------------------------------------------
// SensorCard
// ---------------------------------------------------------------------------
function SensorCard({ title, icon: Icon, children, colorClass = 'text-emerald-400', bgClass = 'bg-emerald-400/10', className = '' }) {
  return (
    <div className={`relative overflow-hidden bg-[#121214] border border-white/5 rounded-[2rem] p-6 lg:p-8 transition-all duration-500 opacity-100 hover:border-white/10 ${className}`}>
      <div className="absolute top-0 right-0 p-8 opacity-[0.03] pointer-events-none">
        <Icon className="w-32 h-32" />
      </div>
      <div className="relative z-10 flex flex-col h-full">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center space-x-4">
            <div className={`p-3 rounded-2xl ${bgClass} ${colorClass} ring-1 ring-white/10`}>
              <Icon className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-medium tracking-wide text-zinc-100">{title}</h3>
          </div>
        </div>
        <div className="flex-1 flex flex-col justify-end">
          {children}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SoilCard - Humidite du Sol avec animation rAF
// ---------------------------------------------------------------------------
function SoilCard({ data, ts, currentTime }) {
  const animPercent = useAnimatedValue(data?.percent ?? null);
  const animRaw     = useAnimatedValue(data?.raw     ?? null, 400);

  return (
    <SensorCard title="Humidité du Sol" icon={Leaf} ts={ts} currentTime={currentTime} colorClass="text-emerald-400" bgClass="bg-emerald-400/10">
      <div className="flex justify-between items-end mb-4">
        <p className="text-5xl font-bold tracking-tight text-white">
          {data == null ? '--' : animPercent.toFixed(1)}
          <span className="text-2xl text-zinc-500 font-normal ml-1">%</span>
        </p>
        <p className="text-sm text-zinc-500 font-mono mb-1 flex items-center bg-black/50 px-2 py-1 rounded-md">
          <Activity className="w-3 h-3 mr-1.5 text-emerald-500" />
          RAW {data == null ? '--' : Math.round(animRaw)}
        </p>
      </div>
      <div className="w-full bg-zinc-800/50 rounded-full h-2.5 overflow-hidden backdrop-blur-sm">
        <div
          className="bg-emerald-500 h-full rounded-full shadow-[0_0_15px_rgba(16,185,129,0.5)]"
          style={{ width: `${animPercent}%` }}
        />
      </div>
    </SensorCard>
  );
}

// ---------------------------------------------------------------------------
// LdrCard - Luminosite avec animation rAF
// ---------------------------------------------------------------------------
function LdrCard({ data, ts, currentTime }) {
  const animPercent = useAnimatedValue(data?.percent ?? null);
  const animRaw     = useAnimatedValue(data?.raw     ?? null, 400);

  return (
    <SensorCard title="Luminosité" icon={Sun} ts={ts} currentTime={currentTime} colorClass="text-yellow-400" bgClass="bg-yellow-400/10">
      <div className="flex justify-between items-end mb-4">
        <p className="text-5xl font-bold tracking-tight text-white">
          {data == null ? '--' : animPercent.toFixed(1)}
          <span className="text-2xl text-zinc-500 font-normal ml-1">%</span>
        </p>
        <p className="text-sm text-zinc-500 font-mono mb-1 flex items-center bg-black/50 px-2 py-1 rounded-md">
          <Activity className="w-3 h-3 mr-1.5 text-yellow-500" />
          RAW {data == null ? '--' : Math.round(animRaw)}
        </p>
      </div>
      <div className="w-full bg-zinc-800/50 rounded-full h-2.5 overflow-hidden backdrop-blur-sm">
        <div
          className="bg-yellow-400 h-full rounded-full shadow-[0_0_15px_rgba(250,204,21,0.5)]"
          style={{ width: `${animPercent}%` }}
        />
      </div>
    </SensorCard>
  );
}

// ---------------------------------------------------------------------------
// ClimateCard - Température & Humidité avec animation rAF
// ---------------------------------------------------------------------------
function ClimateCard({ data, ts, currentTime }) {
  const animTemp = useAnimatedValue(data?.temperature ?? null);
  const animHum  = useAnimatedValue(data?.humidity    ?? null);

  return (
    <SensorCard title="Climat" icon={ThermometerSun} ts={ts} currentTime={currentTime} colorClass="text-amber-400" bgClass="bg-amber-400/10">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-sm font-medium text-zinc-500 mb-1">Température</p>
          <p className="text-4xl font-bold tracking-tight text-white">
            {data == null ? '--' : animTemp.toFixed(1)}
            <span className="text-xl text-zinc-500 font-normal ml-1">°C</span>
          </p>
        </div>
        <div>
          <p className="text-sm font-medium text-zinc-500 mb-1">Humidité</p>
          <p className="text-4xl font-bold tracking-tight text-white">
            {data == null ? '--' : animHum.toFixed(1)}
            <span className="text-xl text-zinc-500 font-normal ml-1">%</span>
          </p>
        </div>
      </div>
    </SensorCard>
  );
}

// ---------------------------------------------------------------------------
// NpkCard - Macronutriments avec animation rAF
// ---------------------------------------------------------------------------
function NpkCard({ data, ts, currentTime }) {
  const animN = useAnimatedValue(data?.N ?? null, 500);
  const animP = useAnimatedValue(data?.P ?? null, 500);
  const animK = useAnimatedValue(data?.K ?? null, 500);

  return (
    <SensorCard className="flex-1" title="Macronutriments" icon={FlaskConical} ts={ts} currentTime={currentTime} colorClass="text-fuchsia-400" bgClass="bg-fuchsia-400/10">
      <div className="flex justify-between items-stretch flex-1 gap-2">
        <div className="flex-1 text-center flex flex-col justify-center group cursor-default py-4">
          <p className="text-xs font-mono text-zinc-500 mb-3 transition-colors group-hover:text-fuchsia-400 uppercase tracking-widest">Nitrogen</p>
          <p className="text-4xl font-bold text-white tracking-tight">
            {data == null ? '--' : Math.round(animN)}
          </p>
          <p className="text-xs font-mono text-zinc-600 mt-2">mg/kg</p>
        </div>
        <div className="w-px bg-gradient-to-b from-transparent via-white/10 to-transparent self-stretch" />
        <div className="flex-1 text-center flex flex-col justify-center group cursor-default py-4">
          <p className="text-xs font-mono text-zinc-500 mb-3 transition-colors group-hover:text-fuchsia-400 uppercase tracking-widest">Phosphore</p>
          <p className="text-4xl font-bold text-white tracking-tight">
            {data == null ? '--' : Math.round(animP)}
          </p>
          <p className="text-xs font-mono text-zinc-600 mt-2">mg/kg</p>
        </div>
        <div className="w-px bg-gradient-to-b from-transparent via-white/10 to-transparent self-stretch" />
        <div className="flex-1 text-center flex flex-col justify-center group cursor-default py-4">
          <p className="text-xs font-mono text-zinc-500 mb-3 transition-colors group-hover:text-fuchsia-400 uppercase tracking-widest">Potassium</p>
          <p className="text-4xl font-bold text-white tracking-tight">
            {data == null ? '--' : Math.round(animK)}
          </p>
          <p className="text-xs font-mono text-zinc-600 mt-2">mg/kg</p>
        </div>
      </div>
    </SensorCard>
  );
}

// ---------------------------------------------------------------------------
// WaterCard - Irrigation avec animation rAF
// ---------------------------------------------------------------------------
function WaterCard({ data, ts, currentTime }) {
  const animFlow  = useAnimatedValue(data?.flow_rate    ?? null);
  const animVol   = useAnimatedValue(data?.total_volume ?? null);

  return (
    <SensorCard className="flex-1" title="Dynamique d'Irrigation" icon={Droplets} ts={ts} currentTime={currentTime} colorClass="text-cyan-400" bgClass="bg-cyan-400/10">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs font-mono text-zinc-500 mb-2">Débit</p>
          <p className="text-3xl font-bold tracking-tight text-white flex items-baseline">
            {data == null ? '--' : animFlow.toFixed(1)}
            <span className="text-sm text-zinc-500 font-mono ml-2">{data?.unit_flow || 'L/m'}</span>
          </p>
        </div>
        <div>
          <p className="text-xs font-mono text-zinc-500 mb-2">Volume Total</p>
          <p className="text-3xl font-bold tracking-tight text-white flex items-baseline">
            {data == null ? '--' : animVol.toFixed(1)}
            <span className="text-sm text-zinc-500 font-mono ml-2">{data?.unit_vol || 'L'}</span>
          </p>
        </div>
      </div>
    </SensorCard>
  );
}

// ---------------------------------------------------------------------------
// FanCard - Ventilateur
// ---------------------------------------------------------------------------
function FanCard({ data, ts, currentTime }) {
  const isOn = data != null && (data.state === true || data.state === 'ON' || data.state === 1 || data.isOn === true || data.active === true);

  return (
    <SensorCard title="Ventilation" icon={Fan} ts={ts} currentTime={currentTime} colorClass="text-blue-400" bgClass="bg-blue-400/10">
      <div className="flex justify-between items-center h-full">
        <div>
          <p className="text-sm font-medium text-zinc-500 mb-1">État du système</p>
          <p className={`text-3xl font-bold tracking-tight ${data == null ? 'text-white' : isOn ? 'text-blue-400' : 'text-zinc-400'}`}>
            {data == null ? '--' : (isOn ? 'ACTIVÉ' : 'DÉSACTIVÉ')}
          </p>
        </div>
        <div className={`p-4 rounded-full transition-all duration-500 ${isOn ? 'bg-blue-500/20 text-blue-400 shadow-[0_0_20px_rgba(59,130,246,0.3)]' : 'bg-zinc-800/50 text-zinc-600'}`}>
          <Fan className={`w-8 h-8 ${isOn ? 'animate-spin' : ''}`} style={{ animationDuration: '3s' }} />
        </div>
      </div>
    </SensorCard>
  );
}

// ---------------------------------------------------------------------------
// Co2Card - Capteur CO2
// ---------------------------------------------------------------------------
function Co2Card({ data, ts, currentTime }) {
  const animPpm = useAnimatedValue(data?.ppm ?? null, 400);
  const animRaw = useAnimatedValue(data?.raw ?? null, 400);

  const percentage = Math.min(Math.max(((animPpm - 400) / 1600) * 100, 0), 100);

  return (
    <SensorCard title="Qualité de l'Air (CO2)" icon={Wind} ts={ts} currentTime={currentTime} colorClass="text-sky-400" bgClass="bg-sky-400/10">
      <div className="flex justify-between items-end mb-4">
        <p className="text-5xl font-bold tracking-tight text-white">
          {data == null ? '--' : Math.round(animPpm)}
          <span className="text-2xl text-zinc-500 font-normal ml-1">ppm</span>
        </p>
        <p className="text-sm text-zinc-500 font-mono mb-1 flex items-center bg-black/50 px-2 py-1 rounded-md">
          <Activity className="w-3 h-3 mr-1.5 text-sky-500" />
          RAW {data == null ? '--' : Math.round(animRaw)}
        </p>
      </div>
      <div className="w-full bg-zinc-800/50 rounded-full h-2.5 overflow-hidden backdrop-blur-sm">
        <div
          className="bg-sky-400 h-full rounded-full shadow-[0_0_15px_rgba(56,189,248,0.5)] transition-all duration-300"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </SensorCard>
  );
}

// Fenêtre de conservation de l'historique : 24 heures
const WINDOW_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// App principal
// ---------------------------------------------------------------------------
export default function App() {
  const [authView, setAuthView] = useState('login');
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return localStorage.getItem('agrishare_authenticated') === 'true';
  });
  const [status, setStatus]           = useState('connecting');
  const [currentTime, setCurrentTime] = useState(Date.now());
  const [sensors, setSensors]         = useState({
    dht:   { data: null, ts: 0 },
    soil:  { data: null, ts: 0 },
    ldr:   { data: null, ts: 0 },
    npk:   { data: null, ts: 0 },
    water: { data: null, ts: 0 },
    fan:   { data: null, ts: 0 },
    co2:   { data: null, ts: 0 },
  });
  // Charge l'historique persisté au montage, en éliminant déjà les entrées périmées
  const [history, setHistory] = useState(() => {
    try {
      const saved = localStorage.getItem('agrishare_history');
      if (!saved) return [];
      const parsed = JSON.parse(saved);
      const cutoff = Date.now() - WINDOW_MS;
      return parsed.filter(p => p.ts > cutoff);
    } catch {
      return [];
    }
  });
  const clientRef = useRef(null);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Nettoyage périodique : supprime les points > 24h toutes les 5 minutes
  useEffect(() => {
    const pruner = setInterval(() => {
      setHistory(prev => {
        const cutoff = Date.now() - WINDOW_MS;
        const pruned = prev.filter(p => p.ts > cutoff);
        if (pruned.length !== prev.length) {
          localStorage.setItem('agrishare_history', JSON.stringify(pruned));
        }
        return pruned;
      });
    }, 5 * 60 * 1000);
    return () => clearInterval(pruner);
  }, []);

  // Persiste l'historique dans localStorage à chaque changement
  useEffect(() => {
    localStorage.setItem('agrishare_history', JSON.stringify(history));
  }, [history]);

  useEffect(() => {
    const brokerUrl = 'wss://3d45e6809f7a47f0983691192e9b674b.s1.eu.hivemq.cloud:8884/mqtt';
    const options = {
      clientId: 'agrishare_web_' + Math.random().toString(16).substr(2, 8),
      username: 'Wassmi',
      password: 'Wassmi123',
      protocol: 'wss',
    };

    clientRef.current = mqtt.connect(brokerUrl, options);
    const client = clientRef.current;

    client.on('connect', () => {
      setStatus('connected');
      client.subscribe('agrishare/sensors/#', (err) => {
        if (err) console.error("Erreur d'abonnement:", err);
      });
      client.subscribe('agrishare/actuators/#', (err) => {
        if (err) console.error("Erreur d'abonnement actuators:", err);
      });
    });

    client.on('reconnect', () => setStatus('connecting'));
    client.on('error',   (err) => { console.error('Erreur MQTT:', err); setStatus('disconnected'); });
    client.on('offline', () => setStatus('disconnected'));

    client.on('message', (topic, message) => {
      try {
        const payload = JSON.parse(message.toString());
        const now = Date.now();

        if (topic === 'agrishare/sensors/dht') {
          setSensors(prev => ({ ...prev, dht: { data: payload, ts: now } }));
          setHistory(prev => {
            const now2 = Date.now();
            const cutoff = now2 - WINDOW_MS;
            const timeStr = new Date(now2).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            const newPoint = { ts: now2, time: timeStr, temperature: payload.temperature, humidity: payload.humidity };
            // Filtre les points plus vieux que 24h et ajoute le nouveau
            return [...prev.filter(p => p.ts > cutoff), newPoint];
          });
        } else if (topic === 'agrishare/sensors/soil') {
          setSensors(prev => ({ ...prev, soil: { data: payload, ts: now } }));
        } else if (topic === 'agrishare/sensors/ldr') {
          setSensors(prev => ({ ...prev, ldr: { data: payload, ts: now } }));
        } else if (topic === 'agrishare/sensors/npk') {
          setSensors(prev => ({ ...prev, npk: { data: payload, ts: now } }));
        } else if (topic === 'agrishare/sensors/water') {
          setSensors(prev => ({ ...prev, water: { data: payload, ts: now } }));
        } else if (topic === 'agrishare/sensors/fan' || topic === 'agrishare/actuators/fan') {
          setSensors(prev => ({ ...prev, fan: { data: payload, ts: now } }));
        } else if (topic === 'agrishare/sensors/co2') {
          setSensors(prev => ({ ...prev, co2: { data: payload, ts: now } }));
        }
      } catch (e) {
        console.error('Erreur parsing MQTT payload:', e);
      }
    });

    return () => { if (client) client.end(); };
  }, []);

  const getStatusStyles = () => {
    if (status === 'connected')  return 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20 shadow-[0_0_15px_rgba(52,211,153,0.15)]';
    if (status === 'connecting') return 'text-amber-400 bg-amber-400/10 border-amber-400/20 shadow-[0_0_15px_rgba(251,191,36,0.15)]';
    return 'text-rose-400 bg-rose-400/10 border-rose-400/20 shadow-[0_0_15px_rgba(244,63,94,0.15)]';
  };

  const getStatusIcon = () => {
    if (status === 'connected')  return <Wifi className="w-4 h-4 mr-2" />;
    if (status === 'connecting') return <Loader2 className="w-4 h-4 mr-2 animate-spin" />;
    return <WifiOff className="w-4 h-4 mr-2" />;
  };

  if (!isAuthenticated) {
    if (authView === 'register') {
      return (
        <Register 
          onNavigate={() => setAuthView('login')}
          onRegister={() => setAuthView('login')}
        />
      );
    }
    return (
      <Login 
        onNavigate={() => setAuthView('register')}
        onLogin={(rememberMe) => {
          setIsAuthenticated(true);
          if (rememberMe) {
            localStorage.setItem('agrishare_authenticated', 'true');
          }
        }} 
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#050505] text-zinc-100 font-sans p-4 md:p-6 lg:p-8 selection:bg-emerald-500/30">
      <div className="max-w-[1400px] mx-auto space-y-6">

        <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-6 border-b border-white/5">
          <div className="space-y-2">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-emerald-500/10 rounded-xl border border-emerald-500/20">
                <Leaf className="w-6 h-6 text-emerald-500" />
              </div>
              <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-white">AgriShare</h1>
            </div>
            <p className="text-zinc-500 font-medium pl-1 tracking-wide flex items-center space-x-2">
              <Cpu className="w-4 h-4" />
              <span>Interface de Télémétrie</span>
            </p>
          </div>
          <div className="flex items-center space-x-4">
            <a
              href="https://wokwi.com/projects/467797481012494337"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:flex items-center px-4 py-2 rounded-full border border-emerald-500/20 bg-emerald-500/5 backdrop-blur-md text-sm font-medium hover:bg-emerald-500/10 hover:border-emerald-500/30 transition-all group text-zinc-300 hover:text-emerald-400"
            >
              <span className="mr-2">Simulation Wokwi</span>
              <ExternalLink className="w-4 h-4 opacity-70 group-hover:opacity-100 transition-opacity" />
            </a>
            <div className="hidden lg:flex items-center px-4 py-2 rounded-full border border-white/5 bg-zinc-900/50 backdrop-blur-md text-sm font-medium">
              <span className="text-zinc-400 capitalize">
                {new Date(currentTime).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              </span>
              <span className="mx-3 text-white/10">|</span>
              <span className="text-zinc-200 font-mono tracking-wider">
                {new Date(currentTime).toLocaleTimeString('fr-FR')}
              </span>
            </div>
            <div className={`flex items-center px-4 py-2 rounded-full border text-sm font-medium transition-colors duration-300 backdrop-blur-md ${getStatusStyles()}`}>
              {getStatusIcon()}
              <span className="capitalize tracking-wider">
                {status === 'connecting' ? 'Connexion en cours...' : status === 'connected' ? 'Connecté' : 'Déconnecté'}
              </span>
            </div>
            
            <button
              onClick={() => {
                setIsAuthenticated(false);
                localStorage.removeItem('agrishare_authenticated');
              }}
              className="flex items-center px-4 py-2 rounded-full border border-red-500/20 bg-red-500/10 text-red-400 text-sm font-medium hover:bg-red-500/20 hover:border-red-500/30 transition-colors"
            >
              <LogOut className="w-4 h-4 mr-2" />
              <span>Déconnexion</span>
            </button>
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

          {/* ── Row 1 : 3 sensor cards ── */}
          <ClimateCard data={sensors.dht.data} ts={sensors.dht.ts} currentTime={currentTime} />
          <SoilCard data={sensors.soil.data} ts={sensors.soil.ts} currentTime={currentTime} />
          <LdrCard  data={sensors.ldr.data}  ts={sensors.ldr.ts}  currentTime={currentTime} />

          {/* ── Row 2 : Chart (2 cols) + NPK/Water stack (1 col) ── */}
          <div className="lg:col-span-2 relative overflow-hidden bg-[#121214] border border-white/5 rounded-[2rem] p-6 lg:p-8 flex flex-col group transition-all duration-500 hover:border-white/10">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center space-x-4">
                <div className="p-3 rounded-2xl bg-indigo-500/10 text-indigo-400 ring-1 ring-white/10">
                  <Activity className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-medium tracking-wide text-zinc-100">Télémétrie en Direct</h3>
                  <p className="text-sm text-zinc-500">
                    
                      Fenêtre de 24h
                  </p>
                </div>
              </div>
              {history.length > 0 && (
                <div className="flex items-center space-x-2 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-full">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-xs font-medium text-emerald-400 uppercase tracking-wider">En direct</span>
                </div>
              )}
            </div>
            <div className="flex-1 min-h-[300px] w-full mt-4">
              {history.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={history} margin={{ top: 10, right: 10, bottom: 0, left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#27272a" />
                    <XAxis
                      dataKey="ts"
                      type="number"
                      scale="time"
                      domain={['auto', 'auto']}
                      stroke="#71717a"
                      fontSize={11}
                      tickMargin={12}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(ts) => new Date(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                    />
                    <YAxis yAxisId="left"  stroke="#f59e0b" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}°`} />
                    <YAxis yAxisId="right" orientation="right" stroke="#3b82f6" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} />
                    <Tooltip
                      contentStyle={{ backgroundColor: 'rgba(24,24,27,0.9)', backdropFilter: 'blur(12px)', borderColor: 'rgba(255,255,255,0.1)', color: '#f4f4f5', borderRadius: '16px', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.5)' }}
                      itemStyle={{ fontSize: '13px', fontWeight: 500 }}
                      labelStyle={{ color: '#a1a1aa', fontSize: '12px', marginBottom: '6px' }}
                      labelFormatter={(ts) => new Date(ts).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', paddingTop: '20px' }} />
                    <Line yAxisId="left"  type="monotone" dataKey="temperature" name="Température (°C)" stroke="#f59e0b" strokeWidth={3} dot={false} activeDot={{ r: 6, fill: '#18181b', stroke: '#f59e0b', strokeWidth: 2 }} isAnimationActive={false} />
                    <Line yAxisId="right" type="monotone" dataKey="humidity"    name="Humidité (%)"   stroke="#3b82f6" strokeWidth={3} dot={false} activeDot={{ r: 6, fill: '#18181b', stroke: '#3b82f6', strokeWidth: 2 }} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full w-full flex items-center justify-center rounded-2xl border border-dashed border-white/5 bg-zinc-900/20">
                  <div className="text-center text-zinc-500">
                    <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-zinc-600" />
                    <p className="font-mono text-sm tracking-widest uppercase">En attente de flux</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-6 lg:col-span-1">
            <NpkCard   data={sensors.npk.data}   ts={sensors.npk.ts}   currentTime={currentTime} />
          </div>

          {/* ── Row 3 : Fan + CO2 + Water ── */}
          <FanCard data={sensors.fan.data} ts={sensors.fan.ts} currentTime={currentTime} />
          <Co2Card data={sensors.co2.data} ts={sensors.co2.ts} currentTime={currentTime} />
          <WaterCard data={sensors.water.data} ts={sensors.water.ts} currentTime={currentTime} />

          {/* ── Row 4 : IA Collaborative — pleine largeur ── */}
          <div className="lg:col-span-3">
            <AiAdvisor sensors={sensors} />
          </div>

        </div>
      </div>
    </div>
  );
}
