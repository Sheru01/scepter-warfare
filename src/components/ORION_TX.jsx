/**
 * ============================================================
 *  ORION TX Strategy Engine  |  Part 1 of 2
 * ============================================================
 *  Developer Notes:
 *  - Developed by Capt. M.D. Rana, USAF / Director, HAT Lab
 *  - Purpose: Demonstrates a multi-theater simulation engine for
 *    real-time AI/COA (Course of Action) exploration.
 *  - Architecture: Built with React + Tailwind; uses custom hooks,
 *    ref-based live state tracking, and a 60 FPS requestAnimationFrame loop.
 *  - Extendability: Add new theaters, strategies, or backend data feeds
 *    (FastAPI / Flask) by expanding the simulation hooks.
 *  - Performance: Uses refs to avoid stale closures and throttles rendering
 *    for efficiency. Adjustable speed multiplier for demo scaling.
 *  - Maintenance: Tailwind handles visuals; constants at the top can be
 *    tuned for battlefield size, timing, or agent behaviors.
 * ============================================================
 */

import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import {
  Play,
  Pause,
  RotateCcw,
  Target,
  Package,
  Eye,
  Users,
  TrendingUp,
  AlertTriangle,
  Map,
  Award,
  Settings,
} from "lucide-react";

/* ============================================================
   Simulation Configuration
   - Adjust grid size, number of theaters, and engagement logic here.
   - Keeping all constants centralized simplifies experimentation.
============================================================ */
const SIMULATION_CONFIG = {
  GRID_SIZE: 400, // pixels for each canvas
  NUM_THEATERS: 4,
  STRATEGY_SWITCH_TIME: { min: 3, max: 5 }, // seconds before switching COA
  ENGAGEMENT_DISTANCE: 35,
  HIT_DAMAGE: 2,
  BASE_SUCCESS_PROBABILITY: 50,
};

/* ============================================================
   Hook: useSimulation
   Handles all movement, targeting, and engagement updates.
   Uses refs and callbacks to ensure performance at 60 FPS.
============================================================ */
const useSimulation = (mode, policy, logistics, currentStrategy) => {
  const [theaters, setTheaters] = useState([]);
  const [agents, setAgents] = useState([]);

  /* --------------------------
     Initialize chosen mode
     (multi-theater vs standard)
  -------------------------- */
  const initializeMode = useCallback((selectedMode) => {
    if (selectedMode === "multi-theater") initMultiTheater();
    else initStandardMode();
  }, []);

  /* --------------------------
     Multi-theater setup:
     Each theater gets random agents and targets.
  -------------------------- */
  const initMultiTheater = useCallback(() => {
    const newTheaters = [];
    for (let t = 0; t < SIMULATION_CONFIG.NUM_THEATERS; t++) {
      const theaterAgents = [];
      const numAgents = 8 + Math.floor(Math.random() * 5);
      const numTargets = 2 + Math.floor(Math.random() * 3);

      // Blue team (friendly) initialization
      for (let i = 0; i < numAgents; i++) {
        theaterAgents.push({
          id: `t${t}-b${i}`,
          x: Math.random() * SIMULATION_CONFIG.GRID_SIZE * 0.25,
          y: Math.random() * SIMULATION_CONFIG.GRID_SIZE,
          vx: 0,
          vy: 0,
          team: "blue",
          active: true,
          fuel: 100,
          ammo: 100,
        });
      }

      // Red team (enemy) initialization
      for (let i = 0; i < numTargets; i++) {
        theaterAgents.push({
          id: `t${t}-r${i}`,
          x:
            SIMULATION_CONFIG.GRID_SIZE * 0.7 +
            Math.random() * SIMULATION_CONFIG.GRID_SIZE * 0.25,
          y: Math.random() * SIMULATION_CONFIG.GRID_SIZE,
          team: "red",
          health: 100,
        });
      }

      newTheaters.push({
        id: t,
        name: ["Northern Front", "Eastern Sector", "Southern Theater", "Western Zone"][t],
        agents: theaterAgents,
        priority: Math.random(),
      });
    }
    setTheaters(newTheaters);
  }, []);

  /* --------------------------
     Standard mode setup:
     Single-canvas simulation.
  -------------------------- */
  const initStandardMode = useCallback(() => {
    const newAgents = [];
    for (let i = 0; i < 20; i++) {
      newAgents.push({
        id: `b${i}`,
        x: Math.random() * SIMULATION_CONFIG.GRID_SIZE * 0.3,
        y: Math.random() * SIMULATION_CONFIG.GRID_SIZE,
        vx: 0,
        vy: 0,
        team: "blue",
        active: true,
      });
    }
    for (let i = 0; i < 6; i++) {
      newAgents.push({
        id: `r${i}`,
        x:
          SIMULATION_CONFIG.GRID_SIZE * 0.7 +
          Math.random() * SIMULATION_CONFIG.GRID_SIZE * 0.2,
        y: Math.random() * SIMULATION_CONFIG.GRID_SIZE,
        team: "red",
        health: 100,
      });
    }
    setAgents(newAgents);
  }, []);

  /* --------------------------
     Helper: findNearest
     Finds the closest target to an agent.
  -------------------------- */
  const findNearest = useCallback((agent, targets) => {
    if (targets.length === 0) return null;
    let nearest = targets[0];
    let minDistance = Infinity;
    for (const target of targets) {
      const distance = Math.hypot(target.x - agent.x, target.y - agent.y);
      if (distance < minDistance) {
        minDistance = distance;
        nearest = target;
      }
    }
    return nearest;
  }, []);

  /* --------------------------
     updateMultiTheater
     Moves blue agents, applies damage to red targets.
  -------------------------- */
  const updateMultiTheater = useCallback(() => {
    setTheaters((prevTheaters) =>
      prevTheaters.map((theater) => {
        // Move blue agents
        const updatedAgents = theater.agents.map((agent) => {
          if (agent.team === "blue" && agent.active) {
            const redTargets = theater.agents.filter(
              (a) => a.team === "red" && a.health > 0
            );
            const nearest = findNearest(agent, redTargets);
            if (!nearest) return agent;

            const behavior = getStrategyBehavior(agent, nearest, currentStrategy);
            let aggressionMod =
              policy.roe === "defensive"
                ? 0.5
                : policy.roe === "aggressive"
                ? 1.5
                : 1;

            const transportMod = logistics.transportCapacity / 100;
            const newVx = behavior.vx * aggressionMod;
            const newVy = behavior.vy * aggressionMod;

            let newX = agent.x + newVx * transportMod;
            let newY = agent.y + newVy * transportMod;

            // Keep agents inside grid bounds
            newX = Math.max(0, Math.min(SIMULATION_CONFIG.GRID_SIZE, newX));
            newY = Math.max(0, Math.min(SIMULATION_CONFIG.GRID_SIZE, newY));

            return { ...agent, vx: newVx, vy: newVy, x: newX, y: newY };
          }
          return agent;
        });

        // Apply damage from blue to red agents
        const finalAgents = updatedAgents.map((agent) => {
          if (agent.team === "red" && agent.health > 0) {
            const blueAgents = updatedAgents.filter(
              (a) => a.team === "blue" && a.active
            );
            let totalDamage = 0;
            for (const blueAgent of blueAgents) {
              const distance = Math.hypot(
                blueAgent.x - agent.x,
                blueAgent.y - agent.y
              );
              if (distance < SIMULATION_CONFIG.ENGAGEMENT_DISTANCE) {
                const hitChance = logistics.commsReliability / 100;
                if (Math.random() < hitChance) {
                  let damage = SIMULATION_CONFIG.HIT_DAMAGE;
                  if (policy.roe === "defensive") damage *= 0.5;
                  if (policy.roe === "aggressive") damage *= 1.5;
                  totalDamage += damage;
                }
              }
            }
            if (totalDamage > 0) {
              return { ...agent, health: Math.max(0, agent.health - totalDamage) };
            }
          }
          return agent;
        });
        return { ...theater, agents: finalAgents };
      })
    );
  }, [
    currentStrategy,
    policy.roe,
    logistics.transportCapacity,
    logistics.commsReliability,
    findNearest,
  ]);

  /* --------------------------
     updateStandardMode
     Same logic as above but for one canvas.
  -------------------------- */
  const updateStandardMode = useCallback(() => {
    setAgents((prevAgents) => {
      let updatedAgents = prevAgents.map((agent) => {
        if (agent.team === "blue" && agent.active) {
          const redTargets = prevAgents.filter(
            (a) => a.team === "red" && a.health > 0
          );
          const nearest = findNearest(agent, redTargets);
          if (!nearest) return agent;

          const behavior = getStrategyBehavior(agent, nearest, currentStrategy);
          let newX = agent.x + behavior.vx;
          let newY = agent.y + behavior.vy;
          newX = Math.max(0, Math.min(SIMULATION_CONFIG.GRID_SIZE, newX));
          newY = Math.max(0, Math.min(SIMULATION_CONFIG.GRID_SIZE, newY));
          return { ...agent, vx: behavior.vx, vy: behavior.vy, x: newX, y: newY };
        }
        return agent;
      });

      // Damage red agents
      updatedAgents = updatedAgents.map((agent) => {
        if (agent.team === "red" && agent.health > 0) {
          const blueAgents = updatedAgents.filter(
            (a) => a.team === "blue" && a.active
          );
          let totalDamage = 0;
          for (const blueAgent of blueAgents) {
            const distance = Math.hypot(blueAgent.x - agent.x, blueAgent.y - agent.y);
            if (distance < SIMULATION_CONFIG.ENGAGEMENT_DISTANCE)
              totalDamage += SIMULATION_CONFIG.HIT_DAMAGE;
          }
          if (totalDamage > 0)
            return { ...agent, health: Math.max(0, agent.health - totalDamage) };
        }
        return agent;
      });
      return updatedAgents;
    });
  }, [currentStrategy, findNearest]);

  return { theaters, agents, initializeMode, updateMultiTheater, updateStandardMode };
};

/* ============================================================
   Hook: useStrategyEvaluation
   Evaluates COA (Course of Action) effectiveness based on
   proximity, logistics, and policy factors.
============================================================ */
const useStrategyEvaluation = () => {
  const [exploredCOAs, setExploredCOAs] = useState(0);
  const [bestCOAs, setBestCOAs] = useState([]);

  const evaluateCurrentStrategy = useCallback(
    (strategy, allStrategies, mode, theaters, agents, policy, logistics, timeElapsed) => {
      // Generate a simulated "score" for the COA
      const score =
        (Math.random() * 0.5 +
          (policy.forceLevel / 100) * 0.3 +
          (logistics.supplyRate / 100) * 0.2) *
        100;

      const result = {
        id: exploredCOAs + 1,
        name: strategy,
        score,
        time: timeElapsed,
      };

      // Keep top 50 best COAs
      setBestCOAs((prev) => {
        const updated = [...prev, result].sort((a, b) => b.score - a.score);
        return updated.slice(0, 50);
      });

      // Increment exploration counter
      setExploredCOAs((n) => n + 1);
    },
    [exploredCOAs]
  );

  const resetEvaluation = useCallback(() => {
    setExploredCOAs(0);
    setBestCOAs([]);
  }, []);

  return {
    exploredCOAs,
    bestCOAs,
    evaluateCurrentStrategy,
    resetEvaluation,
  };
};



/* ============================================================
   Strategy Behavior Function
   - Returns velocity (vx, vy) based on strategy type.
   - Separated for clarity and testability.
============================================================ */
const getStrategyBehavior = (agent, nearest, strategyApproach, timeElapsed = 0) => {
  if (!nearest) return { vx: 0, vy: 0 };
  const dx = nearest.x - agent.x;
  const dy = nearest.y - agent.y;
  const baseAngle = Math.atan2(dy, dx);
  const dist = Math.hypot(dx, dy);
  const agentNum = parseInt(agent.id.match(/\d+/)?.[0] || 0);

  const strategies = [
    { name: "Direct Assault", approach: "direct", speed: 2.5 },
    { name: "Flanking Maneuver", approach: "flank", speed: 2 },
    { name: "Pincer Movement", approach: "pincer", speed: 2 },
    { name: "Dispersed Engagement", approach: "dispersed", speed: 1.8 },
    { name: "Concentrated Strike", approach: "concentrated", speed: 3 },
    { name: "Hit and Run", approach: "hitrun", speed: 3.5 },
  ];

  const config = strategies.find((s) => s.approach === strategyApproach) || strategies[0];
  let angle = baseAngle;
  let speedMod = config.speed;

  // Adjust movement angle per strategy
  switch (strategyApproach) {
    case "flank":
      angle = baseAngle + (agentNum % 2 === 0 ? Math.PI / 3 : -Math.PI / 3);
      break;
    case "pincer":
      angle = baseAngle + (agentNum % 2 === 0 ? Math.PI / 2.5 : -Math.PI / 2.5);
      break;
    case "dispersed":
      angle = baseAngle + (Math.random() - 0.5) * Math.PI / 2;
      break;
    case "concentrated":
      angle = baseAngle + Math.sin(timeElapsed + agentNum) * 0.3;
      break;
    case "hitrun":
      if (dist < 80) {
        angle = baseAngle + Math.PI;
        speedMod *= 1.5;
      }
      break;
    default:
      break;
  }
  return { vx: Math.cos(angle) * speedMod, vy: Math.sin(angle) * speedMod };
};
/* ============================================================
   Component: ORION_TX
   - Main React component for the ORION TX Strategy Engine
   - Integrates all simulation hooks, 60 FPS loop, rendering,
     analytics, and UI controls.
============================================================ */
const ORION_TX = () => {
  /* --------------------------
     Core simulation states
  -------------------------- */
  const [mode, setMode] = useState("multi-theater");
  const [isRunning, setIsRunning] = useState(false);
  const [speed, setSpeed] = useState(100); // speed multiplier
  const [timeElapsed, setTimeElapsed] = useState(0);
  const [fps, setFps] = useState(0);
  const [currentStrategy, setCurrentStrategy] = useState("direct");
  const [strategyTimer, setStrategyTimer] = useState(0);

  /* --------------------------
     Policy and logistics sliders
  -------------------------- */
  const [policy, setPolicy] = useState({
    forceLevel: 100,
    roe: "standard",
    commanderIntent: "balanced",
    riskTolerance: 50,
  });
  const [logistics, setLogistics] = useState({
    supplyRate: 100,
    maintenanceLevel: 100,
    commsReliability: 100,
    transportCapacity: 100,
  });

  /* --------------------------
     Mission performance metrics
  -------------------------- */
  const [missionMetrics, setMissionMetrics] = useState({
    successProbability: 75,
    predictedCasualties: 0,
    timeToObjective: 0,
    resourceConsumption: 0,
    coverageGaps: [],
  });

  /* --------------------------
     Hooks for simulation logic
  -------------------------- */
  const { theaters, agents, initializeMode, updateMultiTheater, updateStandardMode } =
    useSimulation(mode, policy, logistics, currentStrategy);
  const { exploredCOAs, bestCOAs, evaluateCurrentStrategy, resetEvaluation } =
    useStrategyEvaluation();

  /* --------------------------
     Refs for animation and canvases
  -------------------------- */
  const canvasRefs = useRef([]);
  const lastFrameTime = useRef(performance.now());

  /* --------------------------
     Strategies definition (memoized)
  -------------------------- */
  const strategies = useMemo(
    () => [
      { name: "Direct Assault", approach: "direct" },
      { name: "Flanking Maneuver", approach: "flank" },
      { name: "Pincer Movement", approach: "pincer" },
      { name: "Dispersed Engagement", approach: "dispersed" },
      { name: "Concentrated Strike", approach: "concentrated" },
      { name: "Hit and Run", approach: "hitrun" },
    ],
    []
  );

  /* ============================================================
     Initialize mode and setup
  ============================================================ */
  useEffect(() => {
    handleInitializeMode(mode);
  }, [mode]);

  const handleInitializeMode = (selectedMode) => {
    setIsRunning(false);
    setTimeElapsed(0);
    setStrategyTimer(0);
    resetEvaluation();
    initializeMode(selectedMode);
  };

/* ============================================================
   Core Animation Loop (Stable Continuous Version)
   - Continuous COA Exploration (thousands+)
   - Auto-pauses after COA_LIMIT
  ============================================================ */
useEffect(() => {
  if (!isRunning) return;

  const COA_LIMIT = 20000; // Stop automatically after this many COAs
  let frameCount = 0;
  let fpsTimer = performance.now();
  lastFrameTime.current = performance.now();

  const animate = (now) => {
    const delta = now - lastFrameTime.current;
    const timeStep = (delta / 1000) * (speed / 100);
    lastFrameTime.current = now;

    // update timers
    setTimeElapsed((t) => t + timeStep);
    setStrategyTimer((st) => st + timeStep);

    // Continuous COA exploration
    evaluateCurrentStrategy(
      strategies[Math.floor(Math.random() * strategies.length)].approach,
      strategies,
      mode,
      theaters,
      agents,
      policy,
      logistics,
      timeElapsed
    );

    // stop automatically at COA_LIMIT
    if (exploredCOAs >= COA_LIMIT) {
      console.log(`✅ Stopped after ${COA_LIMIT} COAs`);
      setIsRunning(false);
      return;
    }

    // update simulation and metrics
    if (mode === "multi-theater") updateMultiTheater();
    else updateStandardMode();

    updateMissionMetrics();

    // FPS calculation
    frameCount++;
    const elapsed = now - fpsTimer;
    if (elapsed > 1000) {
      setFps(frameCount);
      frameCount = 0;
      fpsTimer = now;
    }

    if (isRunning) requestAnimationFrame(animate);
  };

  requestAnimationFrame(animate);

  return () => {
    lastFrameTime.current = performance.now();
  };
}, [isRunning]);

  /* ============================================================
     Mission Metrics Update Logic
  ============================================================ */
  const updateMissionMetrics = useCallback(() => {
    const allAgents =
      mode === "multi-theater" ? theaters.flatMap((t) => t.agents) : agents;
    const activeBlue = allAgents.filter(
      (a) => a.team === "blue" && a.active
    ).length;
    const activeRed = allAgents.filter(
      (a) => a.team === "red" && a.health > 0
    ).length;
    const forceRatio = activeBlue / Math.max(activeRed, 1);
    const policyMod = policy.forceLevel / 100;
    const logisticsMod = (logistics.supplyRate + logistics.commsReliability) / 200;

    let baseProb =
      SIMULATION_CONFIG.BASE_SUCCESS_PROBABILITY + (forceRatio - 1) * 30;
    baseProb *= policyMod * logisticsMod;
    if (policy.roe === "defensive") baseProb *= 0.8;
    if (policy.roe === "aggressive") baseProb *= 1.2;

    setMissionMetrics({
      successProbability: Math.min(100, Math.max(0, baseProb)),
      predictedCasualties: Math.floor(activeBlue * (1 - policyMod) * 0.3),
      timeToObjective: Math.floor(100 / (logisticsMod * 2)),
      resourceConsumption: Math.floor(100 - logistics.supplyRate),
      coverageGaps: policy.forceLevel < 80 ? ["Sector B", "Eastern Flank"] : [],
    });
  }, [mode, theaters, agents, policy, logistics]);

  /* ============================================================
     Canvas Rendering Logic
     - Draws background, grid, and agents with glow effects.
  ============================================================ */
  useEffect(() => {
    const renderCanvas = (canvas, theaterData) => {
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, SIMULATION_CONFIG.GRID_SIZE, SIMULATION_CONFIG.GRID_SIZE);

      // gradient background
      const gradient = ctx.createLinearGradient(0, 0, 0, SIMULATION_CONFIG.GRID_SIZE);
      gradient.addColorStop(0, "#0f172a");
      gradient.addColorStop(1, "#1e293b");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, SIMULATION_CONFIG.GRID_SIZE, SIMULATION_CONFIG.GRID_SIZE);

      // grid lines
      ctx.strokeStyle = "#1e293b";
      for (let i = 0; i < SIMULATION_CONFIG.GRID_SIZE; i += 40) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, SIMULATION_CONFIG.GRID_SIZE);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, i);
        ctx.lineTo(SIMULATION_CONFIG.GRID_SIZE, i);
        ctx.stroke();
      }

      const agentsToDraw = mode === "multi-theater" ? theaterData.agents : agents;

      // draw blue and red agents with glow
      agentsToDraw.forEach((agent) => {
        if (agent.team === "blue" && agent.active) {
          ctx.shadowBlur = 10;
          ctx.shadowColor = "#60a5fa";
          ctx.fillStyle = "#3b82f6";
          ctx.beginPath();
          ctx.arc(agent.x, agent.y, 5, 0, Math.PI * 2);
          ctx.fill();
        } else if (agent.team === "red" && agent.health > 0) {
          ctx.shadowBlur = 10;
          ctx.shadowColor = "#f87171";
          ctx.fillStyle = "#ef4444";
          ctx.beginPath();
          ctx.arc(agent.x, agent.y, 7, 0, Math.PI * 2);
          ctx.fill();
          // small health bar
          ctx.shadowBlur = 0;
          ctx.fillStyle = "#22c55e";
          ctx.fillRect(agent.x - 8, agent.y - 12, (agent.health / 100) * 16, 2);
        }
      });
      ctx.shadowBlur = 0;
    };

    if (mode === "multi-theater") {
      theaters.forEach((theater, idx) => {
        const canvas = canvasRefs.current[idx];
        renderCanvas(canvas, theater);
      });
    } else {
      const canvas = canvasRefs.current[0];
      renderCanvas(canvas, { agents });
    }
  }, [agents, theaters, mode]);

  /* ============================================================
     Component Render
     - Tailwind-based UI layout and controls.
  ============================================================ */
  return (
    <div className="min-h-screen bg-slate-900 text-white p-4">
      <div className="max-w-[1900px] mx-auto">
        <div className="mb-4">
          <h1 className="text-3xl font-bold mb-2 bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
            ORION TX Strategy Engine
          </h1>
          <p className="text-slate-400 text-sm">
            Real-Time COA Exploration & Multi-Theater Modeling
          </p>
        </div>

        {/* Control panel */}
        <div className="grid grid-cols-6 gap-2 mb-4">
          {[{ id: "multi-theater", name: "Multi-Theater", icon: Map },
            { id: "standard", name: "Standard", icon: Target },
            { id: "resources", name: "Resources", icon: Package },
            { id: "fog-of-war", name: "Fog of War", icon: Eye },
            { id: "campaign", name: "Campaign", icon: Award },
            { id: "human-vs-ai", name: "Human vs AI", icon: Users }].map((m) => {
            const Icon = m.icon;
            return (
              <button
                key={m.id}
                onClick={() => setMode(m.id)}
                className={`p-3 rounded-lg border transition ${
                  mode === m.id
                    ? "bg-blue-600 border-blue-500"
                    : "bg-slate-800 border-slate-700 hover:border-slate-600"
                }`}
              >
                <Icon size={20} className="mx-auto mb-1" />
                <div className="text-xs">{m.name}</div>
              </button>
            );
          })}
        </div>

        {/* Simulation display */}
        <div className="grid grid-cols-4 gap-4">
          <div className="col-span-3">
            {mode === "multi-theater" ? (
              <div className="grid grid-cols-2 gap-3">
                {theaters.map((theater, idx) => (
                  <div
                    key={theater.id}
                    className="bg-slate-800 rounded-lg p-3 border border-slate-700"
                  >
                    <div className="flex justify-between items-center mb-2">
                      <h3 className="text-sm font-semibold">{theater.name}</h3>
                      <span className="text-xs text-slate-400">
                        {theater.agents.filter((a) => a.team === "blue").length} B / 
                        {theater.agents.filter((a) => a.team === "red").length} R
                      </span>
                    </div>
                    <canvas
                      ref={(el) => (canvasRefs.current[idx] = el)}
                      width={SIMULATION_CONFIG.GRID_SIZE}
                      height={SIMULATION_CONFIG.GRID_SIZE}
                      className="w-full rounded border border-slate-700"
                    />
                  </div>
                ))}
              </div>
            ) : (
              <canvas
                ref={(el) => (canvasRefs.current[0] = el)}
                width={SIMULATION_CONFIG.GRID_SIZE}
                height={SIMULATION_CONFIG.GRID_SIZE}
                className="w-full bg-slate-800 rounded border border-slate-700"
              />
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-3">
            <div className="bg-slate-800 rounded-lg p-3 border border-slate-700">
              <h3 className="text-sm font-semibold mb-2">Controls</h3>
              <button
                onClick={() => setIsRunning(!isRunning)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm mb-2 w-full"
              >
                {isRunning ? "Pause" : "Start"}
              </button>
              <button
                onClick={() => handleInitializeMode(mode)}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm w-full"
              >
                Reset
              </button>
              <div className="mt-3">
                <label className="text-xs text-slate-400 block mb-1">Speed</label>
                <input
                  type="range"
                  min="10"
                  max="200"
                  value={speed}
                  onChange={(e) => setSpeed(Number(e.target.value))}
                  className="w-full"
                />
                <div className="text-xs text-center mt-1">{speed}%</div>
              </div>
            </div>

            <div className="bg-slate-800 rounded-lg p-3 border border-slate-700">
              <h3 className="text-sm font-semibold mb-2">Statistics</h3>
              <div className="text-xs space-y-1">
                <div className="flex justify-between">
                  <span>FPS</span>
                  <span className="text-green-400 font-mono">{fps}</span>
                </div>
                <div className="flex justify-between">
                  <span>Time</span>
                  <span>{timeElapsed.toFixed(1)} s</span>
                </div>
                <div className="flex justify-between">
                  <span>Current COA</span>
                  <span className="text-purple-400">
                    {strategies.find((s) => s.approach === currentStrategy)?.name}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>COAs Explored</span>
                  <span>{exploredCOAs}</span>
                </div>
                <div className="flex justify-between">
                  <span>Best COAs</span>
                  <span className="text-green-400">{bestCOAs.length}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ORION_TX;
