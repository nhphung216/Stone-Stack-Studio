import React, { useEffect, useRef, useState } from 'react';
import Matter, { Engine, Render, Runner, World, Bodies, Body, Composite, Events } from 'matter-js';
import { Play, RotateCcw, AlertTriangle, ShieldCheck, Terminal, HelpCircle, AlertCircle, Smartphone } from 'lucide-react';
import { GameSettings, SimLog } from '../types';

interface GameSimProps {
  settings: GameSettings;
  onSettingsChange: (newSettings: GameSettings) => void;
  logs: SimLog[];
  addLog: (type: 'info' | 'success' | 'warn' | 'error', message: string) => void;
  clearLogs: () => void;
}

export function UnityGameSim({ settings, onSettingsChange, logs, addLog, clearLogs }: GameSimProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // Matter.js Refs
  const engineRef = useRef<Engine | null>(null);
  const runnerRef = useRef<Runner | null>(null);
  const currentReleaseRef = useRef<Body | null>(null); // Stone currently dropped, waiting to hit other items

  // Game state
  const [score, setScore] = useState(0);
  const [gameState, setGameState] = useState<'IDLE' | 'DROP_PENDING' | 'MONITORING' | 'STABILIZING' | 'GAME_OVER'>('IDLE');
  const [stabilityProgress, setStabilityProgress] = useState(0); // 0 to 1 scaling
  const [activeStoneCount, setActiveStoneCount] = useState(0);
  
  // Spawn aiming state
  const [aimX, setAimX] = useState(200); // relative to container width
  const isInputLockedRef = useRef(false);

  // Constants
  const CANVAS_WIDTH = 380;
  const CANVAS_HEIGHT = 500;
  const PLATFORM_Y = 440;
  const PLATFORM_WIDTH = 160;
  const PLATFORM_HEIGHT = 20;

  useEffect(() => {
    // 1. Initialize Matter Engine & Render
    const engine = Engine.create({
      gravity: { y: settings.gravityY, x: 0 }
    });
    engineRef.current = engine;

    const canvas = canvasRef.current;
    if (!canvas) return;

    // Custom aesthetic rendering
    const render = Render.create({
      canvas: canvas,
      engine: engine,
      options: {
        width: CANVAS_WIDTH,
        height: CANVAS_HEIGHT,
        wireframes: false,
        background: '#EAE5DB', // Natural warm background
        showAngleIndicator: false,
        showVelocity: false
      }
    });

    // Draw static platform at the bottom
    const platform = Bodies.rectangle(CANVAS_WIDTH / 2, PLATFORM_Y, PLATFORM_WIDTH, PLATFORM_HEIGHT, {
      isStatic: true,
      friction: settings.friction,
      render: {
        fillStyle: '#5D6D4E', // Sage green platform
        strokeStyle: '#4A553E',
        lineWidth: 2
      },
      label: 'ground'
    });

    Composite.add(engine.world, [platform]);

    // Start physical loop
    Render.run(render);
    const runner = Runner.create();
    Runner.run(runner, engine);
    runnerRef.current = runner;

    addLog('info', 'Unity Physics2D Engine Booted. Rigidbody2D and BoxCollider2D arrays initialized.');
    addLog('info', 'Platform added: BoxCollider2D (Static), 160px wide.');

    // 2. Collision Listeners
    Events.on(engine, 'collisionStart', (event) => {
      event.pairs.forEach((pair) => {
        const labels = [pair.bodyA.label, pair.bodyB.label];
        const isStoneComponent = labels.includes('stone');
        
        if (isStoneComponent) {
          // If the stone has just collided for the first time, report to GameManager
          const stoneBody = pair.bodyA.label === 'stone' ? pair.bodyA : pair.bodyB;
          
          if (stoneBody.plugin && !stoneBody.plugin.hasCollided) {
            stoneBody.plugin.hasCollided = true;
            addLog('success', `[CollisionDetector] Stone #${stoneBody.id} made solid contact with stack!`);
            
            setGameState('STABILIZING');
          }
        }
      });
    });

    // 3. Main stability tick tracker
    const stabilityCheckInterval = setInterval(() => {
      if (engine.world.bodies.length <= 1) return; // Only ground in world

      const stonesInWorld = engine.world.bodies.filter(b => b.label === 'stone');
      setActiveStoneCount(stonesInWorld.length);

      // Check if any stone has fallen off boundaries
      let hasStoneFallen = false;
      stonesInWorld.forEach(stone => {
        if (stone.position.y > settings.deathYCoordinate) {
          hasStoneFallen = true;
        }
      });

      if (hasStoneFallen) {
        triggerGameOver('A stone tumbled off the platform!');
        return;
      }

      // If active drop has landed, monitor if the entire tower is quiet
      const areStonesFalling = stonesInWorld.some(stone => {
        const velSq = stone.velocity.x * stone.velocity.x + stone.velocity.y * stone.velocity.y;
        const speed = Math.sqrt(velSq);
        const angularSpd = Math.abs(stone.angularSpeed);
        
        // Is it moving above our strict physical stability limit?
        return speed > settings.velocityThreshold || angularSpd > (settings.velocityThreshold * 2);
      });

      if (stonesInWorld.length > 0) {
        if (!areStonesFalling) {
          setGameState(prev => {
            if (prev === 'STABILIZING' || prev === 'MONITORING') {
              // Increase stability countdown progress
              setStabilityProgress(curr => {
                const step = 0.1 / settings.requiredStableDuration; // checking every 100ms
                const nextVal = curr + step;
                if (nextVal >= 1.0) {
                  // Confirmed stable! Turn complete
                  addLog('success', `[GameManager] Stability verified for 2.0s! Stone Stacked. Score: ${stonesInWorld.length}`);
                  isInputLockedRef.current = false;
                  setScore(stonesInWorld.length);
                  return 0;
                }
                return nextVal;
              });
              return 'STABILIZING';
            }
            return prev;
          });
        } else {
          // Reset stability tracker if any stone starts shifting/moving
          setStabilityProgress(curr => {
            if (curr > 0) {
              addLog('warn', '[GameManager] Resettled Timer: Tower swaying detected, resetting 2.0s stability window.');
            }
            return 0;
          });
          setGameState('MONITORING');
        }
      }
    }, 100);

    return () => {
      clearInterval(stabilityCheckInterval);
      Render.stop(render);
      Runner.stop(runner);
      Engine.clear(engine);
    };
  }, [settings.gravityY, settings.friction, settings.restitution, settings.requiredStableDuration, settings.velocityThreshold]);

  // Adjust gravity dynamically
  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.gravity.y = settings.gravityY;
    }
  }, [settings.gravityY]);

  const STONE_COLORS = ['#8B8C89', '#A6A29A', '#7D7D7D', '#B8B2A7', '#969696'];

  const dropStone = () => {
    if (gameState === 'GAME_OVER' || isInputLockedRef.current) return;

    if (!engineRef.current) return;

    isInputLockedRef.current = true;
    setGameState('MONITORING');
    setStabilityProgress(0);

    const x = aimX;
    const y = 60; // Release height offset

    const randomColor = STONE_COLORS[Math.floor(Math.random() * STONE_COLORS.length)];

    // Create block mimicking Rigidbody2D and BoxCollider2D
    const stone = Bodies.rectangle(x, y, settings.stoneWidth, settings.stoneHeight, {
      friction: settings.friction,
      restitution: settings.restitution,
      density: settings.mass * 0.001,
      plugin: {
        hasCollided: false
      },
      render: {
        fillStyle: randomColor, // Natural organic stone colors from theme palette
        strokeStyle: '#6C665F',
        lineWidth: 2
      },
      label: 'stone'
    });

    Composite.add(engineRef.current.world, [stone]);
    currentReleaseRef.current = stone;

    addLog('info', `[Input] Stone #${stone.id} dropped at X: ${x.toFixed(0)} (${randomColor}) with BoxCollider2D, Mass: ${settings.mass.toFixed(1)}kg.`);
  };

  const triggerGameOver = (reason: string) => {
    setGameState('GAME_OVER');
    addLog('error', `[GameManager] GAME OVER: ${reason} Tap to retry.`);
  };

  const restartGame = () => {
    if (!engineRef.current) return;

    // Clear world bodies except static platform
    const bodies = [...engineRef.current.world.bodies];
    bodies.forEach(body => {
      if (body.label === 'stone') {
        Composite.remove(engineRef.current!.world, body);
      }
    });

    setScore(0);
    setGameState('IDLE');
    setStabilityProgress(0);
    isInputLockedRef.current = false;
    clearLogs();
    
    addLog('success', 'Game reloaded. Reset score to 0. Instantiated initial state.');
  };

  // Touch & Mouse AIM calculation
  const handlePointerMove = (e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
    if (gameState === 'GAME_OVER' || isInputLockedRef.current) return;
    const boundingBox = containerRef.current?.getBoundingClientRect();
    if (!boundingBox) return;

    let clientX = 0;
    if ('touches' in e) {
      if (e.touches.length > 0) {
        clientX = e.touches[0].clientX;
      } else {
        return;
      }
    } else {
      clientX = e.clientX;
    }

    const mouseXRelative = clientX - boundingBox.left;
    const clampOffset = settings.stoneWidth / 2 + 10;
    const constrainedX = Math.max(clampOffset, Math.min(CANVAS_WIDTH - clampOffset, mouseXRelative));
    
    setAimX(constrainedX);
  };

  const handlePointerDown = (e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
    if (gameState === 'GAME_OVER') {
      restartGame();
      return;
    }
    
    // Calculate final move position and trigger stone release
    handlePointerMove(e);
    dropStone();
  };

  return (
    <div className="flex flex-col gap-5 h-full">
      
      {/* Dynamic Settings Control Widget - Sleek Compact Slider HUD */}
      <div className="bg-[#FCFBF9] border border-[#E5E1D8] text-[#4A4540] rounded-xl p-4 shadow-sm font-sans">
        <h3 className="text-[#2D2D2D] font-serif text-sm font-semibold mb-3 flex items-center justify-between border-b border-[#E5E1D8]/50 pb-2">
          <span>Rigidbody2D & PhysicsMaterial2D Variables</span>
          <span className="text-[#5D6D4E] font-mono text-[10px] uppercase font-semibold">Real-time Injector</span>
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 text-xs text-[#4A4540]">
          
          {/* Gravitational force */}
          <div className="bg-[#FDFCFB] p-2.5 rounded-lg border border-[#EBE8E0] flex flex-col justify-between shadow-xs">
            <div className="flex justify-between items-center mb-1 pb-1">
              <span className="text-[#7C756E]">Gravity Scale (rb.gravityScale)</span>
              <span className="font-mono text-[#5D6D4E] font-bold">{settings.gravityY.toFixed(1)}x</span>
            </div>
            <input 
              type="range" 
              min="0.5" 
              max="2.5" 
              step="0.1"
              value={settings.gravityY} 
              onChange={(e) => onSettingsChange({ ...settings, gravityY: parseFloat(e.target.value) })}
              className="w-full accent-[#5D6D4E] h-1.5 bg-[#EBE8E0] rounded-lg cursor-pointer"
            />
          </div>

          {/* Mass */}
          <div className="bg-[#FDFCFB] p-2.5 rounded-lg border border-[#EBE8E0] flex flex-col justify-between shadow-xs">
            <div className="flex justify-between items-center mb-1 pb-1">
              <span className="text-[#7C756E]">Rigidbody Mass (rb.mass)</span>
              <span className="font-mono text-[#5D6D4E] font-bold">{settings.mass.toFixed(1)} kg</span>
            </div>
            <input 
              type="range" 
              min="0.5" 
              max="5.0" 
              step="0.5"
              value={settings.mass} 
              onChange={(e) => onSettingsChange({ ...settings, mass: parseFloat(e.target.value) })}
              className="w-full accent-[#5D6D4E] h-1.5 bg-[#EBE8E0] rounded-lg cursor-pointer"
            />
          </div>

          {/* Friction coefficient */}
          <div className="bg-[#FDFCFB] p-2.5 rounded-lg border border-[#EBE8E0] flex flex-col justify-between shadow-xs">
            <div className="flex justify-between items-center mb-1 pb-1">
              <span className="text-[#7C756E]">Friction (Math.friction)</span>
              <span className="font-mono text-[#5D6D4E] font-bold">{settings.friction.toFixed(2)}</span>
            </div>
            <input 
              type="range" 
              min="0.05" 
              max="1.0" 
              step="0.05"
              value={settings.friction} 
              onChange={(e) => onSettingsChange({ ...settings, friction: parseFloat(e.target.value) })}
              className="w-full accent-[#5D6D4E] h-1.5 bg-[#EBE8E0] rounded-lg cursor-pointer"
            />
          </div>

          {/* Elastic limits */}
          <div className="bg-[#FDFCFB] p-2.5 rounded-lg border border-[#EBE8E0] flex flex-col justify-between shadow-xs">
            <div className="flex justify-between items-center mb-1 pb-1">
              <span className="text-[#7C756E]">Restitution / Bounce</span>
              <span className="font-mono text-[#5D6D4E] font-bold">{settings.restitution.toFixed(2)}</span>
            </div>
            <input 
              type="range" 
              min="0.0" 
              max="0.8" 
              step="0.05"
              value={settings.restitution} 
              onChange={(e) => onSettingsChange({ ...settings, restitution: parseFloat(e.target.value) })}
              className="w-full accent-[#5D6D4E] h-1.5 bg-[#EBE8E0] rounded-lg cursor-pointer"
            />
          </div>

          {/* Stone dimensions */}
          <div className="bg-[#FDFCFB] p-2.5 rounded-lg border border-[#EBE8E0] flex flex-col justify-between shadow-xs">
            <div className="flex justify-between items-center mb-1 pb-1">
              <span className="text-[#7C756E]">Box Dimensions (WxH)</span>
              <span className="font-mono text-[#5D6D4E] font-bold">{settings.stoneWidth}x{settings.stoneHeight} px</span>
            </div>
            <div className="flex gap-2">
              <button 
                onClick={() => onSettingsChange({ ...settings, stoneWidth: Math.max(30, settings.stoneWidth - 10) })}
                className="flex-1 bg-[#F5F2ED] hover:bg-[#EBE8E0] py-1 border border-[#E5E1D8] rounded cursor-pointer text-center text-[10px] text-[#4A4540] font-semibold transition-all"
              >
                Narrower
              </button>
              <button 
                onClick={() => onSettingsChange({ ...settings, stoneWidth: Math.min(80, settings.stoneWidth + 10) })}
                className="flex-1 bg-[#F5F2ED] hover:bg-[#EBE8E0] py-1 border border-[#E5E1D8] rounded cursor-pointer text-center text-[10px] text-[#4A4540] font-semibold transition-all"
              >
                Wider
              </button>
            </div>
          </div>

          {/* Time window */}
          <div className="bg-[#FDFCFB] p-2.5 rounded-lg border border-[#EBE8E0] flex flex-col justify-between shadow-xs">
            <div className="flex justify-between items-center mb-1 pb-1">
              <span className="text-[#7C756E]">Stability Limit (sec)</span>
              <span className="font-mono text-[#5D6D4E] font-bold">{settings.requiredStableDuration.toFixed(1)}s</span>
            </div>
            <input 
              type="range" 
              min="1.0" 
              max="4.0" 
              step="0.5"
              value={settings.requiredStableDuration} 
              onChange={(e) => onSettingsChange({ ...settings, requiredStableDuration: parseFloat(e.target.value) })}
              className="w-full accent-[#5D6D4E] h-1.5 bg-[#EBE8E0] rounded-lg cursor-pointer"
            />
          </div>

        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 flex-1 min-h-[500px]">
        {/* Interactive canvas centered container inside mock smartphone frame */}
        <div className="lg:col-span-7 flex justify-center items-center">
          <div className="relative bg-[#FAF9F6] border-4 border-[#D5D0C3] rounded-[2.5rem] p-3 shadow-lg select-none max-w-[420px] w-full border-b-[10px]">
            {/* Top Ear speaker capsule mock */}
            <div className="absolute top-2.5 left-1/2 -translate-x-1/2 w-20 h-4 bg-[#EAE5DB] rounded-full flex justify-center items-center z-20">
              <span className="w-10 h-1 bg-[#D5D0C3] rounded-full inline-block"></span>
            </div>

            {/* Simulated game screen viewport */}
            <div 
              ref={containerRef}
              onMouseMove={handlePointerMove}
              onTouchMove={handlePointerMove}
              onMouseDown={handlePointerDown}
              onTouchStart={handlePointerDown}
              className="relative rounded-[2rem] overflow-hidden cursor-crosshair bg-[#EAE5DB] border border-[#BFB9AB]"
              style={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT }}
            >
              {/* Actual Game Canvas */}
              <canvas 
                ref={canvasRef} 
                width={CANVAS_WIDTH} 
                height={CANVAS_HEIGHT}
                className="block"
              />

              {/* Laser Drop Guide Projection */}
              {!isInputLockedRef.current && gameState !== 'GAME_OVER' && (
                <>
                  <div 
                    className="absolute top-[45px] w-2.5 h-2.5 bg-[#5D6D4E] rounded-full -translate-x-1/2 shadow-lg shadow-[#5D6D4E]/50"
                    style={{ left: aimX }}
                  />
                  {settings.aimAssist && (
                    <div 
                      className="absolute top-[52px] border-l border-dashed border-[#5D6D4E]/30 w-px h-[390px] -translate-x-1/2 pointer-events-none"
                      style={{ left: aimX }}
                    />
                  )}
                </>
              )}

              {/* Game state banners HUD inside viewport overlay */}
              <div className="absolute top-6 left-4 right-4 pointer-events-none flex flex-col gap-2 font-sans z-10">
                <div className="flex justify-between items-center bg-[#FCFBF9]/95 text-[#4A4540] backdrop-blur px-3 py-1.5 rounded-full border border-[#E5E1D8] shadow-sm">
                  <div className="text-[10px] text-[#7C756E] font-mono uppercase tracking-wide">TOWER SCORE</div>
                  <div className="text-sm font-bold font-serif text-[#2D2D2D]">{score} stones</div>
                </div>

                {/* Live Real-time status badge */}
                <div className="flex justify-between items-center bg-[#FCFBF9]/95 text-[#4A4540] backdrop-blur px-3 py-1.5 rounded-full border border-[#E5E1D8] shadow-sm">
                  <span className="text-[10px] text-[#7C756E] font-mono uppercase tracking-wide">STATE STATUS</span>
                  <span className={`text-[11px] font-bold tracking-wider ${
                    gameState === 'GAME_OVER' ? 'text-red-800' :
                    gameState === 'STABILIZING' ? 'text-[#7D8F69] animate-pulse' :
                    gameState === 'MONITORING' ? 'text-stone-600' :
                    'text-[#5D6D4E]'
                  }`}>
                    {gameState === 'GAME_OVER' ? 'UNSTABLE_DEATH' :
                     gameState === 'STABILIZING' ? 'MONITORING_LOCK' :
                     gameState === 'MONITORING' ? 'COLLIDERS_ACTIVE' :
                     'READY_TO_DROP'}
                  </span>
                </div>
              </div>

              {/* Dynamic countdown visual overlay */}
              {gameState === 'STABILIZING' && (
                <div className="absolute bottom-20 left-1/2 -translate-x-1/2 bg-[#7D8F69]/90 text-white backdrop-blur font-sans font-bold text-xs tracking-wider px-3.5 py-1.5 rounded-full pointer-events-none border border-[#5D6D4E] flex items-center gap-2 shadow-lg">
                  <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>STABILIZING TOWER: {Math.min(100, Math.floor(stabilityProgress * 100))}%</span>
                </div>
              )}

              {/* Direct Tap Instructions Overlay */}
              {gameState === 'IDLE' && (
                <div className="absolute inset-0 bg-[#F5F2ED]/70 backdrop-blur-xs flex flex-col justify-end items-center pb-24 text-center p-6 text-[#4A4540] pointer-events-none font-sans">
                  <Smartphone className="w-12 h-12 text-[#5D6D4E] mb-2 animate-bounce" />
                  <h4 className="font-bold text-base font-serif text-[#2D2D2D] mb-1">Interactive Sandbox</h4>
                  <p className="text-xs text-[#7C756E] max-w-xs px-2 leading-relaxed">
                    Tap or hover anywhere on the emulator screen above to position the landing spawner, then click to release a stone.
                  </p>
                </div>
              )}

              {/* GameOver Screen Visual Banner Overlay */}
              {gameState === 'GAME_OVER' && (
                <div className="absolute inset-0 bg-[#F5F2ED]/95 backdrop-blur-md flex flex-col justify-center items-center text-center p-6 text-[#4A4540] font-sans">
                  <AlertTriangle className="w-14 h-14 text-rose-800 mb-2 animate-pulse" />
                  <h3 className="font-bold text-xl font-serif tracking-wide uppercase text-red-900">TOWER TUMBLED</h3>
                  <p className="text-xs text-[#7C756E] mt-1 mb-6 max-w-[240px]">
                    Unity Rigidbody2D threshold exceeded/timer reset or fell off platform bounds.
                  </p>
                  
                  <button 
                    onClick={(e) => {
                      e.stopPropagation(); // Avoid triggering drop immediately on overlap
                      restartGame();
                    }}
                    className="flex items-center gap-2 bg-[#5D6D4E] hover:bg-[#505D42] border border-[#4A553E] transition-all font-semibold active:scale-95 text-white py-2 px-5 rounded-full shadow-md text-xs cursor-pointer"
                  >
                    <RotateCcw className="w-4 h-4" />
                    <span>Instant Restart Game</span>
                  </button>
                  
                  <span className="text-[10px] text-[#7C756E] opacity-80 mt-3 font-mono">
                    or tap screen bounds to revive instantly
                  </span>
                </div>
              )}
            </div>
            
            {/* Soft subtle mock physical Home button indicator */}
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-28 h-1 bg-[#D5D0C3] rounded-full"></div>
          </div>
        </div>

        {/* Developer Log stream mimicking physical Unity Editor Log console */}
        <div className="lg:col-span-5 flex flex-col bg-[#FCFBF9] border border-[#E5E1D8] shadow-sm rounded-xl overflow-hidden h-[500px]">
          <div className="bg-[#FDFCFB] px-4 py-3 border-b border-[#E5E1D8] flex justify-between items-center shrink-0">
            <span className="text-xs font-semibold text-[#4A4540] flex items-center gap-1.5 font-mono">
              <Terminal className="w-4 h-4 text-[#5D6D4E]" />
              <span>Unity Console Logs (Simulator)</span>
            </span>
            <button 
              onClick={restartGame}
              className="text-[11px] text-[#4A4540] bg-[#F5F2ED] hover:bg-[#EBE8E0] transition px-2.5 py-1 rounded border border-[#E5E1D8] font-mono flex items-center gap-1 cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset Scene</span>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-3 font-mono text-[11px] space-y-2 select-text scroll-smooth">
            {logs.length === 0 ? (
              <div className="text-[#9D968E] text-center py-12 italic">
                Logs will stream here as rigidbodies collide and stabilize...
              </div>
            ) : (
              logs.map((log) => (
                <div 
                  key={log.id} 
                  className={`p-2 rounded border leading-relaxed flex gap-2 items-start ${
                    log.type === 'success' ? 'bg-[#EDF2E8] border-[#D1DFCA] text-[#3D5230]' :
                    log.type === 'warn' ? 'bg-[#FCF5E2] border-[#EAD09D] text-[#695221]' :
                    log.type === 'error' ? 'bg-[#FDF2F2] border-[#F5C2C2] text-[#852C2C]' :
                    'bg-[#FBFBFA] border-[#EBE8E0] text-[#635F5A]'
                  }`}
                >
                  <span className="text-[#9D968E] shrink-0 select-none">[{log.timestamp}]</span>
                  <div className="flex-1">
                    <span className="font-semibold">{
                      log.type === 'success' ? '✔ [SUCCESS] ' :
                      log.type === 'warn' ? '⚠ [WARNING] ' :
                      log.type === 'error' ? '✖ [ERROR] ' :
                      'ℹ [SYSTEM] '
                    }</span>
                    <span>{log.message}</span>
                  </div>
                </div>
              ))
            )}
          </div>
          
          <div className="bg-[#FDFCFB] p-2.5 border-t border-[#E5E1D8] text-[10px] text-[#7C756E] font-mono text-center shrink-0">
            Matches standard MonoBehaviour Debug logs. Total active stones in stack: {activeStoneCount}
          </div>
        </div>
      </div>
    </div>
  );
}
