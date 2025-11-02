import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Play, Pause, RotateCcw, Target, Shield, Package, Eye, Users, TrendingUp, AlertTriangle, Clock, Map, Award, Settings } from 'lucide-react';

// Configuration constants
const SIMULATION_CONFIG = {
  GRID_SIZE: 400,
  NUM_THEATERS: 4,
  UPDATE_INTERVAL: 50,
  STRATEGY_SWITCH_TIME: { min: 3, max: 5 },
  ENGAGEMENT_DISTANCE: 35,
  HIT_DAMAGE: 2,
  BASE_SUCCESS_PROBABILITY: 50
};

// Custom hook for simulation logic
const useSimulation = (mode, policy, logistics, currentStrategy) => {
  const [theaters, setTheaters] = useState([]);
  const [agents, setAgents] = useState([]);

  const initializeMode = useCallback((selectedMode) => {
    if (selectedMode === 'multi-theater') {
      initMultiTheater();
    } else {
      initStandardMode();
    }
  }, []);

  const initMultiTheater = useCallback(() => {
    const newTheaters = [];
    for (let t = 0; t < SIMULATION_CONFIG.NUM_THEATERS; t++) {
      const theaterAgents = [];
      const numAgents = 8 + Math.floor(Math.random() * 5);
      const numTargets = 2 + Math.floor(Math.random() * 3);
      
      for (let i = 0; i < numAgents; i++) {
        theaterAgents.push({
          id: `t${t}-b${i}`,
          x: Math.random() * SIMULATION_CONFIG.GRID_SIZE * 0.25,
          y: Math.random() * SIMULATION_CONFIG.GRID_SIZE,
          vx: 0,
          vy: 0,
          team: 'blue',
          active: true,
          fuel: 100,
          ammo: 100
        });
      }
      
      for (let i = 0; i < numTargets; i++) {
        theaterAgents.push({
          id: `t${t}-r${i}`,
          x: SIMULATION_CONFIG.GRID_SIZE * 0.7 + Math.random() * SIMULATION_CONFIG.GRID_SIZE * 0.25,
          y: Math.random() * SIMULATION_CONFIG.GRID_SIZE,
          team: 'red',
          health: 100
        });
      }
      
      newTheaters.push({
        id: t,
        name: ['Northern Front', 'Eastern Sector', 'Southern Theater', 'Western Zone'][t],
        agents: theaterAgents,
        priority: Math.random()
      });
    }
    
    setTheaters(newTheaters);
  }, []);

  const initStandardMode = useCallback(() => {
    const newAgents = [];
    
    for (let i = 0; i < 20; i++) {
      newAgents.push({
        id: `b${i}`,
        x: Math.random() * SIMULATION_CONFIG.GRID_SIZE * 0.3,
        y: Math.random() * SIMULATION_CONFIG.GRID_SIZE,
        vx: 0,
        vy: 0,
        team: 'blue',
        active: true
      });
    }
    
    for (let i = 0; i < 6; i++) {
      newAgents.push({
        id: `r${i}`,
        x: SIMULATION_CONFIG.GRID_SIZE * 0.7 + Math.random() * SIMULATION_CONFIG.GRID_SIZE * 0.2,
        y: Math.random() * SIMULATION_CONFIG.GRID_SIZE,
        team: 'red',
        health: 100
      });
    }
    
    setAgents(newAgents);
  }, []);

  const findNearest = useCallback((agent, targets) => {
    if (targets.length === 0) return null;
    
    let nearest = targets[0];
    let minDistance = Infinity;

    for (const target of targets) {
      const distance = Math.sqrt(
        Math.pow(target.x - agent.x, 2) + 
        Math.pow(target.y - agent.y, 2)
      );
      if (distance < minDistance) {
        minDistance = distance;
        nearest = target;
      }
    }
    
    return nearest;
  }, []);

  const updateMultiTheater = useCallback(() => {
    setTheaters(prevTheaters => {
      return prevTheaters.map(theater => {
        const updatedAgents = theater.agents.map(agent => {
          if (agent.team === 'blue' && agent.active) {
            const redTargets = theater.agents.filter(a => a.team === 'red' && a.health > 0);
            const nearest = findNearest(agent, redTargets);
            
            if (!nearest) return agent;

            const behavior = getStrategyBehavior(agent, nearest, currentStrategy);
            
            let aggressionMod = 1;
            if (policy.roe === 'defensive') aggressionMod = 0.5;
            if (policy.roe === 'aggressive') aggressionMod = 1.5;
            
            const newVx = behavior.vx * aggressionMod;
            const newVy = behavior.vy * aggressionMod;
            const transportMod = logistics.transportCapacity / 100;
            
            let newX = agent.x + newVx * transportMod;
            let newY = agent.y + newVy * transportMod;
            
            // Boundary checking
            newX = Math.max(0, Math.min(SIMULATION_CONFIG.GRID_SIZE, newX));
            newY = Math.max(0, Math.min(SIMULATION_CONFIG.GRID_SIZE, newY));
            
            return {
              ...agent,
              vx: newVx,
              vy: newVy,
              x: newX,
              y: newY
            };
          }
          return agent;
        });

        // Handle red agent damage
        const finalAgents = updatedAgents.map(agent => {
          if (agent.team === 'red' && agent.health > 0) {
            const blueAgents = updatedAgents.filter(a => a.team === 'blue' && a.active);
            let totalDamage = 0;
            
            for (const blueAgent of blueAgents) {
              const distance = Math.sqrt(
                Math.pow(blueAgent.x - agent.x, 2) + 
                Math.pow(blueAgent.y - agent.y, 2)
              );
              
              if (distance < SIMULATION_CONFIG.ENGAGEMENT_DISTANCE) {
                const hitChance = logistics.commsReliability / 100;
                if (Math.random() < hitChance) {
                  let damage = SIMULATION_CONFIG.HIT_DAMAGE;
                  if (policy.roe === 'defensive') damage *= 0.5;
                  if (policy.roe === 'aggressive') damage *= 1.5;
                  totalDamage += damage;
                }
              }
            }
            
            if (totalDamage > 0) {
              return {
                ...agent,
                health: Math.max(0, agent.health - totalDamage)
              };
            }
          }
          return agent;
        });

        return { ...theater, agents: finalAgents };
      });
    });
  }, [currentStrategy, policy.roe, logistics.transportCapacity, logistics.commsReliability, findNearest]);

  const updateStandardMode = useCallback(() => {
    setAgents(prevAgents => {
      let updatedAgents = prevAgents.map(agent => {
        if (agent.team === 'blue' && agent.active) {
          const redTargets = prevAgents.filter(a => a.team === 'red' && a.health > 0);
          const nearest = findNearest(agent, redTargets);
          
          if (!nearest) return agent;

          const behavior = getStrategyBehavior(agent, nearest, currentStrategy);
          
          let newX = agent.x + behavior.vx;
          let newY = agent.y + behavior.vy;
          
          // Boundary checking
          newX = Math.max(0, Math.min(SIMULATION_CONFIG.GRID_SIZE, newX));
          newY = Math.max(0, Math.min(SIMULATION_CONFIG.GRID_SIZE, newY));
          
          return {
            ...agent,
            vx: behavior.vx,
            vy: behavior.vy,
            x: newX,
            y: newY
          };
        }
        return agent;
      });

      // Handle red agent damage
      updatedAgents = updatedAgents.map(agent => {
        if (agent.team === 'red' && agent.health > 0) {
          const blueAgents = updatedAgents.filter(a => a.team === 'blue' && a.active);
          let totalDamage = 0;
          
          for (const blueAgent of blueAgents) {
            const distance = Math.sqrt(
              Math.pow(blueAgent.x - agent.x, 2) + 
              Math.pow(blueAgent.y - agent.y, 2)
            );
            
            if (distance < SIMULATION_CONFIG.ENGAGEMENT_DISTANCE) {
              totalDamage += SIMULATION_CONFIG.HIT_DAMAGE;
            }
          }
          
          if (totalDamage > 0) {
            return {
              ...agent,
              health: Math.max(0, agent.health - totalDamage)
            };
          }
        }
        return agent;
      });

      return updatedAgents;
    });
  }, [currentStrategy, findNearest]);

  return {
    theaters,
    agents,
    initializeMode,
    updateMultiTheater,
    updateStandardMode
  };
};

// Custom hook for strategy evaluation
const useStrategyEvaluation = () => {
  const [exploredCOAs, setExploredCOAs] = useState(0);
  const [bestCOAs, setBestCOAs] = useState([]);

  const evaluateCurrentStrategy = useCallback((currentStrategy, strategies, mode, theaters, agents, policy, logistics, timeElapsed) => {
    const allAgents = mode === 'multi-theater' 
      ? theaters.flatMap(t => t.agents)
      : agents;
    
    const blueAgents = allAgents.filter(a => a.team === 'blue' && a.active);
    const redTargets = allAgents.filter(a => a.team === 'red' && a.health > 0);
    
    if (blueAgents.length === 0) return;
    
    let totalDistance = 0;
    let validAgents = 0;
    
    for (const agent of blueAgents) {
      const nearest = findNearest(agent, redTargets);
      if (nearest) {
        totalDistance += Math.sqrt(
          Math.pow(nearest.x - agent.x, 2) + 
          Math.pow(nearest.y - agent.y, 2)
        );
        validAgents++;
      }
    }
    
    if (validAgents === 0) return;
    
    const avgDistToTarget = totalDistance / validAgents;
    const proximityScore = Math.max(0, 100 - avgDistToTarget / 5);
    const policyBonus = policy.forceLevel / 100 * 20;
    const logisticsBonus = logistics.commsReliability / 100 * 15;
    
    const totalScore = Math.floor(
      (proximityScore * 0.6 + policyBonus + logisticsBonus) * 
      (Math.random() * 0.3 + 0.85)
    );
    
    const strategyObj = strategies.find(s => s.approach === currentStrategy);
    const strategyName = strategyObj ? strategyObj.name : 'Unknown';
    
    setBestCOAs(prev => {
      const newCOA = {
        id: Date.now(), // Use timestamp for unique ID
        name: `COA-${exploredCOAs}`,
        strategy: strategyName,
        score: Math.min(100, Math.max(0, totalScore)),
        time: timeElapsed.toFixed(1)
      };
      
      const updated = [...prev, newCOA]
        .sort((a, b) => b.score - a.score)
        .slice(0, 10);
      
      return updated;
    });
    
    setExploredCOAs(prev => prev + 1);
  }, [exploredCOAs]);

  const resetEvaluation = useCallback(() => {
    setExploredCOAs(0);
    setBestCOAs([]);
  }, []);

  return {
    exploredCOAs,
    bestCOAs,
    evaluateCurrentStrategy,
    resetEvaluation
  };
};

// Strategy behavior function (moved outside for pure function)
const getStrategyBehavior = (agent, nearest, strategyApproach, timeElapsed = 0) => {
  if (!nearest) return { vx: 0, vy: 0 };
  
  const dx = nearest.x - agent.x;
  const dy = nearest.y - agent.y;
  const baseAngle = Math.atan2(dy, dx);
  const dist = Math.sqrt(dx * dx + dy * dy);
  const agentNum = parseInt(agent.id.match(/\d+/)?.[0] || 0);
  
  const strategies = [
    { name: 'Direct Assault', approach: 'direct', speed: 2.5, coordination: 0.3 },
    { name: 'Flanking Maneuver', approach: 'flank', speed: 2, coordination: 0.7 },
    { name: 'Pincer Movement', approach: 'pincer', speed: 2, coordination: 0.9 },
    { name: 'Dispersed Engagement', approach: 'dispersed', speed: 1.8, coordination: 0.2 },
    { name: 'Concentrated Strike', approach: 'concentrated', speed: 3, coordination: 0.8 },
    { name: 'Hit and Run', approach: 'hitrun', speed: 3.5, coordination: 0.4 }
  ];
  
  const strategyConfig = strategies.find(s => s.approach === strategyApproach) || strategies[0];
  let angle = baseAngle;
  let speedMod = strategyConfig.speed;
  
  switch(strategyApproach) {
    case 'direct':
      angle = baseAngle;
      break;
    case 'flank':
      angle = baseAngle + (agentNum % 2 === 0 ? Math.PI / 3 : -Math.PI / 3);
      break;
    case 'pincer':
      angle = baseAngle + (agentNum % 2 === 0 ? Math.PI / 2.5 : -Math.PI / 2.5);
      break;
    case 'dispersed':
      angle = baseAngle + (Math.random() - 0.5) * Math.PI / 2;
      break;
    case 'concentrated':
      angle = baseAngle + Math.sin(timeElapsed + agentNum) * 0.3;
      break;
    case 'hitrun':
      if (dist < 80) {
        angle = baseAngle + Math.PI;
        speedMod *= 1.5;
      }
      break;
    default:
      angle = baseAngle;
  }
  
  return {
    vx: Math.cos(angle) * speedMod,
    vy: Math.sin(angle) * speedMod
  };
};

// Helper function for findNearest
const findNearest = (agent, targets) => {
  if (targets.length === 0) return null;
  
  let nearest = targets[0];
  let minDistance = Infinity;

  for (const target of targets) {
    const distance = Math.sqrt(
      Math.pow(target.x - agent.x, 2) + 
      Math.pow(target.y - agent.y, 2)
    );
    if (distance < minDistance) {
      minDistance = distance;
      nearest = target;
    }
  }
  
  return nearest;
};

const SCEPTERComplete = () => {
  const [mode, setMode] = useState('multi-theater');
  const [isRunning, setIsRunning] = useState(false);
  const [speed, setSpeed] = useState(50);
  const [timeElapsed, setTimeElapsed] = useState(0);
  const [currentStrategy, setCurrentStrategy] = useState('direct');
  const [strategyTimer, setStrategyTimer] = useState(0);
  
  const [policy, setPolicy] = useState({
    forceLevel: 100,
    roe: 'standard',
    commanderIntent: 'balanced',
    riskTolerance: 50
  });
  
  const [logistics, setLogistics] = useState({
    supplyRate: 100,
    maintenanceLevel: 100,
    commsReliability: 100,
    transportCapacity: 100
  });
  
  const [missionMetrics, setMissionMetrics] = useState({
    successProbability: 75,
    predictedCasualties: 0,
    timeToObjective: 0,
    resourceConsumption: 0,
    coverageGaps: []
  });
  const lastFrameTime = useRef(performance.now());

  
  // Use custom hooks
  const {
    theaters,
    agents,
    initializeMode,
    updateMultiTheater,
    updateStandardMode
  } = useSimulation(mode, policy, logistics, currentStrategy);
  
  const {
    exploredCOAs,
    bestCOAs,
    evaluateCurrentStrategy,
    resetEvaluation
  } = useStrategyEvaluation();
  
  const canvasRefs = useRef([]);

  // Memoized strategies
  const strategies = useMemo(() => [
    { name: 'Direct Assault', approach: 'direct', speed: 2.5, coordination: 0.3 },
    { name: 'Flanking Maneuver', approach: 'flank', speed: 2, coordination: 0.7 },
    { name: 'Pincer Movement', approach: 'pincer', speed: 2, coordination: 0.9 },
    { name: 'Dispersed Engagement', approach: 'dispersed', speed: 1.8, coordination: 0.2 },
    { name: 'Concentrated Strike', approach: 'concentrated', speed: 3, coordination: 0.8 },
    { name: 'Hit and Run', approach: 'hitrun', speed: 3.5, coordination: 0.4 }
  ], []);

  // Initialize canvas refs
  useEffect(() => {
    canvasRefs.current = canvasRefs.current.slice(0, SIMULATION_CONFIG.NUM_THEATERS);
  }, []);

  // Mode initialization
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

  // Main simulation loop
  useEffect(() => {
    if (!isRunning) return;
    
    const interval = setInterval(() => {
      setTimeElapsed(t => t + 0.1);
      setStrategyTimer(st => st + 0.1);
      
      // Strategy switching logic
      if (strategyTimer > SIMULATION_CONFIG.STRATEGY_SWITCH_TIME.min + 
          Math.random() * (SIMULATION_CONFIG.STRATEGY_SWITCH_TIME.max - SIMULATION_CONFIG.STRATEGY_SWITCH_TIME.min)) {
        const newStrategy = strategies[Math.floor(Math.random() * strategies.length)];
        setCurrentStrategy(newStrategy.approach);
        setStrategyTimer(0);
        evaluateCurrentStrategy(
          newStrategy.approach, 
          strategies, 
          mode, 
          theaters, 
          agents, 
          policy, 
          logistics, 
          timeElapsed
        );
      }
      
      // Update simulation based on mode
      if (mode === 'multi-theater') {
        updateMultiTheater();
      } else {
        updateStandardMode();
      }
      
      // Update mission metrics
      updateMissionMetrics();
      
    }, SIMULATION_CONFIG.UPDATE_INTERVAL);
    
    return () => clearInterval(interval);
  }, [
    isRunning, 
    mode, 
    strategyTimer, 
    currentStrategy, 
    strategies, 
    theaters, 
    agents, 
    policy, 
    logistics, 
    evaluateCurrentStrategy, 
    updateMultiTheater, 
    updateStandardMode
  ]);

  const updateMissionMetrics = useCallback(() => {
    const allAgents = mode === 'multi-theater' 
      ? theaters.flatMap(t => t.agents)
      : agents;
    
    const activeBlue = allAgents.filter(a => a.team === 'blue' && a.active).length;
    const activeRed = allAgents.filter(a => a.team === 'red' && a.health > 0).length;
    
    const forceRatio = activeBlue / Math.max(activeRed, 1);
    const policyMod = policy.forceLevel / 100;
    const logisticsMod = (logistics.supplyRate + logistics.commsReliability) / 200;
    
    let baseProb = SIMULATION_CONFIG.BASE_SUCCESS_PROBABILITY + (forceRatio - 1) * 30;
    baseProb *= policyMod * logisticsMod;
    
    if (policy.roe === 'defensive') baseProb *= 0.8;
    if (policy.roe === 'aggressive') baseProb *= 1.2;
    
    setMissionMetrics({
      successProbability: Math.min(100, Math.max(0, baseProb)),
      predictedCasualties: Math.floor(activeBlue * (1 - policyMod) * 0.3),
      timeToObjective: Math.floor(100 / (logisticsMod * 2)),
      resourceConsumption: Math.floor(100 - logistics.supplyRate),
      coverageGaps: policy.forceLevel < 80 ? ['Sector B', 'Eastern Flank'] : []
    });
  }, [mode, theaters, agents, policy, logistics]);

  // Canvas rendering
  useEffect(() => {
    const renderCanvas = (canvas, theaterData) => {
      if (!canvas) return;
      
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, SIMULATION_CONFIG.GRID_SIZE, SIMULATION_CONFIG.GRID_SIZE);
      
      // Draw background
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, SIMULATION_CONFIG.GRID_SIZE, SIMULATION_CONFIG.GRID_SIZE);
      
      // Draw grid
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 1;
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
      
      const agentsToDraw = mode === 'multi-theater' ? theaterData.agents : agents;
      
      // Draw agents
      agentsToDraw.forEach(agent => {
        if (agent.team === 'blue' && agent.active) {
          ctx.fillStyle = '#3b82f6';
          ctx.beginPath();
          ctx.arc(agent.x, agent.y, 5, 0, Math.PI * 2);
          ctx.fill();
          
          // Draw velocity vector
          if (agent.vx || agent.vy) {
            ctx.strokeStyle = '#60a5fa';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(agent.x, agent.y);
            ctx.lineTo(agent.x + (agent.vx || 0) * 3, agent.y + (agent.vy || 0) * 3);
            ctx.stroke();
          }
        } else if (agent.team === 'red' && agent.health > 0) {
          ctx.fillStyle = '#ef4444';
          ctx.strokeStyle = '#dc2626';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(agent.x, agent.y, 8, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          
          // Draw health bar
          ctx.fillStyle = '#22c55e';
          ctx.fillRect(agent.x - 8, agent.y - 15, (agent.health / 100) * 16, 2);
        }
      });
    };
    
    if (mode === 'multi-theater') {
      theaters.forEach((theater, idx) => {
        const canvas = canvasRefs.current[idx];
        renderCanvas(canvas, theater);
      });
    } else {
      const canvas = canvasRefs.current[0];
      renderCanvas(canvas, { agents });
    }
  }, [agents, theaters, mode]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white p-4">
      <div className="max-w-[1900px] mx-auto">
        <div className="mb-4">
          <h1 className="text-3xl font-bold mb-2 bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
            SCEPTER Strategy Exploration Engine
          </h1>
          <p className="text-slate-400 text-sm">Continuous COA Discovery with Policy & Logistics Modeling</p>
        </div>

        <div className="grid grid-cols-6 gap-2 mb-4">
          {[
            { id: 'multi-theater', name: 'Multi-Theater', icon: Map },
            { id: 'standard', name: 'Standard', icon: Target },
            { id: 'resources', name: 'Resources', icon: Package },
            { id: 'fog-of-war', name: 'Fog of War', icon: Eye },
            { id: 'campaign', name: 'Campaign', icon: Award },
            { id: 'human-vs-ai', name: 'Human vs AI', icon: Users }
          ].map(m => {
            const Icon = m.icon;
            return (
              <button
                key={m.id}
                onClick={() => setMode(m.id)}
                className={`p-3 rounded-lg border transition ${
                  mode === m.id
                    ? 'bg-blue-600 border-blue-500'
                    : 'bg-slate-800 border-slate-700 hover:border-slate-600'
                }`}
              >
                <Icon size={20} className="mx-auto mb-1" />
                <div className="text-xs">{m.name}</div>
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="bg-slate-800 rounded-lg p-3 border border-slate-700">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Settings size={16} />
              Policy & Intent
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Force Level</label>
                <input
                  type="range"
                  min="20"
                  max="100"
                  value={policy.forceLevel}
                  onChange={(e) => setPolicy({...policy, forceLevel: Number(e.target.value)})}
                  className="w-full"
                />
                <div className="text-xs text-center mt-1">{policy.forceLevel}%</div>
              </div>
              
              <div>
                <label className="text-xs text-slate-400 block mb-1">Risk Tolerance</label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={policy.riskTolerance}
                  onChange={(e) => setPolicy({...policy, riskTolerance: Number(e.target.value)})}
                  className="w-full"
                />
                <div className="text-xs text-center mt-1">{policy.riskTolerance}%</div>
              </div>
              
              <div>
                <label className="text-xs text-slate-400 block mb-1">ROE</label>
                <select
                  value={policy.roe}
                  onChange={(e) => setPolicy({...policy, roe: e.target.value})}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs"
                >
                  <option value="defensive">Defensive</option>
                  <option value="standard">Standard</option>
                  <option value="aggressive">Aggressive</option>
                </select>
              </div>
              
              <div>
                <label className="text-xs text-slate-400 block mb-1">Commander Intent</label>
                <select
                  value={policy.commanderIntent}
                  onChange={(e) => setPolicy({...policy, commanderIntent: e.target.value})}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs"
                >
                  <option value="defensive">Defensive</option>
                  <option value="balanced">Balanced</option>
                  <option value="offensive">Offensive</option>
                </select>
              </div>
            </div>
          </div>
          
          <div className="bg-slate-800 rounded-lg p-3 border border-slate-700">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Package size={16} />
              Logistics Status
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Supply Rate</label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={logistics.supplyRate}
                  onChange={(e) => setLogistics({...logistics, supplyRate: Number(e.target.value)})}
                  className="w-full"
                />
                <div className="text-xs text-center mt-1">{logistics.supplyRate}%</div>
              </div>
              
              <div>
                <label className="text-xs text-slate-400 block mb-1">Maintenance</label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={logistics.maintenanceLevel}
                  onChange={(e) => setLogistics({...logistics, maintenanceLevel: Number(e.target.value)})}
                  className="w-full"
                />
                <div className="text-xs text-center mt-1">{logistics.maintenanceLevel}%</div>
              </div>
              
              <div>
                <label className="text-xs text-slate-400 block mb-1">Comms Reliability</label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={logistics.commsReliability}
                  onChange={(e) => setLogistics({...logistics, commsReliability: Number(e.target.value)})}
                  className="w-full"
                />
                <div className="text-xs text-center mt-1">{logistics.commsReliability}%</div>
              </div>
              
              <div>
                <label className="text-xs text-slate-400 block mb-1">Transport Capacity</label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={logistics.transportCapacity}
                  onChange={(e) => setLogistics({...logistics, transportCapacity: Number(e.target.value)})}
                  className="w-full"
                />
                <div className="text-xs text-center mt-1">{logistics.transportCapacity}%</div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-r from-slate-800 to-slate-700 rounded-lg p-4 border border-slate-600 mb-4">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <TrendingUp size={16} />
            Mission Impact Analytics
          </h3>
          <div className="grid grid-cols-5 gap-3">
            <div className="text-center">
              <div className="text-xs text-slate-400 mb-1">Success Probability</div>
              <div className="text-2xl font-bold text-green-400">{Math.floor(missionMetrics.successProbability)}%</div>
              <div className="h-2 bg-slate-900 rounded mt-2 overflow-hidden">
                <div 
                  className="h-full bg-green-500 transition-all"
                  style={{width: `${missionMetrics.successProbability}%`}}
                />
              </div>
            </div>
            
            <div className="text-center">
              <div className="text-xs text-slate-400 mb-1">Predicted Casualties</div>
              <div className="text-2xl font-bold text-red-400">{missionMetrics.predictedCasualties}</div>
            </div>
            
            <div className="text-center">
              <div className="text-xs text-slate-400 mb-1">Time to Objective</div>
              <div className="text-2xl font-bold text-blue-400">{missionMetrics.timeToObjective}s</div>
            </div>
            
            <div className="text-center">
              <div className="text-xs text-slate-400 mb-1">Resource Use</div>
              <div className="text-2xl font-bold text-yellow-400">{missionMetrics.resourceConsumption}%</div>
            </div>
            
            <div className="text-center">
              <div className="text-xs text-slate-400 mb-1">Coverage Gaps</div>
              <div className="text-sm font-bold text-orange-400">
                {missionMetrics.coverageGaps.length > 0 
                  ? missionMetrics.coverageGaps.join(', ')
                  : 'None'}
              </div>
            </div>
          </div>
          
          {policy.forceLevel < 80 && (
            <div className="mt-3 p-2 bg-orange-900/30 border border-orange-700 rounded text-xs flex items-center gap-2">
              <AlertTriangle size={14} className="text-orange-400" />
              <span>Force reduction detected: {missionMetrics.coverageGaps.join(', ')} vulnerable</span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-4 gap-4">
          <div className="col-span-3">
            {mode === 'multi-theater' ? (
              <div className="grid grid-cols-2 gap-3">
                {theaters.map((theater, idx) => (
                  <div key={theater.id} className="bg-slate-800 rounded-lg p-3 border border-slate-700">
                    <div className="flex justify-between items-center mb-2">
                      <h3 className="text-sm font-semibold">{theater.name}</h3>
                      <div className="flex gap-2 text-xs">
                        <span className="bg-blue-900 px-2 py-1 rounded">
                          {theater.agents.filter(a => a.team === 'blue' && a.active).length} Blue
                        </span>
                        <span className="bg-red-900 px-2 py-1 rounded">
                          {theater.agents.filter(a => a.team === 'red' && a.health > 0).length} Red
                        </span>
                      </div>
                    </div>
                    <canvas
                      ref={el => canvasRefs.current[idx] = el}
                      width={SIMULATION_CONFIG.GRID_SIZE}
                      height={SIMULATION_CONFIG.GRID_SIZE}
                      className="w-full bg-slate-900 rounded border border-slate-700"
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
                <div className="flex justify-between items-center mb-3">
                  <h3 className="text-lg font-semibold">Simulation</h3>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setIsRunning(!isRunning)}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg flex items-center gap-2"
                    >
                      {isRunning ? <Pause size={16} /> : <Play size={16} />}
                      {isRunning ? 'Pause' : 'Start'}
                    </button>
                    <button
                      onClick={() => handleInitializeMode(mode)}
                      className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg"
                    >
                      <RotateCcw size={16} />
                    </button>
                  </div>
                </div>
                
                <canvas
                  ref={el => canvasRefs.current[0] = el}
                  width={SIMULATION_CONFIG.GRID_SIZE}
                  height={SIMULATION_CONFIG.GRID_SIZE}
                  className="w-full bg-slate-900 rounded border border-slate-700"
                />
              </div>
            )}
          </div>

          <div className="space-y-3">
            <div className="bg-slate-800 rounded-lg p-3 border border-slate-700">
              <h3 className="text-sm font-semibold mb-3">Controls</h3>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Speed</label>
                <input
                  type="range"
                  min="10"
                  max="200"
                  value={speed}
                  onChange={(e) => setSpeed(Number(e.target.value))}
                  className="w-full"
                />
                <div className="text-xs text-center mt-1">{(speed * 100).toLocaleString()}x</div>
              </div>
            </div>

            <div className="bg-slate-800 rounded-lg p-3 border border-slate-700">
              <h3 className="text-sm font-semibold mb-3">Statistics</h3>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-400">Current Strategy</span>
                  <span className="font-mono text-purple-400">
                    {strategies.find(s => s.approach === currentStrategy)?.name || 'Exploring'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Time</span>
                  <span className="font-mono">{timeElapsed.toFixed(1)}s</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">COAs Explored</span>
                  <span className="font-mono">{exploredCOAs}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Best Found</span>
                  <span className="font-mono text-green-400">{bestCOAs.length}</span>
                </div>
              </div>
            </div>

            <div className="bg-slate-800 rounded-lg p-3 border border-slate-700">
              <h3 className="text-sm font-semibold mb-2">Top COAs</h3>
              <div className="max-h-64 overflow-y-auto space-y-2">
                {bestCOAs.length === 0 ? (
                  <p className="text-xs text-slate-500">Start simulation to discover strategies...</p>
                ) : (
                  bestCOAs.map((coa, idx) => (
                    <div key={coa.id} className="bg-slate-900 rounded p-2 border border-slate-700">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-mono text-blue-400">{coa.name}</span>
                        <span className="text-xs bg-green-900 text-green-300 px-2 py-0.5 rounded font-bold">
                          {coa.score}
                        </span>
                      </div>
                      <div className="text-xs text-slate-300 font-semibold">{coa.strategy}</div>
                      <div className="text-xs text-slate-500">@{coa.time}s</div>
                      {idx === 0 && (
                        <div className="mt-1 text-xs text-yellow-400">★ Best Strategy</div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SCEPTERComplete;