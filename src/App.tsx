import React, { useState, useCallback } from 'react';
import { Settings, Code, Sparkles, Cpu, Layers, HelpCircle, Laptop, Wrench, Smartphone, RefreshCw, BookOpen } from 'lucide-react';
import { GameSettings, SimLog } from './types';
import { UnityGameSim } from './components/UnityGameSim';
import { UnityCodeViewer } from './components/UnityCodeViewer';

export default function App() {
  // Initialize default physical variables
  const [settings, setSettings] = useState<GameSettings>({
    requiredStableDuration: 2.0,
    velocityThreshold: 0.12,
    deathYCoordinate: 510, // fell below 500px canvas height
    gravityY: 1.2,
    stoneWidth: 60,
    stoneHeight: 32,
    friction: 0.55,
    restitution: 0.12,
    mass: 2.0,
    aimAssist: true
  });

  const [activeWorkspace, setActiveWorkspace] = useState<'SIMULATOR' | 'DOCS'>('SIMULATOR');

  // Logs state representing standard Unity MonoBehaviour debug outputs
  const [logs, setLogs] = useState<SimLog[]>([]);

  const addLog = useCallback((type: 'info' | 'success' | 'warn' | 'error', message: string) => {
    const timestamp = new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const newLog: SimLog = {
      id: Math.random().toString(36).substring(4, 9),
      timestamp,
      type,
      message
    };
    
    setLogs((prev) => [newLog, ...prev].slice(0, 50)); // limit log stack count
  }, []);

  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  const handleSettingsChange = useCallback((newSettings: GameSettings) => {
    setSettings(newSettings);
  }, []);

  return (
    <div className="min-h-screen bg-[#F5F2ED] text-[#4A4540] flex flex-col font-sans selection:bg-[#5D6D4E] selection:text-white">
      {/* Top Professional Tool Banner */}
      <header className="bg-[#FCFBF9] border-b border-[#E5E1D8] shrink-0 sticky top-0 z-30 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          
          {/* Logo Heading block */}
          <div>
            <div className="flex items-center gap-2.5">
              <div className="bg-gradient-to-tr from-[#5D6D4E] to-[#7D8F69] p-2 rounded-lg shadow-xs">
                <Layers className="w-5.5 h-5.5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold font-serif tracking-tight text-[#2D2D2D] flex items-center gap-2">
                  <span>Unity 2D Stone Stack Studio</span>
                  <span className="text-[10px] uppercase font-mono bg-[#EDF2E8] text-[#3D5230] px-2 py-0.5 rounded border border-[#D1DFCA]">
                    Mobile Optimized
                  </span>
                </h1>
                <p className="text-xs text-[#7C756E] mt-0.5">
                  Interactive Rigidbody2D sandbox, physical variables exporter & dynamic Unity C# workspace
                </p>
              </div>
            </div>
          </div>

          {/* Quick HUD Toggles */}
          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
            <button
              onClick={() => handleSettingsChange({ ...settings, aimAssist: !settings.aimAssist })}
              className={`flex-1 md:flex-none text-xs font-semibold px-3.5 py-1.5 rounded-lg border transition cursor-pointer flex items-center justify-center gap-2 ${
                settings.aimAssist
                  ? 'bg-[#EDF2E8] hover:bg-[#E1ECD8] text-[#3D5230] border-[#D1DFCA]'
                  : 'bg-[#F5F2ED] hover:bg-[#EBE8E0] text-[#7C756E] border-[#E5E1D8]'
              }`}
            >
              <Sparkles className="w-4 h-4 text-[#5D6D4E]" />
              <span>Aim Projection: {settings.aimAssist ? "On" : "Off"}</span>
            </button>

            <button
              onClick={() => {
                setSettings({
                  requiredStableDuration: 2.0,
                  velocityThreshold: 0.12,
                  deathYCoordinate: 510,
                  gravityY: 1.2,
                  stoneWidth: 60,
                  stoneHeight: 32,
                  friction: 0.55,
                  restitution: 0.12,
                  mass: 2.0,
                  aimAssist: true
                });
                addLog('info', 'Reset all physics variables to factory Unity defaults.');
              }}
              className="text-xs bg-[#F5F2ED] hover:bg-[#EBE8E0] font-semibold px-3.5 py-1.5 rounded-lg text-[#4A4540] transition shrink-0 border border-[#E5E1D8] cursor-pointer flex items-center justify-center gap-2 shadow-xs"
              title="Reset configuration defaults"
            >
              <RefreshCw className="w-3.5 h-3.5 text-[#5D6D4E]" />
              <span>Reset Defaults</span>
            </button>
          </div>

        </div>
      </header>

      {/* Main Workspace Frame container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        
        {/* Left Side: Interactive Physics Sandbox Simulation */}
        <section className="xl:col-span-6 flex flex-col gap-6">
          <div className="bg-[#FCFBF9] border border-[#E5E1D8] rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-4 border-b border-[#E5E1D8]/80 pb-3">
              <div>
                <h2 className="text-sm font-semibold font-serif text-[#2D2D2D] flex items-center gap-1.5">
                  <Smartphone className="w-4.5 h-4.5 text-[#5D6D4E]" />
                  <span>Interactive Engine Sandbox</span>
                </h2>
                <p className="text-[11px] text-[#7C756E] mt-0.5">
                  Simulate tap-to-drop physics, monitor stability parameters & test bounds in real-time
                </p>
              </div>
            </div>

            <UnityGameSim 
              settings={settings}
              onSettingsChange={handleSettingsChange}
              logs={logs}
              addLog={addLog}
              clearLogs={clearLogs}
            />
          </div>
        </section>

        {/* Right Side: Virtual C# IDE exporter and setup manual */}
        <section className="xl:col-span-6 flex flex-col gap-6 h-full xl:sticky xl:top-[90px]">
          <div className="flex flex-col h-full">
            <div className="flex items-center justify-between mb-4 border-b border-[#E5E1D8]/80 pb-3">
              <div>
                <h2 className="text-sm font-semibold font-serif text-[#2D2D2D] flex items-center gap-1.5">
                  <Code className="w-4.5 h-4.5 text-[#5D6D4E]" />
                  <span>Unity MonoBehavior Exporter</span>
                </h2>
                <p className="text-[11px] text-[#7C756E] mt-0.5">
                  C# Scripts bundle. Changes on the left update these variables dynamically!
                </p>
              </div>
            </div>

            <UnityCodeViewer settings={settings} />
          </div>
        </section>

      </main>

      {/* Bottom Professional Footer credits, humble & optimized */}
      <footer className="bg-[#FCFBF9] px-6 py-4 border-t border-[#E5E1D8] text-[#7C756E] text-xs mt-12 shrink-0">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-4">
          <div>
            <span>Designed for modular mobile optimization using </span>
            <code className="text-[#2D2D2D] bg-[#F5F2ED] px-1.5 py-0.5 border border-[#E5E1D8] rounded font-mono">Rigidbody2D</code>
            <span> and </span>
            <code className="text-[#2D2D2D] bg-[#F5F2ED] px-1.5 py-0.5 border border-[#E5E1D8] rounded font-mono">BoxCollider2D</code>
          </div>
          <div className="flex items-center gap-3 text-[11px]">
            <span className="flex items-center gap-1">
              <Cpu className="w-3.5 h-3.5 text-[#5D6D4E]" />
              <span>Physics2D (Box2D Engine)</span>
            </span>
            <span className="text-[#E2DDD3]">|</span>
            <span>Unity LTS Compatible</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
