import React, { useMemo, useState, useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { useGameStore } from '../store';
import { motion } from 'motion/react';
import { ChevronDown, ChevronUp } from 'lucide-react';

export function CombatStats() {
  const combatDamageHistory = useGameStore(state => state.combatDamageHistory || []);
  const [now, setNow] = useState(Date.now());
  const [isMinimized, setIsMinimized] = useState(false);

  // Force tick every 500ms to scroll the chart in real-time
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 500);
    return () => clearInterval(timer);
  }, []);

  // Compute 30 individual 1-second bins for the last 30 seconds
  const data = useMemo(() => {
    return Array.from({ length: 30 }, (_, i) => {
      // Each bin represents 1 second
      const binStart = now - (30 - i) * 1000;
      const binEnd = binStart + 1000;

      const eventsInBin = combatDamageHistory.filter(
        e => e.timestamp >= binStart && e.timestamp < binEnd
      );

      const dealt = eventsInBin.reduce((sum, e) => sum + e.dealt, 0);
      const received = eventsInBin.reduce((sum, e) => sum + e.received, 0);

      return {
        index: i,
        time: new Date(binStart),
        dealt,
        received
      };
    });
  }, [combatDamageHistory, now]);

  // Aggregate totals over the last 30s window
  const totalDealt = useMemo(() => {
    const windowStart = now - 30000;
    return combatDamageHistory
      .filter(e => e.timestamp >= windowStart)
      .reduce((sum, e) => sum + e.dealt, 0);
  }, [combatDamageHistory, now]);

  const totalReceived = useMemo(() => {
    const windowStart = now - 30000;
    return combatDamageHistory
      .filter(e => e.timestamp >= windowStart)
      .reduce((sum, e) => sum + e.received, 0);
  }, [combatDamageHistory, now]);

  // Chart dimensions
  const width = 280;
  const height = 110;
  const padding = { top: 12, right: 12, bottom: 20, left: 24 };

  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  // Scales
  const xScale = useMemo(() => {
    return d3.scaleLinear()
      .domain([0, 29])
      .range([0, chartWidth]);
  }, [chartWidth]);

  const yScale = useMemo(() => {
    const maxVal = d3.max(data, d => Math.max(d.dealt, d.received)) || 0;
    // Keep a reasonable minimum scale ceiling so the chart has visual structure even when idle
    const ceiling = Math.max(15, maxVal * 1.15);
    return d3.scaleLinear()
      .domain([0, ceiling])
      .range([chartHeight, 0]);
  }, [data, chartHeight]);

  // D3 Generators
  const dealtLineGen = useMemo(() => {
    return d3.line<typeof data[0]>()
      .x(d => xScale(d.index))
      .y(d => yScale(d.dealt))
      .curve(d3.curveMonotoneX);
  }, [xScale, yScale]);

  const receivedLineGen = useMemo(() => {
    return d3.line<typeof data[0]>()
      .x(d => xScale(d.index))
      .y(d => yScale(d.received))
      .curve(d3.curveMonotoneX);
  }, [xScale, yScale]);

  const dealtAreaGen = useMemo(() => {
    return d3.area<typeof data[0]>()
      .x(d => xScale(d.index))
      .y0(chartHeight)
      .y1(d => yScale(d.dealt))
      .curve(d3.curveMonotoneX);
  }, [xScale, yScale, chartHeight]);

  const receivedAreaGen = useMemo(() => {
    return d3.area<typeof data[0]>()
      .x(d => xScale(d.index))
      .y0(chartHeight)
      .y1(d => yScale(d.received))
      .curve(d3.curveMonotoneX);
  }, [xScale, yScale, chartHeight]);

  // SVG Paths
  const dealtLinePath = useMemo(() => dealtLineGen(data) || '', [dealtLineGen, data]);
  const receivedLinePath = useMemo(() => receivedLineGen(data) || '', [receivedLineGen, data]);
  const dealtAreaPath = useMemo(() => dealtAreaGen(data) || '', [dealtAreaGen, data]);
  const receivedAreaPath = useMemo(() => receivedAreaGen(data) || '', [receivedAreaGen, data]);

  // Generate vertical grid lines
  const gridLinesX = useMemo(() => {
    return [5, 10, 15, 20, 25];
  }, []);

  // Generate horizontal ticks
  const gridLinesY = useMemo(() => {
    const ticks = yScale.ticks(4);
    return ticks.length > 0 ? ticks : [0, 5, 10, 15];
  }, [yScale]);

  return (
    <motion.div
      id="combat-stats-panel"
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="bg-black/85 backdrop-blur-md rounded-xl border border-cyan-500/30 p-3 w-[300px] shadow-2xl flex flex-col gap-2 font-mono"
      style={{
        boxShadow: '0 0 20px rgba(6, 182, 212, 0.15)',
        pointerEvents: 'auto'
      }}
    >
      {/* Title block */}
      <div className="flex items-center justify-between">
        <div className="flex flex-col">
          <span className="text-[9px] text-zinc-500 tracking-[0.15em] font-bold uppercase">TACTICAL ANALYSIS</span>
          <span className="text-xs font-black text-cyan-400 tracking-wider">COMBAT STATS (30S FEED)</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            id="combat-stats-minimize-btn"
            onClick={() => setIsMinimized(!isMinimized)}
            className="p-1 rounded hover:bg-zinc-800 text-cyan-400 transition-colors cursor-pointer"
            title={isMinimized ? "Expand Stats" : "Minimize Stats"}
          >
            {isMinimized ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </button>
          <div className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[9px] text-emerald-400 font-bold">LIVE</span>
          </div>
        </div>
      </div>

      {/* Collapsible Content wrapper (stays in DOM) */}
      <div
        id="combat-stats-collapsible-content"
        className="flex flex-col gap-2 transition-all duration-300 ease-in-out origin-top overflow-hidden"
        style={{
          maxHeight: isMinimized ? '0px' : '220px',
          opacity: isMinimized ? 0 : 1,
          marginTop: isMinimized ? '0px' : '4px',
          pointerEvents: isMinimized ? 'none' : 'auto'
        }}
      >
        <div className="h-[1px] w-full bg-zinc-800/80" />

        {/* SVG D3 line chart */}
        <div className="relative w-full h-[110px]">
          <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
            <defs>
              {/* Gradients for glow fills */}
              <linearGradient id="dealtGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="rgb(34, 211, 238)" stopOpacity="0.35" />
                <stop offset="100%" stopColor="rgb(34, 211, 238)" stopOpacity="0.0" />
              </linearGradient>
              <linearGradient id="receivedGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="rgb(244, 63, 94)" stopOpacity="0.35" />
                <stop offset="100%" stopColor="rgb(244, 63, 94)" stopOpacity="0.0" />
              </linearGradient>
            </defs>

            <g transform={`translate(${padding.left}, ${padding.top})`}>
              {/* Vertical grid lines */}
              {gridLinesX.map((xVal, index) => (
                <line
                  key={`grid-x-${index}`}
                  x1={xScale(xVal)}
                  y1={0}
                  x2={xScale(xVal)}
                  y2={chartHeight}
                  stroke="rgba(63, 63, 70, 0.25)"
                  strokeDasharray="2,2"
                />
              ))}

              {/* Horizontal grid lines */}
              {gridLinesY.map((yVal, index) => (
                <g key={`grid-y-${index}`}>
                  <line
                    x1={0}
                    y1={yScale(yVal)}
                    x2={chartWidth}
                    y2={yScale(yVal)}
                    stroke="rgba(63, 63, 70, 0.25)"
                    strokeDasharray="2,2"
                  />
                  <text
                    x={-6}
                    y={yScale(yVal) + 3}
                    textAnchor="end"
                    fill="rgba(161, 161, 170, 0.6)"
                    fontSize="7px"
                    fontFamily="monospace"
                  >
                    {Math.round(yVal)}
                  </text>
                </g>
              ))}

              {/* Area Fills under lines */}
              <path d={dealtAreaPath} fill="url(#dealtGrad)" className="transition-all duration-300" />
              <path d={receivedAreaPath} fill="url(#receivedGrad)" className="transition-all duration-300" />

              {/* Line Paths */}
              <path
                d={dealtLinePath}
                fill="none"
                stroke="rgb(34, 211, 238)"
                strokeWidth="2"
                strokeLinecap="round"
                className="transition-all duration-300"
              />
              <path
                d={receivedLinePath}
                fill="none"
                stroke="rgb(244, 63, 94)"
                strokeWidth="2"
                strokeLinecap="round"
                className="transition-all duration-300"
              />

              {/* Bottom time ticks (-30s, -15s, Now) */}
              <line x1={0} y1={chartHeight} x2={chartWidth} y2={chartHeight} stroke="rgba(63, 63, 70, 0.4)" />
              <text x={0} y={chartHeight + 12} textAnchor="start" fill="rgba(161, 161, 170, 0.5)" fontSize="7px">
                -30S
              </text>
              <text x={chartWidth / 2} y={chartHeight + 12} textAnchor="middle" fill="rgba(161, 161, 170, 0.5)" fontSize="7px">
                -15S
              </text>
              <text x={chartWidth} y={chartHeight + 12} textAnchor="end" fill="rgba(161, 161, 170, 0.5)" fontSize="7px">
                NOW
              </text>
            </g>
          </svg>
        </div>

        <div className="h-[1px] w-full bg-zinc-800/80" />

        {/* Numerical aggregates */}
        <div className="grid grid-cols-2 gap-2 text-[10px] tracking-wider mt-0.5">
          <div className="flex flex-col bg-zinc-950/60 p-1.5 rounded border border-cyan-500/15">
            <span className="text-zinc-500 font-bold uppercase text-[8px]">TOTAL DEALT</span>
            <span className="text-cyan-400 font-black text-xs mt-0.5">{totalDealt.toFixed(1)} HP</span>
          </div>
          <div className="flex flex-col bg-zinc-950/60 p-1.5 rounded border border-rose-500/15">
            <span className="text-zinc-500 font-bold uppercase text-[8px]">TOTAL RECEIVED</span>
            <span className="text-rose-500 font-black text-xs mt-0.5">{totalReceived.toFixed(1)} HP</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
