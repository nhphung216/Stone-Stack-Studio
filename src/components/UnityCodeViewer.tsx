import React, { useState } from 'react';
import { Copy, Check, FileCode, Shield, Layers, HelpCircle, Cpu, Sliders } from 'lucide-react';
import { GameSettings, UnityScriptTab } from '../types';

interface CodeViewerProps {
  settings: GameSettings;
}

export function UnityCodeViewer({ settings }: CodeViewerProps) {
  const [activeTab, setActiveTab] = useState<UnityScriptTab>('GameManager');
  const [copied, setCopied] = useState<string | null>(null);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const scripts = {
    GameManager: `using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.UI;

/// <summary>
/// GameManager monitors the overall tower status, validates stability for mobile drops,
/// and handles high-performance instant reload on tap after game over.
/// </summary>
public class GameManager : MonoBehaviour
{
    public static GameManager Instance { get; private set; }

    [Header("Game Physics Settings")]
    [Tooltip("How long the tower must remain still to be considered stable.")]
    [SerializeField] private float requiredStableDuration = ${settings.requiredStableDuration.toFixed(1)}f;
    
    [Tooltip("Velocity threshold below which a stone's rigidbody is considered stable.")]
    [SerializeField] private float velocityThreshold = ${settings.velocityThreshold.toFixed(2)}f;
    
    [Tooltip("Y coordinate below which a stone is considered to have tumbled off.")]
    [SerializeField] private float deathYCoordinate = -8.0f;

    [Header("UI Reference")]
    [SerializeField] private Text scoreText;
    [SerializeField] private Text statusText;
    [SerializeField] private GameObject gameOverPanel;

    private List<Rigidbody2D> activeStones = new List<Rigidbody2D>();
    private bool isGameOver = false;
    private bool isCheckingStability = false;
    private float stabilityTimer = 0.0f;
    private int score = 0;

    private void Awake()
    {
        // Simple Singleton pattern
        if (Instance == null) Instance = this;
        else Destroy(gameObject);
    }

    private void Start()
    {
        ResetGame();
    }

    private void Update()
    {
        if (isGameOver)
        {
            // Direct optimization: restart instantly on mobile screen tap or click
            if (DetectTap())
            {
                RestartGame();
            }
            return;
        }

        CheckStonesFallBoundaries();
        MonitorTowerStability();
    }

    public void RegisterStone(Rigidbody2D rb)
    {
        if (!activeStones.Contains(rb))
        {
            activeStones.Add(rb);
            isCheckingStability = true;
            stabilityTimer = 0.0f;
            UpdateStatus("Stabilizing...");
        }
    }

    private void CheckStonesFallBoundaries()
    {
        for (int i = activeStones.Count - 1; i >= 0; i--)
        {
            var rb = activeStones[i];
            if (rb != null && rb.transform.position.y < deathYCoordinate)
            {
                TriggerGameOver("A stone fell! Unstable tower.");
                return;
            }
        }
    }

    private void MonitorTowerStability()
    {
        if (!isCheckingStability || activeStones.Count == 0) return;

        bool allQuiet = true;

        foreach (var rb in activeStones)
        {
            if (rb == null) continue;

            // Optimizing evaluation limit: check linear velocity and angular velocity
            // In older Unity versions, use rb.velocity. In Unity 2023+, rb.linearVelocity is preferred.
            if (rb.velocity.sqrMagnitude > (velocityThreshold * velocityThreshold) || 
                Mathf.Abs(rb.angularVelocity) > (velocityThreshold * 60f))
            {
                allQuiet = false;
                break;
            }
        }

        if (allQuiet)
        {
            stabilityTimer += Time.deltaTime;
            float remaining = Mathf.Max(0, requiredStableDuration - stabilityTimer);
            UpdateStatus($"Stabilizing... {remaining:F1}s");

            if (stabilityTimer >= requiredStableDuration)
            {
                isCheckingStability = false;
                stabilityTimer = 0.0f;
                score = activeStones.Count;
                UpdateScore(score);
                UpdateStatus("Stable! Tap to drop next.");
                
                // Unlock spawner
                if (StoneSpawner.Instance != null)
                {
                    StoneSpawner.Instance.SetReadyToSpawn(true);
                }
            }
        }
        else
        {
            // Reset if any movement detected
            stabilityTimer = 0.0f;
            UpdateStatus("Tower swaying / settling...");
        }
    }

    public void TriggerGameOver(string reason)
    {
        if (isGameOver) return;
        isGameOver = true;
        isCheckingStability = false;
        
        Debug.Log("Game Over: " + reason);
        if (statusText != null) statusText.text = $"GAME OVER\\n{reason}\\nTap to restart";
        if (gameOverPanel != null) gameOverPanel.SetActive(true);

        // Optional optimization: Stop active blocks to simplify UI state
        foreach (var rb in activeStones)
        {
            if (rb != null)
            {
                rb.constraints = RigidbodyConstraints2D.FreezeAll;
            }
        }
    }

    private bool DetectTap()
    {
        if (Input.touchCount > 0)
        {
            return Input.GetTouch(0).phase == TouchPhase.Began;
        }
        return Input.GetMouseButtonDown(0);
    }

    private void UpdateScore(int newScore)
    {
        if (scoreText != null) scoreText.text = $"Stones: {newScore}";
    }

    private void UpdateStatus(string message)
    {
        if (statusText != null) statusText.text = message;
    }

    private void ResetGame()
    {
        isGameOver = false;
        isCheckingStability = false;
        stabilityTimer = 0.0f;
        score = 0;
        activeStones.Clear();
        
        if (gameOverPanel != null) gameOverPanel.SetActive(false);
        UpdateScore(0);
        UpdateStatus("Position and tap to drop!");
    }

    public void RestartGame()
    {
        // Lightweight instant scene reload
        SceneManager.LoadScene(SceneManager.GetActiveScene().buildIndex);
    }
}`,

    Stone: `using UnityEngine;

/// <summary>
/// Attach to your Stone Prefab. Has local Rigidbody2D and BoxCollider2D caching.
/// Handles collision detection logic and notifies the GameManager when stack contact starts.
/// </summary>
[RequireComponent(typeof(Rigidbody2D))]
[RequireComponent(typeof(BoxCollider2D))]
public class Stone : MonoBehaviour
{
    private Rigidbody2D rb;
    private bool hasCollided = false;

    private void Awake()
    {
        rb = GetComponent<Rigidbody2D>();
        
        // Mobile layout optimization: reduce interpolation lag
        rb.interpolation = RigidbodyInterpolation2D.Interpolate;
        rb.collisionDetectionMode = CollisionDetectionMode2D.Continuous;
    }

    private void OnCollisionEnter2D(Collision2D collision)
    {
        // Any collision with ground platform, or existing stones begins stability cycle
        if (!hasCollided)
        {
            hasCollided = true;
            
            // Notify GameManager
            if (GameManager.Instance != null)
            {
                GameManager.Instance.RegisterStone(rb);
            }
        }
    }
}`,

    StoneSpawner: `using UnityEngine;

/// <summary>
/// StoneSpawner aligns the drop marker using touch/drag input
/// and instantiates the Stone prefab on tap.
/// </summary>
public class StoneSpawner : MonoBehaviour
{
    public static StoneSpawner Instance { get; private set; }

    [Header("Spawner Setup")]
    [Tooltip("The Stone prefab containing Rigidbody2D, BoxCollider2D & Stone script.")]
    [SerializeField] private GameObject stonePrefab;
    
    [Tooltip("Height where the stone is released.")]
    [SerializeField] private float dropHeightY = ${settings.stoneHeight > 40 ? '4.5f' : '4.0f'};
    
    [Tooltip("Horizontal movement restrictors.")]
    [SerializeField] private float minLimitX = -3.0f;
    [SerializeField] private float maxLimitX = 3.0f;

    private bool readyToSpawn = true;
    private Camera mainCamera;

    private void Awake()
    {
        if (Instance == null) Instance = this;
        else Destroy(gameObject);
        
        mainCamera = Camera.main;
    }

    private void Update()
    {
        if (GameManager.Instance == null || !readyToSpawn) return;

        // Tracks touch position horizonal crosshair target on mobile
        float targetX = GetTouchWorldPositionX();
        targetX = Mathf.Clamp(targetX, minLimitX, maxLimitX);
        
        // Instantly snap spawner to touch X alignment
        transform.position = new Vector3(targetX, dropHeightY, 0);

        if (DetectReleaseTap())
        {
            DropStone(targetX);
        }
    }

    private float GetTouchWorldPositionX()
    {
        Vector3 screenPos = Input.mousePosition;
        if (Input.touchCount > 0)
        {
            screenPos = Input.GetTouch(0).position;
        }
        
        Vector3 worldPos = mainCamera.ScreenToWorldPoint(screenPos);
        return worldPos.x;
    }

    private bool DetectReleaseTap()
    {
        // Captures mobile tap beginnings cleanly and reliably
        if (Input.touchCount > 0)
        {
            return Input.GetTouch(0).phase == TouchPhase.Began;
        }
        return Input.GetMouseButtonDown(0);
    }

    private void DropStone(float xPos)
    {
        if (stonePrefab == null)
        {
            Debug.LogError("Assign the stonePrefab under the StoneSpawner inspector!");
            return;
        }

        Vector3 dropPosition = new Vector3(xPos, dropHeightY, 0);
        GameObject stoneObj = Instantiate(stonePrefab, dropPosition, Quaternion.identity);

        Rigidbody2D rb = stoneObj.GetComponent<Rigidbody2D>();
        if (rb != null)
        {
            // Initializing mass dynamically based on settings
            rb.mass = ${settings.mass.toFixed(1)}f;
            rb.gravityScale = ${settings.gravityY > 0 ? (settings.gravityY / 1).toFixed(1) : '1.0'}f;
        }

        // Lock spawning until tower is stable
        SetReadyToSpawn(false);
    }

    public void SetReadyToSpawn(bool isReady)
    {
        readyToSpawn = isReady;
    }
}`
  };

  return (
    <div className="flex flex-col h-full bg-[#FCFBF9] border border-[#E5E1D8] shadow-sm rounded-xl overflow-hidden font-sans">
      {/* Code Header Bar */}
      <div className="bg-[#FDFCFB] px-4 py-3 border-b border-[#E5E1D8] flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#8B8C89] inline-block"></span>
            <span className="w-2.5 h-2.5 rounded-full bg-[#A6A29A] inline-block"></span>
            <span className="w-2.5 h-2.5 rounded-full bg-[#5D6D4E] inline-block"></span>
          </div>
          <span className="text-[#7C756E] text-xs font-mono ml-2 border-l border-[#E5E1D8]/80 pl-3">
            Unity C# Editor (Mobile Optimized)
          </span>
        </div>

        {/* Sync Indicator badge */}
        <div className="flex items-center gap-2 bg-[#EDF2E8] text-[#3D5230] text-[11px] px-2.5 py-1 rounded-full font-mono border border-[#D1DFCA] shadow-xs">
          <Sliders className="w-3 h-3 animate-pulse text-[#5D6D4E]" />
          <span>Syncing variables with simulator</span>
        </div>
      </div>

      {/* Tabs list */}
      <div className="bg-[#F5F2ED]/60 border-b border-[#E5E1D8] flex overflow-x-auto select-none no-scrollbar">
        {(Object.keys(scripts) as Array<Exclude<UnityScriptTab, 'UnityInstructions'>>).map((scriptName) => (
          <button
            key={scriptName}
            onClick={() => setActiveTab(scriptName)}
            className={`px-4 py-3 text-xs font-mono border-r border-[#E5E1D8] flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
              activeTab === scriptName
                ? 'bg-[#FCFBF9] text-[#2D2D2D] border-b-2 border-b-[#5D6D4E] font-bold'
                : 'text-[#7C756E] hover:text-[#4A4540] hover:bg-[#EBE8E0]'
            }`}
          >
            <FileCode className="w-4.5 h-4.5 text-[#5D6D4E]" />
            <span>{scriptName}.cs</span>
          </button>
        ))}
        <button
          onClick={() => setActiveTab('UnityInstructions')}
          className={`px-4 py-3 text-xs font-mono border-r border-[#E5E1D8] flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'UnityInstructions'
              ? 'bg-[#FCFBF9] text-[#2D2D2D] border-b-2 border-b-[#5D6D4E] font-bold'
              : 'text-[#7C756E] hover:text-[#4A4540] hover:bg-[#EBE8E0]'
          }`}
        >
          <HelpCircle className="w-4.5 h-4.5 text-[#5D6D4E]" />
          <span>Unity Setup Guide</span>
        </button>
      </div>

      {/* Script View / Editor */}
      <div className="flex-1 overflow-y-auto bg-[#FDFCFB] p-4 font-mono text-[13px] relative leading-relaxed">
        {activeTab !== 'UnityInstructions' ? (
          <>
            {/* Copy button absolute */}
            <button
              onClick={() => copyToClipboard(scripts[activeTab as keyof typeof scripts], activeTab)}
              className="absolute top-4 right-4 flex items-center gap-1.5 bg-[#F5F2ED] border border-[#E5E1D8] hover:bg-[#EBE8E0] text-[#4A4540] transition-all px-3 py-1.5 rounded-lg text-xs font-sans font-medium cursor-pointer shadow-xs"
            >
              {copied === activeTab ? (
                <>
                  <Check className="w-3.5 h-3.5 text-[#3D5230]" />
                  <span className="text-[#3D5230] font-semibold">Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-[#5D6D4E]" />
                  <span>Copy Script</span>
                </>
              )}
            </button>

            {/* Simulated syntax highlighting renderer */}
            <pre className="text-[#4A4540] select-text pr-24 overflow-x-auto text-[13px]">
              <code>
                {scripts[activeTab as keyof typeof scripts]
                  .split('\n')
                  .map((line, idx) => {
                    // Comments
                    if (line.trim().startsWith('//') || line.trim().startsWith('///')) {
                      return (
                        <div key={idx} className="table-row font-normal">
                          <span className="table-cell pr-4 text-right text-[#ACACAC] select-none text-xs w-8 pb-0.5">{idx + 1}</span>
                          <span className="table-cell text-[#8E9B82] italic pb-0.5">{line}</span>
                        </div>
                      );
                    }

                    // Keywords color substitution matching warm IDE colors
                    const keywords = ['using', 'public', 'private', 'class', 'struct', 'void', 'bool', 'int', 'float', 'static', 'string', 'new', 'if', 'else', 'return', 'foreach', 'for', 'override'];

                    // Highlight serialized attributes or headers
                    let isAttribute = line.includes('[SerializeField]') || line.includes('[Tooltip') || line.includes('[Header') || line.includes('[RequireComponent');

                    return (
                      <div key={idx} className="table-row pb-0.5">
                        <span className="table-cell pr-4 text-right text-[#ACACAC] select-none text-xs w-8 pb-0.5">{idx + 1}</span>
                        <span className={`table-cell whitespace-pre pb-0.5 ${isAttribute ? 'text-[#7D5A9E] font-medium' : ''}`}>
                          {line.split(' ').map((word, wordIdx) => {
                            let cleanWord = word.replace(/[^a-zA-Z]/g, '');
                            if (keywords.includes(cleanWord)) {
                              return <span key={wordIdx} className="text-[#9E5F3D] font-bold">{word} </span>;
                            }
                            if (word.startsWith('"') || word.endsWith('"') || word.includes('\\n')) {
                              return <span key={wordIdx} className="text-[#845E35] italic">{word} </span>;
                            }
                            if (word.includes('GameManager') || word.includes('Stone') || word.includes('StoneSpawner')) {
                              return <span key={wordIdx} className="text-[#3F6E72] font-semibold">{word} </span>;
                            }
                            if (word.endsWith('f') && !isNaN(parseFloat(word))) {
                              return <span key={wordIdx} className="text-[#4F678F] font-semibold">{word} </span>;
                            }
                            return word + ' ';
                          })}
                        </span>
                      </div>
                    );
                  })}
              </code>
            </pre>
          </>
        ) : (
          <div className="font-sans text-[#4A4540] max-w-3xl space-y-6 select-text p-2">
            <div>
              <h3 className="text-base font-semibold font-serif text-[#2D2D2D] flex items-center gap-2 mb-2">
                <Shield className="w-5 h-5 text-[#5D6D4E]" />
                Unity 2D Mobile Setup Instructions
              </h3>
              <p className="text-[#7C756E] text-sm leading-relaxed">
                Follow this simple layout setup to install the scripts in your Unity project. This setup is highly performant and pre-optimized to respect mobile battery, touch response, and low-latency rendering.
              </p>
            </div>

            <div className="space-y-4 border-l border-[#E5E1D8] pl-4 py-1">
              <div>
                <h4 className="text-[#2D2D2D] font-medium text-sm flex items-center gap-1.5 font-serif">
                  <span className="text-xs font-mono bg-[#F5F2ED] text-[#5D6D4E] px-2 py-0.5 rounded">Step 1</span>
                  Create Objects in Scene
                </h4>
                <ul className="list-disc pl-5 mt-1.5 text-xs text-[#7C756E] space-y-1">
                  <li>Create empty GameObject named <strong className="text-[#2D2D2D]">_GameManager</strong>, attach <code className="text-[#3F6E72]">GameManager.cs</code>.</li>
                  <li>Create empty GameObject named <strong className="text-[#2D2D2D]">_Spawner</strong>, position near camera top, attach <code className="text-[#3F6E72]">StoneSpawner.cs</code>.</li>
                  <li>Create a 2D Sprite named <strong className="text-[#2D2D2D]">Ground</strong>, move to the bottom. Add a <code className="text-[#7D5A9E]">BoxCollider2D</code> (Static). Set its scale wider for the stone target zone.</li>
                </ul>
              </div>

              <div>
                <h4 className="text-[#2D2D2D] font-medium text-sm flex items-center gap-1.5 font-serif">
                  <span className="text-xs font-mono bg-[#F5F2ED] text-[#5D6D4E] px-2 py-0.5 rounded">Step 2</span>
                  Build the Stone Prefab
                </h4>
                <ul className="list-disc pl-5 mt-1.5 text-xs text-[#7C756E] space-y-1">
                  <li>Create a 2D Square/Capsule Sprite in your asset folder.</li>
                  <li>Add <code className="text-[#7D5A9E]">Rigidbody2D</code> and <code className="text-[#7D5A9E]">BoxCollider2D</code> to it.</li>
                  <li>Attach <code className="text-[#3F6E72]">Stone.cs</code> to it. It automatically registers components.</li>
                  <li>
                    <strong>Physics2D optimization:</strong> In the Rigidbody2D inspector, set:
                    <ul className="list-circle pl-5 mt-1 space-y-0.5 opacity-80">
                      <li>Collision Detection: <span className="text-[#9E5F3D] font-semibold">Continuous</span></li>
                      <li>Interpolate: <span className="text-[#9E5F3D] font-semibold">Interpolate</span></li>
                      <li>Sleeping Mode: <span className="text-[#7C756E]">Start Awake</span></li>
                    </ul>
                  </li>
                  <li>Drag this GameObject into your Asset Folder to convert it into a <strong className="text-[#2D2D2D]">Prefab</strong>, then remove it from the scene.</li>
                </ul>
              </div>

              <div>
                <h4 className="text-[#2D2D2D] font-medium text-sm flex items-center gap-1.5 font-serif">
                  <span className="text-xs font-mono bg-[#F5F2ED] text-[#5D6D4E] px-2 py-0.5 rounded">Step 3</span>
                  Connect Inspector Fields
                </h4>
                <ul className="list-disc pl-5 mt-1.5 text-xs text-[#7C756E] space-y-1">
                  <li>Select <strong className="text-[#2D2D2D]">_Spawner</strong>, and drag the Stone Prefab into the <code className="text-[#845E35]">Stone Prefab</code> property slot.</li>
                  <li>Select <strong className="text-[#2D2D2D]">_GameManager</strong>, map your UI HUD items (Standard Canvas Text for score and status, and active Game Over panel).</li>
                </ul>
              </div>

              <div>
                <h4 className="text-[#2D2D2D] font-medium text-sm flex items-center gap-1.5 font-serif">
                  <span className="text-xs font-mono bg-[#F5F2ED] text-[#5D6D4E] px-2 py-0.5 rounded">Step 4</span>
                  Build Settings (Mobile Screen)
                </h4>
                <ul className="list-disc pl-5 mt-1.5 text-xs text-[#7C756E] space-y-1">
                  <li>Deploy to Android or iOS from Build Settings. The input systems fully align with touch tap controls, with desktop mouse fallback for fast local testing!</li>
                </ul>
              </div>
            </div>

            {/* Quick Note block */}
            <div className="bg-[#EDF2E8] border border-[#D1DFCA] p-3.5 rounded-lg flex items-start gap-2.5 text-xs text-[#4A4540]">
              <Layers className="w-5 h-5 text-[#5D6D4E] shrink-0 mt-0.5" />
              <div className="leading-normal">
                <span className="text-[#2D2D2D] font-serif font-semibold block mb-0.5">Physics Material 2D Optimization Note</span>
                To make the stones stack realistically without slipping, create a <code className="text-[#845E35]">PhysicsMaterial2D</code> in Unity. Set friction to <code className="text-[#4F678F]">{settings.friction}</code> and bounciness to <code className="text-[#4F678F]">{settings.restitution}</code>, then apply this material to the Stone's <code className="text-[#7D5A9E]">BoxCollider2D</code>. This matches your current simulator setup exactly.
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
