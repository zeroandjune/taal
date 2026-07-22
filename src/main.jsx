import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import * as martinez from "martinez-polygon-clipping";
import * as opentype from "opentype.js";
import {
  Circle,
  Download,
  Eraser,
  Grid3X3,
  Lock,
  MousePointer2,
  PenLine,
  RotateCw,
  RefreshCcw,
  Square,
  X,
} from "lucide-react";
import "./styles.css";

const STORAGE_KEY = "nstool.latestProject.v2";
const OLD_STORAGE_KEY = "nstool.latestProject.v1";
const CANVAS_SIZE = 300;
const ARTBOARD = { x: 0, y: 0, w: CANVAS_SIZE, h: CANVAS_SIZE };
const WORKSPACE = { x: -150, y: -150, w: 600, h: 600 };
const VECTOR_GRID_SIZE = 1;
const PIXEL_GRID_SIZE = 10;
const KAPPA = 0.5522847498;

const baseGlyphs = [
  "ㄱ",
  "ㄲ",
  "ㄴ",
  "ㄷ",
  "ㄸ",
  "ㄹ",
  "ㅁ",
  "ㅂ",
  "ㅃ",
  "ㅅ",
  "ㅆ",
  "ㅇ",
  "ㅈ",
  "ㅉ",
  "ㅊ",
  "ㅋ",
  "ㅌ",
  "ㅍ",
  "ㅎ",
  "ㅏ",
  "ㅑ",
  "ㅓ",
  "ㅕ",
  "ㅗ",
  "ㅛ",
  "ㅜ",
  "ㅠ",
  "ㅡ",
  "ㅣ",
  "ㅐ",
  "ㅔ",
];

const CHO = ["ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"];
const JUNG = ["ㅏ", "ㅐ", "ㅑ", "ㅒ", "ㅓ", "ㅔ", "ㅕ", "ㅖ", "ㅗ", "ㅘ", "ㅙ", "ㅚ", "ㅛ", "ㅜ", "ㅝ", "ㅞ", "ㅟ", "ㅠ", "ㅡ", "ㅢ", "ㅣ"];
const JONG = ["", "ㄱ", "ㄲ", "ㄳ", "ㄴ", "ㄵ", "ㄶ", "ㄷ", "ㄹ", "ㄺ", "ㄻ", "ㄼ", "ㄽ", "ㄾ", "ㄿ", "ㅀ", "ㅁ", "ㅂ", "ㅄ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"];

const defaultProject = {
  selectedGlyph: "ㄱ",
  canvasMode: "vector",
  activeTool: "pen",
  previewText: "다람쥐 헌 쳇바퀴에 타고파",
  previewSize: 68,
  previewPolarity: "positive",
  vectorStyle: {
    strokeWidth: 28,
    lineCap: "round",
    lineJoin: "round",
    cornerMode: "sharp",
    cornerRadius: 36,
    squircle: false,
  },
  pixel: {
    gridSize: PIXEL_GRID_SIZE,
    gridAngle: 0,
    gridShape: "square",
  },
  layout: {
    lines: { x1: 240, x2: 480, y1: 240, y2: 480 },
    gap: 12,
    variant: "A1",
  },
  options: {
    descendingYVowels: false,
    wVowels: false,
    curvatureOverlay: true,
    speedPunkSize: 10,
    pathDisplay: "filled",
    zoom: 1,
  },
  glyphs: {},
};

function readProject() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(OLD_STORAGE_KEY);
    return raw ? normalizeProject(JSON.parse(raw)) : defaultProject;
  } catch {
    return defaultProject;
  }
}

function normalizeProject(saved) {
  const project = {
    ...defaultProject,
    ...saved,
    vectorStyle: { ...defaultProject.vectorStyle, ...saved.vectorStyle },
    pixel: { ...defaultProject.pixel, ...saved.pixel },
    layout: {
      ...defaultProject.layout,
      ...(saved.layout?.lines ? saved.layout : {}),
      lines: { ...defaultProject.layout.lines, ...(saved.layout?.lines || {}) },
    },
    options: { ...defaultProject.options, ...saved.options },
    glyphs: {},
  };
  if (!["square", "circle"].includes(project.pixel.gridShape)) {
    project.pixel.gridShape = "square";
  }
  Object.entries(saved.glyphs || {}).forEach(([key, glyph]) => {
    project.glyphs[key] = normalizeGlyph(glyph);
  });
  return project;
}

function normalizeGlyph(glyph = {}) {
  const paths = (glyph.paths || []).map((path) => ({
    id: path.id || crypto.randomUUID(),
    strokeWidth: path.strokeWidth || 28,
    lineCap: path.lineCap || "round",
    lineJoin: path.lineJoin || "round",
    cornerMode: path.cornerMode || "sharp",
    shapeType: path.shapeType || null,
    rect: path.rect || null,
    rotationAngle: path.rotationAngle || 0,
    rotationCenter: path.rotationCenter || null,
    fillRule: path.fillRule || "evenodd",
    displayMode: path.displayMode || null,
    closed: Boolean(path.closed),
    points: (path.points || []).map(normalizePoint),
    subpaths: path.subpaths?.map((ring) => ring.map(normalizePoint)),
  }));

  (glyph.shapes || []).forEach((shape) => {
    paths.push(shape.type === "ellipse" ? ellipsePath(shape) : rectPath(shape.x, shape.y, shape.w, shape.h, shape.strokeWidth));
  });

  return {
    paths: paths.filter((path) => path.points.length),
    pixels: glyph.pixels || [],
  };
}

function normalizePoint(point) {
  return {
    id: point.id || crypto.randomUUID(),
    x: point.x,
    y: point.y,
    in: point.in || null,
    out: point.out || null,
    smooth: Boolean(point.smooth),
    cornerSource: point.cornerSource || null,
    cornerOrigin: point.cornerOrigin || null,
    cornerOriginal: point.cornerOriginal || null,
  };
}

function emptyGlyph() {
  return { paths: [], pixels: [] };
}

function getGlyph(project, glyph) {
  return normalizeGlyph(project.glyphs[glyph] || emptyGlyph());
}

function App() {
  const [project, setProject] = useState(readProject);
  const [past, setPast] = useState([]);
  const [future, setFuture] = useState([]);
  const [activePathId, setActivePathId] = useState(null);
  const [vectorSelection, setVectorSelection] = useState({ anchors: [], segments: [], widgets: [] });
  const [proofMode, setProofMode] = useState(false);
  const [referencePoint, setReferencePoint] = useState("cc");
  const [resetOpen, setResetOpen] = useState(false);
  const currentGlyph = getGlyph(project, project.selectedGlyph);
  const glyphSet = useMemo(() => {
    const enabled = [...baseGlyphs];
    enabled.push("ㅒ", "ㅖ");
    if (project.options.wVowels) enabled.push("ㅘ", "ㅙ", "ㅚ", "ㅝ", "ㅞ", "ㅟ", "ㅢ");
    return Array.from(new Set(enabled));
  }, [project.options.wVowels]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
  }, [project]);

  useEffect(() => {
    function onKeyDown(event) {
      const key = event.key.toLowerCase();
      if (event.target?.matches("input, textarea, [contenteditable='true']")) return;
      if ((event.ctrlKey || event.metaKey) && key === "z") {
        event.preventDefault();
        event.shiftKey ? redo() : undo();
      } else if ((event.ctrlKey || event.metaKey) && (event.key === "]" || event.code === "BracketRight")) {
        event.preventDefault();
        moveSelectedLayer(1);
      } else if ((event.ctrlKey || event.metaKey) && (event.key === "[" || event.code === "BracketLeft")) {
        event.preventDefault();
        moveSelectedLayer(-1);
      } else if ((event.ctrlKey || event.metaKey) && key === "a") {
        event.preventDefault();
        if (project.canvasMode === "vector") {
          setVectorSelection({
            anchors: currentGlyph.paths.flatMap((path) => path.points.map((_, pointIndex) => ({ pathId: path.id, pointIndex }))),
            segments: currentGlyph.paths.flatMap((path) => getSegments(path).map((segment) => ({ pathId: path.id, index: segment.index, nextIndex: segment.nextIndex }))),
            widgets: [],
          });
        }
      } else if (key === "v") {
        setProject((previous) => ({ ...previous, activeTool: "select" }));
      } else if (key === "p") {
        setProject((previous) => ({ ...previous, activeTool: "pen" }));
      } else if (key === "m") {
        setProject((previous) => ({ ...previous, activeTool: "rect" }));
      } else if (key === "l") {
        setProject((previous) => ({ ...previous, activeTool: "ellipse" }));
      } else if (event.key === "Escape") {
        setActivePathId(null);
        setProject((previous) => ({ ...previous, activeTool: "select" }));
      } else if (event.code === "Space") {
        event.preventDefault();
        setProofMode(true);
      }
    }
    function onKeyUp(event) {
      if (event.code === "Space") setProofMode(false);
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [past, future, project]);

  useEffect(() => {
    if (project.activeTool !== "pen") setActivePathId(null);
  }, [project.activeTool]);

  function patchProject(patch, history = true) {
    setProject((previous) => {
      const next = typeof patch === "function" ? patch(previous) : { ...previous, ...patch };
      if (history) {
        setPast((items) => [...items.slice(-39), previous]);
        setFuture([]);
      }
      return next;
    });
  }

  function patchGlyph(glyphPatch, history = true, historyBase = null) {
    setProject((previous) => {
      const glyph = getGlyph(previous, previous.selectedGlyph);
      const nextGlyph = {
        ...glyph,
        ...(typeof glyphPatch === "function" ? glyphPatch(glyph) : glyphPatch),
      };
      if (history) {
        const baseProject = historyBase
          ? {
              ...previous,
              glyphs: {
                ...previous.glyphs,
                [previous.selectedGlyph]: historyBase,
              },
            }
          : previous;
        setPast((items) => [...items.slice(-39), baseProject]);
        setFuture([]);
      }
      return {
        ...previous,
        glyphs: {
          ...previous.glyphs,
          [previous.selectedGlyph]: nextGlyph,
        },
      };
    });
  }

  function undo() {
    if (!past.length) return;
    const previous = past[past.length - 1];
    setFuture((items) => [project, ...items]);
    setPast((items) => items.slice(0, -1));
    setProject(previous);
    setActivePathId(null);
  }

  function redo() {
    if (!future.length) return;
    const next = future[0];
    setPast((items) => [...items, project]);
    setFuture((items) => items.slice(1));
    setProject(next);
    setActivePathId(null);
  }

  function resetWork() {
    localStorage.removeItem(STORAGE_KEY);
    setPast([]);
    setFuture([]);
    setProject(defaultProject);
    setActivePathId(null);
    setVectorSelection({ anchors: [], segments: [], widgets: [] });
    setResetOpen(false);
  }

  function moveSelectedLayer(direction) {
    const ids = selectedPathIds(vectorSelection);
    if (!ids.size) return;
    patchGlyph((glyph) => {
      const paths = [...glyph.paths];
      const indices = direction > 0
        ? paths.map((path, index) => [path, index]).reverse()
        : paths.map((path, index) => [path, index]);
      indices.forEach(([path, index]) => {
        if (!ids.has(path.id)) return;
        const nextIndex = index + direction;
        if (nextIndex < 0 || nextIndex >= paths.length || ids.has(paths[nextIndex].id)) return;
        [paths[index], paths[nextIndex]] = [paths[nextIndex], paths[index]];
      });
      return { paths };
    });
  }

  function publishOtf() {
    const font = buildOtf(project, glyphSet);
    const blob = new Blob([font.toArrayBuffer()], { type: "font/otf" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "NSTool-Regular.otf";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">NS</span>
          <span>Non-square Hangul Font Tool</span>
        </div>
        <nav className="top-actions">
          <button className="text-button" onClick={undo} disabled={!past.length}>
            Undo
          </button>
          <button className="text-button" onClick={redo} disabled={!future.length}>
            Redo
          </button>
          <button className="text-button" onClick={() => setResetOpen(true)}>
            <RefreshCcw size={16} />
            Reset
          </button>
          <button className="primary-button" onClick={publishOtf}>
            <Download size={17} />
            Publish OTF
          </button>
        </nav>
      </header>

      <main className="workspace">
        <section className="showcase">
          <Showcase
            project={project}
            glyphSet={glyphSet}
            onSelectGlyph={(selectedGlyph) => {
              setActivePathId(null);
              setVectorSelection({ anchors: [], segments: [], widgets: [] });
              patchProject({ selectedGlyph }, false);
            }}
            onPatchProject={patchProject}
          />
        </section>
        <section className="studio">
          <div className="studio-main">
            <ModeTabs canvasMode={project.canvasMode} onChange={(canvasMode) => patchProject({ canvasMode }, false)} />
            {project.canvasMode === "vector" ? (
              <VectorCanvas
                glyph={currentGlyph}
                style={{ ...project.vectorStyle, pathDisplay: project.options.pathDisplay }}
                grid={project.pixel}
                activeTool={project.activeTool}
                setTool={(activeTool) => patchProject({ activeTool }, false)}
                showCurvature={project.options.curvatureOverlay}
                proofMode={proofMode}
                activePathId={activePathId}
                setActivePathId={setActivePathId}
                selection={vectorSelection}
                setSelection={setVectorSelection}
                speedPunkSize={project.options.speedPunkSize || 10}
                referencePoint={referencePoint}
                onChange={patchGlyph}
              />
            ) : (
              <PixelCanvas glyph={currentGlyph} grid={project.pixel} activeTool={project.activeTool} onChange={patchGlyph} />
            )}
          </div>
          <aside className="inspector">
            <ToolRail
              activeTool={project.activeTool}
              setTool={(activeTool) => patchProject({ activeTool }, false)}
              canvasMode={project.canvasMode}
              pathDisplay={project.options.pathDisplay}
              togglePathDisplay={() => {
                const nextDisplay = project.options.pathDisplay === "filled" ? "outline" : "filled";
                const pathIds = selectedPathIds(vectorSelection);
                patchProject((previous) => ({ ...previous, options: { ...previous.options, pathDisplay: nextDisplay } }), false);
                if (pathIds.size) {
                  patchGlyph((glyph) => ({
                    paths: glyph.paths.map((path) => pathIds.has(path.id) && path.closed ? { ...path, displayMode: nextDisplay } : path),
                  }), false);
                }
              }}
            />
            <SettingsPanel project={project} currentGlyph={currentGlyph} selection={vectorSelection} patchProject={patchProject} patchGlyph={patchGlyph} canvasMode={project.canvasMode} referencePoint={referencePoint} setReferencePoint={setReferencePoint} />
          </aside>
        </section>
      </main>
      <PreviewBar project={project} onPatchProject={patchProject} />
      {resetOpen && (
        <div className="reset-dialog-backdrop" role="presentation">
          <div className="reset-dialog" role="dialog" aria-modal="true" aria-label="Reset confirmation">
            <p>Are you sure you want to reset?</p>
            <div>
              <button onClick={resetWork}>Yes</button>
              <button onClick={() => setResetOpen(false)}>No</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Showcase({ project, glyphSet, onSelectGlyph, onPatchProject }) {
  return (
    <div className={`showcase-inner ${project.previewPolarity}`}>
      <div className="panel-heading">
        <h1>Glyph View</h1>
        <span>{glyphSet.length} glyphs</span>
      </div>
      <div className="glyph-grid">
        {glyphSet.map((glyph) => {
          const source = getGlyph(project, glyph);
          const complete = hasDrawing(source);
          return (
            <button key={glyph} className={`glyph-cell ${project.selectedGlyph === glyph ? "active" : ""} ${complete ? "complete" : "empty"}`} onClick={() => onSelectGlyph(glyph)}>
              <PreviewSourceGlyph source={source} label={glyph} />
              {!complete && <span>{glyph}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PreviewBar({ project, onPatchProject }) {
  const [editingPreview, setEditingPreview] = useState(false);
  const previewText = project.previewText || "";
  const displayText = previewText || defaultProject.previewText;
  return (
    <section className={`preview-bar ${project.previewPolarity}`} style={{ "--preview-size": `${project.previewSize}px` }}>
      <textarea
        className="preview-editor"
        value={previewText}
        spellCheck="false"
        onFocus={() => setEditingPreview(true)}
        onBlur={() => setEditingPreview(false)}
        onChange={(event) => onPatchProject({ previewText: event.target.value }, false)}
        aria-label="Preview text"
      />
      <div className={`composed-preview ${!previewText && !editingPreview ? "placeholder" : ""}`}>
        {[...displayText].map((char, index) => (
          <ComposedChar key={`${char}-${index}`} char={char} project={project} />
        ))}
      </div>
      <div className="preview-floating-controls">
        <button className={project.previewPolarity === "positive" ? "active" : ""} onClick={() => onPatchProject({ previewPolarity: "positive" }, false)}>Positive</button>
        <button className={project.previewPolarity === "negative" ? "active" : ""} onClick={() => onPatchProject({ previewPolarity: "negative" }, false)}>Negative</button>
        <label>
          <span>Size</span>
          <input type="range" min="20" max="96" value={project.previewSize} style={rangeStyle(project.previewSize, 20, 96)} onChange={(event) => onPatchProject({ previewSize: Number(event.target.value) }, false)} />
        </label>
      </div>
    </section>
  );
}

function ComposedChar({ char, project }) {
  if (char === " ") return <span className="composed-space" />;
  const directSource = getGlyph(project, char);
  if (hasDrawing(directSource)) return <span className="single-glyph"><PreviewSourceGlyph source={directSource} label={char} /></span>;
  const parts = decomposeHangul(char);
  if (!parts) {
    return <span className="fallback-char unmade">{char}</span>;
  }
  const drawnParts = parts.filter((part) => part && hasDrawing(getGlyph(project, part)));
  if (!drawnParts.length) return <span className="fallback-char unmade">{char}</span>;
  return (
    <span className="composed-char">
      {parts.map((part, index) => (
        part && hasDrawing(getGlyph(project, part)) && <span key={`${part}-${index}`} className={`part p${index}`}><PreviewSourceGlyph source={getGlyph(project, part)} label={part} /></span>
      ))}
    </span>
  );
}

function decomposeHangul(char) {
  const code = char.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) return null;
  const offset = code - 0xac00;
  const cho = Math.floor(offset / 588);
  const jung = Math.floor((offset % 588) / 28);
  const jong = offset % 28;
  return [CHO[cho], JUNG[jung], JONG[jong]];
}

function hasDrawing(glyph) {
  return glyph.paths.some((path) => path.points.length > 0) || glyph.pixels.length > 0;
}

function PreviewSourceGlyph({ source, label }) {
  const clipId = `clip-${useId().replaceAll(":", "")}`;
  return (
    <svg viewBox={`0 0 ${CANVAS_SIZE} ${CANVAS_SIZE}`} className="source-preview" aria-label={label}>
      <defs>
        <clipPath id={clipId}>
          <rect x={ARTBOARD.x} y={ARTBOARD.y} width={ARTBOARD.w} height={ARTBOARD.h} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        {source.paths.map((path) => (
          <path
            key={path.id}
            d={pathToD(path)}
            fill={path.closed && path.displayMode !== "outline" ? "currentColor" : "none"}
            fillRule={path.fillRule || "evenodd"}
            stroke={!path.closed || path.displayMode === "outline" ? "currentColor" : "none"}
            strokeWidth={!path.closed || path.displayMode === "outline" ? path.strokeWidth : 0}
            strokeLinecap={path.lineCap}
            strokeLinejoin={path.lineJoin || "round"}
          />
        ))}
        {source.pixels.map((pixel) => (
          <PixelMark key={`${pixel.x}-${pixel.y}-${pixel.size}-${pixel.shape || "square"}`} pixel={pixel} />
        ))}
      </g>
    </svg>
  );
}

function ModeTabs({ canvasMode, onChange }) {
  return (
    <div className="mode-tabs">
      <button className={canvasMode === "vector" ? "active" : ""} onClick={() => onChange("vector")}>
        <PenLine size={16} />
        Vector
      </button>
      <button className={canvasMode === "pixel" ? "active" : ""} onClick={() => onChange("pixel")}>
        <Grid3X3 size={16} />
        Grid
      </button>
    </div>
  );
}

function ToolRail({ activeTool, setTool, canvasMode, pathDisplay, togglePathDisplay }) {
  const [shapeMenu, setShapeMenu] = useState(null);
  const pressTimer = useRef(null);
  const vectorTools = [
    ["select", MousePointer2, "Selection Tool", "Select anchors, segments, or drag a marquee. Shortcut: V"],
    ["pen", PenLine, "Pen Tool", "Draw straight or Bezier paths. Drag while placing a point for handles. Shortcut: P"],
    ["rect", Square, "Rectangle Tool", "Drag to create an editable rectangle path. Shortcut: M"],
    ["ellipse", Circle, "Ellipse Tool", "Drag to create an editable ellipse path. Shortcut: L"],
    ["erase", Eraser, "Erase Tool", "Click anchors or segments to remove them."],
  ];
  const pixelTools = [
    ["pixel", PenLine, "Grid Pen Tool", "Paint cells on the grid."],
    ["gridRect", Square, "Grid Rectangle Tool", "Long press to choose Filled or Outlined Rectangle. Rasterizes to the current grid."],
    ["gridEllipse", Circle, "Grid Circle Tool", "Long press to choose Filled or Outlined Circle. Rasterizes to the current grid."],
    ["erase", Eraser, "Pixel Eraser", "Click a filled cell to remove it."],
  ];
  const tools = canvasMode === "vector" ? vectorTools : pixelTools;

  return (
    <div className="tool-rail" aria-label="Tool rail">
      {tools.map(([id, Icon, label, description]) => {
        const shapeTool = canvasMode === "pixel" && (id === "gridRect" || id === "gridEllipse");
        const active = shapeTool ? activeTool.startsWith(id) : activeTool === id;
        return (
          <span key={id} className="tool-option-wrap">
            <TooltipButton
              active={active}
              onMouseDown={() => {
                if (!shapeTool) return;
                pressTimer.current = setTimeout(() => setShapeMenu(shapeMenu === id ? null : id), 450);
              }}
              onMouseUp={() => clearTimeout(pressTimer.current)}
              onClick={() => {
                if (shapeTool) setTool(`${id}:filled`);
                else setTool(id);
              }}
              label={label}
              description={description}
            >
              <Icon size={19} />
              {shapeTool && <span className="tool-corner" />}
            </TooltipButton>
            {shapeMenu === id && (
              <div className="tool-menu">
                <button onClick={() => { setTool(`${id}:filled`); setShapeMenu(null); }}>Filled</button>
                <button onClick={() => { setTool(`${id}:outline`); setShapeMenu(null); }}>Outlined</button>
              </div>
            )}
          </span>
        );
      })}
      {canvasMode === "vector" && (
        <TooltipButton active={pathDisplay === "filled"} onClick={togglePathDisplay} label={pathDisplay === "filled" ? "Filled" : "Outline"} description="Toggle closed paths between filled shapes and outlined strokes.">
          {pathDisplay === "filled" ? <span className="filled-icon" /> : <span className="outline-icon"><Square size={19} /><X size={13} /></span>}
        </TooltipButton>
      )}
    </div>
  );
}

function TooltipButton({ active, onClick, onMouseDown, onMouseUp, label, description, children }) {
  const [open, setOpen] = useState(false);
  const timer = useRef(null);
  return (
    <span className="tool-wrap" onMouseEnter={() => { timer.current = setTimeout(() => setOpen(true), 1000); }} onMouseLeave={() => { clearTimeout(timer.current); setOpen(false); }}>
      <button className={active ? "active" : ""} onMouseDown={onMouseDown} onMouseUp={onMouseUp} onClick={onClick} aria-label={label}>
        {children}
      </button>
      {open && (
        <span className="tooltip">
          <strong>{label}</strong>
          <span>{description}</span>
        </span>
      )}
    </span>
  );
}

function SettingsPanel({ project, currentGlyph, selection, patchProject, patchGlyph, canvasMode, referencePoint, setReferencePoint }) {
  const [rotationValue, setRotationValue] = useState(0);
  const [shearValue, setShearValue] = useState("0");
  const [radiusUiValue, setRadiusUiValue] = useState(null);
  const radiusEditRef = useRef(null);
  function setVectorStyle(key, value) {
    patchProject((previous) => ({ ...previous, vectorStyle: { ...previous.vectorStyle, [key]: value } }), false);
    const pathIds = selectedPathIds(selection);
    if (pathIds.size) {
      patchGlyph((glyph) => ({
        paths: glyph.paths.map((path) => pathIds.has(path.id) ? { ...path, [key]: value } : path),
      }), false);
    }
  }
  function setGridProperty(key, value) {
    patchProject((previous) => ({ ...previous, pixel: { ...previous.pixel, [key]: value } }), false);
  }
  function setOption(key, value) {
    patchProject((previous) => ({ ...previous, options: { ...previous.options, [key]: value } }), false);
  }
  function setShapeCorner(mode) {
    patchProject((previous) => ({ ...previous, vectorStyle: { ...previous.vectorStyle, cornerMode: mode } }), false);
    const pathIds = selectedPathIds(selection);
    patchGlyph((glyph) => ({
      paths: glyph.paths.map((path) => {
        if (!pathIds.has(path.id) || !isPureRectangle(path)) return path;
        const rect = path.rect || pathBounds(path);
        return { ...rectPath(rect.x, rect.y, rect.w, rect.h, path.strokeWidth, mode, project.vectorStyle.cornerRadius, project.vectorStyle.squircle, path.displayMode || project.options.pathDisplay), id: path.id };
      }),
    }), false);
  }
  function setCornerRadius(value) {
    setRadiusUiValue(value);
    patchProject((previous) => ({ ...previous, vectorStyle: { ...previous.vectorStyle, cornerRadius: value } }), false);
    if (!radiusEditRef.current) beginRadiusEdit(currentCornerRadius);
    const edit = radiusEditRef.current;
    const delta = value - (edit?.startValue || 0);
    patchGlyph((glyph) => ({
      paths: glyph.paths.map((path) => {
        const pathEdit = edit?.paths.find((item) => item.pathId === path.id);
        if (!pathEdit) return path;
        if (isPureRectangle(path) && !selection.anchors.some((anchor) => anchor.pathId === path.id) && !(selection.widgets || []).some((widget) => widget.pathId === path.id)) {
          const rect = path.rect || pathBounds(path);
          const radius = Math.max(0, Math.min(value, Math.min(Math.abs(rect.w), Math.abs(rect.h)) / 2));
          return { ...rectPath(rect.x, rect.y, rect.w, rect.h, path.strokeWidth, radius > 0 ? "round" : "sharp", radius, project.vectorStyle.squircle, path.displayMode || project.options.pathDisplay), id: path.id };
        }
        return applyRadiusTargets(path, pathEdit.targets.map((target) => ({
          ...target,
          baseRadius: target.radius,
          radius: Math.max(0, target.radius + delta),
        })));
      }),
    }), false);
  }
  function beginRadiusEdit(value = currentCornerRadius) {
    setRadiusUiValue(value);
    radiusEditRef.current = {
      startValue: value,
      paths: radiusEditTargets(currentGlyph, selection),
    };
  }
  function endRadiusEdit() {
    radiusEditRef.current = null;
    setRadiusUiValue(null);
  }
  function setSquircle(value) {
    patchProject((previous) => ({ ...previous, vectorStyle: { ...previous.vectorStyle, squircle: value } }), false);
    const pathIds = selectedPathIds(selection);
    patchGlyph((glyph) => ({
      paths: glyph.paths.map((path) => {
        if (!pathIds.has(path.id) || !isPureRectangle(path)) return path;
        const rect = path.rect || pathBounds(path);
        return { ...rectPath(rect.x, rect.y, rect.w, rect.h, path.strokeWidth, "round", project.vectorStyle.cornerRadius, value, path.displayMode || project.options.pathDisplay), id: path.id };
      }),
    }), false);
  }

  function applyPathfinder(mode) {
    const pathIds = selectedPathIds(selection);
    const selected = currentGlyph.paths.filter((path) => pathIds.has(path.id) && path.closed);
    if (selected.length < 2) return;
    if (selected.some(hasCurves) && mode !== "intersect") {
      const replacement = curvePreservingPathfinder(selected, mode, project.vectorStyle.strokeWidth);
      patchGlyph((glyph) => ({
        paths: [
          ...glyph.paths.filter((path) => !pathIds.has(path.id)),
          replacement,
        ],
      }));
      return;
    }
    const subject = pathToPolygon(selected[0]);
    const clips = selected.slice(1).map(pathToPolygon);
    const result = clips.reduce((current, clip) => {
      if (!current) return null;
      if (mode === "unite") return martinez.union(current, clip);
      if (mode === "minus") return martinez.diff(current, clip);
      if (mode === "exclude") return martinez.xor(current, clip);
      return martinez.intersection(current, clip);
    }, subject);
    const replacement = polygonsToPaths(result, project.vectorStyle.strokeWidth);
    if (!replacement.length) return;
    patchGlyph((glyph) => ({
      paths: [
        ...glyph.paths.filter((path) => !pathIds.has(path.id)),
        ...replacement,
      ],
    }));
  }
  function removeOverlap() {
    const pathIds = selectedPathIds(selection);
    if (!pathIds.size) return;
    patchGlyph((glyph) => ({
      paths: glyph.paths.map((path) => pathIds.has(path.id) ? removePathOverlap(path) : path),
    }));
  }
  function rotateSelected(degrees) {
    const pathIds = selectedPathIds(selection);
    const selected = currentGlyph.paths.filter((path) => pathIds.has(path.id));
    if (!selected.length) return;
    const box = selectedTransformBox(currentGlyph, selection);
    const origin = originFromRotatedBox(box || unionBoxes(selected.map(selectionBoxForPath)), referencePoint);
    const angle = (Math.round(degrees) * Math.PI) / 180;
    patchGlyph((glyph) => ({
      paths: glyph.paths.map((path) => {
        if (!pathIds.has(path.id)) return path;
        const rotated = {
          ...path,
          rotationAngle: (path.rotationAngle || 0) + angle,
          rotationCenter: origin,
          ...movePathPoints(path, path.points.map((_, index) => index), (point) => rotatePoint(point, origin, angle)),
        };
        return boxWithinWorkspace(selectionBoxForPath(rotated)) ? rotated : path;
      }),
    }));
  }
  function shearSelected(degrees) {
    const pathIds = selectedPathIds(selection);
    const selected = currentGlyph.paths.filter((path) => pathIds.has(path.id));
    if (!selected.length) return;
    const box = selectedTransformBox(currentGlyph, selection) || unionBoxes(selected.map(selectionBoxForPath));
    const origin = originFromRotatedBox(box, referencePoint);
    const amount = Math.tan((Math.round(degrees) * Math.PI) / 180);
    patchGlyph((glyph) => ({
      paths: glyph.paths.map((path) => {
        if (!pathIds.has(path.id)) return path;
        const sheared = {
          ...path,
          ...movePathPoints(path, path.points.map((_, index) => index), (point) => shearPoint(point, origin, amount, referencePoint)),
        };
        return boxWithinWorkspace(selectionBoxForPath(sheared)) ? sheared : path;
      }),
    }));
  }
  const selectedRect = currentGlyph.paths.find((path) => selectedPathIds(selection).has(path.id) && isPureRectangle(path));
  const shapeSelected = Boolean(selectedRect);
  const hasVectorSelection = selectedPathIds(selection).size > 0;
  const transformBox = selectedTransformBox(currentGlyph, selection);
  const transformOrigin = transformBox ? originFromRotatedBox(transformBox, referencePoint) : { x: 0, y: 0 };
  const hasRadiusTarget = canvasMode === "vector" && currentGlyph.paths.some((path) => selectedPathIds(selection).has(path.id) && (isPureRectangle(path) || hasRoundedCornerPairs(path) || path.points.some((_, index) => isRoundableCorner(path, index))));
  const maxCornerRadius = selectedRect ? Math.floor(Math.min(Math.abs(selectedRect.rect?.w || pathBounds(selectedRect).w), Math.abs(selectedRect.rect?.h || pathBounds(selectedRect).h)) / 2) : 100;
  const currentCornerRadius = selectedCornerRadius(currentGlyph, selection, selectedRect);
  const displayedCornerRadius = radiusUiValue ?? currentCornerRadius;

  return (
    <div className="settings">
      {canvasMode === "vector" && (
        <section>
          <h2>Stroke</h2>
          <label>
            <span>Weight</span>
            <input type="range" min="1" max="100" value={project.vectorStyle.strokeWidth} style={rangeStyle(project.vectorStyle.strokeWidth, 1, 100)} onChange={(event) => setVectorStyle("strokeWidth", Number(event.target.value))} />
            <strong>{project.vectorStyle.strokeWidth}</strong>
          </label>
          <div className="icon-row" aria-label="Stroke cap">
            {["round", "butt", "square"].map((cap) => (
              <button key={cap} className={project.vectorStyle.lineCap === cap ? "active" : ""} onClick={() => setVectorStyle("lineCap", cap)} aria-label={`${cap} cap`}>
                <span className={`cap-icon cap-${cap}`} />
              </button>
            ))}
          </div>
          <div className="icon-row" aria-label="Corner form">
            {["round", "miter", "bevel"].map((join) => (
              <button key={join} className={project.vectorStyle.lineJoin === join ? "active" : ""} onClick={() => setVectorStyle("lineJoin", join)} aria-label={`${join} join`}>
                <span className={`join-icon join-${join}`} />
              </button>
            ))}
          </div>
        </section>
      )}
      {canvasMode === "vector" && hasRadiusTarget && (
        <section>
          <h2>Shape</h2>
          <label>
            <span>Radius</span>
            <input type="range" min="0" max={maxCornerRadius} value={Math.min(displayedCornerRadius, maxCornerRadius)} style={rangeStyle(Math.min(displayedCornerRadius, maxCornerRadius), 0, maxCornerRadius)} onPointerDown={() => beginRadiusEdit(currentCornerRadius)} onPointerUp={endRadiusEdit} onBlur={endRadiusEdit} onChange={(event) => setCornerRadius(Number(event.target.value))} />
            <strong>{Math.min(displayedCornerRadius, maxCornerRadius)}</strong>
          </label>
          {shapeSelected && (
            <Toggle checked={project.vectorStyle.squircle} onChange={setSquircle} label="Squircle" />
          )}
        </section>
      )}
      {canvasMode === "vector" && hasVectorSelection && (
        <section>
          <h2>Transform</h2>
          <div className="transform-summary">
            <div className="origin-grid">
              {["nw", "nc", "ne", "cw", "cc", "ce", "sw", "sc", "se"].map((id) => (
                <button key={id} className={referencePoint === id ? "active" : ""} onClick={() => setReferencePoint(id)} aria-label={`Origin ${id}`} />
              ))}
            </div>
            <div className="transform-fields">
              <label><span>X</span><input type="number" value={Math.round(transformOrigin.x)} readOnly /></label>
              <label><span>Y</span><input type="number" value={Math.round(transformOrigin.y)} readOnly /></label>
              <label><span>W</span><input type="number" value={Math.round(transformBox?.w || 0)} readOnly /></label>
              <label><span>H</span><input type="number" value={Math.round(transformBox?.h || 0)} readOnly /></label>
            </div>
          </div>
          <div className="transform-actions">
            <label>
              <span className="angle-icon" />
              <input type="number" value={rotationValue} onChange={(event) => setRotationValue(Number(event.target.value))} onKeyDown={(event) => {
                if (event.key === "Enter") rotateSelected(rotationValue);
              }} step="1" />
            </label>
            <label>
              <span className="shear-icon" />
              <input type="number" value={shearValue} onChange={(event) => setShearValue(event.target.value)} onKeyDown={(event) => {
                if (event.key === "Enter") shearSelected(Number.parseFloat(shearValue) || 0);
              }} step="1" />
            </label>
          </div>
        </section>
      )}
      {canvasMode === "pixel" && (
        <section>
          <h2>Grid</h2>
          <label>
            <span>Angle</span>
            <input type="range" min="-45" max="45" value={project.pixel.gridAngle} style={rangeStyle(project.pixel.gridAngle, -45, 45)} onChange={(event) => setGridProperty("gridAngle", Number(event.target.value))} />
            <strong>{project.pixel.gridAngle}</strong>
          </label>
        </section>
      )}
      {canvasMode === "vector" && (
        <section>
          <h2>Pathfinder</h2>
          <div className="icon-row pathfinder-row" aria-label="Pathfinder">
            <button onClick={() => applyPathfinder("unite")} aria-label="Unite"><span className="pathfinder-icon pathfinder-unite" /></button>
            <button onClick={() => applyPathfinder("minus")} aria-label="Minus Front"><span className="pathfinder-icon pathfinder-minus" /></button>
            <button onClick={() => applyPathfinder("intersect")} aria-label="Intersect"><span className="pathfinder-icon pathfinder-intersect" /></button>
            <button onClick={() => applyPathfinder("exclude")} aria-label="Exclude"><span className="pathfinder-icon pathfinder-exclude" /></button>
            <button onClick={removeOverlap} aria-label="Remove Overlap"><span className="pathfinder-icon pathfinder-remove" /></button>
          </div>
        </section>
      )}
      {canvasMode === "vector" && (
      <section>
        <h2>Composition</h2>
        <Toggle checked={project.options.curvatureOverlay} onChange={(value) => setOption("curvatureOverlay", value)} label="Speed Punk" />
        {project.options.curvatureOverlay && (
          <label>
            <span>Size</span>
            <input type="range" min="10" max="20" value={project.options.speedPunkSize || 10} style={rangeStyle(project.options.speedPunkSize || 10, 10, 20)} onChange={(event) => setOption("speedPunkSize", Number(event.target.value))} />
            <strong>{project.options.speedPunkSize || 10}</strong>
          </label>
        )}
        <Toggle checked={project.options.wVowels} onChange={(value) => setOption("wVowels", value)} label="Extended Vowels" />
      </section>
      )}
      <section>
        <h2>Hangul Layout</h2>
        <LayoutEditor project={project} patchProject={patchProject} />
      </section>
    </div>
  );
}

function Toggle({ checked, onChange, label }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

function rangeStyle(value, min, max) {
  const span = Math.max(1, max - min);
  const progress = Math.max(0, Math.min(100, ((Number(value) - min) / span) * 100));
  return { "--range-progress": `${progress}%` };
}

function LayoutEditor({ project, patchProject }) {
  const svgRef = useRef(null);
  const [dragLine, setDragLine] = useState(null);
  const lines = project.layout.lines;

  function local(event) {
    const rect = svgRef.current.getBoundingClientRect();
    const scale = CANVAS_SIZE / rect.width;
    return { x: Math.round((event.clientX - rect.left) * scale), y: Math.round((event.clientY - rect.top) * scale) };
  }

  function setLine(key, value) {
    const clamped = Math.max(80, Math.min(640, value));
    patchProject((previous) => ({
      ...previous,
      layout: {
        ...previous.layout,
        lines: { ...previous.layout.lines, [key]: clamped },
      },
    }), false);
  }

  return (
    <div>
      <select value={project.layout.variant} onChange={(event) => patchProject((previous) => ({ ...previous, layout: { ...previous.layout, variant: event.target.value } }), false)}>
        <option value="A1">A1 Equal vertical final</option>
        <option value="B1">B1 Narrow medial</option>
        <option value="C1">C1 Low medial</option>
        <option value="A2">A2 Horizontal bare</option>
        <option value="A3">A3 Mixed bare</option>
      </select>
      <svg
        ref={svgRef}
        className="layout-editor"
        viewBox={`0 0 ${CANVAS_SIZE} ${CANVAS_SIZE}`}
        onMouseMove={(event) => {
          if (!dragLine) return;
          const point = local(event);
          setLine(dragLine, dragLine.startsWith("x") ? point.x : point.y);
        }}
        onMouseUp={() => setDragLine(null)}
        onMouseLeave={() => setDragLine(null)}
      >
        <rect x="80" y="80" width="560" height="560" fill="white" stroke="black" />
        <line x1={lines.x1} y1="80" x2={lines.x1} y2="640" />
        <line x1={lines.x2} y1="80" x2={lines.x2} y2="640" />
        <line x1="80" y1={lines.y1} x2="640" y2={lines.y1} />
        <line x1="80" y1={lines.y2} x2="640" y2={lines.y2} />
        {["x1", "x2"].map((key) => <line key={key} className="layout-handle" x1={lines[key]} y1="80" x2={lines[key]} y2="640" onMouseDown={() => setDragLine(key)} />)}
        {["y1", "y2"].map((key) => <line key={key} className="layout-handle" x1="80" y1={lines[key]} x2="640" y2={lines[key]} onMouseDown={() => setDragLine(key)} />)}
        <circle cx={(80 + lines.x1) / 2} cy={(80 + lines.y1) / 2} r="8" />
        <circle cx={(lines.x1 + lines.x2) / 2} cy={(lines.y1 + lines.y2) / 2} r="8" />
        <circle cx={(lines.x2 + 640) / 2} cy={(lines.y2 + 640) / 2} r="8" />
      </svg>
    </div>
  );
}

function VectorCanvas({ glyph, style, grid, activeTool, setTool, showCurvature, proofMode, activePathId, setActivePathId, selection, setSelection, speedPunkSize, referencePoint, onChange }) {
  const [drag, setDrag] = useState(null);
  const [marquee, setMarquee] = useState(null);
  const [shapeDraft, setShapeDraft] = useState(null);
  const [tangentGuide, setTangentGuide] = useState(null);
  const [view, setView] = useState({ x: 0, y: 0, zoom: 1 });
  const [guides, setGuides] = useState([]);
  const [guideDraft, setGuideDraft] = useState(null);
  const [guideMenu, setGuideMenu] = useState(null);
  const [joinMenu, setJoinMenu] = useState(null);
  const [rotationLabel, setRotationLabel] = useState(null);
  const [canvasPixels, setCanvasPixels] = useState(300);
  const dragBaseRef = useRef(null);
  const svgRef = useRef(null);
  const interactionRef = useRef({ drag: null, marquee: null, shapeDraft: null, guideDraft: null });
  const handleMoveRef = useRef(null);
  const handleUpRef = useRef(null);
  const viewSize = CANVAS_SIZE / view.zoom;
  const handleScale = viewSize / canvasPixels;
  const viewBox = `${view.x} ${view.y} ${viewSize} ${viewSize}`;

  useEffect(() => {
    if (!svgRef.current) return;
    const updateSize = () => setCanvasPixels(svgRef.current?.getBoundingClientRect().width || 300);
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(svgRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    function onKeyDown(event) {
      if (event.target?.matches("input, textarea, [contenteditable='true']")) return;
      if ((event.ctrlKey || event.metaKey) && event.key === "1") {
        event.preventDefault();
        setView({ x: 0, y: 0, zoom: 1 });
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "j") {
        event.preventDefault();
        joinSelectedAnchors("center");
        return;
      }
      const delta = event.shiftKey ? 10 : 1;
      const map = { ArrowLeft: [-delta, 0], ArrowRight: [delta, 0], ArrowUp: [0, -delta], ArrowDown: [0, delta] };
      if (map[event.key] && selection.anchors.length) {
        event.preventDefault();
        moveSelected(map[event.key][0], map[event.key][1]);
      }
      if ((event.key === "Backspace" || event.key === "Delete") && (selection.anchors.length || selection.segments.length || (selection.handles || []).length)) {
        event.preventDefault();
        deleteSelection();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selection, glyph]);

  useEffect(() => {
    const hasInteraction = () => {
      const current = interactionRef.current;
      return Boolean(current.drag || current.marquee || current.shapeDraft || current.guideDraft);
    };
    const move = (event) => {
      if (hasInteraction()) handleMoveRef.current?.(event);
    };
    const release = () => {
      if (hasInteraction()) handleUpRef.current?.();
    };
    document.addEventListener("mousemove", move, true);
    document.addEventListener("mouseup", release, true);
    window.addEventListener("blur", release);
    return () => {
      document.removeEventListener("mousemove", move, true);
      document.removeEventListener("mouseup", release, true);
      window.removeEventListener("blur", release);
    };
  }, []);

  function rotationOriginForBox(box) {
    return originFromRotatedBox(box, referencePoint);
  }

  function localPoint(event) {
    return svgLocalPoint(svgRef.current, event);
  }

  function anchorPoint(event) {
    const point = localPoint(event);
    return snapPoint(point, VECTOR_GRID_SIZE);
  }

  function updatePaths(updater, history = true) {
    onChange((current) => ({ paths: updater(current.paths) }), history);
  }

  function startHistoryGesture() {
    dragBaseRef.current = { paths: glyph.paths, pixels: glyph.pixels };
  }

  function finishHistoryGesture(changed) {
    if (changed && dragBaseRef.current) {
      onChange((current) => current, true, dragBaseRef.current);
    }
    dragBaseRef.current = null;
  }

  function handleCanvasDown(event) {
    setGuideMenu(null);
    setJoinMenu(null);
    if (proofMode) {
      setDrag({ type: "pan", startClient: { x: event.clientX, y: event.clientY }, startView: view });
      return;
    }
    const point = localPoint(event);
    if (activeTool === "select") {
      setMarquee({ start: point, end: point, additive: event.shiftKey });
      return;
    }
    if (activeTool === "rect" || activeTool === "ellipse") {
      const snapped = snapPoint(clampWorkspacePoint(point), VECTOR_GRID_SIZE);
      setShapeDraft({ type: activeTool, start: snapped, end: snapped });
      return;
    }
    if (activeTool === "erase") return;
    if (activeTool === "pen" || activeTool === "anchor") {
      const hit = hitAnchor(glyph.paths, point, 14 * handleScale);
      if (hit && activePathId && hit.pathId === activePathId && hit.pointIndex === 0 && pathById(glyph.paths, activePathId)?.points.length > 1) {
        updatePaths((paths) => paths.map((path) => path.id === activePathId ? { ...path, closed: true } : path));
        setActivePathId(null);
        setTool("select");
        return;
      }
      if (hit && activePathId && hit.pathId !== activePathId && isPathEndpoint(glyph.paths, hit)) {
        connectOpenPaths(activePathId, hit.pathId, hit.pointIndex);
        setActivePathId(activePathId);
        setSelection({ anchors: [{ pathId: activePathId, pointIndex: pathById(glyph.paths, activePathId)?.points.length || 0 }], segments: [], widgets: [], handles: [] });
        return;
      }
      if (hit && !activePathId && isPathEndpoint(glyph.paths, hit)) {
        if (hit.pointIndex === 0) reversePath(hit.pathId);
        setActivePathId(hit.pathId);
        setSelection({ anchors: [hit], segments: [], widgets: [], handles: [] });
        return;
      }
      startHistoryGesture();
      const snapped = snapPoint(clampWorkspacePoint(point), VECTOR_GRID_SIZE);
      const previousPoint = activePathId ? pathById(glyph.paths, activePathId)?.points.at(-1) : null;
      const shifted = event.shiftKey && previousPoint ? constrainOrthogonal(previousPoint, snapped) : snapped;
      const corrected = activePathId ? nearestConnectionPoint(glyph.paths, shifted, activePathId) || shifted : shifted;
      const pathId = addPenPoint(corrected, false);
      setDrag({ type: "newHandle", pathId, point: corrected });
    }
  }

  function handleMove(event) {
    const point = localPoint(event);
    if (guideDraft) {
      const next = clampWorkspacePoint(point);
      setGuideDraft({
        ...guideDraft,
        x: snapValue(next.x, VECTOR_GRID_SIZE),
        y: snapValue(next.y, VECTOR_GRID_SIZE),
      });
    } else if (drag?.type === "pan") {
      const rect = svgRef.current.getBoundingClientRect();
      const dx = ((event.clientX - drag.startClient.x) / rect.width) * (CANVAS_SIZE / drag.startView.zoom);
      const dy = ((event.clientY - drag.startClient.y) / rect.height) * (CANVAS_SIZE / drag.startView.zoom);
      setView(clampView({ ...drag.startView, x: drag.startView.x - dx, y: drag.startView.y - dy }));
    } else if (drag?.type === "anchor") {
      const constrained = event.shiftKey ? constrainPointFromStart(drag.start || drag.last, point, true) : point;
      const next = snapPoint(clampWorkspacePoint(constrained), VECTOR_GRID_SIZE);
      const moved = moveAnchor(drag.anchor, next.x - drag.last.x, next.y - drag.last.y, false);
      setDrag({ ...drag, last: { x: drag.last.x + moved.dx, y: drag.last.y + moved.dy } });
    } else if (drag?.type === "selection") {
      const constrained = event.shiftKey && drag.start ? constrainPointFromStart(drag.start, point, true) : point;
      const next = snapPoint(clampWorkspacePoint(constrained), VECTOR_GRID_SIZE);
      const moved = moveSelected(next.x - drag.last.x, next.y - drag.last.y, false);
      setDrag({ ...drag, last: { x: drag.last.x + moved.dx, y: drag.last.y + moved.dy } });
    } else if (drag?.type === "segment") {
      const constrained = event.shiftKey && drag.start ? constrainPointFromStart(drag.start, point, true) : point;
      const next = snapPoint(clampWorkspacePoint(constrained), VECTOR_GRID_SIZE);
      const moved = moveSegments(drag.segments, next.x - drag.last.x, next.y - drag.last.y, false);
      setDrag({ ...drag, last: { x: drag.last.x + moved.dx, y: drag.last.y + moved.dy } });
    } else if (drag?.type === "bbox-scale") {
      scaleSelectedFromBox(drag.box, drag.handle, snapPoint(clampWorkspacePoint(point), VECTOR_GRID_SIZE), false);
    } else if (drag?.type === "bbox-rotate") {
      const angle = Math.atan2(point.y - drag.center.y, point.x - drag.center.x);
      const delta = snapAngle(angle - drag.startAngle, Math.PI / 180);
      rotateSelectedFromBase(drag.center, delta, false);
      setRotationLabel({
        x: point.x + 6 / view.zoom,
        y: point.y - 8 / view.zoom,
        angle: normalizeDegrees((delta * 180) / Math.PI),
      });
    } else if (drag?.type === "guide-move") {
      const next = snapPoint(clampWorkspacePoint(point), VECTOR_GRID_SIZE);
      setGuides((items) => items.map((guide) => guide.id === drag.guideId ? { ...guide, x: next.x, y: next.y } : guide));
    } else if (drag?.type === "guide-rotate") {
      setGuides((items) => items.map((guide) => {
        if (guide.id !== drag.guideId) return guide;
        const rawAngle = Math.atan2(point.y - guide.y, point.x - guide.x);
        const angle = event.shiftKey ? snapAngle(rawAngle, Math.PI / 4) : rawAngle;
        setRotationLabel({ x: point.x + 6 / view.zoom, y: point.y - 8 / view.zoom, angle: normalizeDegrees((angle * 180) / Math.PI) });
        return { ...guide, angle };
      }));
    } else if (drag?.type === "corner") {
      moveCorner(drag.anchor, point, false);
      const moved = drag.moved || Math.hypot(point.x - drag.last.x, point.y - drag.last.y) > 1;
      setDrag({ ...drag, last: point, moved });
    } else if (drag?.type === "handle") {
      moveHandle(drag.anchor, drag.side, point, false);
    } else if (drag?.type === "newHandle") {
      const distance = Math.hypot(point.x - drag.point.x, point.y - drag.point.y);
      if (distance > 4) setLastPointHandles(drag.pathId, clampWorkspacePoint(point), false);
    } else if (marquee) {
      setMarquee({ ...marquee, end: point });
    } else if (shapeDraft) {
      const end = event.shiftKey ? constrainShapeEnd(shapeDraft.start, point) : point;
      setShapeDraft({ ...shapeDraft, end: snapPoint(clampWorkspacePoint(end), VECTOR_GRID_SIZE) });
    } else if (activeTool === "pen") {
      setTangentGuide(nearestTangentGuide(glyph.paths, point, activePathId));
    }
  }

  function handleUp() {
    try {
      if (guideDraft) {
        setGuides((items) => [...items, { id: crypto.randomUUID(), ...guideDraft }]);
      }
      if (marquee) {
        const box = normalizedBox(marquee.start, marquee.end);
        const anchors = [];
        const segments = [];
        glyph.paths.forEach((path) => path.points.forEach((point, pointIndex) => {
          if (point.x >= box.x && point.x <= box.x + box.w && point.y >= box.y && point.y <= box.y + box.h) anchors.push({ pathId: path.id, pointIndex });
        }));
        glyph.paths.forEach((path) => getSegments(path).forEach((segment) => {
          if (segmentHitsBox(segment, box)) segments.push({ pathId: path.id, index: segment.index, nextIndex: segment.nextIndex });
        }));
        if (marquee.additive) {
          setSelection((previous) => ({ anchors: uniqueAnchors([...(previous.anchors || []), ...anchors]), segments: uniqueSegments([...(previous.segments || []), ...segments]), widgets: previous.widgets || [], handles: previous.handles || [] }));
        } else {
          setSelection({ anchors, segments, widgets: [], handles: [] });
        }
      }
      if (shapeDraft) {
        const box = normalizedBox(shapeDraft.start, shapeDraft.end);
        if (box.w > 3 && box.h > 3) {
          const path = shapeDraft.type === "ellipse" ? ellipsePath({ x: box.x, y: box.y, w: box.w, h: box.h, strokeWidth: style.strokeWidth, displayMode: style.pathDisplay }) : rectPath(box.x, box.y, box.w, box.h, style.strokeWidth, "sharp", 0, false, style.pathDisplay);
          onChange((current) => ({ paths: [...current.paths, path] }));
        }
      }
      finishHistoryGesture(Boolean(drag && drag.type !== "pan"));
    } finally {
      if (drag?.type === "corner" && drag.toggleWidget && !drag.moved) {
        toggleRadiusWidget(drag.toggleWidget, drag.additiveToggle);
      }
      setGuideDraft(null);
      setMarquee(null);
      setShapeDraft(null);
      setTangentGuide(null);
      setRotationLabel(null);
      setDrag(null);
      dragBaseRef.current = null;
    }
  }

  function toggleRadiusWidget(widget, additive = false) {
    setSelection((previous) => {
      const widgets = previous.widgets || [];
      const exists = widgets.some((item) => item.pathId === widget.pathId && item.cornerSource === widget.cornerSource);
      const nextWidgets = exists
        ? widgets.filter((item) => !(item.pathId === widget.pathId && item.cornerSource === widget.cornerSource))
        : uniqueWidgets(additive ? [...widgets, widget] : [widget]);
      return {
        anchors: additive ? (previous.anchors || []) : [],
        segments: additive ? (previous.segments || []) : [],
        widgets: nextWidgets,
        handles: additive ? (previous.handles || []) : [],
      };
    });
  }

  function handleWheel(event) {
    if (!event.altKey) return;
    event.preventDefault();
    const nextZoom = Math.max(1, Math.min(8, event.deltaY < 0 ? view.zoom * 1.12 : view.zoom / 1.12));
    const rect = svgRef.current.getBoundingClientRect();
    const fx = (event.clientX - rect.left) / rect.width;
    const fy = (event.clientY - rect.top) / rect.height;
    const pointer = { x: view.x + fx * viewSize, y: view.y + fy * viewSize };
    const nextSize = CANVAS_SIZE / nextZoom;
    setView(clampView({
      zoom: nextZoom,
      x: pointer.x - fx * nextSize,
      y: pointer.y - fy * nextSize,
    }));
  }

  interactionRef.current = { drag, marquee, shapeDraft, guideDraft };
  handleMoveRef.current = handleMove;
  handleUpRef.current = handleUp;

  function addPenPoint(point, history = true) {
    const targetPathId = activePathId || crypto.randomUUID();
    onChange((current) => {
      let paths = [...current.paths];
      if (!activePathId) {
        const path = newPath(style, targetPathId);
        path.points = [newPoint(point.x, point.y)];
        paths.push(path);
        setActivePathId(path.id);
      } else {
        paths = paths.map((path) => path.id === activePathId ? { ...path, points: [...path.points, newPoint(point.x, point.y)] } : path);
      }
      return { paths };
    }, history);
    return targetPathId;
  }

  function setLastPointHandles(pathId, handlePoint, history = true) {
    updatePaths((paths) => paths.map((path) => {
      if (path.id !== pathId) return path;
      const lastIndex = path.points.length - 1;
      return {
        ...path,
        points: path.points.map((point, index) => index === lastIndex ? clampEditablePoint(withSymmetricHandles(point, clampWorkspacePoint(handlePoint))) : point),
      };
    }), history);
  }

  function moveSelected(dx, dy, history = true) {
    const limited = limitSelectionDelta(glyph.paths, selection.anchors, dx, dy);
    updatePaths((paths) => paths.map((path) => ({
      ...path,
      ...movePathPoints(detachRadiusForIndexes(path, selection.anchors.filter((anchor) => anchor.pathId === path.id).map((anchor) => anchor.pointIndex)), selection.anchors.filter((anchor) => anchor.pathId === path.id).map((anchor) => anchor.pointIndex), (point) => translatePoint(point, limited.dx, limited.dy)),
    })), history);
    return limited;
  }

  function moveAnchor(anchor, dx, dy, history = true) {
    const limited = limitSelectionDelta(glyph.paths, [anchor], dx, dy);
    updatePaths((paths) => paths.map((path) => path.id === anchor.pathId ? { ...path, ...movePathPoints(detachRadiusForIndexes(path, [anchor.pointIndex]), [anchor.pointIndex], (point) => translatePoint(point, limited.dx, limited.dy)) } : path), history);
    return limited;
  }

  function moveSegments(segments, dx, dy, history = true) {
    const anchors = uniqueSegments(segments).flatMap((segment) => [{ pathId: segment.pathId, pointIndex: segment.index }, { pathId: segment.pathId, pointIndex: segment.nextIndex }]);
    const limited = limitSelectionDelta(glyph.paths, anchors, dx, dy);
    updatePaths((paths) => paths.map((path) => {
      const indexes = uniqueSegments(segments)
        .filter((segment) => segment.pathId === path.id)
        .flatMap((segment) => [segment.index, segment.nextIndex]);
      if (!indexes.length) return path;
      const uniqueIndexes = [...new Set(indexes)];
      return {
        ...path,
        ...movePathPoints(detachRadiusForIndexes(path, uniqueIndexes), uniqueIndexes, (point) => translatePoint(point, limited.dx, limited.dy)),
      };
    }), history);
    return limited;
  }

  function moveHandle(anchor, side, absolute, history = true) {
    updatePaths((paths) => paths.map((path) => path.id === anchor.pathId ? { ...path, ...movePathPoints(detachRadiusForIndexes(path, [anchor.pointIndex]), [anchor.pointIndex], (point, index) => {
      if (index !== anchor.pointIndex) return point;
      if (!point.smooth) return { ...point, [side]: { x: absolute.x, y: absolute.y } };
      const otherSide = side === "in" ? "out" : "in";
      return {
        ...point,
        [side]: { x: absolute.x, y: absolute.y },
        [otherSide]: { x: point.x - (absolute.x - point.x), y: point.y - (absolute.y - point.y) },
      };
    }) } : path), history);
  }

  function moveCorner(anchor, absolute, history = true) {
    const basePaths = dragBaseRef.current?.paths || glyph.paths;
    if (anchor.cornerSource) {
      const basePath = pathById(basePaths, anchor.pathId);
      const origin = anchor.cornerOrigin || roundedCornerOrigin(basePath, anchor.cornerSource) || basePath?.points[anchor.pointIndex];
      const rawRadius = origin ? projectedCornerRadius(basePath, anchor, absolute, origin) : 0;
      const selectedSources = new Set(drag?.activeSources || selectedRadiusWidgetsForPath(basePath, selection).map((widget) => widget.cornerSource));
      const activeSources = selectedSources.has(anchor.cornerSource) ? selectedSources : new Set([anchor.cornerSource]);
      const draggedWidget = roundedCornerWidgets(basePath).find((widget) => widget.cornerSource === anchor.cornerSource);
      const draggedBaseRadius = draggedWidget ? Math.hypot(basePath.points[draggedWidget.indexes[0]].x - draggedWidget.origin.x, basePath.points[draggedWidget.indexes[0]].y - draggedWidget.origin.y) : 0;
      const radiusDelta = rawRadius - draggedBaseRadius;
      updatePaths((paths) => paths.map((path) => {
        if (path.id !== anchor.pathId) return path;
        const sourcePath = pathById(basePaths, path.id) || path;
        const targets = roundedCornerWidgets(sourcePath).map((widget) => {
          const currentRadius = Math.hypot(sourcePath.points[widget.indexes[0]].x - widget.origin.x, sourcePath.points[widget.indexes[0]].y - widget.origin.y);
          return {
            id: widget.cornerSource,
            baseRadius: currentRadius,
            radius: activeSources.has(widget.cornerSource) ? Math.max(0, currentRadius + radiusDelta) : currentRadius,
          };
        });
        sourcePath.points.forEach((point, pointIndex) => {
          if (!activeSources.has(point.id) || targets.some((target) => target.id === point.id) || !isRoundableCorner(sourcePath, pointIndex)) return;
          targets.push({ id: point.id, baseRadius: 0, radius: Math.max(0, radiusDelta) });
        });
        if (!targets.some((target) => target.id === anchor.cornerSource)) targets.push({ id: anchor.cornerSource, baseRadius: 0, radius: rawRadius });
        return applyRadiusTargets(sourcePath, targets);
      }), history);
      return;
    }
    const basePathForRadius = pathById(basePaths, anchor.pathId);
    const basePointForRadius = basePathForRadius?.points[anchor.pointIndex];
    const explicitSources = new Set(drag?.activeSources || []);
    const targets = explicitSources.size
      ? glyph.paths.flatMap((path) => path.points.map((point, pointIndex) => ({ pathId: path.id, pointIndex, sourceId: point.id })).filter((item) => explicitSources.has(item.sourceId)))
      : selection.anchors.length > 1 ? selection.anchors : [anchor];
    const sharedLimit = sharedRadiusLimitForTargets(basePaths, targets);
    const rawRadius = basePointForRadius ? projectedCornerRadius(basePathForRadius, anchor, absolute, basePointForRadius) : null;
    const radiusOverride = rawRadius == null ? null : Math.min(rawRadius, sharedLimit);
    updatePaths((paths) => paths.map((path) => {
      const basePath = pathById(basePaths, path.id) || path;
      const pathTargets = targets.filter((item) => item.pathId === path.id).map((item) => item.pointIndex);
      if (!pathTargets.length) return path;
      return pathTargets
        .sort((a, b) => b - a)
        .reduce((currentPath, pointIndex) => roundCornerInPath(currentPath, pointIndex, absolute, radiusOverride), basePath);
    }), history);
  }

  function scaleSelectedFromBox(box, handle, point, history = true) {
    if (box.angle) {
      scaleSelectedFromRotatedBox(box, handle, point, history);
      return;
    }
    const fixed = {
      nw: { x: box.x + box.w, y: box.y + box.h },
      ne: { x: box.x, y: box.y + box.h },
      sw: { x: box.x + box.w, y: box.y },
      se: { x: box.x, y: box.y },
      n: { x: box.x + box.w / 2, y: box.y + box.h },
      s: { x: box.x + box.w / 2, y: box.y },
      w: { x: box.x + box.w, y: box.y + box.h / 2 },
      e: { x: box.x, y: box.y + box.h / 2 },
    }[handle];
    const moving = bboxMovingPoint(box, handle);
    let sx = (point.x - fixed.x) / ((moving.x - fixed.x) || 1);
    let sy = (point.y - fixed.y) / ((moving.y - fixed.y) || 1);
    if (handle === "n" || handle === "s") sx = 1;
    if (handle === "w" || handle === "e") sy = 1;
    sx = clampScale(sx, box.w);
    sy = clampScale(sy, box.h);
    const basePaths = dragBaseRef.current?.paths || glyph.paths;
    updatePaths((paths) => paths.map((path) => {
      const selected = selection.anchors.filter((anchor) => anchor.pathId === path.id).map((anchor) => anchor.pointIndex);
      if (!selected.length) return path;
      const basePath = pathById(basePaths, path.id) || path;
      const scaled = {
        ...path,
        ...movePathPoints(basePath, selected, (item) => scalePoint(item, fixed, sx, sy)),
      };
      return boxWithinWorkspace(selectionBoxForPath(scaled)) ? scaled : path;
    }), history);
  }

  function scaleSelectedFromRotatedBox(box, handle, point, history = true) {
    const center = box.rotationCenter || { x: box.x + box.w / 2, y: box.y + box.h / 2 };
    const localPoint = rotatePlainPoint(point, center, -(box.angle || 0));
    const fixed = {
      nw: { x: box.x + box.w, y: box.y + box.h },
      ne: { x: box.x, y: box.y + box.h },
      sw: { x: box.x + box.w, y: box.y },
      se: { x: box.x, y: box.y },
      n: { x: box.x + box.w / 2, y: box.y + box.h },
      s: { x: box.x + box.w / 2, y: box.y },
      w: { x: box.x + box.w, y: box.y + box.h / 2 },
      e: { x: box.x, y: box.y + box.h / 2 },
    }[handle];
    const moving = bboxMovingPoint(box, handle);
    let sx = (localPoint.x - fixed.x) / ((moving.x - fixed.x) || 1);
    let sy = (localPoint.y - fixed.y) / ((moving.y - fixed.y) || 1);
    if (handle === "n" || handle === "s") sx = 1;
    if (handle === "w" || handle === "e") sy = 1;
    sx = clampScale(sx, box.w);
    sy = clampScale(sy, box.h);
    const basePaths = dragBaseRef.current?.paths || glyph.paths;
    updatePaths((paths) => paths.map((path) => {
      const selected = selection.anchors.filter((anchor) => anchor.pathId === path.id).map((anchor) => anchor.pointIndex);
      if (!selected.length) return path;
      const basePath = pathById(basePaths, path.id) || path;
      const scaled = {
        ...path,
        ...movePathPoints(basePath, selected, (item) => {
          const local = rotatePoint(item, center, -(box.angle || 0));
          const scaled = scalePoint(local, fixed, sx, sy);
          return rotatePoint(scaled, center, box.angle || 0);
        }),
      };
      return boxWithinWorkspace(selectionBoxForPath(scaled)) ? scaled : path;
    }), history);
  }

  function rotateSelectedFromBase(center, angle, history = true) {
    const basePaths = dragBaseRef.current?.paths || glyph.paths;
    updatePaths((paths) => paths.map((path) => {
      const selected = selection.anchors.filter((anchor) => anchor.pathId === path.id).map((anchor) => anchor.pointIndex);
      if (!selected.length) return path;
      const basePath = pathById(basePaths, path.id) || path;
      const rotated = {
        ...path,
        rotationAngle: (basePath.rotationAngle || 0) + angle,
        rotationCenter: center,
        ...movePathPoints(basePath, selected, (item) => rotatePoint(item, center, angle)),
      };
      return boxWithinWorkspace(selectionBoxForPath(rotated)) ? rotated : path;
    }), history);
  }

  function deleteSelection() {
    if ((selection.handles || []).length) {
      deleteHandles(selection.handles || []);
      setSelection((previous) => ({ ...(previous || {}), handles: [] }));
      return;
    }
    const segmentEndpointKeys = new Set((selection.segments || []).flatMap((segment) => [
      `${segment.pathId}:${segment.index}`,
      `${segment.pathId}:${segment.nextIndex}`,
    ]));
    const anchors = (selection.segments || []).length
      ? (selection.anchors || []).filter((anchor) => !segmentEndpointKeys.has(`${anchor.pathId}:${anchor.pointIndex}`))
      : selection.anchors;
    deleteItems(anchors, selection.segments);
    setSelection({ anchors: [], segments: [], widgets: [], handles: [] });
  }

  function deleteHandles(handles) {
    const byPath = new Map();
    uniqueHandles(handles).forEach((handle) => {
      if (!byPath.has(handle.pathId)) byPath.set(handle.pathId, []);
      byPath.get(handle.pathId).push(handle);
    });
    updatePaths((paths) => paths.map((path) => {
      const pathHandles = byPath.get(path.id) || [];
      if (!pathHandles.length) return path;
      const affectedIndexes = new Set(pathHandles.map((handle) => handle.pointIndex));
      const detached = detachRadiusForIndexes(path, [...affectedIndexes]);
      const byPoint = new Map();
      pathHandles.forEach((handle) => {
        if (!byPoint.has(handle.pointIndex)) byPoint.set(handle.pointIndex, new Set());
        byPoint.get(handle.pointIndex).add(handle.side);
      });
      pathHandles.forEach((handle) => {
        if (handle.side === "in" && (detached.closed || handle.pointIndex > 0)) {
          const prevIndex = (handle.pointIndex - 1 + detached.points.length) % detached.points.length;
          if (!byPoint.has(prevIndex)) byPoint.set(prevIndex, new Set());
          byPoint.get(prevIndex).add("out");
        }
        if (handle.side === "out" && (detached.closed || handle.pointIndex < detached.points.length - 1)) {
          const nextIndex = (handle.pointIndex + 1) % detached.points.length;
          if (!byPoint.has(nextIndex)) byPoint.set(nextIndex, new Set());
          byPoint.get(nextIndex).add("in");
        }
      });
      const points = detached.points.map((point, index) => {
        const sides = byPoint.get(index);
        if (!sides) return point;
        const next = { ...point, smooth: false };
        if (sides.has("in")) next.in = null;
        if (sides.has("out")) next.out = null;
        return next;
      });
      return { ...detached, points };
    }));
  }

  function deleteItems(anchors, segments) {
    const anchorsToDelete = new Set(anchors.map((anchor) => `${anchor.pathId}:${anchor.pointIndex}`));
    const segmentsByPath = new Map();
    segments.forEach((segment) => {
      if (!segmentsByPath.has(segment.pathId)) segmentsByPath.set(segment.pathId, []);
      segmentsByPath.get(segment.pathId).push(segment);
    });
    updatePaths((paths) => paths.flatMap((path) => {
      const withoutAnchors = normalizeIsolatedAnchors({
        ...path,
        closed: path.closed && ![0, path.points.length - 1].some((index) => anchorsToDelete.has(`${path.id}:${index}`)),
        points: path.points.filter((_, index) => !anchorsToDelete.has(`${path.id}:${index}`)),
        subpaths: path.subpaths?.map((ring) => ring.filter((point) => {
          const index = path.points.findIndex((candidate) => candidate.id === point.id);
          return !anchorsToDelete.has(`${path.id}:${index}`);
        })).filter((ring) => ring.length),
      });
      const pathSegments = segmentsByPath.get(path.id) || [];
      if (!pathSegments.length) return withoutAnchors.points.length ? [withoutAnchors] : [];
      const affected = pathSegments.flatMap((segment) => [segment.index, segment.nextIndex]);
      return deleteSegmentsFromPath(detachRadiusForIndexes(withoutAnchors, affected), pathSegments).map(normalizeIsolatedAnchors).filter((item) => item.points.length);
    }));
  }

function pathSegmentClick(event, path, index, nextIndex) {
    event.stopPropagation();
    const segment = { pathId: path.id, index, nextIndex };
    if (activeTool === "pen") {
      const raw = snapPoint(clampWorkspacePoint(localPoint(event)), VECTOR_GRID_SIZE);
      const previousPoint = activePathId ? pathById(glyph.paths, activePathId)?.points.at(-1) : null;
      const shifted = event.shiftKey && previousPoint ? constrainOrthogonal(previousPoint, raw) : raw;
      const point = activePathId ? nearestConnectionPoint(glyph.paths, shifted, activePathId) || shifted : shifted;
      if (activePathId) {
        startHistoryGesture();
        const pathId = addPenPoint(point, false);
        setDrag({ type: "newHandle", pathId, point });
        return;
      }
      updatePaths((paths) => paths.map((item) => item.id === path.id ? {
        ...item,
        points: item.points.flatMap((anchor, anchorIndex) => anchorIndex === index ? [anchor, newPoint(point.x, point.y)] : [anchor]),
      } : item));
      setSelection({ anchors: [{ pathId: path.id, pointIndex: index + 1 }], segments: [], widgets: [], handles: [] });
      setActivePathId(null);
      return;
    }
    if (activeTool === "erase") {
      deleteItems([], [segment]);
      return;
    }
    if (activeTool === "rect" || activeTool === "ellipse") setTool("select");
    const anchorHit = hitAnchor(glyph.paths, localPoint(event), 7 * handleScale);
    if (anchorHit) {
      anchorMouseDown(event, anchorHit.pathId, anchorHit.pointIndex);
      return;
    }
    const segmentAnchors = [{ pathId: path.id, pointIndex: index }, { pathId: path.id, pointIndex: nextIndex }];
    const alreadySelected = selection.segments.some((item) => item.pathId === segment.pathId && item.index === segment.index && item.nextIndex === segment.nextIndex);
    const dragSegments = alreadySelected ? selection.segments : event.shiftKey ? uniqueSegments([...(selection.segments || []), segment]) : [segment];
    if (event.shiftKey && activeTool === "select") {
      setSelection((previous) => ({
        anchors: uniqueAnchors([...(previous.anchors || []), ...segmentAnchors]),
        segments: uniqueSegments([...(previous.segments || []), segment]),
        widgets: previous.widgets || [],
        handles: previous.handles || [],
      }));
    } else {
      setSelection({ anchors: segmentAnchors, segments: [segment], widgets: [], handles: [] });
    }
    startHistoryGesture();
    const start = snapPoint(clampWorkspacePoint(localPoint(event)), VECTOR_GRID_SIZE);
    setDrag({ type: "segment", segments: dragSegments, last: start, start });
  }

  function pathSegmentDoubleClick(event, path) {
    event.stopPropagation();
    if (activeTool === "rect" || activeTool === "ellipse") setTool("select");
    const anchors = path.points.map((_, pointIndex) => ({ pathId: path.id, pointIndex }));
    const segments = getSegments(path).map((segment) => ({ pathId: path.id, index: segment.index, nextIndex: segment.nextIndex }));
    if (event.shiftKey) {
      setSelection((previous) => ({
        anchors: uniqueAnchors([...(previous.anchors || []), ...anchors]),
        segments: uniqueSegments([...(previous.segments || []), ...segments]),
        widgets: previous.widgets || [],
        handles: previous.handles || [],
      }));
      return;
    }
    setSelection({
      anchors,
      segments,
      widgets: [],
      handles: [],
    });
  }

  function anchorMouseDown(event, pathId, pointIndex) {
    event.stopPropagation();
    if (activeTool === "rect" || activeTool === "ellipse") setTool("select");
    const anchor = { pathId, pointIndex };
    if ((activeTool === "pen" || activeTool === "anchor") && activePathId === pathId && pointIndex === 0 && pathById(glyph.paths, pathId)?.points.length > 1) {
      updatePaths((paths) => paths.map((path) => path.id === pathId ? { ...path, closed: true } : path));
      setActivePathId(null);
      setTool("select");
      return;
    }
    if (activeTool === "erase") {
      deleteItems([anchor], []);
      return;
    }
    if ((activeTool === "pen" || activeTool === "anchor") && !activePathId && isPathEndpoint(glyph.paths, anchor)) {
      if (pointIndex === 0) reversePath(pathId);
      setActivePathId(pathId);
    }
    const alreadySelected = selection.anchors.some((item) => item.pathId === pathId && item.pointIndex === pointIndex);
    if (event.shiftKey && activeTool === "select") {
      setSelection((previous) => ({
        anchors: alreadySelected
          ? (previous.anchors || []).filter((item) => !(item.pathId === pathId && item.pointIndex === pointIndex))
          : [...(previous.anchors || []), anchor],
        segments: previous.segments || [],
        widgets: previous.widgets || [],
        handles: previous.handles || [],
      }));
      const start = anchorPoint(event);
      setDrag({ type: "selection", last: start, start });
      return;
    }
    if (activeTool === "select" && alreadySelected && selection.anchors.length > 1) {
      startHistoryGesture();
      const start = anchorPoint(event);
      setDrag({ type: "selection", last: start, start });
      return;
    }
    setSelection({ anchors: [anchor], segments: [], widgets: [], handles: [] });
    startHistoryGesture();
    const start = anchorPoint(event);
    setDrag({ type: "anchor", anchor, last: start, start });
  }

  function anchorDoubleClick(event, pathId, pointIndex) {
    event.stopPropagation();
    updatePaths((paths) => paths.map((path) => path.id === pathId ? { ...path, points: path.points.map((point, index) => index === pointIndex ? toggleSmooth(point) : point) } : path));
  }

  function reversePath(pathId) {
    updatePaths((paths) => paths.map((path) => path.id === pathId ? {
      ...path,
      points: [...path.points].reverse().map((point) => ({ ...point, in: point.out, out: point.in })),
    } : path));
  }

  function connectOpenPaths(activeId, targetId, targetIndex) {
    updatePaths((paths) => {
      const active = pathById(paths, activeId);
      const target = pathById(paths, targetId);
      if (!active || !target || active.closed || target.closed) return paths;
      const activePoints = active.points;
      const targetPoints = targetIndex === 0 ? target.points : [...target.points].reverse().map((point) => ({ ...point, in: point.out, out: point.in }));
      const connected = { ...active, points: [...activePoints, ...targetPoints] };
      return paths.filter((path) => path.id !== activeId && path.id !== targetId).concat(connected);
    });
  }

  function joinSelectedAnchors(mode) {
    if (selection.anchors.length < 2) return;
    const first = selection.anchors[0];
    const last = selection.anchors[selection.anchors.length - 1];
    updatePaths((paths) => joinPathsByAnchors(paths, first, last, mode));
    setJoinMenu(null);
  }

  function anchorContextMenu(event, pathId, pointIndex) {
    event.preventDefault();
    event.stopPropagation();
    const anchor = { pathId, pointIndex };
    const exists = selection.anchors.some((item) => item.pathId === pathId && item.pointIndex === pointIndex);
    if (!exists) setSelection((previous) => ({ ...previous, anchors: [...(previous.anchors || []), anchor] }));
    if ((exists ? selection.anchors.length : selection.anchors.length + 1) >= 2) {
      setJoinMenu({ x: event.clientX, y: event.clientY });
    }
  }

  const draftPath = shapeDraft ? (shapeDraft.type === "ellipse" ? ellipsePath({ ...normalizedBox(shapeDraft.start, shapeDraft.end), strokeWidth: style.strokeWidth, displayMode: style.pathDisplay }) : rectPath(...rectArgs(normalizedBox(shapeDraft.start, shapeDraft.end), style.strokeWidth, "sharp", 0, false, style.pathDisplay))) : null;

  function cornerMouseDown(event, anchor) {
    event.stopPropagation();
    if (activeTool === "rect" || activeTool === "ellipse") setTool("select");
    const path = pathById(glyph.paths, anchor.pathId);
    const sourceId = anchor.cornerSource || path?.points[anchor.pointIndex]?.id;
    if (!sourceId) return;
    const widget = { pathId: anchor.pathId, cornerSource: sourceId };
    const explicitWidgets = selection.widgets || [];
    const derivedWidgets = selectedRadiusWidgetsForPath(path, selection).map((item) => ({ pathId: anchor.pathId, cornerSource: item.cornerSource }));
    const currentWidgets = explicitWidgets.length ? explicitWidgets : derivedWidgets;
    const isSelected = explicitWidgets.some((item) => item.pathId === widget.pathId && item.cornerSource === widget.cornerSource);
    let nextWidgets = explicitWidgets.length ? explicitWidgets : [widget];
    let pendingToggle = null;
    if (!explicitWidgets.length) {
      nextWidgets = event.shiftKey ? uniqueWidgets([...derivedWidgets, widget]) : [widget];
      setSelection({
        anchors: event.shiftKey ? (selection.anchors || []) : [],
        segments: event.shiftKey ? (selection.segments || []) : [],
        widgets: nextWidgets,
        handles: event.shiftKey ? (selection.handles || []) : [],
      });
    } else if (isSelected) {
      pendingToggle = widget;
    } else {
      nextWidgets = uniqueWidgets(event.shiftKey ? [...currentWidgets, widget] : [widget]);
      setSelection({
        anchors: event.shiftKey ? (selection.anchors || []) : [],
        segments: event.shiftKey ? (selection.segments || []) : [],
        widgets: nextWidgets,
        handles: event.shiftKey ? (selection.handles || []) : [],
      });
    }
    const activeSources = (isSelected ? currentWidgets : nextWidgets).map((item) => item.cornerSource);
    startHistoryGesture();
    setDrag({
      type: "corner",
      anchor: { ...anchor, cornerSource: sourceId },
      last: localPoint(event),
      activeSources,
      moved: false,
      toggleWidget: pendingToggle,
      additiveToggle: event.shiftKey,
    });
  }

  function startGuide(event, orientation) {
    event.preventDefault();
    const point = clampWorkspacePoint(localPoint(event));
    setGuideMenu(null);
    setTool("select");
    setGuideDraft({
      orientation,
      x: snapValue(point.x, VECTOR_GRID_SIZE),
      y: snapValue(point.y, VECTOR_GRID_SIZE),
      angle: orientation === "vertical" ? Math.PI / 2 : 0,
      locked: false,
    });
  }

  function guideContext(event, guide) {
    event.preventDefault();
    setGuideMenu({ guideId: guide.id, x: event.clientX, y: event.clientY });
  }

  function guideMouseDown(event, guide, mode = "move") {
    event.stopPropagation();
    setTool("select");
    if (guide.locked) return;
    setDrag({ type: mode === "rotate" ? "guide-rotate" : "guide-move", guideId: guide.id });
  }

  function patchGuide(id, patch) {
    setGuides((items) => items.map((guide) => guide.id === id ? { ...guide, ...patch } : guide));
    setGuideMenu(null);
  }

  function deleteGuide(id) {
    setGuides((items) => items.filter((guide) => guide.id !== id));
    setGuideMenu(null);
  }

  const visibleGuides = proofMode ? [] : [...guides, ...(guideDraft ? [{ id: "draft", ...guideDraft }] : [])];

  return (
    <div className="canvas-shell">
      <div className="canvas-frame">
        <svg className="ruler ruler-top" viewBox={`${view.x} 0 ${viewSize} 24`} preserveAspectRatio="none" onMouseDown={(event) => startGuide(event, "vertical")}>
          <RulerTicks orientation="horizontal" view={view} />
        </svg>
        <RulerLabels orientation="horizontal" view={view} />
        <svg className="ruler ruler-left" viewBox={`0 ${view.y} 24 ${viewSize}`} preserveAspectRatio="none" onMouseDown={(event) => startGuide(event, "horizontal")}>
          <RulerTicks orientation="vertical" view={view} />
        </svg>
        <RulerLabels orientation="vertical" view={view} />
        <svg ref={svgRef} viewBox={viewBox} tabIndex="0" className={`drawing-canvas ${view.x === 0 && view.y === 0 && view.zoom === 1 ? "artboard-default" : ""} ${proofMode ? "pan-ready" : ""} ${drag?.type === "pan" ? "panning" : ""}`} onWheel={handleWheel} onMouseDown={handleCanvasDown} onMouseMove={(event) => {
          if (drag || marquee || shapeDraft || guideDraft) return;
          handleMove(event);
        }}>
        <CanvasGuides zoom={view.zoom} view={view} />
        {visibleGuides.map((guide) => <Guide key={guide.id} guide={guide} handleScale={handleScale} onMouseDown={guideMouseDown} onContextMenu={guideContext} />)}
        {marquee && <rect className="marquee" {...rectBox(normalizedBox(marquee.start, marquee.end))} />}
        {glyph.paths.map((path) => <EditablePath key={path.id} path={path} selection={selection} showCurvature={showCurvature} proofMode={proofMode} handleScale={handleScale} speedPunkSize={speedPunkSize} onSegmentClick={pathSegmentClick} onSegmentDoubleClick={pathSegmentDoubleClick} onBodyMouseDown={(event) => { event.stopPropagation(); const anchorHit = hitAnchor(glyph.paths, localPoint(event), 7 * handleScale); if (anchorHit) { anchorMouseDown(event, anchorHit.pathId, anchorHit.pointIndex); return; } startHistoryGesture(); setDrag({ type: "selection", last: snapPoint(clampWorkspacePoint(localPoint(event)), VECTOR_GRID_SIZE) }); }} onBBoxHandleDown={(event, box, handle) => { event.stopPropagation(); startHistoryGesture(); setDrag({ type: "bbox-scale", box, handle }); }} onBBoxRotateDown={(event, box) => { event.stopPropagation(); const point = localPoint(event); const center = rotationOriginForBox(box); startHistoryGesture(); setDrag({ type: "bbox-rotate", center, startAngle: Math.atan2(point.y - center.y, point.x - center.x) }); }} onAnchorMouseDown={anchorMouseDown} onAnchorDoubleClick={anchorDoubleClick} onAnchorContextMenu={anchorContextMenu} onHandleDown={(event, anchor, side) => { event.stopPropagation(); const handle = { pathId: anchor.pathId, pointIndex: anchor.pointIndex, side }; setSelection((previous) => ({ anchors: event.shiftKey ? (previous.anchors || []) : [], segments: event.shiftKey ? (previous.segments || []) : [], widgets: event.shiftKey ? (previous.widgets || []) : [], handles: event.shiftKey ? uniqueHandles([...(previous.handles || []), handle]) : [handle] })); startHistoryGesture(); setDrag({ type: "handle", anchor, side }); }} onCornerDown={cornerMouseDown} />)}
        {!proofMode && <AnchorOverlay paths={glyph.paths} selection={selection} handleScale={handleScale} onAnchorMouseDown={anchorMouseDown} onAnchorDoubleClick={anchorDoubleClick} onAnchorContextMenu={anchorContextMenu} />}
        {!proofMode && <RadiusWidgetHitOverlay paths={glyph.paths} selection={selection} handleScale={handleScale} onCornerDown={cornerMouseDown} />}
        {!proofMode && <BoundingBoxInteractionOverlay paths={glyph.paths} selection={selection} handleScale={handleScale} onHandleDown={(event, box, handle) => { event.stopPropagation(); startHistoryGesture(); setDrag({ type: "bbox-scale", box, handle }); }} onRotateDown={(event, box) => { event.stopPropagation(); const point = localPoint(event); const center = rotationOriginForBox(box); startHistoryGesture(); setDrag({ type: "bbox-rotate", center, startAngle: Math.atan2(point.y - center.y, point.x - center.x) }); }} />}
        {tangentGuide && <line className="tangent-guide" x1={tangentGuide.x1} y1={tangentGuide.y1} x2={tangentGuide.x2} y2={tangentGuide.y2} />}
        {rotationLabel && <g className="rotation-label"><rect x={rotationLabel.x} y={rotationLabel.y - 10 / view.zoom} width={34 / view.zoom} height={14 / view.zoom} /><text x={rotationLabel.x + 4 / view.zoom} y={rotationLabel.y} fontSize={9 / view.zoom}>{rotationLabel.angle}°</text></g>}
        {glyph.pixels.map((pixel) => <g className="shared-pixel" key={`${pixel.x}-${pixel.y}-${pixel.size}-${pixel.shape || "square"}`}><PixelMark pixel={pixel} /></g>)}
        {draftPath && <path className="draft-path" d={pathToD(draftPath)} fill="none" stroke="black" strokeWidth={draftPath.strokeWidth} />}
        </svg>
      </div>
      {guideMenu && (
        <div className="guide-menu" style={{ left: guideMenu.x, top: guideMenu.y }}>
          <button onClick={() => patchGuide(guideMenu.guideId, { locked: !guides.find((guide) => guide.id === guideMenu.guideId)?.locked })}>{guides.find((guide) => guide.id === guideMenu.guideId)?.locked ? "Unlock Guide" : "Lock Guide"}</button>
          <button onClick={() => deleteGuide(guideMenu.guideId)}>Delete Guide</button>
          <button onClick={() => { setGuides([]); setGuideMenu(null); }}>Delete All Guides</button>
        </div>
      )}
      {joinMenu && (
        <div className="guide-menu join-menu" style={{ left: joinMenu.x, top: joinMenu.y }}>
          <button onClick={() => joinSelectedAnchors("last")}>Join to Last</button>
          <button onClick={() => joinSelectedAnchors("center")}>Join at Center</button>
          <button onClick={() => joinSelectedAnchors("first")}>Join to First</button>
        </div>
      )}
    </div>
  );
}

function EditablePath({ path, selection, showCurvature, proofMode, handleScale = 1, speedPunkSize = 42, onSegmentClick, onSegmentDoubleClick, onBodyMouseDown, onBBoxHandleDown, onBBoxRotateDown, onAnchorMouseDown, onAnchorDoubleClick, onAnchorContextMenu, onHandleDown, onCornerDown }) {
  const segments = getSegments(path);
  const closed = path.closed;
  const wholeSelected = path.points.length > 0 && path.points.every((_, pointIndex) => (selection.anchors || []).some((anchor) => anchor.pathId === path.id && anchor.pointIndex === pointIndex));
  const bounds = wholeSelected ? selectionBoxForPath(path) : null;
  const pathSelected = (selection.anchors || []).some((anchor) => anchor.pathId === path.id) || (selection.segments || []).some((segment) => segment.pathId === path.id) || (selection.widgets || []).some((widget) => widget.pathId === path.id) || (selection.handles || []).some((handle) => handle.pathId === path.id);
  const roundedWidgets = pathSelected ? roundedCornerWidgets(path) : [];
  const selectedWidgetSources = new Set(selectedRadiusWidgetsForPath(path, selection).map((widget) => widget.cornerSource));
  return (
    <g className={proofMode ? "proof-path" : ""}>
      {proofMode ? (
        <path d={pathToD(path)} fill={closed && path.displayMode !== "outline" ? "black" : "none"} fillRule={path.fillRule || "evenodd"} stroke="black" strokeWidth={!closed || path.displayMode === "outline" ? path.strokeWidth : 0} strokeLinecap={path.lineCap} strokeLinejoin={path.lineJoin || "round"} />
      ) : (
        <>
          <path
            className={closed && path.displayMode !== "outline" ? "shape-fill" : "stroke-fill"}
            d={pathToD(path)}
            fill={closed && path.displayMode !== "outline" ? "black" : "none"}
            fillRule={path.fillRule || "evenodd"}
            stroke={!closed || path.displayMode === "outline" ? "black" : "none"}
            strokeWidth={!closed || path.displayMode === "outline" ? path.strokeWidth : 0}
            strokeLinecap={path.lineCap}
            strokeLinejoin={path.lineJoin || "round"}
          />
          <path className="path-centerline" d={pathToD(path)} fill="none" stroke="black" strokeWidth="1" />
        </>
      )}
      {wholeSelected && path.closed && <path className="object-hit" d={pathToD(path)} onMouseDown={onBodyMouseDown} />}
      {bounds && <BoundingBox box={bounds} handleScale={handleScale} onHandleDown={onBBoxHandleDown} onRotateDown={onBBoxRotateDown} />}
      {segments.map((segment) => <path key={`${path.id}-${segment.index}`} className="segment-hit" d={segmentD(segment)} onMouseDown={(event) => onSegmentClick(event, path, segment.index, segment.nextIndex)} onDoubleClick={(event) => onSegmentDoubleClick(event, path)} />)}
      {showCurvature && !proofMode && <CurvatureOverlay path={path} size={speedPunkSize} />}
      {path.points.map((point, pointIndex) => {
        const selected = selection.anchors.some((anchor) => anchor.pathId === path.id && anchor.pointIndex === pointIndex);
        const widgetSelected = (selection.widgets || []).some((widget) => widget.pathId === path.id && widget.cornerSource === point.id);
        const anchor = { pathId: path.id, pointIndex };
        const endpoint = !path.closed && (pointIndex === 0 || pointIndex === path.points.length - 1);
        const showHandles = Boolean(point.in || point.out);
        return (
          <g key={point.id}>
            {showHandles && point.in && <line className="bezier-handle-line" x1={point.x} y1={point.y} x2={point.in.x} y2={point.in.y} />}
            {showHandles && point.out && <line className="bezier-handle-line" x1={point.x} y1={point.y} x2={point.out.x} y2={point.out.y} />}
            {showHandles && point.in && <circle className={`bezier-handle ${(selection.handles || []).some((handle) => handle.pathId === path.id && handle.pointIndex === pointIndex && handle.side === "in") ? "selected" : ""}`} cx={point.in.x} cy={point.in.y} r={3.75 * handleScale} onMouseDown={(event) => onHandleDown(event, anchor, "in")} />}
            {showHandles && point.out && <circle className={`bezier-handle ${(selection.handles || []).some((handle) => handle.pathId === path.id && handle.pointIndex === pointIndex && handle.side === "out") ? "selected" : ""}`} cx={point.out.x} cy={point.out.y} r={3.75 * handleScale} onMouseDown={(event) => onHandleDown(event, anchor, "out")} />}
            {endpoint && <EndpointMark path={path} pointIndex={pointIndex} />}
            {point.smooth ? (
              <circle data-anchor="true" cx={point.x} cy={point.y} r={3.75 * handleScale} className={`anchor-point smooth ${selected ? "selected" : ""}`} onMouseDown={(event) => onAnchorMouseDown(event, path.id, pointIndex)} onDoubleClick={(event) => onAnchorDoubleClick(event, path.id, pointIndex)} onContextMenu={(event) => onAnchorContextMenu(event, path.id, pointIndex)} />
            ) : (
              <rect data-anchor="true" x={point.x - 3.5 * handleScale} y={point.y - 3.5 * handleScale} width={7 * handleScale} height={7 * handleScale} className={`anchor-point ${selected ? "selected" : ""}`} onMouseDown={(event) => onAnchorMouseDown(event, path.id, pointIndex)} onDoubleClick={(event) => onAnchorDoubleClick(event, path.id, pointIndex)} onContextMenu={(event) => onAnchorContextMenu(event, path.id, pointIndex)} />
            )}
            {pathSelected && isRoundableCorner(path, pointIndex) && (
              <circle className={`corner-widget ${widgetSelected || selectedWidgetSources.has(point.id) ? "selected" : ""}`} cx={cornerWidgetPosition(path, pointIndex).x} cy={cornerWidgetPosition(path, pointIndex).y} r={3.75 * handleScale} onMouseDown={(event) => onCornerDown(event, anchor)} />
            )}
          </g>
        );
      })}
      {roundedWidgets.map((widget) => (
        <circle
          key={`corner-${path.id}-${widget.cornerSource}`}
          className={`corner-widget ${selectedWidgetSources.has(widget.cornerSource) ? "selected" : ""}`}
          cx={widget.position.x}
          cy={widget.position.y}
          r={3.75 * handleScale}
          onMouseDown={(event) => onCornerDown(event, { pathId: path.id, pointIndex: widget.indexes[0], indexes: widget.indexes, cornerSource: widget.cornerSource, cornerOrigin: widget.origin })}
        />
      ))}
    </g>
  );
}

function AnchorOverlay({ paths, selection, handleScale, onAnchorMouseDown, onAnchorDoubleClick, onAnchorContextMenu }) {
  return (
    <g className="anchor-overlay">
      {paths.map((path) => path.points.map((point, pointIndex) => {
        const selected = selection.anchors.some((anchor) => anchor.pathId === path.id && anchor.pointIndex === pointIndex);
        return point.smooth ? (
          <circle key={`${path.id}-${point.id}`} data-anchor="true" cx={point.x} cy={point.y} r={3.75 * handleScale} className={`anchor-point overlay-anchor smooth ${selected ? "selected" : ""}`} onMouseDown={(event) => onAnchorMouseDown(event, path.id, pointIndex)} onDoubleClick={(event) => onAnchorDoubleClick(event, path.id, pointIndex)} onContextMenu={(event) => onAnchorContextMenu(event, path.id, pointIndex)} />
        ) : (
          <rect key={`${path.id}-${point.id}`} data-anchor="true" x={point.x - 3.5 * handleScale} y={point.y - 3.5 * handleScale} width={7 * handleScale} height={7 * handleScale} className={`anchor-point overlay-anchor ${selected ? "selected" : ""}`} onMouseDown={(event) => onAnchorMouseDown(event, path.id, pointIndex)} onDoubleClick={(event) => onAnchorDoubleClick(event, path.id, pointIndex)} onContextMenu={(event) => onAnchorContextMenu(event, path.id, pointIndex)} />
        );
      }))}
    </g>
  );
}

function RadiusWidgetHitOverlay({ paths, selection, handleScale, onCornerDown }) {
  return (
    <g className="radius-widget-hit-overlay">
      {paths.flatMap((path) => {
        const pathSelected = selection.anchors.some((anchor) => anchor.pathId === path.id) || selection.segments.some((segment) => segment.pathId === path.id) || (selection.widgets || []).some((widget) => widget.pathId === path.id);
        if (!pathSelected) return [];
        const rounded = roundedCornerWidgets(path).map((widget) => ({
          key: `${path.id}-${widget.cornerSource}`,
          position: widget.position,
          anchor: { pathId: path.id, pointIndex: widget.indexes[0], indexes: widget.indexes, cornerSource: widget.cornerSource, cornerOrigin: widget.origin },
        }));
        const roundedSources = new Set(rounded.map((widget) => widget.anchor.cornerSource));
        const virtual = path.points
          .map((point, pointIndex) => ({ point, pointIndex }))
          .filter(({ point, pointIndex }) => !roundedSources.has(point.id) && isRoundableCorner(path, pointIndex))
          .map(({ point, pointIndex }) => ({
            key: `${path.id}-${point.id}`,
            position: cornerWidgetPosition(path, pointIndex),
            anchor: { pathId: path.id, pointIndex },
          }));
        return [...rounded, ...virtual].map((widget) => (
          <circle
            key={widget.key}
            className="corner-widget-hit"
            cx={widget.position.x}
            cy={widget.position.y}
            r={5 * handleScale}
            onMouseDown={(event) => onCornerDown(event, widget.anchor)}
          />
        ));
      })}
    </g>
  );
}

function EndpointMark({ path, pointIndex }) {
  const point = path.points[pointIndex];
  const neighbor = pointIndex === 0 ? path.points[1] : path.points[pointIndex - 1];
  if (!point || !neighbor) return null;
  const angle = Math.atan2(point.y - neighbor.y, point.x - neighbor.x) + Math.PI / 2;
  const dx = Math.cos(angle) * 9;
  const dy = Math.sin(angle) * 9;
  return <line className="endpoint-mark" x1={point.x - dx} y1={point.y - dy} x2={point.x + dx} y2={point.y + dy} />;
}

function BoundingBox({ box, handleScale = 1, onHandleDown, onRotateDown }) {
  const handles = bboxHandles(box);
  const cornerHandles = handles.filter(([id]) => id.length === 2);
  const center = box.rotationCenter || { x: box.x + box.w / 2, y: box.y + box.h / 2 };
  const transform = box.angle ? `rotate(${(box.angle * 180) / Math.PI} ${center.x} ${center.y})` : undefined;
  return (
    <g className="bbox-layer" transform={transform}>
      <rect className="bounding-box" {...rectBox(box)} />
      <circle className="bbox-center" cx={box.x + box.w / 2} cy={box.y + box.h / 2} r={3.75 * handleScale} />
      {handles.map(([id, x, y]) => (
        <rect key={id} className={`bbox-handle bbox-handle-${id}`} x={x - 3.5 * handleScale} y={y - 3.5 * handleScale} width={7 * handleScale} height={7 * handleScale} onMouseDown={(event) => onHandleDown(event, box, id)} />
      ))}
      {cornerHandles.map(([id, x, y]) => (
        <circle key={`r-${id}`} className="bbox-rotate-handle" cx={x + (x < box.x + box.w / 2 ? -14 : 14) * handleScale} cy={y + (y < box.y + box.h / 2 ? -14 : 14) * handleScale} r={7 * handleScale} onMouseDown={(event) => onRotateDown(event, box)} />
      ))}
    </g>
  );
}

function BoundingBoxInteractionOverlay({ paths, selection, handleScale = 1, onHandleDown, onRotateDown }) {
  const selectedIds = selectedPathIds(selection);
  return (
    <g className="bbox-interaction-layer">
      {paths.filter((path) => selectedIds.has(path.id) && path.points.every((_, pointIndex) => selection.anchors.some((anchor) => anchor.pathId === path.id && anchor.pointIndex === pointIndex))).map((path) => (
        <BoundingBoxHitZones key={path.id} box={selectionBoxForPath(path)} handleScale={handleScale} onHandleDown={onHandleDown} onRotateDown={onRotateDown} />
      ))}
    </g>
  );
}

function BoundingBoxHitZones({ box, handleScale, onHandleDown, onRotateDown }) {
  const handles = bboxHandles(box);
  const cornerHandles = handles.filter(([id]) => id.length === 2);
  const center = box.rotationCenter || { x: box.x + box.w / 2, y: box.y + box.h / 2 };
  const transform = box.angle ? `rotate(${(box.angle * 180) / Math.PI} ${center.x} ${center.y})` : undefined;
  const hit = 14 * handleScale;
  return (
    <g transform={transform}>
      {handles.map(([id, x, y]) => (
        <rect key={id} className={`bbox-hit bbox-hit-${id}`} x={x - hit / 2} y={y - hit / 2} width={hit} height={hit} onMouseDown={(event) => onHandleDown(event, box, id)} />
      ))}
      {cornerHandles.map(([id, x, y]) => (
        <path
          key={`rotate-${id}`}
          className="bbox-rotate-zone"
          d={rotateWedgePath(x, y, x < box.x + box.w / 2 ? -1 : 1, y < box.y + box.h / 2 ? -1 : 1, 15 * handleScale, 35 * handleScale)}
          onMouseDown={(event) => onRotateDown(event, box)}
        />
      ))}
    </g>
  );
}

function rotateWedgePath(x, y, sx, sy, inner, outer) {
  const points = [
    { x: x + sx * inner, y: y + sy * inner * 0.35 },
    { x: x + sx * outer, y: y + sy * outer * 0.35 },
    { x: x + sx * outer * 0.35, y: y + sy * outer },
    { x: x + sx * inner * 0.35, y: y + sy * inner },
  ];
  return `M ${points.map((point) => `${point.x} ${point.y}`).join(" L ")} Z`;
}

function Guide({ guide, handleScale, onMouseDown, onContextMenu }) {
  const length = CANVAS_SIZE * 2;
  const dx = Math.cos(guide.angle || 0) * length;
  const dy = Math.sin(guide.angle || 0) * length;
  return (
    <g className={`guide-item ${guide.locked ? "locked" : ""}`}>
      <line
        className="guide-line"
        x1={guide.x - dx}
        y1={guide.y - dy}
        x2={guide.x + dx}
        y2={guide.y + dy}
        onMouseDown={(event) => onMouseDown(event, guide, "rotate")}
        onContextMenu={(event) => onContextMenu(event, guide)}
      />
      {guide.locked ? (
        <g className="guide-lock" transform={`translate(${guide.x} ${guide.y}) scale(${handleScale})`} onContextMenu={(event) => onContextMenu(event, guide)}>
          <rect x="-3.2" y="-0.8" width="6.4" height="5.8" />
          <path d="M -2.4 -0.8 L -2.4 -3.2 Q 0 -5.6 2.4 -3.2 L 2.4 -0.8" />
        </g>
      ) : (
        <circle className="guide-handle" cx={guide.x} cy={guide.y} r={3.5 * handleScale} onMouseDown={(event) => onMouseDown(event, guide, "move")} onContextMenu={(event) => onContextMenu(event, guide)} />
      )}
    </g>
  );
}

function PixelCanvas({ glyph, grid, activeTool, onChange }) {
  const svgRef = useRef(null);
  const [drawing, setDrawing] = useState(false);
  const [shapeDraft, setShapeDraft] = useState(null);
  const drawBaseRef = useRef(null);
  const pixelTool = parsePixelTool(activeTool);

  function localCell(event) {
    const point = svgLocalPoint(svgRef.current, event);
    return { ...gridCellAt(point, grid), cursor: point };
  }

  function paint(event) {
    const cell = localCell(event);
    onChange((current) => {
      const exists = current.pixels.some((pixel) => samePixel(pixel, cell));
      if (activeTool === "erase") return { pixels: current.pixels.filter((pixel) => !pointHitsPixel(cell.cursor, pixel)) };
      return exists ? {} : { pixels: [...current.pixels, cell] };
    }, false);
  }

  function addRasterShape(start, end, type, mode) {
    const box = normalizedBox(start.cursor, end.cursor);
    const cells = [];
    for (let y = 0; y <= CANVAS_SIZE; y += PIXEL_GRID_SIZE / 2) {
      for (let x = 0; x <= CANVAS_SIZE; x += PIXEL_GRID_SIZE / 2) {
        const cell = gridCellAt({ x, y }, grid);
        if (cells.some((item) => samePixel(item, cell))) continue;
        const center = pixelCenter(cell);
        const insideRect = center.x >= box.x && center.x <= box.x + box.w && center.y >= box.y && center.y <= box.y + box.h;
        const rx = box.w / 2 || 1;
        const ry = box.h / 2 || 1;
        const cx = box.x + rx;
        const cy = box.y + ry;
        const ellipseValue = ((center.x - cx) ** 2) / (rx ** 2) + ((center.y - cy) ** 2) / (ry ** 2);
        const inside = type === "gridEllipse" ? ellipseValue <= 1 : insideRect;
        const edge = type === "gridEllipse"
          ? ellipseValue <= 1 && ellipseValue >= 0.72
          : insideRect && (center.x < box.x + cell.size || center.x > box.x + box.w - cell.size || center.y < box.y + cell.size || center.y > box.y + box.h - cell.size);
        if (mode === "filled" ? inside : edge) cells.push(cell);
      }
    }
    onChange((current) => ({
      pixels: [
        ...current.pixels,
        ...cells.filter((cell) => !current.pixels.some((pixel) => samePixel(pixel, cell))),
      ],
    }));
  }

  return (
    <div className="canvas-shell">
      <div className="canvas-frame pixel-frame">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${CANVAS_SIZE} ${CANVAS_SIZE}`}
          className="drawing-canvas pixel-canvas"
          onMouseDown={(event) => {
          if (pixelTool.shape) {
            drawBaseRef.current = { paths: glyph.paths, pixels: glyph.pixels };
            setShapeDraft({ type: pixelTool.shape, mode: pixelTool.mode, start: localCell(event), end: localCell(event) });
            return;
          }
          drawBaseRef.current = { paths: glyph.paths, pixels: glyph.pixels };
          setDrawing(true);
          paint(event);
        }}
        onMouseMove={(event) => {
          if (shapeDraft) setShapeDraft({ ...shapeDraft, end: localCell(event) });
          else if (drawing) paint(event);
        }}
        onMouseUp={() => {
          if (shapeDraft) {
            addRasterShape(shapeDraft.start, shapeDraft.end, shapeDraft.type, shapeDraft.mode);
            setShapeDraft(null);
          }
          if (drawing && drawBaseRef.current) onChange((current) => current, true, drawBaseRef.current);
          drawBaseRef.current = null;
          setDrawing(false);
        }}
        onMouseLeave={() => {
          if (shapeDraft) {
            addRasterShape(shapeDraft.start, shapeDraft.end, shapeDraft.type, shapeDraft.mode);
            setShapeDraft(null);
          }
          if (drawing && drawBaseRef.current) onChange((current) => current, true, drawBaseRef.current);
          drawBaseRef.current = null;
          setDrawing(false);
        }}
      >
        <rect width={CANVAS_SIZE} height={CANVAS_SIZE} fill="white" />
        <GridOverlay grid={grid} />
        {glyph.paths.map((path) => (
          <path key={path.id} d={pathToD(path)} fill={path.closed && path.displayMode !== "outline" ? "black" : "none"} fillRule={path.fillRule || "evenodd"} stroke={!path.closed || path.displayMode === "outline" ? "black" : "none"} strokeWidth={!path.closed || path.displayMode === "outline" ? path.strokeWidth : 0} strokeLinecap={path.lineCap} strokeLinejoin={path.lineJoin || "round"} opacity={path.closed ? 0.18 : 0.28} />
        ))}
        {glyph.pixels.map((pixel) => <PixelMark key={`${pixel.x}-${pixel.y}-${pixel.size}-${pixel.shape || "square"}`} pixel={pixel} />)}
        {shapeDraft && <rect className="grid-shape-draft" {...rectBox(normalizedBox(shapeDraft.start.cursor, shapeDraft.end.cursor))} />}
      </svg>
      </div>
    </div>
  );
}

function CanvasGuides({ zoom = 1, view = { x: 0, y: 0, zoom: 1 } }) {
  const lines = [];
  if (zoom >= 5) {
    const xStart = Math.floor(view.x / VECTOR_GRID_SIZE) * VECTOR_GRID_SIZE;
    const xEnd = Math.ceil((view.x + CANVAS_SIZE / zoom) / VECTOR_GRID_SIZE) * VECTOR_GRID_SIZE;
    const yStart = Math.floor(view.y / VECTOR_GRID_SIZE) * VECTOR_GRID_SIZE;
    const yEnd = Math.ceil((view.y + CANVAS_SIZE / zoom) / VECTOR_GRID_SIZE) * VECTOR_GRID_SIZE;
    for (let i = xStart; i <= xEnd; i += VECTOR_GRID_SIZE) {
      lines.push(<line key={`v-${i}`} x1={i} y1={view.y} x2={i} y2={view.y + CANVAS_SIZE / zoom} />);
    }
    for (let i = yStart; i <= yEnd; i += VECTOR_GRID_SIZE) {
      lines.push(<line key={`h-${i}`} x1={view.x} y1={i} x2={view.x + CANVAS_SIZE / zoom} y2={i} />);
    }
  }
  return (
    <g className="canvas-guides">
      <rect className="artboard-fill" x={ARTBOARD.x} y={ARTBOARD.y} width={ARTBOARD.w} height={ARTBOARD.h} />
      <rect className="artboard-boundary" x={ARTBOARD.x} y={ARTBOARD.y} width={ARTBOARD.w} height={ARTBOARD.h} />
      {lines}
      <line x1={CANVAS_SIZE / 2} y1="0" x2={CANVAS_SIZE / 2} y2="16" className="center-tick" />
      <line x1={CANVAS_SIZE / 2} y1={CANVAS_SIZE - 16} x2={CANVAS_SIZE / 2} y2={CANVAS_SIZE} className="center-tick" />
      <line x1="0" y1={CANVAS_SIZE / 2} x2="16" y2={CANVAS_SIZE / 2} className="center-tick" />
      <line x1={CANVAS_SIZE - 16} y1={CANVAS_SIZE / 2} x2={CANVAS_SIZE} y2={CANVAS_SIZE / 2} className="center-tick" />
    </g>
  );
}

function RulerTicks({ orientation, view }) {
  const zoom = view.zoom;
  const size = CANVAS_SIZE / zoom;
  const start = orientation === "horizontal" ? view.x : view.y;
  const end = start + size;
  const majorStep = zoom >= 5 ? 10 : zoom >= 2 ? 25 : 50;
  const minorStep = majorStep / 5;
  const ticks = [];
  for (let value = Math.floor(start / minorStep) * minorStep; value <= end; value += minorStep) {
    if (value < 0 || value > CANVAS_SIZE) continue;
    const major = Math.round(value / majorStep) === value / majorStep;
    if (orientation === "horizontal") {
      ticks.push(<line key={value} x1={value} y1={major ? 0 : 12} x2={value} y2={24} />);
    } else {
      ticks.push(<line key={value} x1={major ? 0 : 12} y1={value} x2={24} y2={value} />);
    }
  }
  return <g>{ticks}</g>;
}

function RulerLabels({ orientation, view }) {
  const zoom = view.zoom;
  const size = CANVAS_SIZE / zoom;
  const start = orientation === "horizontal" ? view.x : view.y;
  const end = start + size;
  const majorStep = zoom >= 5 ? 10 : zoom >= 2 ? 25 : 50;
  const labels = [];
  for (let value = Math.ceil(start / majorStep) * majorStep; value <= end; value += majorStep) {
    if (value < 0 || value > CANVAS_SIZE) continue;
    const percent = ((value - start) / size) * 100;
    labels.push(
      <span key={value} className="ruler-label" style={orientation === "horizontal" ? { left: `${percent}%` } : { top: `${percent}%` }}>
        {value}
      </span>,
    );
  }
  return <div className={`ruler-labels ${orientation === "horizontal" ? "top" : "left"}`}>{labels}</div>;
}

function GridOverlay({ grid }) {
  const center = CANVAS_SIZE / 2;
  const step = PIXEL_GRID_SIZE;
  const angle = grid.gridAngle || 0;
  const items = [];
  const start = -CANVAS_SIZE;
  const end = CANVAS_SIZE * 2;
  if (grid.gridShape === "circle") {
    for (let y = start; y < end; y += step) {
      for (let x = start; x < end; x += step) {
        items.push(<circle key={`c-${x}-${y}`} cx={x} cy={y} r={step / 2} />);
      }
    }
  } else if (grid.gridShape === "triangle") {
    const h = (Math.sqrt(3) / 2) * step;
    for (let y = start; y < end; y += h) {
      for (let x = start; x < end; x += step) {
        const flip = Math.round((x - start) / step + (y - start) / h) % 2 === 0;
        items.push(<polygon key={`t-${x}-${y}`} points={flip ? `${x},${y + h} ${x + step / 2},${y} ${x + step},${y + h}` : `${x},${y} ${x + step},${y} ${x + step / 2},${y + h}`} />);
      }
    }
  } else if (grid.gridShape === "hexagon" || grid.gridShape === "pentagon") {
    const radius = step / 2;
    const w = Math.sqrt(3) * radius;
    const h = 1.5 * radius;
    for (let row = -20; row < 45; row += 1) {
      for (let col = -20; col < 45; col += 1) {
        const x = col * w + (row % 2 ? w / 2 : 0);
        const y = row * h;
        if (grid.gridShape === "pentagon" && (row + col) % 3 === 0) {
          items.push(<polygon key={`p-${row}-${col}`} points={regularPolygonPoints(x, y, radius * 0.92, 5)} />);
        } else {
          items.push(<polygon key={`h-${row}-${col}`} points={regularPolygonPoints(x, y, radius, 6, Math.PI / 6)} />);
        }
      }
    }
  } else {
    for (let i = start; i <= end; i += step) {
      items.push(<line key={`gv-${i}`} x1={i} y1={start} x2={i} y2={end} />);
      items.push(<line key={`gh-${i}`} x1={start} y1={i} x2={end} y2={i} />);
    }
  }
  return <g className="pixel-grid overlay-grid" transform={`rotate(${angle} ${center} ${center})`}>{items}</g>;
}

function PixelMark({ pixel }) {
  const shape = pixel.shape || "square";
  const size = pixel.size;
  if (shape === "circle") return <circle cx={pixel.x} cy={pixel.y} r={size / 2} fill="currentColor" />;
  if (shape === "triangle") return <polygon points={regularPolygonPoints(pixel.x, pixel.y, size / 2, 3, pixel.angle || 0)} fill="currentColor" />;
  if (shape === "pentagon") return <polygon points={regularPolygonPoints(pixel.x, pixel.y, size / 2, 5, pixel.angle || 0)} fill="currentColor" />;
  if (shape === "hexagon") return <polygon points={regularPolygonPoints(pixel.x, pixel.y, size / 2, 6, (pixel.angle || 0) + Math.PI / 6)} fill="currentColor" />;
  return <rect x={pixel.x} y={pixel.y} width={size} height={size} fill="currentColor" transform={`rotate(${pixel.angleDeg || 0} ${CANVAS_SIZE / 2} ${CANVAS_SIZE / 2})`} />;
}

function CurvatureOverlay({ path, size = 42 }) {
  const segments = getSegments(path);
  const outward = path.closed && signedArea(path.points) > 0 ? -1 : 1;
  return (
    <g className="curvature-overlay">
      {segments.map((segment) => <path key={`${segment.index}-${segment.nextIndex}`} d={speedPunkAreaD(segment, outward, size)} />)}
    </g>
  );
}

function buildOtf(project, glyphSet) {
  const glyphs = [new opentype.Glyph({ name: ".notdef", unicode: 0, advanceWidth: 1000, path: new opentype.Path() })];
  glyphSet.forEach((char) => {
    glyphs.push(new opentype.Glyph({ name: `uni${char.charCodeAt(0).toString(16).toUpperCase()}`, unicode: char.charCodeAt(0), advanceWidth: 1000, path: glyphToFontPath(getGlyph(project, char)) }));
  });
  return new opentype.Font({ familyName: "NSTool", styleName: "Regular", unitsPerEm: 1000, ascender: 880, descender: -120, glyphs });
}

function glyphToFontPath(source) {
  const fontPath = new opentype.Path();
  source.paths.forEach((path) => getSegments(path).forEach((segment) => addStrokeSegment(fontPath, segment.start, segment.end, path.strokeWidth, path.lineCap)));
  source.pixels.forEach((pixel) => addRectToFont(fontPath, pixel.x, pixel.y, pixel.size, pixel.size));
  return fontPath;
}

function addStrokeSegment(path, start, end, width, lineCap) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (!length) return;
  const radius = width / 2;
  const nx = (-dy / length) * radius;
  const ny = (dx / length) * radius;
  const cap = lineCap === "butt" ? 0 : radius;
  const ux = (dx / length) * cap;
  const uy = (dy / length) * cap;
  addClippedPolygon(path, [
    { x: start.x - ux + nx, y: start.y - uy + ny },
    { x: end.x + ux + nx, y: end.y + uy + ny },
    { x: end.x + ux - nx, y: end.y + uy - ny },
    { x: start.x - ux - nx, y: start.y - uy - ny },
  ]);
}

function addRectToFont(path, x, y, width, height) {
  addClippedPolygon(path, [{ x, y }, { x: x + width, y }, { x: x + width, y: y + height }, { x, y: y + height }]);
}

function addClippedPolygon(path, points) {
  const ring = points.map((point) => [point.x, point.y]);
  ring.push([...ring[0]]);
  const artboardRing = [
    [ARTBOARD.x, ARTBOARD.y],
    [ARTBOARD.x + ARTBOARD.w, ARTBOARD.y],
    [ARTBOARD.x + ARTBOARD.w, ARTBOARD.y + ARTBOARD.h],
    [ARTBOARD.x, ARTBOARD.y + ARTBOARD.h],
    [ARTBOARD.x, ARTBOARD.y],
  ];
  const clipped = martinez.intersection([[ring]], [[artboardRing]]);
  if (!Array.isArray(clipped)) return;
  clipped.forEach((polygon) => {
    polygon.forEach((clippedRing) => {
      const clippedPoints = clippedRing.slice(0, -1).map(([x, y]) => ({ x, y }));
      if (clippedPoints.length >= 3) addPolygon(path, clippedPoints);
    });
  });
}

function addPolygon(path, points) {
  const first = toFontPoint(points[0].x, points[0].y);
  path.moveTo(first.x, first.y);
  points.slice(1).forEach((point) => {
    const converted = toFontPoint(point.x, point.y);
    path.lineTo(converted.x, converted.y);
  });
  path.close();
}

function toFontPoint(x, y) {
  return { x: (x / CANVAS_SIZE) * 1000, y: 880 - (y / CANVAS_SIZE) * 1000 };
}

function newPath(style, id = crypto.randomUUID()) {
  return { id, strokeWidth: style.strokeWidth, lineCap: style.lineCap, lineJoin: style.lineJoin || "round", closed: false, points: [] };
}

function newPoint(x, y) {
  const point = clampWorkspacePoint({ x, y });
  return { id: crypto.randomUUID(), x: point.x, y: point.y, in: null, out: null, smooth: false };
}

function rectPath(x, y, w, h, strokeWidth = 28, cornerMode = "sharp", cornerRadius = 36, squircle = false, displayMode = "filled") {
  const rect = { x, y, w, h };
  if (cornerMode !== "round") {
    return { id: crypto.randomUUID(), strokeWidth, lineCap: "round", lineJoin: "round", cornerMode, shapeType: "rectangle", rect, displayMode, closed: true, points: [newPoint(x, y), newPoint(x + w, y), newPoint(x + w, y + h), newPoint(x, y + h)] };
  }
  return roundedRectPath(x, y, w, h, cornerRadius, strokeWidth, squircle, displayMode);
}

function roundedRectPath(x, y, w, h, radius, strokeWidth = 28, squircle = false, displayMode = "filled") {
  const r = Math.max(1, Math.min(radius, Math.abs(w) / 2, Math.abs(h) / 2));
  if (squircle) return squircleRectPath(x, y, w, h, r, strokeWidth, displayMode);
  const p1 = newPoint(x + r, y);
  const p2 = newPoint(x + w - r, y);
  const p3 = newPoint(x + w, y + r);
  const p4 = newPoint(x + w, y + h - r);
  const p5 = newPoint(x + w - r, y + h);
  const p6 = newPoint(x + r, y + h);
  const p7 = newPoint(x, y + h - r);
  const p8 = newPoint(x, y + r);
  p2.out = { x: x + w - r + r * KAPPA, y };
  p3.in = { x: x + w, y: y + r - r * KAPPA };
  p3.out = { x: x + w, y: y + r + r * KAPPA };
  p4.in = { x: x + w, y: y + h - r - r * KAPPA };
  p4.out = { x: x + w, y: y + h - r + r * KAPPA };
  p5.in = { x: x + w - r + r * KAPPA, y: y + h };
  p5.out = { x: x + w - r - r * KAPPA, y: y + h };
  p6.in = { x: x + r + r * KAPPA, y: y + h };
  p6.out = { x: x + r - r * KAPPA, y: y + h };
  p7.in = { x, y: y + h - r + r * KAPPA };
  p7.out = { x, y: y + h - r - r * KAPPA };
  p8.in = { x, y: y + r + r * KAPPA };
  p8.out = { x, y: y + r - r * KAPPA };
  p1.in = { x: x + r - r * KAPPA, y };
  markCornerPair(p8, p1, { x, y });
  markCornerPair(p2, p3, { x: x + w, y });
  markCornerPair(p4, p5, { x: x + w, y: y + h });
  markCornerPair(p6, p7, { x, y: y + h });
  return { id: crypto.randomUUID(), strokeWidth, lineCap: "round", lineJoin: "round", cornerMode: "round", shapeType: "rectangle", rect: { x, y, w, h }, cornerRadius: r, squircle: false, displayMode, closed: true, points: [p1, p2, p3, p4, p5, p6, p7, p8] };
}

function markCornerPair(first, second, origin) {
  const source = crypto.randomUUID();
  first.cornerSource = source;
  second.cornerSource = source;
  first.cornerOrigin = origin;
  second.cornerOrigin = origin;
}

function squircleRectPath(x, y, w, h, radius, strokeWidth = 28, displayMode = "filled") {
  const points = [];
  const cx = x + w / 2;
  const cy = y + h / 2;
  const a = Math.abs(w) / 2;
  const b = Math.abs(h) / 2;
  const ratio = Math.min(radius / Math.min(a, b), 1);
  const exponent = 2 + ratio * 4;
  for (let i = 0; i < 32; i += 1) {
    const t = (Math.PI * 2 * i) / 32;
    const cos = Math.cos(t);
    const sin = Math.sin(t);
    const px = cx + Math.sign(cos) * a * Math.abs(cos) ** (2 / exponent);
    const py = cy + Math.sign(sin) * b * Math.abs(sin) ** (2 / exponent);
    points.push(newPoint(px, py));
  }
  return { id: crypto.randomUUID(), strokeWidth, lineCap: "round", lineJoin: "round", cornerMode: "round", shapeType: "rectangle", rect: { x, y, w, h }, cornerRadius: radius, squircle: true, displayMode, closed: true, points };
}

function ellipsePath(shape) {
  const x = shape.x;
  const y = shape.y;
  const w = shape.w;
  const h = shape.h;
  const rx = w / 2;
  const ry = h / 2;
  const cx = x + rx;
  const cy = y + ry;
  const top = newPoint(cx, y);
  const right = newPoint(x + w, cy);
  const bottom = newPoint(cx, y + h);
  const left = newPoint(x, cy);
  top.out = { x: cx + rx * KAPPA, y };
  top.in = { x: cx - rx * KAPPA, y };
  top.smooth = true;
  right.in = { x: x + w, y: cy - ry * KAPPA };
  right.out = { x: x + w, y: cy + ry * KAPPA };
  right.smooth = true;
  bottom.in = { x: cx + rx * KAPPA, y: y + h };
  bottom.out = { x: cx - rx * KAPPA, y: y + h };
  bottom.smooth = true;
  left.in = { x, y: cy + ry * KAPPA };
  left.out = { x, y: cy - ry * KAPPA };
  left.smooth = true;
  return { id: crypto.randomUUID(), strokeWidth: shape.strokeWidth || 28, lineCap: "round", lineJoin: "round", displayMode: shape.displayMode || "filled", closed: true, points: [top, right, bottom, left] };
}

function pathToD(path) {
  if (path.subpaths?.length) return path.subpaths.map((ring) => ringToD(ring)).join(" ");
  return ringToD(path.points, path.closed);
}

function ringToD(points, closed = true) {
  if (!points.length) return "";
  const path = { points, closed };
  if (!path.points.length) return "";
  const [first, ...rest] = path.points;
  let d = `M ${first.x} ${first.y}`;
  rest.forEach((point, index) => {
    const prev = path.points[index];
    d += segmentCommand(prev, point);
  });
  if (path.closed && path.points.length > 1) {
    d += segmentCommand(path.points[path.points.length - 1], first);
    d += " Z";
  }
  return d;
}

function segmentCommand(start, end) {
  if (start.out || end.in) {
    const c1 = start.out || { x: start.x, y: start.y };
    const c2 = end.in || { x: end.x, y: end.y };
    return ` C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${end.x} ${end.y}`;
  }
  return ` L ${end.x} ${end.y}`;
}

function getSegments(path) {
  if (path.subpaths?.length) {
    const indexById = new Map(path.points.map((point, index) => [point.id, index]));
    return path.subpaths.flatMap((ring) => {
      const segments = [];
      for (let i = 0; i < ring.length - 1; i += 1) {
        segments.push(makeSegmentFromPoints(indexById.get(ring[i].id), indexById.get(ring[i + 1].id), ring[i], ring[i + 1]));
      }
      if (path.closed && ring.length > 1) {
        segments.push(makeSegmentFromPoints(indexById.get(ring[ring.length - 1].id), indexById.get(ring[0].id), ring[ring.length - 1], ring[0]));
      }
      return segments;
    });
  }
  const segments = [];
  for (let i = 0; i < path.points.length - 1; i += 1) {
    segments.push(makeSegment(path, i, i + 1));
  }
  if (path.closed && path.points.length > 1) segments.push(makeSegment(path, path.points.length - 1, 0));
  return segments;
}

function makeSegment(path, index, nextIndex) {
  const start = path.points[index];
  const end = path.points[nextIndex];
  return makeSegmentFromPoints(index, nextIndex, start, end);
}

function makeSegmentFromPoints(index, nextIndex, start, end) {
  return { index, nextIndex, start, end, c1: start.out || start, c2: end.in || end };
}

function segmentD(segment) {
  return `M ${segment.start.x} ${segment.start.y}${segmentCommand(segment.start, segment.end)}`;
}

function segmentHitsBox(segment, box) {
  const samples = 12;
  for (let index = 0; index <= samples; index += 1) {
    const t = index / samples;
    const point = cubicAt(segment, t);
    if (point.x >= box.x && point.x <= box.x + box.w && point.y >= box.y && point.y <= box.y + box.h) return true;
  }
  return false;
}

function translatePoint(point, dx, dy) {
  return {
    ...point,
    x: point.x + dx,
    y: point.y + dy,
    in: point.in ? { x: point.in.x + dx, y: point.in.y + dy } : null,
    out: point.out ? { x: point.out.x + dx, y: point.out.y + dy } : null,
  };
}

function scalePoint(point, origin, sx, sy) {
  const scaleCoord = (target) => target ? { x: origin.x + (target.x - origin.x) * sx, y: origin.y + (target.y - origin.y) * sy } : null;
  return {
    ...point,
    x: origin.x + (point.x - origin.x) * sx,
    y: origin.y + (point.y - origin.y) * sy,
    in: scaleCoord(point.in),
    out: scaleCoord(point.out),
  };
}

function rotatePoint(point, center, angle) {
  const rotateCoord = (target) => {
    if (!target) return null;
    const dx = target.x - center.x;
    const dy = target.y - center.y;
    return {
      x: center.x + dx * Math.cos(angle) - dy * Math.sin(angle),
      y: center.y + dx * Math.sin(angle) + dy * Math.cos(angle),
    };
  };
  return {
    ...point,
    ...rotateCoord(point),
    in: rotateCoord(point.in),
    out: rotateCoord(point.out),
  };
}

function shearPoint(point, origin, amount, referencePoint = "cc") {
  const vertical = referencePoint === "cw" || referencePoint === "ce";
  const shearCoord = (target) => {
    if (!target) return null;
    return vertical
      ? { x: target.x, y: target.y + (target.x - origin.x) * amount }
      : { x: target.x + (target.y - origin.y) * amount, y: target.y };
  };
  return {
    ...point,
    x: vertical ? point.x : point.x + (point.y - origin.y) * amount,
    y: vertical ? point.y + (point.x - origin.x) * amount : point.y,
    in: shearCoord(point.in),
    out: shearCoord(point.out),
  };
}

function rotatePlainPoint(point, center, angle) {
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  return {
    x: center.x + dx * Math.cos(angle) - dy * Math.sin(angle),
    y: center.y + dx * Math.sin(angle) + dy * Math.cos(angle),
  };
}

function movePathPoints(path, pointIndexes, updater) {
  const targets = new Set(pointIndexes);
  const updatedPoints = path.points.map((point, index) => targets.has(index) ? updater(point, index) : point);
  const byId = new Map(updatedPoints.map((point) => [point.id, point]));
  return {
    points: updatedPoints,
    subpaths: path.subpaths?.map((ring) => ring.map((point) => byId.get(point.id) || point)),
  };
}

function limitSelectionDelta(paths, anchors, dx, dy) {
  const points = [];
  anchors.forEach((anchor) => {
    const path = pathById(paths, anchor.pathId);
    const point = path?.points[anchor.pointIndex];
    if (point) points.push(point);
  });
  if (!points.length) return { dx, dy };
  const box = editablePointsBounds(points);
  return limitDeltaForBox(box, dx, dy);
}

function editablePointsBounds(points) {
  const xs = points.flatMap((point) => [point.x, point.in?.x, point.out?.x].filter((value) => Number.isFinite(value)));
  const ys = points.flatMap((point) => [point.y, point.in?.y, point.out?.y].filter((value) => Number.isFinite(value)));
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function limitDeltaForBox(box, dx, dy) {
  let nextDx = dx;
  let nextDy = dy;
  if (box.x + nextDx < WORKSPACE.x) nextDx = WORKSPACE.x - box.x;
  if (box.x + box.w + nextDx > WORKSPACE.x + WORKSPACE.w) nextDx = WORKSPACE.x + WORKSPACE.w - (box.x + box.w);
  if (box.y + nextDy < WORKSPACE.y) nextDy = WORKSPACE.y - box.y;
  if (box.y + box.h + nextDy > WORKSPACE.y + WORKSPACE.h) nextDy = WORKSPACE.y + WORKSPACE.h - (box.y + box.h);
  return { dx: nextDx, dy: nextDy };
}

function boxWithinWorkspace(box) {
  if (!box) return true;
  return box.x >= WORKSPACE.x - 0.001
    && box.y >= WORKSPACE.y - 0.001
    && box.x + box.w <= WORKSPACE.x + WORKSPACE.w + 0.001
    && box.y + box.h <= WORKSPACE.y + WORKSPACE.h + 0.001;
}

function clampValue(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function clampWorkspacePoint(point) {
  if (!point) return null;
  return {
    x: clampValue(point.x, WORKSPACE.x, WORKSPACE.x + WORKSPACE.w),
    y: clampValue(point.y, WORKSPACE.y, WORKSPACE.y + WORKSPACE.h),
  };
}

function clampEditablePoint(point) {
  const clamped = clampWorkspacePoint(point);
  return {
    ...point,
    x: clamped.x,
    y: clamped.y,
    in: clampWorkspacePoint(point.in),
    out: clampWorkspacePoint(point.out),
  };
}

function detachRadiusForIndexes(path, pointIndexes) {
  const indexes = new Set(pointIndexes);
  const sources = new Set();
  path.points.forEach((point, index) => {
    if (indexes.has(index) && point.cornerSource) sources.add(point.cornerSource);
  });
  if (!sources.size) return path;
  return {
    ...path,
    points: path.points.map((point) => sources.has(point.cornerSource) ? { ...point, cornerSource: null, cornerOrigin: null, cornerOriginal: null } : point),
  };
}

function deleteSegmentsFromPath(path, segments) {
  if (path.subpaths?.length || path.points.length < 2) return [path];
  const deleted = new Set(segments.map((segment) => `${segment.index}:${segment.nextIndex}`));
  const makePath = (points, index) => ({
    ...path,
    id: index === 0 ? path.id : crypto.randomUUID(),
    closed: false,
    subpaths: undefined,
    points,
  });
  if (!path.closed) {
    const runs = [];
    let current = [path.points[0]];
    for (let index = 0; index < path.points.length - 1; index += 1) {
      if (deleted.has(`${index}:${index + 1}`)) {
        if (current.length > 1) runs.push(current);
        current = [path.points[index + 1]];
      } else {
        current.push(path.points[index + 1]);
      }
    }
    if (current.length > 1) runs.push(current);
    return runs.map(makePath);
  }
  const firstBreak = segments[0];
  const start = firstBreak.nextIndex;
  const order = Array.from({ length: path.points.length }, (_, offset) => (start + offset) % path.points.length);
  const runs = [];
  let current = [path.points[order[0]]];
  for (let offset = 0; offset < order.length - 1; offset += 1) {
    const from = order[offset];
    const to = order[offset + 1];
    if (deleted.has(`${from}:${to}`)) {
      if (current.length > 1) runs.push(current);
      current = [path.points[to]];
    } else {
      current.push(path.points[to]);
    }
  }
  const last = order[order.length - 1];
  const first = order[0];
  if (!deleted.has(`${last}:${first}`) && current.length > 1) {
    runs.push(current);
  } else if (current.length > 1) {
    runs.push(current);
  }
  return runs.map(makePath);
}

function toggleSmooth(point) {
  if (point.smooth) return { ...point, in: null, out: null, smooth: false };
  const withHandles = point.in || point.out ? point : { ...point, in: { x: point.x - 48, y: point.y }, out: { x: point.x + 48, y: point.y } };
  return { ...withHandles, smooth: true };
}

function withSymmetricHandles(point, handle) {
  return { ...point, out: handle, in: { x: point.x - (handle.x - point.x), y: point.y - (handle.y - point.y) }, smooth: false };
}

function hitAnchor(paths, point, radius) {
  for (let pathIndex = paths.length - 1; pathIndex >= 0; pathIndex -= 1) {
    const path = paths[pathIndex];
    for (let pointIndex = 0; pointIndex < path.points.length; pointIndex += 1) {
      const candidate = path.points[pointIndex];
      if (Math.hypot(candidate.x - point.x, candidate.y - point.y) <= radius) return { pathId: path.id, pointIndex };
    }
  }
  return null;
}

function isPathEndpoint(paths, anchor) {
  const path = pathById(paths, anchor.pathId);
  if (!path || path.closed) return false;
  return anchor.pointIndex === 0 || anchor.pointIndex === path.points.length - 1;
}

function pathById(paths, id) {
  return paths.find((path) => path.id === id);
}

function normalizedBox(start, end) {
  return { x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), w: Math.abs(end.x - start.x), h: Math.abs(end.y - start.y) };
}

function rectBox(box) {
  return { x: box.x, y: box.y, width: box.w, height: box.h };
}

function rectArgs(box, strokeWidth, cornerMode, cornerRadius, squircle, displayMode) {
  return [box.x, box.y, box.w, box.h, strokeWidth, cornerMode, cornerRadius, squircle, displayMode];
}

function snapPoint(point, grid) {
  return { x: snapValue(point.x, grid), y: snapValue(point.y, grid) };
}

function snapValue(value, grid) {
  return Math.round(value / grid) * grid;
}

function snapAngle(angle, step) {
  return Math.round(angle / step) * step;
}

function normalizeDegrees(degrees) {
  return ((Math.round(degrees) % 360) + 360) % 360;
}

function constrainOrthogonal(start, point) {
  const dx = point.x - start.x;
  const dy = point.y - start.y;
  return Math.abs(dx) >= Math.abs(dy) ? { x: point.x, y: start.y } : { x: start.x, y: point.y };
}

function constrainPointFromStart(start, point, allowDiagonal = false) {
  const dx = point.x - start.x;
  const dy = point.y - start.y;
  if (!allowDiagonal) return constrainOrthogonal(start, point);
  const distance = Math.hypot(dx, dy);
  if (!distance) return point;
  const angle = snapAngle(Math.atan2(dy, dx), Math.PI / 4);
  return { x: start.x + Math.cos(angle) * distance, y: start.y + Math.sin(angle) * distance };
}

function constrainShapeEnd(start, point) {
  const dx = point.x - start.x;
  const dy = point.y - start.y;
  const side = Math.max(Math.abs(dx), Math.abs(dy));
  return { x: start.x + Math.sign(dx || 1) * side, y: start.y + Math.sign(dy || 1) * side };
}

function clampView(view) {
  const zoom = Math.max(1, Math.min(8, view.zoom));
  const size = CANVAS_SIZE / zoom;
  return {
    zoom,
    x: clampValue(view.x, WORKSPACE.x, WORKSPACE.x + WORKSPACE.w - size),
    y: clampValue(view.y, WORKSPACE.y, WORKSPACE.y + WORKSPACE.h - size),
  };
}

function svgLocalPoint(svg, event) {
  const point = svg.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;
  const local = point.matrixTransform(svg.getScreenCTM().inverse());
  return { x: local.x, y: local.y };
}

function selectedPathIds(selection) {
  return new Set([
    ...(selection.anchors || []).map((anchor) => anchor.pathId),
    ...(selection.segments || []).map((segment) => segment.pathId),
    ...(selection.widgets || []).map((widget) => widget.pathId),
    ...(selection.handles || []).map((handle) => handle.pathId),
  ]);
}

function selectedTransformBox(glyph, selection) {
  if (!selectedPathIds(selection).size) return null;
  const selectedIds = selectedPathIds(selection);
  const selectedPaths = glyph.paths.filter((path) => selectedIds.has(path.id));
  const allSelectedPaths = selectedPaths.length && selectedPaths.every((path) => path.points.every((_, pointIndex) => selection.anchors.some((anchor) => anchor.pathId === path.id && anchor.pointIndex === pointIndex)));
  if (allSelectedPaths) {
    return selectedPaths.length === 1 ? selectionBoxForPath(selectedPaths[0]) : visualUnionBox(selectedPaths.map(selectionBoxForPath));
  }
  const selectedAnchorPoints = [];
  selection.anchors.forEach((anchor) => {
    const path = pathById(glyph.paths, anchor.pathId);
    const point = path?.points[anchor.pointIndex];
    if (point) selectedAnchorPoints.push(point);
  });
  if (selectedAnchorPoints.length) return pointsBounds(selectedAnchorPoints);
  return selectedPaths.length ? visualUnionBox(selectedPaths.map(selectionBoxForPath)) : null;
}

function pointsBounds(points) {
  const xs = points.map((point) => point.x).filter((value) => Number.isFinite(value));
  const ys = points.map((point) => point.y).filter((value) => Number.isFinite(value));
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function uniqueAnchors(anchors) {
  const seen = new Set();
  return anchors.filter((anchor) => {
    const key = `${anchor.pathId}:${anchor.pointIndex}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function uniqueSegments(segments) {
  const seen = new Set();
  return segments.filter((segment) => {
    const key = `${segment.pathId}:${segment.index}:${segment.nextIndex}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function uniqueWidgets(widgets) {
  const seen = new Set();
  return widgets.filter((widget) => {
    const key = `${widget.pathId}:${widget.cornerSource}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function uniqueHandles(handles) {
  const seen = new Set();
  return handles.filter((handle) => {
    const key = `${handle.pathId}:${handle.pointIndex}:${handle.side}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function selectedRadiusWidgetsForPath(path, selection) {
  if (!path) return [];
  const explicit = new Set((selection.widgets || []).filter((widget) => widget.pathId === path.id).map((widget) => widget.cornerSource));
  if (explicit.size) {
    const rounded = roundedCornerWidgets(path).filter((widget) => explicit.has(widget.cornerSource));
    const virtual = path.points
      .map((point, pointIndex) => ({ point, pointIndex }))
      .filter(({ point, pointIndex }) => explicit.has(point.id) && isRoundableCorner(path, pointIndex))
      .map(({ point, pointIndex }) => ({
        cornerSource: point.id,
        origin: point,
        indexes: [pointIndex],
        position: cornerWidgetPosition(path, pointIndex),
      }));
    return [...rounded, ...virtual];
  }
  const anchors = new Set((selection.anchors || []).filter((anchor) => anchor.pathId === path.id).map((anchor) => anchor.pointIndex));
  const wholePath = path.points.length > 0 && path.points.every((_, index) => anchors.has(index));
  const hasSegmentSelection = (selection.segments || []).some((segment) => segment.pathId === path.id);
  if (hasSegmentSelection && !wholePath) return [];
  const rounded = roundedCornerWidgets(path).filter((widget) => {
    if (explicit.has(widget.cornerSource) || wholePath) return true;
    if (widget.indexes.some((index) => anchors.has(index))) return true;
    return false;
  });
  const roundedSources = new Set(rounded.map((widget) => widget.cornerSource));
  const virtual = path.points
    .map((point, pointIndex) => ({ point, pointIndex }))
    .filter(({ point, pointIndex }) => {
      if (!isRoundableCorner(path, pointIndex) || roundedSources.has(point.id)) return false;
      if (wholePath || anchors.has(pointIndex)) return true;
      return false;
    })
    .map(({ point, pointIndex }) => ({
      cornerSource: point.id,
      origin: point,
      indexes: [pointIndex],
      position: cornerWidgetPosition(path, pointIndex),
    }));
  return [...rounded, ...virtual];
}

function normalizeIsolatedAnchors(path) {
  if (path.points.length > 1) return path;
  return {
    ...path,
    closed: false,
    cornerMode: "sharp",
    points: path.points.map((point) => ({
      ...point,
      in: null,
      out: null,
      smooth: false,
      cornerSource: null,
      cornerOrigin: null,
    })),
  };
}

function selectedCornerRadius(glyph, selection, selectedRect) {
  const targets = radiusEditTargets(glyph, selection).flatMap((item) => item.targets);
  if (targets.length) return Math.round(Math.min(...targets.map((target) => target.radius)));
  if (selectedRect) return selectedRect.cornerMode === "round" ? Math.round(selectedRect.cornerRadius || measuredRoundedRadius(selectedRect) || 0) : 0;
  const pathIds = selectedPathIds(selection);
  const rounded = glyph.paths.find((path) => pathIds.has(path.id) && hasRoundedCornerPairs(path));
  return rounded ? Math.round(measuredRoundedRadius(rounded)) : 0;
}

function radiusEditTargets(glyph, selection) {
  const pathIds = selectedPathIds(selection);
  return glyph.paths
    .filter((path) => pathIds.has(path.id))
    .map((path) => {
      const selectedIndexes = selection.anchors.filter((anchor) => anchor.pathId === path.id).map((anchor) => anchor.pointIndex);
      const wholePath = selectedIndexes.length === path.points.length;
      const explicitSources = new Set((selection.widgets || []).filter((widget) => widget.pathId === path.id).map((widget) => widget.cornerSource));
      const selectedWidgets = selectedRadiusWidgetsForPath(path, selection);
      const selectedSet = new Set(selectedIndexes);
      const selectedWidgetSources = new Set(selectedWidgets.map((widget) => widget.cornerSource));
      const targets = [];
      const roundedSources = new Set();
      roundedCornerWidgets(path).forEach((widget) => {
        const selected = explicitSources.size
          ? explicitSources.has(widget.cornerSource)
          : selectedWidgetSources.has(widget.cornerSource) || wholePath || (!selectedWidgetSources.size && widget.indexes.some((index) => selectedSet.has(index)));
        if (!selected) return;
        roundedSources.add(widget.cornerSource);
        targets.push({ id: widget.cornerSource, radius: Math.hypot(path.points[widget.indexes[0]].x - widget.origin.x, path.points[widget.indexes[0]].y - widget.origin.y) });
      });
      path.points.forEach((point, index) => {
        if (!isRoundableCorner(path, index)) return;
        if (explicitSources.size) {
          if (!explicitSources.has(point.id)) return;
        } else {
          if (selectedWidgetSources.size) return;
          if (!wholePath && !selectedSet.has(index)) return;
        }
        if (roundedSources.has(point.id)) return;
        targets.push({ id: point.id, radius: 0 });
      });
      return { pathId: path.id, targets };
    })
    .filter((item) => item.targets.length);
}

function applyRadiusTargets(path, targets) {
  const sharp = restoreRoundedCornersInPath(path);
  const limitedTargets = limitRadiusDeltaTargets(sharp, targets);
  const preserved = roundedCornerWidgets(path)
    .filter((widget) => !limitedTargets.some((target) => target.id === widget.cornerSource))
    .map((widget) => ({
      id: widget.cornerSource,
      radius: Math.hypot(path.points[widget.indexes[0]].x - widget.origin.x, path.points[widget.indexes[0]].y - widget.origin.y),
      baseRadius: Math.hypot(path.points[widget.indexes[0]].x - widget.origin.x, path.points[widget.indexes[0]].y - widget.origin.y),
    }));
  const targetMap = new Map([...preserved, ...limitedTargets].map((target) => [target.id, target]));
  const indexes = sharp.points
    .map((point, index) => ({ id: point.id, index }))
    .filter((item) => targetMap.has(item.id) && isRoundableCorner(sharp, item.index))
    .sort((a, b) => b.index - a.index);
  const limited = limitRadiusTargets(sharp, indexes.map((item) => ({ ...item, ...targetMap.get(item.id) })));
  return indexes.reduce((currentPath, item) => {
    const radius = limited.get(item.id) || 0;
    if (radius < 1) return currentPath;
    const index = currentPath.points.findIndex((point) => point.id === item.id);
    return index >= 0 ? roundCornerInPath(currentPath, index, currentPath.points[index], radius) : currentPath;
  }, sharp);
}

function limitRadiusDeltaTargets(path, targets) {
  if (targets.length < 2) return targets.map((target) => ({ ...target, radius: Math.max(0, target.radius) }));
  const byId = new Map(targets.map((target) => [target.id, target]));
  const indexed = path.points
    .map((point, index) => ({ point, index, target: byId.get(point.id) }))
    .filter((item) => item.target && isRoundableCorner(path, item.index));
  if (indexed.length < 2) return targets.map((target) => ({ ...target, radius: Math.max(0, target.radius) }));
  const requestedDelta = Math.max(...indexed.map(({ target }) => (target.radius || 0) - (target.baseRadius || 0)));
  if (requestedDelta <= 0) return targets.map((target) => ({ ...target, radius: Math.max(0, target.radius) }));
  let maxDelta = requestedDelta;
  const indexedByPoint = new Map(indexed.map((item) => [item.index, item]));
  indexed.forEach((item) => {
    const point = item.point;
    const prevIndex = (item.index - 1 + path.points.length) % path.points.length;
    const nextIndex = (item.index + 1) % path.points.length;
    [prevIndex, nextIndex].forEach((otherIndex) => {
      const other = indexedByPoint.get(otherIndex);
      if (!other) return;
      const length = segmentLengthBetween(path, item.index, otherIndex);
      const baseTotal = (item.target.baseRadius || 0) + (other.target.baseRadius || 0);
      const growing = Number((item.target.radius || 0) > (item.target.baseRadius || 0)) + Number((other.target.radius || 0) > (other.target.baseRadius || 0));
      if (!growing) return;
      maxDelta = Math.min(maxDelta, Math.max(0, (length - baseTotal) / growing));
    });
  });
  const delta = Math.min(requestedDelta, maxDelta);
  return targets.map((target) => {
    const requested = Math.max(0, target.radius || 0);
    const base = target.baseRadius || 0;
    return requested > base ? { ...target, radius: base + delta } : { ...target, radius: requested };
  });
}

function projectedCornerRadius(path, anchor, absolute, origin) {
  const widget = anchor.cornerSource ? roundedCornerWidgets(path || {}).find((item) => item.cornerSource === anchor.cornerSource) : null;
  const reference = widget?.position || (path ? cornerWidgetPosition(path, anchor.pointIndex) : null);
  const direction = normalizeVector({ x: (reference?.x ?? origin.x) - origin.x, y: (reference?.y ?? origin.y) - origin.y });
  if (!Number.isFinite(direction.x) || (!direction.x && !direction.y)) return 0;
  const projected = (absolute.x - origin.x) * direction.x + (absolute.y - origin.y) * direction.y;
  return Math.max(0, projected);
}

function limitRadiusTargets(path, targets) {
  const limited = new Map(targets.map((target) => [target.id, target.radius]));
  const selectedIndexes = new Map(targets.map((target) => [target.index, target]));
  targets.forEach((target) => {
    const prevIndex = (target.index - 1 + path.points.length) % path.points.length;
    const nextIndex = (target.index + 1) % path.points.length;
    limited.set(target.id, Math.min(limited.get(target.id), segmentLengthBetween(path, prevIndex, target.index), segmentLengthBetween(path, target.index, nextIndex)));
  });
  for (let pass = 0; pass < targets.length + 2; pass += 1) {
    let changed = false;
    targets.forEach((target) => {
      const point = path.points[target.index];
      const next = path.points[(target.index + 1) % path.points.length];
      const nextTarget = selectedIndexes.get((target.index + 1) % path.points.length);
      if (!nextTarget) return;
      const length = segmentLengthBetween(path, target.index, (target.index + 1) % path.points.length);
      const total = (limited.get(target.id) || 0) + (limited.get(nextTarget.id) || 0);
      if (total <= length + 0.001 || total <= 0) return;
      const baseA = Math.min(target.baseRadius ?? 0, limited.get(target.id) || 0);
      const baseB = Math.min(nextTarget.baseRadius ?? 0, limited.get(nextTarget.id) || 0);
      const baseTotal = baseA + baseB;
      if (baseTotal >= length - 0.001) {
        const nextA = Math.min(limited.get(target.id) || 0, baseA);
        const nextB = Math.min(limited.get(nextTarget.id) || 0, baseB);
        changed = changed || nextA !== limited.get(target.id) || nextB !== limited.get(nextTarget.id);
        limited.set(target.id, nextA);
        limited.set(nextTarget.id, nextB);
        return;
      }
      const extra = length - baseTotal;
      const incA = Math.max(0, (limited.get(target.id) || 0) - baseA);
      const incB = Math.max(0, (limited.get(nextTarget.id) || 0) - baseB);
      const incTotal = incA + incB;
      if (incTotal > extra && incTotal > 0) {
        const scale = extra / incTotal;
        const nextA = baseA + incA * scale;
        const nextB = baseB + incB * scale;
        changed = changed || Math.abs(nextA - (limited.get(target.id) || 0)) > 0.001 || Math.abs(nextB - (limited.get(nextTarget.id) || 0)) > 0.001;
        limited.set(target.id, nextA);
        limited.set(nextTarget.id, nextB);
      }
    });
    if (!changed) break;
  }
  return limited;
}

function measuredRoundedRadius(path) {
  const pairIndex = path.points.findIndex((point, index) => {
    const next = path.points[(index + 1) % path.points.length];
    return point.cornerSource && next?.cornerSource === point.cornerSource && point.cornerOrigin;
  });
  if (pairIndex < 0) return 0;
  const point = path.points[pairIndex];
  return Math.hypot(point.x - point.cornerOrigin.x, point.y - point.cornerOrigin.y);
}

function sharedRadiusLimitForTargets(paths, targets) {
  const byPath = new Map();
  targets.forEach((target) => {
    if (!byPath.has(target.pathId)) byPath.set(target.pathId, []);
    byPath.get(target.pathId).push(target.pointIndex);
  });
  const limits = [];
  byPath.forEach((indexes, pathId) => {
    const path = pathById(paths, pathId);
    if (path) limits.push(sharedRadiusLimitForPath(path, indexes));
  });
  return limits.length ? Math.min(...limits) : Infinity;
}

function sharedRadiusLimitForPath(path, indexes) {
  const selected = new Set(indexes.filter((index) => isRoundableCorner(path, index)));
  if (!selected.size) return 0;
  const limits = [...selected].map((index) => {
    const prevIndex = (index - 1 + path.points.length) % path.points.length;
    const nextIndex = (index + 1) % path.points.length;
    return Math.min(segmentLengthBetween(path, prevIndex, index), segmentLengthBetween(path, index, nextIndex));
  });
  selected.forEach((index) => {
    const nextIndex = (index + 1) % path.points.length;
    if (selected.has(nextIndex)) {
      limits.push(segmentLengthBetween(path, index, nextIndex) / 2);
    }
  });
  return Math.max(0, Math.min(...limits));
}

function isPureRectangle(path) {
  if (path.shapeType !== "rectangle" || !path.rect) return false;
  const box = pathBounds(path);
  const rect = path.rect;
  const sameBox = Math.abs(box.x - rect.x) < 0.5 && Math.abs(box.y - rect.y) < 0.5 && Math.abs(box.w - rect.w) < 0.5 && Math.abs(box.h - rect.h) < 0.5;
  if (!sameBox) return false;
  if (path.cornerMode === "round") return true;
  if (path.points.length !== 4) return false;
  const expected = [
    [rect.x, rect.y],
    [rect.x + rect.w, rect.y],
    [rect.x + rect.w, rect.y + rect.h],
    [rect.x, rect.y + rect.h],
  ];
  return path.points.every((point, index) => Math.abs(point.x - expected[index][0]) < 0.5 && Math.abs(point.y - expected[index][1]) < 0.5 && !point.in && !point.out);
}

function pathBounds(path) {
  const points = sampledPathPoints(path);
  return pointsBounds(points.length ? points : path.points);
}

function sampledPathPoints(path) {
  const samples = [];
  getSegments(path).forEach((segment) => {
    const steps = segment.start.out || segment.end.in ? 24 : 1;
    for (let index = 0; index <= steps; index += 1) {
      samples.push(cubicAt(segment, index / steps));
    }
  });
  if (!samples.length) samples.push(...(path.subpaths?.length ? path.subpaths.flat() : path.points));
  return samples;
}

function selectionBoxForPath(path) {
  if (!path.rotationAngle) return pathBounds(path);
  const center = path.rotationCenter || pathBounds(path);
  const rotationCenter = center.w ? { x: center.x + center.w / 2, y: center.y + center.h / 2 } : center;
  const unrotated = {
    ...path,
    points: path.points.map((point) => rotatePoint(point, rotationCenter, -path.rotationAngle)),
    subpaths: path.subpaths?.map((ring) => ring.map((point) => rotatePoint(point, rotationCenter, -path.rotationAngle))),
  };
  return { ...pathBounds(unrotated), angle: path.rotationAngle, rotationCenter };
}

function unionBoxes(boxes) {
  const minX = Math.min(...boxes.map((box) => box.x));
  const minY = Math.min(...boxes.map((box) => box.y));
  const maxX = Math.max(...boxes.map((box) => box.x + box.w));
  const maxY = Math.max(...boxes.map((box) => box.y + box.h));
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function visualUnionBox(boxes) {
  const points = boxes.flatMap(rotatedBoxCorners);
  const bounds = pointsBounds(points);
  return { ...bounds, angle: 0, rotationCenter: { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h / 2 } };
}

function originFromBox(box, key) {
  const xMap = { nw: box.x, cw: box.x, sw: box.x, nc: box.x + box.w / 2, cc: box.x + box.w / 2, sc: box.x + box.w / 2, ne: box.x + box.w, ce: box.x + box.w, se: box.x + box.w };
  const yMap = { nw: box.y, nc: box.y, ne: box.y, cw: box.y + box.h / 2, cc: box.y + box.h / 2, ce: box.y + box.h / 2, sw: box.y + box.h, sc: box.y + box.h, se: box.y + box.h };
  return { x: xMap[key] ?? box.x + box.w / 2, y: yMap[key] ?? box.y + box.h / 2 };
}

function originFromRotatedBox(box, key) {
  if (!box) return { x: 0, y: 0 };
  if (!box.angle) return originFromBox(box, key);
  const corners = rotatedBoxCorners(box);
  const top = [...corners].sort((a, b) => a.y - b.y).slice(0, 2).sort((a, b) => a.x - b.x);
  const bottom = [...corners].sort((a, b) => b.y - a.y).slice(0, 2).sort((a, b) => a.x - b.x);
  const left = [...corners].sort((a, b) => a.x - b.x).slice(0, 2).sort((a, b) => a.y - b.y);
  const right = [...corners].sort((a, b) => b.x - a.x).slice(0, 2).sort((a, b) => a.y - b.y);
  const midpoint = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const map = {
    nw: top[0],
    ne: top[1],
    sw: bottom[0],
    se: bottom[1],
    nc: midpoint(top[0], top[1]),
    sc: midpoint(bottom[0], bottom[1]),
    cw: midpoint(left[0], left[1]),
    ce: midpoint(right[0], right[1]),
    cc: midpoint(corners[0], corners[2]),
  };
  return map[key] || map.cc;
}

function rotatedBoxCorners(box) {
  const center = box.rotationCenter || { x: box.x + box.w / 2, y: box.y + box.h / 2 };
  const corners = [
    { x: box.x, y: box.y },
    { x: box.x + box.w, y: box.y },
    { x: box.x + box.w, y: box.y + box.h },
    { x: box.x, y: box.y + box.h },
  ];
  return box.angle ? corners.map((point) => rotatePlainPoint(point, center, box.angle)) : corners;
}

function bboxMovingPoint(box, handle) {
  return {
    nw: { x: box.x, y: box.y },
    n: { x: box.x + box.w / 2, y: box.y },
    ne: { x: box.x + box.w, y: box.y },
    e: { x: box.x + box.w, y: box.y + box.h / 2 },
    se: { x: box.x + box.w, y: box.y + box.h },
    s: { x: box.x + box.w / 2, y: box.y + box.h },
    sw: { x: box.x, y: box.y + box.h },
    w: { x: box.x, y: box.y + box.h / 2 },
  }[handle] || { x: box.x + box.w, y: box.y + box.h };
}

function bboxHandles(box) {
  return [
    ["nw", box.x, box.y],
    ["n", box.x + box.w / 2, box.y],
    ["ne", box.x + box.w, box.y],
    ["e", box.x + box.w, box.y + box.h / 2],
    ["se", box.x + box.w, box.y + box.h],
    ["s", box.x + box.w / 2, box.y + box.h],
    ["sw", box.x, box.y + box.h],
    ["w", box.x, box.y + box.h / 2],
  ];
}

function clampScale(scale, size) {
  const minScale = Math.min(0.98, Math.max(PIXEL_GRID_SIZE / Math.max(PIXEL_GRID_SIZE, Math.abs(size)), 0.05));
  return Math.max(minScale, Math.min(20, scale));
}

function intersectBoxes(boxes) {
  const minX = Math.max(...boxes.map((box) => box.x));
  const minY = Math.max(...boxes.map((box) => box.y));
  const maxX = Math.min(...boxes.map((box) => box.x + box.w));
  const maxY = Math.min(...boxes.map((box) => box.y + box.h));
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function roundedCornerForPath(path, pointIndex, absolute) {
  const point = path.points[pointIndex];
  const prev = path.points[(pointIndex - 1 + path.points.length) % path.points.length];
  const next = path.points[(pointIndex + 1) % path.points.length];
  if (!point || !prev || !next) return point;
  const inVector = normalizeVector({ x: prev.x - point.x, y: prev.y - point.y });
  const outVector = normalizeVector({ x: next.x - point.x, y: next.y - point.y });
  const dragRadius = Math.hypot(absolute.x - point.x, absolute.y - point.y);
  const maxRadius = Math.max(0, Math.min(Math.hypot(prev.x - point.x, prev.y - point.y), Math.hypot(next.x - point.x, next.y - point.y)) / 2);
  const radius = Math.min(maxRadius, Math.max(0, dragRadius));
  if (radius < 1) return { ...point, smooth: false, in: null, out: null };
  return {
    ...point,
    smooth: true,
    in: { x: point.x + inVector.x * radius * KAPPA, y: point.y + inVector.y * radius * KAPPA },
    out: { x: point.x + outVector.x * radius * KAPPA, y: point.y + outVector.y * radius * KAPPA },
  };
}

function clonePointForCorner(point) {
  return {
    ...point,
    in: point.in ? { ...point.in } : null,
    out: point.out ? { ...point.out } : null,
    cornerOrigin: point.cornerOrigin ? { ...point.cornerOrigin } : null,
    cornerOriginal: null,
  };
}

function lerpPlainPoint(a, b, t) {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function splitCubicSegment(segment, t) {
  const p0 = segment.start;
  const p1 = segment.c1 || segment.start;
  const p2 = segment.c2 || segment.end;
  const p3 = segment.end;
  const p01 = lerpPlainPoint(p0, p1, t);
  const p12 = lerpPlainPoint(p1, p2, t);
  const p23 = lerpPlainPoint(p2, p3, t);
  const p012 = lerpPlainPoint(p01, p12, t);
  const p123 = lerpPlainPoint(p12, p23, t);
  const point = lerpPlainPoint(p012, p123, t);
  return {
    point,
    left: { c1: p01, c2: p012 },
    right: { c1: p123, c2: p23 },
  };
}

function approximateSegmentLength(segment, steps = 32) {
  let length = 0;
  let previous = cubicAt(segment, 0);
  for (let index = 1; index <= steps; index += 1) {
    const point = cubicAt(segment, index / steps);
    length += Math.hypot(point.x - previous.x, point.y - previous.y);
    previous = point;
  }
  return length;
}

function segmentLengthBetween(path, index, nextIndex) {
  const start = path.points[index];
  const end = path.points[nextIndex];
  if (!start || !end) return 0;
  const segment = makeSegmentFromPoints(index, nextIndex, start, end);
  return (segment.start.out || segment.end.in) ? approximateSegmentLength(segment) : Math.hypot(end.x - start.x, end.y - start.y);
}

function handleIfDistinct(handle, point) {
  return Math.hypot(handle.x - point.x, handle.y - point.y) > 0.01 ? { x: handle.x, y: handle.y } : null;
}

function roundCornerInPath(path, pointIndex, absolute, radiusOverride = null) {
  if (path.subpaths?.length) return path;
  if (!isRoundableCorner(path, pointIndex)) return path;
  const point = path.points[pointIndex];
  const prevIndex = (pointIndex - 1 + path.points.length) % path.points.length;
  const nextIndex = (pointIndex + 1) % path.points.length;
  const prev = path.points[prevIndex];
  const next = path.points[nextIndex];
  if (!point || !prev || !next) return path;
  const incomingSegment = makeSegmentFromPoints(prevIndex, pointIndex, prev, point);
  const outgoingSegment = makeSegmentFromPoints(pointIndex, nextIndex, point, next);
  const incomingCurved = Boolean(prev.out || point.in);
  const outgoingCurved = Boolean(point.out || next.in);
  const toPrev = normalizeVector({ x: prev.x - point.x, y: prev.y - point.y });
  const toNext = normalizeVector({ x: next.x - point.x, y: next.y - point.y });
  const prevLen = incomingCurved ? approximateSegmentLength(incomingSegment) : Math.hypot(prev.x - point.x, prev.y - point.y);
  const nextLen = outgoingCurved ? approximateSegmentLength(outgoingSegment) : Math.hypot(next.x - point.x, next.y - point.y);
  const maxRadius = Math.max(0, Math.min(prevLen, nextLen));
  let radius = Math.max(0, Math.min(maxRadius, radiusOverride ?? Math.hypot(absolute.x - point.x, absolute.y - point.y)));
  if (maxRadius - radius < 3) radius = maxRadius;
  if (radius < 1) return path;
  const basePoints = path.points.map(clonePointForCorner);
  const tIncoming = incomingCurved ? Math.max(0, Math.min(1, 1 - radius / Math.max(1, prevLen))) : 1;
  const tOutgoing = outgoingCurved ? Math.max(0, Math.min(1, radius / Math.max(1, nextLen))) : 0;
  let start;
  let end;
  let incomingTangent;
  let outgoingTangent;
  if (incomingCurved) {
    const split = splitCubicSegment(incomingSegment, tIncoming);
    start = newPoint(split.point.x, split.point.y);
    start.in = handleIfDistinct(split.left.c2, start);
    basePoints[prevIndex] = { ...basePoints[prevIndex], out: handleIfDistinct(split.left.c1, basePoints[prevIndex]) };
    incomingTangent = normalizeVector(cubicTangent(incomingSegment, tIncoming));
  } else {
    start = newPoint(point.x + toPrev.x * radius, point.y + toPrev.y * radius);
    incomingTangent = normalizeVector({ x: point.x - start.x, y: point.y - start.y });
  }
  if (outgoingCurved) {
    const split = splitCubicSegment(outgoingSegment, tOutgoing);
    end = newPoint(split.point.x, split.point.y);
    end.out = handleIfDistinct(split.right.c1, end);
    basePoints[nextIndex] = { ...basePoints[nextIndex], in: handleIfDistinct(split.right.c2, basePoints[nextIndex]) };
    outgoingTangent = normalizeVector(cubicTangent(outgoingSegment, tOutgoing));
  } else {
    end = newPoint(point.x + toNext.x * radius, point.y + toNext.y * radius);
    outgoingTangent = normalizeVector({ x: end.x - point.x, y: end.y - point.y });
  }
  start.out = {
    x: start.x + incomingTangent.x * radius * KAPPA,
    y: start.y + incomingTangent.y * radius * KAPPA,
  };
  end.in = {
    x: end.x - outgoingTangent.x * radius * KAPPA,
    y: end.y - outgoingTangent.y * radius * KAPPA,
  };
  const cornerOriginal = {
    prev: clonePointForCorner(prev),
    point: clonePointForCorner(point),
    next: clonePointForCorner(next),
  };
  start.cornerSource = point.id;
  end.cornerSource = point.id;
  start.cornerOrigin = { x: point.x, y: point.y };
  end.cornerOrigin = { x: point.x, y: point.y };
  start.cornerOriginal = cornerOriginal;
  end.cornerOriginal = cornerOriginal;
  const points = [
    ...basePoints.slice(0, pointIndex),
    start,
    end,
    ...basePoints.slice(pointIndex + 1),
  ];
  return { ...path, points, cornerMode: "round" };
}

function hasRoundedCornerPairs(path) {
  return path.points.some((point, index) => {
    const next = path.points[(index + 1) % path.points.length];
    return point.cornerSource && next?.cornerSource === point.cornerSource && point.cornerOrigin && next.cornerOrigin;
  });
}

function roundedCornerWidgets(path) {
  const widgets = [];
  path.points.forEach((point, index) => {
    const nextIndex = (index + 1) % path.points.length;
    const next = path.points[nextIndex];
    if (!point.cornerSource || next?.cornerSource !== point.cornerSource || !point.cornerOrigin) return;
    widgets.push({
      cornerSource: point.cornerSource,
      origin: point.cornerOrigin,
      indexes: [index, nextIndex],
      position: { x: (point.x + next.x) / 2, y: (point.y + next.y) / 2 },
    });
  });
  return widgets;
}

function roundedCornerOrigin(path, cornerSource) {
  return path?.points.find((point) => point.cornerSource === cornerSource)?.cornerOrigin || null;
}

function selectedRoundedCornerSources(path, selection) {
  const explicit = new Set((selection.widgets || []).filter((widget) => widget.pathId === path?.id).map((widget) => widget.cornerSource));
  if (explicit.size) return explicit;
  const selected = new Set((selection.anchors || []).filter((anchor) => anchor.pathId === path?.id).map((anchor) => anchor.pointIndex));
  return new Set(roundedCornerWidgets(path || {}).filter((widget) => widget.indexes.every((index) => selected.has(index))).map((widget) => widget.cornerSource));
}

function restoreRoundedCornersInPath(path) {
  if (!hasRoundedCornerPairs(path)) return path;
  const restored = [];
  const originalsById = new Map();
  for (let index = 0; index < path.points.length; index += 1) {
    const point = path.points[index];
    const replacement = originalsById.get(point.id);
    if (replacement) {
      restored.push(clonePointForCorner(replacement));
      originalsById.delete(point.id);
      continue;
    }
    const next = path.points[(index + 1) % path.points.length];
    if (point.cornerSource && next?.cornerSource === point.cornerSource && point.cornerOrigin) {
      const original = point.cornerOriginal || next.cornerOriginal;
      if (original?.prev && restored.at(-1)?.id === original.prev.id) {
        restored[restored.length - 1] = clonePointForCorner(original.prev);
      }
      if (original?.next) originalsById.set(original.next.id, original.next);
      restored.push(original?.point ? clonePointForCorner(original.point) : {
        ...newPoint(point.cornerOrigin.x, point.cornerOrigin.y),
        id: point.cornerSource,
      });
      index += 1;
    } else {
      restored.push(point);
    }
  }
  return { ...path, points: restored, cornerMode: restored.some((point) => point.cornerSource) ? "round" : "sharp" };
}

function resizeRoundedCornersInPath(path, radius) {
  if (!hasRoundedCornerPairs(path)) return path;
  const sharp = restoreRoundedCornersInPath(path);
  const indexes = sharp.points
    .map((point, index) => [point, index])
    .filter(([, index]) => isRoundableCorner(sharp, index))
    .map(([, index]) => index)
    .sort((a, b) => b - a);
  const limitedRadius = Math.min(radius, sharedRadiusLimitForPath(sharp, indexes));
  return indexes.reduce((currentPath, index) => roundCornerInPath(currentPath, index, currentPath.points[index], limitedRadius), sharp);
}

function isRoundableCorner(path, pointIndex) {
  const point = path.points[pointIndex];
  if (!point || point.cornerSource) return false;
  if (!path.closed && (pointIndex === 0 || pointIndex === path.points.length - 1)) return false;
  const prev = path.points[(pointIndex - 1 + path.points.length) % path.points.length];
  const next = path.points[(pointIndex + 1) % path.points.length];
  if (!prev || !next) return false;
  const incomingCurved = Boolean(prev.out || point.in);
  const outgoingCurved = Boolean(point.out || next.in);
  if (incomingCurved && outgoingCurved) return false;
  return Math.hypot(prev.x - point.x, prev.y - point.y) > 1 && Math.hypot(next.x - point.x, next.y - point.y) > 1;
}

function mergeCoincidentCornerPoints(points) {
  if (points.length < 2) return points;
  const merged = [];
  points.forEach((point) => {
    const previous = merged[merged.length - 1];
    if (previous && Math.hypot(previous.x - point.x, previous.y - point.y) < 2) {
      merged[merged.length - 1] = {
        ...previous,
        out: previous.out || point.out,
        in: point.in || previous.in,
        smooth: previous.smooth || point.smooth,
      };
    } else {
      merged.push(point);
    }
  });
  if (merged.length > 2 && Math.hypot(merged[0].x - merged.at(-1).x, merged[0].y - merged.at(-1).y) < 2) {
    const first = merged[0];
    const last = merged.pop();
    merged[0] = { ...first, in: first.in || last.in, out: first.out || last.out, smooth: first.smooth || last.smooth };
  }
  return merged;
}

function removePathOverlap(path) {
  const uniquePoints = [];
  path.points.forEach((point) => {
    const previous = uniquePoints[uniquePoints.length - 1];
    if (previous && pointsCoincide(previous, point)) {
      uniquePoints[uniquePoints.length - 1] = {
        ...previous,
        in: previous.in || point.in,
        out: previous.out || point.out,
        smooth: previous.smooth || point.smooth,
      };
      return;
    }
    uniquePoints.push(point);
  });
  if (path.closed && uniquePoints.length > 1 && pointsCoincide(uniquePoints[0], uniquePoints.at(-1))) {
    const last = uniquePoints.pop();
    uniquePoints[0] = { ...uniquePoints[0], in: uniquePoints[0].in || last.in, out: uniquePoints[0].out || last.out, smooth: uniquePoints[0].smooth || last.smooth };
  }
  const seenSegments = new Set();
  const filtered = uniquePoints.filter((point, index) => {
    if (!path.closed && index === uniquePoints.length - 1) return true;
    const next = uniquePoints[(index + 1) % uniquePoints.length];
    if (!next || pointsCoincide(point, next)) return false;
    const key = segmentKey(point, next);
    if (seenSegments.has(key)) return false;
    seenSegments.add(key);
    return true;
  });
  return { ...path, points: filtered.length ? filtered : uniquePoints };
}

function pointsCoincide(a, b, tolerance = 0.01) {
  return Math.hypot(a.x - b.x, a.y - b.y) <= tolerance;
}

function segmentKey(a, b) {
  const p1 = `${Math.round(a.x * 100) / 100},${Math.round(a.y * 100) / 100}`;
  const p2 = `${Math.round(b.x * 100) / 100},${Math.round(b.y * 100) / 100}`;
  return [p1, p2].sort().join("|");
}

function roundedCorner(point, absolute) {
  const radius = Math.min(90, Math.max(8, Math.hypot(absolute.x - point.x, absolute.y - point.y)));
  return {
    ...point,
    smooth: true,
    in: { x: point.x - radius, y: point.y },
    out: { x: point.x + radius, y: point.y },
  };
}

function cornerWidgetPosition(path, pointIndex) {
  const point = path.points[pointIndex];
  const prev = path.points[(pointIndex - 1 + path.points.length) % path.points.length];
  const next = path.points[(pointIndex + 1) % path.points.length];
  if (!point || !prev || !next) return point || { x: 0, y: 0 };
  const prevIndex = (pointIndex - 1 + path.points.length) % path.points.length;
  const nextIndex = (pointIndex + 1) % path.points.length;
  const incomingSegment = makeSegmentFromPoints(prevIndex, pointIndex, prev, point);
  const outgoingSegment = makeSegmentFromPoints(pointIndex, nextIndex, point, next);
  const incomingDirection = (prev.out || point.in)
    ? normalizeVector(scaleVector(cubicTangent(incomingSegment, 1), -1))
    : normalizeVector({ x: prev.x - point.x, y: prev.y - point.y });
  const outgoingDirection = (point.out || next.in)
    ? normalizeVector(cubicTangent(outgoingSegment, 0))
    : normalizeVector({ x: next.x - point.x, y: next.y - point.y });
  let bisector = normalizeVector({ x: incomingDirection.x + outgoingDirection.x, y: incomingDirection.y + outgoingDirection.y });
  if (Math.hypot(bisector.x, bisector.y) < 0.01) bisector = normalizeVector({ x: -incomingDirection.y, y: incomingDirection.x });
  const distance = Math.min(20, Math.max(10, Math.min(segmentLengthBetween(path, prevIndex, pointIndex), segmentLengthBetween(path, pointIndex, nextIndex)) * 0.22));
  let candidate = { x: point.x + bisector.x * distance, y: point.y + bisector.y * distance };
  if (path.closed && !pointInPathFill(path, candidate)) {
    candidate = { x: point.x - bisector.x * distance, y: point.y - bisector.y * distance };
  }
  return candidate;
}

function scaleVector(vector, scale) {
  return { x: vector.x * scale, y: vector.y * scale };
}

function pointInPathFill(path, point) {
  const samples = sampledPathPoints(path);
  if (samples.length < 3) return false;
  let inside = false;
  for (let index = 0, previousIndex = samples.length - 1; index < samples.length; previousIndex = index, index += 1) {
    const a = samples[index];
    const b = samples[previousIndex];
    const intersects = ((a.y > point.y) !== (b.y > point.y))
      && point.x < ((b.x - a.x) * (point.y - a.y)) / ((b.y - a.y) || 1) + a.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

function pixelCenter(pixel) {
  if ((pixel.shape || "square") === "square") return rotateAround({ x: pixel.x + pixel.size / 2, y: pixel.y + pixel.size / 2 }, pixel.angleDeg || 0, CANVAS_SIZE / 2, CANVAS_SIZE / 2);
  return { x: pixel.x, y: pixel.y };
}

function parsePixelTool(activeTool) {
  if (!activeTool?.startsWith("gridRect") && !activeTool?.startsWith("gridEllipse")) return { shape: null, mode: "filled" };
  const [shape, mode = "filled"] = activeTool.split(":");
  return { shape, mode };
}

function regularPolygonPoints(cx, cy, radius, sides, offset = 0) {
  return Array.from({ length: sides }, (_, index) => {
    const angle = offset - Math.PI / 2 + (Math.PI * 2 * index) / sides;
    return `${cx + Math.cos(angle) * radius},${cy + Math.sin(angle) * radius}`;
  }).join(" ");
}

function gridCellAt(point, grid) {
  const step = PIXEL_GRID_SIZE;
  const angleDeg = grid.gridAngle || 0;
  const local = rotateAround(point, -angleDeg, CANVAS_SIZE / 2, CANVAS_SIZE / 2);
  const shape = grid.gridShape || "square";
  if (shape === "square") {
    const x = Math.floor(local.x / step) * step;
    const y = Math.floor(local.y / step) * step;
    return { x, y, size: step, shape, angleDeg };
  }
  const center = {
    x: Math.round(local.x / step) * step,
    y: Math.round(local.y / step) * step,
  };
  const world = rotateAround(center, angleDeg, CANVAS_SIZE / 2, CANVAS_SIZE / 2);
  return { x: world.x, y: world.y, size: step, shape, angle: (angleDeg * Math.PI) / 180, angleDeg };
}

function samePixel(a, b) {
  return Math.round(a.x) === Math.round(b.x) && Math.round(a.y) === Math.round(b.y) && a.size === b.size && (a.shape || "square") === (b.shape || "square");
}

function pointHitsPixel(point, pixel) {
  const shape = pixel.shape || "square";
  const size = pixel.size;
  if (shape === "circle") return Math.hypot(point.x - pixel.x, point.y - pixel.y) <= size / 2;
  if (shape === "square") {
    const local = rotateAround(point, -(pixel.angleDeg || 0), CANVAS_SIZE / 2, CANVAS_SIZE / 2);
    return local.x >= pixel.x && local.x <= pixel.x + size && local.y >= pixel.y && local.y <= pixel.y + size;
  }
  return Math.hypot(point.x - pixel.x, point.y - pixel.y) <= size / 2;
}

function rotateAround(point, angleDeg, cx, cy) {
  const angle = (angleDeg * Math.PI) / 180;
  const dx = point.x - cx;
  const dy = point.y - cy;
  return {
    x: cx + dx * Math.cos(angle) - dy * Math.sin(angle),
    y: cy + dx * Math.sin(angle) + dy * Math.cos(angle),
  };
}

function cubicAt(segment, t) {
  const p0 = segment.start;
  const p1 = segment.c1 || segment.start;
  const p2 = segment.c2 || segment.end;
  const p3 = segment.end;
  const mt = 1 - t;
  return {
    x: mt ** 3 * p0.x + 3 * mt ** 2 * t * p1.x + 3 * mt * t ** 2 * p2.x + t ** 3 * p3.x,
    y: mt ** 3 * p0.y + 3 * mt ** 2 * t * p1.y + 3 * mt * t ** 2 * p2.y + t ** 3 * p3.y,
  };
}

function cubicTangent(segment, t) {
  const p0 = segment.start;
  const p1 = segment.c1 || segment.start;
  const p2 = segment.c2 || segment.end;
  const p3 = segment.end;
  const mt = 1 - t;
  return {
    x: 3 * mt ** 2 * (p1.x - p0.x) + 6 * mt * t * (p2.x - p1.x) + 3 * t ** 2 * (p3.x - p2.x),
    y: 3 * mt ** 2 * (p1.y - p0.y) + 6 * mt * t * (p2.y - p1.y) + 3 * t ** 2 * (p3.y - p2.y),
  };
}

function curvatureAmount(segment, t) {
  const tangent = cubicTangent(segment, t);
  const p0 = segment.start;
  const p1 = segment.c1 || segment.start;
  const p2 = segment.c2 || segment.end;
  const p3 = segment.end;
  const mt = 1 - t;
  const second = {
    x: 6 * mt * (p2.x - 2 * p1.x + p0.x) + 6 * t * (p3.x - 2 * p2.x + p1.x),
    y: 6 * mt * (p2.y - 2 * p1.y + p0.y) + 6 * t * (p3.y - 2 * p2.y + p1.y),
  };
  const numerator = Math.abs(tangent.x * second.y - tangent.y * second.x);
  const denominator = Math.max(1, (tangent.x ** 2 + tangent.y ** 2) ** 1.5);
  return (numerator / denominator) * 14000;
}

function normalizeVector(vector) {
  const length = Math.max(1, Math.hypot(vector.x, vector.y));
  return { x: vector.x / length, y: vector.y / length };
}

function nearestTangentGuide(paths, point, activePathId) {
  let best = null;
  const active = activePathId ? pathById(paths, activePathId) : null;
  const start = active?.points.at(-1) || null;
  paths.forEach((path) => {
    if (path.id === activePathId) return;
    getSegments(path).forEach((segment) => {
      for (let step = 0; step <= 28; step += 1) {
        const t = step / 28;
        const p = cubicAt(segment, t);
        const tangent = normalizeVector(cubicTangent(segment, t));
        const cursorDistance = Math.hypot(p.x - point.x, p.y - point.y);
        let score = cursorDistance;
        if (start) {
          const candidateLine = normalizeVector({ x: p.x - start.x, y: p.y - start.y });
          const tangentScore = Math.abs(candidateLine.x * tangent.y - candidateLine.y * tangent.x);
          score = cursorDistance + tangentScore * 28;
          if (cursorDistance > 20 || tangentScore > 0.12) return;
        }
        if (cursorDistance < 18 && (!best || score < best.distance)) {
          best = {
            distance: score,
            x1: p.x - tangent.x * 32,
            y1: p.y - tangent.y * 32,
            x2: p.x + tangent.x * 32,
            y2: p.y + tangent.y * 32,
          };
        }
      }
    });
  });
  return best;
}

function nearestConnectionPoint(paths, point, activePathId) {
  let best = null;
  paths.forEach((path) => {
    if (path.id === activePathId) return;
    path.points.forEach((candidate, pointIndex) => {
      if (!isPathEndpoint(paths, { pathId: path.id, pointIndex })) return;
      const distance = Math.hypot(candidate.x - point.x, candidate.y - point.y);
      if (distance < 5 && (!best || distance < best.distance)) best = { distance, point: { x: candidate.x, y: candidate.y } };
    });
    getSegments(path).forEach((segment) => {
      const projected = projectPointToLineSegment(point, segment.start, segment.end);
      const distance = Math.hypot(projected.x - point.x, projected.y - point.y);
      if (distance < 3 && (!best || distance < best.distance)) best = { distance, point: snapPoint(projected, VECTOR_GRID_SIZE) };
    });
  });
  return best?.point || null;
}

function projectPointToLineSegment(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSq = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSq));
  return { x: start.x + dx * t, y: start.y + dy * t };
}

function speedPunkAreaD(segment, outward = 1, size = 10) {
  const base = [];
  const graph = [];
  const samples = 22;
  for (let index = 0; index <= samples; index += 1) {
    const t = index / samples;
    const point = cubicAt(segment, t);
    const tangent = cubicTangent(segment, t);
    const normal = normalizeVector({ x: -tangent.y * outward, y: tangent.x * outward });
    const length = Math.min(size * 2.2, Math.max(1.5, curvatureAmount(segment, t) * (size / 42)));
    base.push(point);
    graph.push({ x: point.x + normal.x * length, y: point.y + normal.y * length });
  }
  const start = base[0];
  return [
    `M ${start.x} ${start.y}`,
    ...base.slice(1).map((point) => `L ${point.x} ${point.y}`),
    ...graph.reverse().map((point) => `L ${point.x} ${point.y}`),
    "Z",
  ].join(" ");
}

function signedArea(points) {
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    area += current.x * next.y - next.x * current.y;
  }
  return area / 2;
}

function pathToPolygon(path) {
  const rings = (path.subpaths?.length ? path.subpaths : [path.points]).map((points) => {
    const ring = pointsToPolygonRing(points);
    if (ring.length && (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1])) ring.push([...ring[0]]);
    return ring;
  });
  return [rings.filter((ring) => ring.length >= 4)];
}

function pointsToPolygonRing(points) {
  const pseudoPath = { points, closed: true };
  const ring = [];
  getSegments(pseudoPath).forEach((segment) => {
    const steps = segment.start.out || segment.end.in ? 6 : 1;
    for (let index = 0; index < steps; index += 1) {
      const point = cubicAt(segment, index / steps);
      ring.push([roundCoord(point.x), roundCoord(point.y)]);
    }
  });
  return simplifyRing(ring, 1.2);
}

function simplifyRing(ring, tolerance) {
  if (ring.length < 4) return ring;
  return ring.filter((point, index) => {
    const prev = ring[(index - 1 + ring.length) % ring.length];
    const next = ring[(index + 1) % ring.length];
    const area = Math.abs((point[0] - prev[0]) * (next[1] - prev[1]) - (point[1] - prev[1]) * (next[0] - prev[0]));
    const base = Math.hypot(next[0] - prev[0], next[1] - prev[1]) || 1;
    return area / base > tolerance;
  });
}

function hasCurves(path) {
  return path.points.some((point) => point.in || point.out) || path.subpaths?.some((ring) => ring.some((point) => point.in || point.out));
}

function curvePreservingPathfinder(paths, mode, strokeWidth) {
  const rings = [];
  if (mode === "minus") {
    rings.push(...pathRings(paths[0]));
    paths.slice(1).forEach((path) => rings.push(...pathRings(path).map(reverseRing)));
  } else {
    paths.forEach((path) => rings.push(...pathRings(path)));
  }
  const points = rings.flat();
  return {
    id: crypto.randomUUID(),
    strokeWidth,
    lineCap: "round",
    cornerMode: "sharp",
    closed: true,
    fillRule: mode === "unite" ? "nonzero" : "evenodd",
    points,
    subpaths: rings,
  };
}

function pathRings(path) {
  return (path.subpaths?.length ? path.subpaths : [path.points]).map((ring) => ring.map(clonePoint));
}

function reverseRing(ring) {
  return [...ring].reverse().map((point) => ({ ...point, in: point.out, out: point.in }));
}

function joinPathsByAnchors(paths, first, last, mode = "center") {
  const firstPath = pathById(paths, first.pathId);
  const lastPath = pathById(paths, last.pathId);
  if (!firstPath || !lastPath) return paths;
  const firstPoint = firstPath.points[first.pointIndex];
  const lastPoint = lastPath.points[last.pointIndex];
  if (!firstPoint || !lastPoint) return paths;
  const joinPoint = mode === "first"
    ? { x: firstPoint.x, y: firstPoint.y }
    : mode === "last"
      ? { x: lastPoint.x, y: lastPoint.y }
      : { x: (firstPoint.x + lastPoint.x) / 2, y: (firstPoint.y + lastPoint.y) / 2 };

  if (first.pathId === last.pathId) {
    return paths.map((path) => {
      if (path.id !== first.pathId) return path;
      const points = path.points.map((point, index) => (index === first.pointIndex || index === last.pointIndex ? { ...point, ...joinPoint } : point));
      return { ...path, points, closed: true };
    });
  }

  const firstSplit = splitPathAtAnchor(firstPath, first.pointIndex, "end");
  const lastSplit = splitPathAtAnchor(lastPath, last.pointIndex, "start");
  const firstOriented = firstSplit.primary.map((point, index, array) => index === array.length - 1 ? { ...point, ...joinPoint } : point);
  const lastOriented = lastSplit.primary.map((point, index) => index === 0 ? { ...point, ...joinPoint } : point);
  const joined = {
    ...firstPath,
    id: firstPath.id,
    closed: false,
    points: [...firstOriented, ...lastOriented.slice(1)],
  };
  const remnants = [
    ...firstSplit.remnants.map((points) => ({ ...firstPath, id: crypto.randomUUID(), closed: false, points })),
    ...lastSplit.remnants.map((points) => ({ ...lastPath, id: crypto.randomUUID(), closed: false, points })),
  ].filter((path) => path.points.length > 1);
  return paths.filter((path) => path.id !== first.pathId && path.id !== last.pathId).concat(joined, remnants);
}

function splitPathAtAnchor(path, pointIndex, target) {
  const points = path.points.map(clonePoint);
  if (path.closed) {
    const loop = [...points.slice(pointIndex), ...points.slice(0, pointIndex + 1)];
    return target === "start"
      ? { primary: loop, remnants: [] }
      : { primary: reverseRing(loop), remnants: [] };
  }
  const isStart = pointIndex === 0;
  const isEnd = pointIndex === points.length - 1;
  if (target === "start" && isStart) return { primary: points, remnants: [] };
  if (target === "end" && isEnd) return { primary: points, remnants: [] };
  if (target === "start" && isEnd) return { primary: reverseRing(points), remnants: [] };
  if (target === "end" && isStart) return { primary: reverseRing(points), remnants: [] };
  const before = points.slice(0, pointIndex + 1);
  const after = points.slice(pointIndex);
  if (target === "start") {
    return {
      primary: after,
      remnants: before.length > 1 ? [before] : [],
    };
  }
  if (target === "end") {
    return {
      primary: before,
      remnants: after.length > 1 ? [after] : [],
    };
  }
  return { primary: points, remnants: [] };
}

function clonePoint(point) {
  return {
    ...point,
    id: crypto.randomUUID(),
    in: point.in ? { ...point.in } : null,
    out: point.out ? { ...point.out } : null,
  };
}

function polygonsToPaths(polygons, strokeWidth) {
  if (!Array.isArray(polygons)) return [];
  const allRings = [];
  polygons.forEach((polygon) => {
    const rings = polygon
      .filter((ring) => Array.isArray(ring) && ring.length >= 4)
      .map((ring) => ring.slice(0, -1).map(([x, y]) => newPoint(x, y)));
    allRings.push(...rings);
  });
  if (!allRings.length) return [];
  return [{
    id: crypto.randomUUID(),
    strokeWidth,
    lineCap: "round",
    cornerMode: "sharp",
    closed: true,
    fillRule: "evenodd",
    points: allRings.flat(),
    subpaths: allRings,
  }];
}

function roundCoord(value) {
  return Math.round(value * 100) / 100;
}

createRoot(document.getElementById("root")).render(<App />);
