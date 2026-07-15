import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Send, Plus, X, Trash2, Loader2, Sparkles, Clock, AlertTriangle, Users, MessageSquarePlus } from 'lucide-react';

// ---------------------------------------------------------------------------
// Configuration de l'API
// ---------------------------------------------------------------------------
const GEMINI_API_KEY = 'AIzaSyAQ2sT4_107rUNSALIUHsj2-PSs6-uGSIA'; // <-- Insérez votre clé API Google Gemini ici
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const STORAGE_KEY_REPORTS = 'agrishare_neighbor_reports';

function timeAgo(ts) {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "à l'instant";
  if (mins < 60) return `il y a ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `il y a ${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `il y a ${days}j`;
}

// ---------------------------------------------------------------------------
// Prompt builder
// ---------------------------------------------------------------------------
function buildPrompt(sensors, reports) {
  const dht = sensors.dht?.data;
  const soil = sensors.soil?.data;
  const ldr = sensors.ldr?.data;
  const npk = sensors.npk?.data;
  const water = sensors.water?.data;
  const co2 = sensors.co2?.data;

  const sensorBlock = `
DONNÉES CAPTEURS IoT EN TEMPS RÉEL :
• Température de l'air : ${dht?.temperature != null ? dht.temperature + '°C' : 'Non disponible'}
• Humidité de l'air : ${dht?.humidity != null ? dht.humidity + '%' : 'Non disponible'}
• Qualité de l'air (CO2) : ${co2?.ppm != null ? co2.ppm + ' ppm (brut : ' + co2.raw + ')' : 'Non disponible'}
• Humidité du sol : ${soil?.percent != null ? soil.percent + '% (valeur brute : ' + soil.raw + ')' : 'Non disponible'}
• Luminosité : ${ldr?.percent != null ? ldr.percent + '% (valeur brute : ' + ldr.raw + ')' : 'Non disponible'}
• Macronutriments NPK : ${npk ? 'N=' + npk.N + ' P=' + npk.P + ' K=' + npk.K + ' mg/kg' : 'Non disponible'}
• Débit d'irrigation : ${water?.flow_rate != null ? water.flow_rate + ' ' + (water.unit_flow || 'L/min') : 'Non disponible'}
• Volume total irrigué : ${water?.total_volume != null ? water.total_volume + ' ' + (water.unit_vol || 'L') : 'Non disponible'}
`.trim();

  const reportsBlock = reports.length > 0
    ? reports.map((r, i) => `${i + 1}. "${r.text}" — ${timeAgo(r.ts)}`).join('\n')
    : 'Aucun retour pour le moment.';

  return `Tu es un agronome expert IA intégré dans la plateforme AgriShare. Tu dois fournir des conseils agricoles intelligents en croisant les données capteurs IoT et les retours d'expérience des agriculteurs voisins.

${sensorBlock}

RETOURS D'EXPÉRIENCE DES AGRICULTEURS VOISINS :
${reportsBlock}

MISSION :
1. **🔍 Diagnostic croisé** : Analyse les données capteurs en les croisant avec les retours des voisins. Identifie les corrélations et les risques.
2. **⚡ Actions immédiates** : Suggestions d'actions à réaliser maintenant basées sur l'état actuel des capteurs.
3. **📅 Actions planifiées** : Actions à prévoir dans les jours/semaines à venir.
4. **⚠️ Alertes préventives** : Risques potentiels détectés en comparant les observations des voisins et tes propres données.
5. **💡 Idées collaboratives** : Suggestions de collaboration avec les voisins (partage de ressources, traitements collectifs, etc.)

RÈGLES :
- Réponds UNIQUEMENT en français.
- Utilise des émojis pertinents pour chaque section.
- Sois précis et concret : donne des valeurs seuils, des noms de produits bio, des durées.
- Si des données capteurs manquent, signale-le et donne des recommandations générales.
- Structure ta réponse avec des titres Markdown (##) pour chaque section.
- Sois concis mais complet : maximum 500 mots.`;
}

// ---------------------------------------------------------------------------
// Simple Markdown renderer
// ---------------------------------------------------------------------------
function renderMarkdown(text) {
  if (!text) return null;
  const lines = text.split('\n');
  const elements = [];
  let listItems = [];
  let listKey = 0;

  const flushList = () => {
    if (listItems.length > 0) {
      elements.push(<ul key={`list-${listKey++}`} className="ai-md-list">{listItems}</ul>);
      listItems = [];
    }
  };

  const formatInline = (str) => {
    const parts = [];
    const regex = /\*\*(.*?)\*\*/g;
    let lastIndex = 0;
    let match;
    while ((match = regex.exec(str)) !== null) {
      if (match.index > lastIndex) {
        parts.push(str.slice(lastIndex, match.index));
      }
      parts.push(<strong key={match.index} className="text-zinc-100 font-semibold">{match[1]}</strong>);
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < str.length) parts.push(str.slice(lastIndex));
    return parts.length > 0 ? parts : str;
  };

  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('## ')) {
      flushList();
      elements.push(<h2 key={`h2-${i}`} className="ai-md-h2">{formatInline(trimmed.slice(3))}</h2>);
    } else if (trimmed.startsWith('### ')) {
      flushList();
      elements.push(<h3 key={`h3-${i}`} className="ai-md-h3">{formatInline(trimmed.slice(4))}</h3>);
    } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ') || /^\d+\.\s/.test(trimmed)) {
      const content = trimmed.replace(/^[-*]\s|^\d+\.\s/, '');
      listItems.push(<li key={`li-${i}`} className="ai-md-li">{formatInline(content)}</li>);
    } else if (trimmed === '') {
      flushList();
    } else {
      flushList();
      elements.push(<p key={`p-${i}`} className="ai-md-p">{formatInline(trimmed)}</p>);
    }
  });
  flushList();
  return elements;
}

// ---------------------------------------------------------------------------
// AiAdvisor Component
// ---------------------------------------------------------------------------
export default function AiAdvisor({ sensors }) {
  const [reports, setReports] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_REPORTS);
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [newReport, setNewReport] = useState('');

  const [aiResponse, setAiResponse] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const textareaRef = useRef(null);
  const responseRef = useRef(null);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_REPORTS, JSON.stringify(reports));
  }, [reports]);

  // --- Reports ---
  const addReport = () => {
    const trimmed = newReport.trim();
    if (!trimmed) return;
    setReports(prev => [{ id: Date.now(), text: trimmed, ts: Date.now() }, ...prev]);
    setNewReport('');
    if (textareaRef.current) textareaRef.current.focus();
  };

  const removeReport = (id) => {
    setReports(prev => prev.filter(r => r.id !== id));
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      addReport();
    }
  };

  // --- Gemini API ---
  const analyzeWithAI = useCallback(async () => {
    if (!GEMINI_API_KEY || GEMINI_API_KEY === 'VOTRE_CLE_API_ICI') {
      setError("Veuillez configurer la clé API GEMINI_API_KEY dans le code source (AiAdvisor.jsx).");
      return;
    }
    
    setIsLoading(true);
    setError('');
    setAiResponse('');

    try {
      const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: buildPrompt(sensors, reports) }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 2500 },
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        if (response.status === 429) throw new Error('Limite de requêtes atteinte. Réessayez dans quelques secondes.');
        if (response.status === 400 || response.status === 403) throw new Error('Clé API invalide ou expirée.');
        throw new Error(errData?.error?.message || `Erreur API (${response.status})`);
      }

      const data = await response.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error("Aucune réponse reçue de l'IA.");
      setAiResponse(text);
      setTimeout(() => responseRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 300);
    } catch (err) {
      setError(err.message || "Erreur lors de l'appel à l'IA.");
    } finally {
      setIsLoading(false);
    }
  }, [sensors, reports]);

  // --- Render ---
  return (
    <div className="relative overflow-hidden bg-[#121214] border border-white/5 rounded-[2rem] transition-all duration-500 hover:border-violet-500/10">

      <div className="absolute -top-40 -right-40 w-[500px] h-[500px] bg-gradient-radial from-violet-500/[0.04] to-transparent rounded-full pointer-events-none" />

      <div className="relative z-10 p-6 lg:p-8">

        {/* ---- Retours des voisins ---- */}
        <div className="mb-6">
          <div className="flex items-center space-x-2 mb-4">
            <Users className="w-4 h-4 text-violet-400" />
            <span className="text-sm font-medium text-zinc-300">Retours des voisins</span>
            {reports.length > 0 && (
              <span className="text-[10px] bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-full font-mono">{reports.length}</span>
            )}
          </div>

          {/* Input */}
          <div className="flex gap-2 mb-3">
            <div className="flex-1 relative">
              <textarea
                ref={textareaRef}
                value={newReport}
                onChange={e => setNewReport(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder='Ex: "Mon voisin Ahmed a repéré du mildiou sur ses tomates à 2 km..."'
                rows={2}
                className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-violet-500/30 focus:ring-1 focus:ring-violet-500/20 transition-all resize-none"
              />
              <MessageSquarePlus className="absolute right-3 top-3 w-4 h-4 text-zinc-700 pointer-events-none" />
            </div>
            <button
              onClick={addReport}
              disabled={!newReport.trim()}
              className="self-end p-3 rounded-xl bg-violet-500/15 hover:bg-violet-500/25 text-violet-400 transition-all border border-violet-500/20 hover:border-violet-500/30 disabled:opacity-30 disabled:cursor-not-allowed"
              title="Ajouter"
            >
              <Plus className="w-5 h-5" />
            </button>
          </div>

          {/* Reports list */}
          {reports.length > 0 && (
            <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1 ai-scrollbar">
              {reports.map(report => (
                <div
                  key={report.id}
                  className="flex items-start gap-3 p-3 rounded-xl bg-zinc-900/50 border border-white/[0.03] group/report hover:border-white/5 transition-all ai-fade-in"
                >
                  <div className="w-1.5 h-1.5 rounded-full bg-violet-400/60 mt-2 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-zinc-300 leading-relaxed">{report.text}</p>
                    <p className="text-[11px] text-zinc-600 mt-1 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {timeAgo(report.ts)}
                    </p>
                  </div>
                  <button
                    onClick={() => removeReport(report.id)}
                    className="p-1.5 rounded-lg text-zinc-600 hover:text-rose-400 hover:bg-rose-500/10 opacity-0 group-hover/report:opacity-100 transition-all flex-shrink-0"
                    title="Supprimer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ---- Analyze Button ---- */}
        <button
          onClick={analyzeWithAI}
          disabled={isLoading}
          className="w-full relative overflow-hidden group/btn py-3.5 px-6 rounded-2xl font-medium text-sm transition-all duration-300 border disabled:opacity-40 disabled:cursor-not-allowed
            bg-gradient-to-r from-violet-600/20 to-indigo-600/20 border-violet-500/20 text-violet-200 
            hover:from-violet-600/30 hover:to-indigo-600/30 hover:border-violet-500/30 hover:shadow-[0_0_30px_rgba(139,92,246,0.15)]
            active:scale-[0.99]"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-violet-500/0 via-violet-500/5 to-violet-500/0 translate-x-[-100%] group-hover/btn:translate-x-[100%] transition-transform duration-1000" />
          <div className="relative flex items-center justify-center gap-2">
            {isLoading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Analyse en cours...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-5 h-5" />
                <span>Suggestions de l'IA</span>
              </>
            )}
          </div>
        </button>

        {/* ---- Error ---- */}
        {error && (
          <div className="mt-4 p-4 rounded-xl bg-rose-500/[0.07] border border-rose-500/15 flex items-start gap-3 ai-fade-in">
            <AlertTriangle className="w-5 h-5 text-rose-400 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-rose-400/70">{error}</p>
          </div>
        )}

        {/* ---- AI Response ---- */}
        {aiResponse && (
          <div ref={responseRef} className="mt-6 ai-fade-in">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center">
                <Sparkles className="w-3.5 h-3.5 text-white" />
              </div>
              <span className="text-sm font-medium text-zinc-300">Suggestions</span>
              <div className="flex-1 h-px bg-gradient-to-r from-violet-500/20 to-transparent" />
            </div>
            <div className="p-5 rounded-2xl bg-zinc-900/30 border border-white/[0.03] ai-response-content">
              {renderMarkdown(aiResponse)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
