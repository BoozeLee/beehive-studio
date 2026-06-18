import React, { useMemo, useRef, useEffect, useState } from "react";
import { useProjectStore } from "../../../stores/projectStore";
import { getSendBuses } from "../../../lib/audioMixer";
import type { Track } from "../../../lib/desktopTypes";

const COLORS = {
  bg: "#0f0f12",
  panel: "#18181c",
  border: "#2a2a30",
  accent: "#ff8c42",
  text: "#e0e0e0",
  textMuted: "#888",
  node: "#18181c",
  edge: "#4a4a55",
  send: "#8b5cf6",
  master: "#f59e0b",
};

export const AudioGraph: React.FC = () => {
  const tracks = useProjectStore((s) => s.tracks);
  const buses = getSendBuses();
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const update = () => {
      if (containerRef.current) {
        setSize({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [tracks.length, buses.length]);

  const layout = useMemo(() => {
    const marginX = 24;
    const marginY = 24;
    const nodeWidth = 80;
    const nodeHeight = 28;
    const usableWidth = Math.max(size.width - marginX * 2, 200);
    const usableHeight = Math.max(size.height - marginY * 2, 120);

    const trackY = marginY + 20;
    const effectY = trackY + nodeHeight + 24;
    const sendY = effectY + nodeHeight + 24;
    const masterY = sendY + nodeHeight + 24;

    const trackCount = Math.max(tracks.length, 1);
    const trackSpacing = trackCount > 1 ? (usableWidth - nodeWidth) / (trackCount - 1) : usableWidth / 2;

    const trackNodes = tracks.map((track, i) => ({
      id: track.id,
      x: marginX + i * trackSpacing,
      y: trackY,
      label: track.name,
      color: track.color,
    }));

    const effectNodes = tracks.flatMap((track, i) =>
      (track.effects ?? []).map((effect, j) => ({
        id: `${track.id}-fx-${effect.id}`,
        x: marginX + i * trackSpacing,
        y: effectY + j * (nodeHeight + 8),
        label: effect.type,
        color: COLORS.textMuted,
        parentId: track.id,
      }))
    );

    const sendCount = Math.max(buses.length, 1);
    const sendSpacing = sendCount > 1 ? (usableWidth - nodeWidth) / (sendCount - 1) : usableWidth / 2;
    const sendNodes = buses.map((bus, i) => ({
      id: `send-${bus.id}`,
      x: marginX + i * sendSpacing,
      y: sendY,
      label: bus.name,
      color: COLORS.send,
    }));

    const masterNode = {
      id: "master",
      x: marginX + usableWidth / 2 - nodeWidth / 2,
      y: masterY,
      label: "Master",
      color: COLORS.master,
    };

    const outputNode = {
      id: "output",
      x: masterNode.x,
      y: masterY + nodeHeight + 24,
      label: "Output",
      color: COLORS.accent,
    };

    return { trackNodes, effectNodes, sendNodes, masterNode, outputNode, nodeWidth, nodeHeight };
  }, [tracks, buses, size]);

  const edges = useMemo(() => {
    const lines: Array<{ x1: number; y1: number; x2: number; y2: number; color: string }> = [];
    const { trackNodes, effectNodes, sendNodes, masterNode, outputNode } = layout;

    for (const track of trackNodes) {
      const fx = effectNodes.filter((e) => e.parentId === track.id);
      if (fx.length === 0) {
        lines.push({
          x1: track.x + layout.nodeWidth / 2,
          y1: track.y + layout.nodeHeight,
          x2: masterNode.x + layout.nodeWidth / 2,
          y2: masterNode.y,
          color: COLORS.edge,
        });
      } else {
        lines.push({
          x1: track.x + layout.nodeWidth / 2,
          y1: track.y + layout.nodeHeight,
          x2: fx[0].x + layout.nodeWidth / 2,
          y2: fx[0].y,
          color: COLORS.edge,
        });
        for (let i = 0; i < fx.length - 1; i++) {
          lines.push({
            x1: fx[i].x + layout.nodeWidth / 2,
            y1: fx[i].y + layout.nodeHeight,
            x2: fx[i + 1].x + layout.nodeWidth / 2,
            y2: fx[i + 1].y,
            color: COLORS.edge,
          });
        }
        const last = fx[fx.length - 1];
        lines.push({
          x1: last.x + layout.nodeWidth / 2,
          y1: last.y + layout.nodeHeight,
          x2: masterNode.x + layout.nodeWidth / 2,
          y2: masterNode.y,
          color: COLORS.edge,
        });
      }

      for (const send of sendNodes) {
        lines.push({
          x1: track.x + layout.nodeWidth / 2,
          y1: track.y + layout.nodeHeight,
          x2: send.x + layout.nodeWidth / 2,
          y2: send.y,
          color: COLORS.send,
        });
      }
    }

    for (const send of sendNodes) {
      lines.push({
        x1: send.x + layout.nodeWidth / 2,
        y1: send.y + layout.nodeHeight,
        x2: masterNode.x + layout.nodeWidth / 2,
        y2: masterNode.y,
        color: COLORS.send,
      });
    }

    lines.push({
      x1: masterNode.x + layout.nodeWidth / 2,
      y1: masterNode.y + layout.nodeHeight,
      x2: outputNode.x + layout.nodeWidth / 2,
      y2: outputNode.y,
      color: COLORS.accent,
    });

    return lines;
  }, [layout]);

  const nodes = [
    ...layout.trackNodes,
    ...layout.effectNodes,
    ...layout.sendNodes,
    layout.masterNode,
    layout.outputNode,
  ];

  return (
    <div
      ref={containerRef}
      style={{
        flex: 1,
        minHeight: 260,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 8,
        background: COLORS.bg,
        position: "relative",
        overflow: "hidden",
      }}
      data-testid="audio-graph"
    >
      <svg width={size.width} height={size.height} style={{ position: "absolute", inset: 0 }}>
        {edges.map((edge, i) => (
          <line
            key={i}
            x1={edge.x1}
            y1={edge.y1}
            x2={edge.x2}
            y2={edge.y2}
            stroke={edge.color}
            strokeWidth={1.5}
            opacity={0.7}
          />
        ))}
      </svg>
      {nodes.map((node) => (
        <div
          key={node.id}
          data-testid={`audio-graph-node-${node.id}`}
          style={{
            position: "absolute",
            left: node.x,
            top: node.y,
            width: layout.nodeWidth,
            height: layout.nodeHeight,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 4,
            background: COLORS.node,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 9,
            color: node.color,
            boxShadow: `0 0 0 1px ${node.color}44`,
          }}
        >
          {node.label}
        </div>
      ))}
    </div>
  );
};
