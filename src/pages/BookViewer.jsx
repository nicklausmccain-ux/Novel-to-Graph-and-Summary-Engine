import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import CytoscapeComponent from "react-cytoscapejs";
import "../App.css";

// Cache-bust suffix for dev — forces browser to re-fetch JSON after regeneration
const CB = import.meta.env.DEV ? `?v=${Date.now()}` : "";

// ── Cytoscape Stylesheet (plain white theme) ────────────────────────

const cyStylesheet = [
  {
    selector: "node",
    style: {
      label: "data(label)",
      "background-color": "#5b7b9a",
      color: "#333",
      "font-family": "system-ui, -apple-system, sans-serif",
      "font-size": "11px",
      "text-valign": "bottom",
      "text-halign": "center",
      "text-margin-y": 6,
      width: "data(size)",
      height: "data(size)",
      "border-width": 1.5,
      "border-color": "#7a9ab5",
      "text-outline-width": 2,
      "text-outline-color": "#ffffff",
      "text-outline-opacity": 0.9,
      "min-zoomed-font-size": 8,
      "overlay-padding": 6,
      opacity: "data(nodeOpacity)",
      "transition-property":
        "background-color, border-color, width, height, opacity",
      "transition-duration": "0.25s",
    },
  },
  {
    selector: "node[isCore]",
    style: {
      "font-size": "12px",
      "font-weight": "bold",
      "min-zoomed-font-size": 0,
    },
  },
  {
    selector: "node.new-node",
    style: {
      "background-color": "#22c55e",
      "border-color": "#16a34a",
      "border-width": 2.5,
      "font-weight": "bold",
      "font-size": "13px",
      color: "#166534",
    },
  },
  {
    selector: "node:selected",
    style: {
      "background-color": "#2563eb",
      "border-color": "#1d4ed8",
      "border-width": 3,
      width: 42,
      height: 42,
      color: "#1e3a5f",
      "font-size": "14px",
      "font-weight": "bold",
      opacity: 1,
    },
  },
  {
    selector: "edge",
    style: {
      width: "data(edgeWidth)",
      "line-color": "#ccc",
      "curve-style": "bezier",
      opacity: "data(edgeOpacity)",
      "target-arrow-shape": "none",
      "overlay-padding": 4,
      "transition-property": "line-color, width, opacity",
      "transition-duration": "0.25s",
    },
  },
  {
    selector: "edge[coreEdge]",
    style: {
      "line-color": "#999",
    },
  },
  {
    selector: "edge.new-edge",
    style: {
      "line-color": "#22c55e",
      width: 2.5,
      opacity: 0.9,
      "line-style": "solid",
    },
  },
  {
    selector: "edge:selected",
    style: {
      "line-color": "#2563eb",
      width: 3,
      opacity: 1,
    },
  },
  {
    selector: ".dimmed",
    style: {
      opacity: 0.08,
    },
  },
  {
    selector: ".highlighted",
    style: {
      opacity: 1,
    },
  },
];

// ── Helper: Title Case ──────────────────────────────────────────────

function titleCase(s) {
  if (!s) return "";
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Mobile breakpoint ───────────────────────────────────────────────

function useIsMobile(breakpoint = 900) {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.innerWidth < breakpoint
  );
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const handler = (e) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    setIsMobile(mq.matches);
    return () => mq.removeEventListener("change", handler);
  }, [breakpoint]);
  return isMobile;
}

// ── Main BookViewer ─────────────────────────────────────────────────

export default function BookViewer() {
  const { bookId } = useParams();
  const navigate = useNavigate();
  const BASE = `${import.meta.env.BASE_URL}books/${bookId}`.replace(
    /\/\//g,
    "/"
  );

  // Book metadata
  const [bookMeta, setBookMeta] = useState(null);

  // Data state
  const [mode, setMode] = useState("loading");
  const [chapters, setChapters] = useState([]);
  const [characters, setCharacters] = useState({});
  const [chapterNum, setChapterNum] = useState(1);
  const [snapshot, setSnapshot] = useState(null);
  const [delta, setDelta] = useState(null);
  const [error, setError] = useState("");

  // UI state
  const [selected, setSelected] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [focusMode, setFocusMode] = useState(false);
  const [focusNodeId, setFocusNodeId] = useState(null);
  const [showUnnamed, setShowUnnamed] = useState(false);
  const [showMinor, setShowMinor] = useState(true);
  const [graphReady, setGraphReady] = useState(false);
  const [layouting, setLayouting] = useState(false);
  const [showGraphDetails, setShowGraphDetails] = useState(false);
  const [showEvidenceQuotes, setShowEvidenceQuotes] = useState(false);
  const [mobileView, setMobileView] = useState("summary"); // default to summary

  const cyRef = useRef(null);
  const isMobile = useIsMobile(900);

  // ── Navigate back to catalog ──
  const goToLibrary = useCallback(() => {
    navigate("/books");
  }, [navigate]);

  // ── Go to Chapter 1 ──
  const goToChapter1 = useCallback(() => {
    setChapterNum(1);
    setSelected(null);
    setFocusMode(false);
    setFocusNodeId(null);
  }, []);

  // ── Fetch book.json + reset state on bookId change ──
  useEffect(() => {
    setMode("loading");
    setChapters([]);
    setCharacters({});
    setChapterNum(1);
    setSnapshot(null);
    setDelta(null);
    setError("");
    setSelected(null);
    setSearchQuery("");
    setFocusMode(false);
    setFocusNodeId(null);
    setBookMeta(null);
    setGraphReady(false);

    fetch(`${BASE}/book.json${CB}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((meta) => setBookMeta(meta))
      .catch(() => setBookMeta(null));
  }, [bookId, BASE]);

  // ── On mount / bookId change: load chapter index ──
  useEffect(() => {
    if (mode !== "loading") return;

    (async () => {
      try {
        const chapResp = await fetch(`${BASE}/chapters/index.json${CB}`);
        if (!chapResp.ok) throw new Error("No chapters");
        const chapIdx = await chapResp.json();
        if (!Array.isArray(chapIdx))
          throw new Error("chapters/index.json is not an array");

        let charIdx = {};
        try {
          const charResp = await fetch(`${BASE}/characters/index.json${CB}`);
          if (charResp.ok) charIdx = await charResp.json();
        } catch (_) {}

        setChapters(chapIdx);
        setCharacters(charIdx);
        setChapterNum(1);
        setMode("chapters");
      } catch (_chapErr) {
        try {
          const [graphResp, dataResp] = await Promise.all([
            fetch(`${BASE}/graph.json`),
            fetch(`${BASE}/data.json`),
          ]);
          if (!graphResp.ok) throw new Error("No graph.json either");
          const graph = await graphResp.json();
          const data = dataResp.ok ? await dataResp.json() : {};

          const graphNodes = graph.nodes || [];
          const idToName = {};
          graphNodes.forEach((n) => {
            idToName[n.id] = n.name || String(n.id);
          });

          const nodes = graphNodes.map((n) => ({
            id:
              n.name
                ?.toLowerCase()
                .replace(/[^\w\s-]/g, "")
                .replace(/\s+/g, "-") || String(n.id),
            name: titleCase(n.name || String(n.id)),
            description: "",
            aliases: [],
          }));

          const nodeIdMap = {};
          graphNodes.forEach((n, i) => {
            nodeIdMap[n.id] = nodes[i].id;
          });

          const links = (graph.links || graph.edges || []).map((e) => ({
            source:
              nodeIdMap[
                typeof e.source === "object" ? e.source.id : e.source
              ] || String(e.source),
            target:
              nodeIdMap[
                typeof e.target === "object" ? e.target.id : e.target
              ] || String(e.target),
            label: e.label || e.type || "",
            description: e.description || "",
            weight: e.value || e.weight || 1,
          }));

          setSnapshot({ nodes, links });
          setDelta({
            new_nodes: nodes.map((n) => n.id),
            new_edges: [],
            summary: "",
          });
          setChapters([
            { chapter: 0, title: "Whole Book", snapshot: null, delta: null },
          ]);
          setChapterNum(0);

          let charIdx = {};
          const gChars = graph.characters || [];
          if (Array.isArray(gChars)) {
            gChars.forEach((gc) => {
              const cid =
                gc.name
                  ?.toLowerCase()
                  .replace(/[^\w\s-]/g, "")
                  .replace(/\s+/g, "-") || String(gc.id);
              charIdx[cid] = {
                name: titleCase(gc.name || String(gc.id)),
                description: gc.desc || gc.description || "",
                aliases: [],
              };
            });
          }
          setCharacters(charIdx);
          setMode("whole-book");
        } catch (fallbackErr) {
          setError(`Could not load data: ${fallbackErr.message}`);
          setMode("error");
        }
      }
    })();
  }, [mode, BASE]);

  // ── Load chapter data when chapter changes ──
  useEffect(() => {
    if (mode !== "chapters" || !chapters.length) return;
    const entry = chapters.find((c) => c.chapter === chapterNum);
    if (!entry) return;

    setGraphReady(false);

    (async () => {
      try {
        const [snap, del] = await Promise.all([
          fetch(`${BASE}/chapters/${entry.snapshot}${CB}`).then((r) =>
            r.json()
          ),
          fetch(`${BASE}/chapters/${entry.delta}${CB}`).then((r) =>
            r.json()
          ),
        ]);
        setSnapshot(snap);
        setDelta(del);
        setSelected(null);
        setFocusNodeId(null);
      } catch (e) {
        setError(`Failed to load chapter ${chapterNum}: ${String(e)}`);
      }
    })();
  }, [mode, chapters, chapterNum, BASE]);

  // ── Compute stats ──
  const stats = useMemo(() => {
    if (!snapshot) return { total: 0, core: 0, unnamed: 0, links: 0 };
    const nodes = snapshot.nodes ?? [];
    const core = nodes.filter((n) => n.is_core).length;
    const unnamed = nodes.filter((n) => n.is_unnamed).length;
    return {
      total: nodes.length,
      core,
      unnamed,
      links: (snapshot.links ?? []).length,
    };
  }, [snapshot]);

  // ── Node lookup ──
  const nodeInfo = useMemo(() => {
    if (!snapshot) return {};
    const map = {};
    for (const n of snapshot.nodes ?? []) {
      map[n.id] = n;
    }
    return map;
  }, [snapshot]);

  // ── Build Cytoscape elements ──
  const elements = useMemo(() => {
    if (!snapshot) return [];
    const newNodeSet = new Set(delta?.new_nodes ?? []);
    const newEdgeSet = new Set(
      (delta?.new_edges ?? []).map((e) => `${e.source}|${e.target}`)
    );

    let filteredNodes = (snapshot.nodes ?? []).filter((n) => {
      if (!showUnnamed && n.is_unnamed) return false;
      if (focusMode && !n.is_core) return false;
      if (!focusMode && !showMinor && !n.is_core && !n.is_unnamed)
        return false;
      return true;
    });

    if (focusMode && focusNodeId) {
      const keepIds = new Set([focusNodeId]);
      for (const link of snapshot.links ?? []) {
        if (link.source === focusNodeId) keepIds.add(link.target);
        if (link.target === focusNodeId) keepIds.add(link.source);
      }
      filteredNodes = filteredNodes.filter((n) => keepIds.has(n.id));
    }

    const visibleNodeIds = new Set(filteredNodes.map((n) => n.id));

    let nodes = filteredNodes.map((n) => {
      const imp = n.importance ?? 0.3;
      const sz = Math.round(16 + imp * 32);
      const isCore = n.is_core ?? false;
      return {
        data: {
          id: n.id,
          label: n.name,
          description: n.description || "",
          size: sz,
          nodeOpacity: isCore ? 1.0 : 0.3 + imp * 0.7,
          isCore: isCore ? 1 : 0,
        },
        classes: newNodeSet.has(n.id) ? "new-node" : "",
      };
    });

    let edges = (snapshot.links ?? [])
      .filter(
        (e) => visibleNodeIds.has(e.source) && visibleNodeIds.has(e.target)
      )
      .map((e, i) => {
        const srcCore = nodeInfo[e.source]?.is_core;
        const tgtCore = nodeInfo[e.target]?.is_core;
        const bothCore = srcCore && tgtCore;
        return {
          data: {
            id: `e-${i}`,
            source: e.source,
            target: e.target,
            label: e.label || "",
            description: e.description || "",
            weight: e.weight || 1,
            edgeWidth: bothCore ? 1.8 : 1.0,
            edgeOpacity: bothCore ? 0.7 : 0.3,
            coreEdge: bothCore ? 1 : 0,
          },
          classes: newEdgeSet.has(`${e.source}|${e.target}`)
            ? "new-edge"
            : "",
        };
      });

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchIds = new Set(
        nodes
          .filter((n) => n.data.label.toLowerCase().includes(q))
          .map((n) => n.data.id)
      );
      for (const [cid, cinfo] of Object.entries(characters)) {
        if (
          cinfo.aliases?.some((a) => a.toLowerCase().includes(q)) ||
          cinfo.name?.toLowerCase().includes(q)
        ) {
          if (visibleNodeIds.has(cid)) matchIds.add(cid);
        }
      }
      if (matchIds.size > 0) {
        edges = edges.filter(
          (e) =>
            matchIds.has(e.data.source) || matchIds.has(e.data.target)
        );
        const edgeNodeIds = new Set();
        edges.forEach((e) => {
          edgeNodeIds.add(e.data.source);
          edgeNodeIds.add(e.data.target);
        });
        const keepIds = new Set([...matchIds, ...edgeNodeIds]);
        nodes = nodes.filter((n) => keepIds.has(n.data.id));
      }
    }

    return [...nodes, ...edges];
  }, [
    snapshot,
    delta,
    searchQuery,
    characters,
    showUnnamed,
    showMinor,
    focusMode,
    focusNodeId,
    nodeInfo,
  ]);

  // ── Cytoscape events ──
  const handleCyMount = useCallback(
    (cy) => {
      cyRef.current = cy;

      cy.on("tap", "node", (e) => {
        const nodeData = e.target.data();
        const charInfo = characters[nodeData.id] || {};

        if (focusMode) setFocusNodeId(nodeData.id);

        const neighbors = e.target.connectedEdges().map((edge) => {
          const otherId =
            edge.data("source") === nodeData.id
              ? edge.data("target")
              : edge.data("source");
          const otherNode = cy.getElementById(otherId);
          return {
            id: otherId,
            name: otherNode.data("label") || otherId,
            relation: edge.data("label") || "",
            description: edge.data("description") || "",
            isNew: edge.hasClass("new-edge"),
          };
        });

        const seen = new Set();
        const uniqueNeighbors = [];
        for (const n of neighbors) {
          if (!seen.has(n.id)) {
            seen.add(n.id);
            uniqueNeighbors.push(n);
          }
        }

        setSelected({
          type: "node",
          id: nodeData.id,
          name: charInfo.name || nodeData.label,
          description:
            charInfo.description ||
            nodeData.description ||
            "No description available.",
          aliases: charInfo.aliases || [],
          neighbors: uniqueNeighbors,
        });

        if (isMobile) setMobileView("detail");
      });

      cy.on("tap", "edge", (e) => {
        const edgeData = e.target.data();
        const sourceChar = characters[edgeData.source] || {};
        const targetChar = characters[edgeData.target] || {};

        setSelected({
          type: "edge",
          sourceName: sourceChar.name || edgeData.source,
          targetName: targetChar.name || edgeData.target,
          sourceId: edgeData.source,
          targetId: edgeData.target,
          label: edgeData.label,
          description:
            edgeData.description || "No relationship detail available.",
          isNew: e.target.hasClass("new-edge"),
        });

        if (isMobile) setMobileView("detail");
      });

      cy.on("tap", (e) => {
        if (e.target === cy) {
          setSelected(null);
          if (focusMode) setFocusNodeId(null);
        }
      });
    },
    [characters, focusMode, isMobile]
  );

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.removeAllListeners();
    handleCyMount(cy);
  }, [handleCyMount]);

  // ── Layout ──
  useEffect(() => {
    if (elements.length === 0) return;
    setGraphReady(false);
    setLayouting(true);

    const timer = setTimeout(() => {
      const cy = cyRef.current;
      if (!cy) return;
      try {
        cy.stop();
      } catch (_) {}

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          cy.resize();
          const lay = cy.layout({
            name: "cose",
            animate: false,
            randomize: true,
            fit: true,
            padding: 80,
            nodeRepulsion: () => 2500000,
            idealEdgeLength: () => 180,
            edgeElasticity: () => 80,
            gravity: 0.08,
            numIter: 2000,
            componentSpacing: 120,
          });

          lay.one("layoutstop", () => {
            cy.resize();
            cy.fit(undefined, 80);
            cy.center();
            setLayouting(false);
            setGraphReady(true);
          });

          lay.run();
        });
      });
    }, 100);
    return () => clearTimeout(timer);
  }, [chapterNum, elements.length]);

  const handleRelayout = useCallback(() => {
    const cy = cyRef.current;
    if (!cy) return;
    setGraphReady(false);
    setLayouting(true);
    try {
      cy.stop();
    } catch (_) {}
    const lay = cy.layout({
      name: "cose",
      animate: false,
      randomize: true,
      fit: true,
      padding: 80,
      nodeRepulsion: () => 2500000,
      idealEdgeLength: () => 180,
      edgeElasticity: () => 80,
      gravity: 0.08,
      numIter: 2000,
      componentSpacing: 120,
    });
    lay.one("layoutstop", () => {
      requestAnimationFrame(() => {
        try {
          cy.fit(undefined, 80);
        } catch (_) {}
        setLayouting(false);
        setGraphReady(true);
      });
    });
    lay.run();
  }, []);

  const handleFit = useCallback(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.fit(undefined, 80);
  }, []);

  const resetView = useCallback(() => {
    setSelected(null);
    setSearchQuery("");
    setFocusMode(false);
    setFocusNodeId(null);
    const cy = cyRef.current;
    if (!cy) return;
    cy.elements().removeClass("dimmed highlighted");
    cy.fit(undefined, 120);
  }, []);

  const jumpToNode = useCallback(
    (id) => {
      const cy = cyRef.current;
      if (!cy) return;
      const node = cy.getElementById(id);
      if (!node.length) return;
      cy.animate({ fit: { eles: node, padding: 140 }, duration: 400 });
      node.select();
      if (isMobile) setMobileView("graph");
    },
    [isMobile]
  );

  // ── Navigation ──
  const goPrev = () => setChapterNum((n) => Math.max(1, n - 1));
  const goNext = () =>
    setChapterNum((n) => Math.min(chapters.length, n + 1));

  const currentChapter = chapters.find((c) => c.chapter === chapterNum);

  // ── Summary data ──
  const storySummary = delta?.story_summary || null;
  const needsReview = delta?.needs_review || false;
  const evidenceQuotes = delta?.evidence_quotes ?? [];

  const graphSummary = useMemo(() => {
    if (delta?.summary_short) return delta.summary_short;
    if (delta?.summary) return delta.summary;
    if (currentChapter?.summary) return currentChapter.summary;
    return "";
  }, [delta, currentChapter]);

  const highlights = useMemo(() => delta?.highlights ?? [], [delta]);
  const keyCharacters = useMemo(() => delta?.key_characters ?? [], [delta]);

  const visibleNodes = useMemo(
    () => elements.filter((el) => el.data && !el.data.source).length,
    [elements]
  );

  const bookTitle = bookMeta?.title ?? titleCase(bookId.replace(/-/g, " "));
  const bookAuthor = bookMeta?.author ?? "";

  // ── Render ──

  if (mode === "loading") {
    return (
      <div className="loading-screen">
        <div className="loading-content">
          <h1 className="loading-title">{bookTitle}</h1>
          <p className="loading-subtitle">
            {bookAuthor ? `by ${bookAuthor} — ` : ""}Loading...
          </p>
          <div className="loading-spinner" />
        </div>
      </div>
    );
  }

  if (mode === "error") {
    return (
      <div className="loading-screen">
        <div className="loading-content">
          <h1 className="loading-title">Error</h1>
          <p className="loading-subtitle">{error}</p>
          <button className="library-back-btn" onClick={goToLibrary}>
            &larr; Back to Library
          </button>
        </div>
      </div>
    );
  }

  // ── Left panel ──
  const leftPanelContent = (
    <>
      <div className="section-title">Chapter Stats</div>
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value">{stats.core}</div>
          <div className="stat-label">Core Chars</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.links}</div>
          <div className="stat-label">Relations</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">+{delta?.new_nodes?.length ?? 0}</div>
          <div className="stat-label">New Chars</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">+{delta?.new_edges?.length ?? 0}</div>
          <div className="stat-label">New Links</div>
        </div>
      </div>
      <div className="stats-footnote">
        {visibleNodes} shown of {stats.total} total
        {focusMode && focusNodeId && " (focused)"}
      </div>

      <div className="chapter-summary-section">
        <div className="section-title">Chapter Summary</div>
        {storySummary ? (
          <p className="story-summary-text">{storySummary}</p>
        ) : (
          <p className="chapter-summary-text">
            {graphSummary || "Summary not generated yet."}
          </p>
        )}
        {needsReview && (
          <div className="review-warning">Summary may need review</div>
        )}
        {evidenceQuotes.length > 0 && (
          <div className="graph-details-toggle">
            <button
              className="toggle-btn"
              onClick={() => setShowEvidenceQuotes((s) => !s)}
            >
              {showEvidenceQuotes ? "\u25BE Evidence Quotes" : "\u25B8 Evidence Quotes"}
            </button>
            {showEvidenceQuotes && (
              <div className="evidence-quotes-body">
                {evidenceQuotes.map((q, i) => (
                  <blockquote key={i} className="evidence-quote">
                    &ldquo;{q}&rdquo;
                  </blockquote>
                ))}
              </div>
            )}
          </div>
        )}
        {(highlights.length > 0 || graphSummary) && (
          <div className="graph-details-toggle">
            <button
              className="toggle-btn"
              onClick={() => setShowGraphDetails((s) => !s)}
            >
              {showGraphDetails ? "\u25BE Graph Details" : "\u25B8 Graph Details"}
            </button>
            {showGraphDetails && (
              <div className="graph-details-body">
                {storySummary && graphSummary && (
                  <p className="graph-summary-text">{graphSummary}</p>
                )}
                {highlights.length > 0 && (
                  <ul className="chapter-highlights">
                    {highlights.map((h, i) => (
                      <li key={i} className="highlight-bullet">{h}</li>
                    ))}
                  </ul>
                )}
                {keyCharacters.length > 0 && (
                  <div className="key-characters-row">
                    {keyCharacters.map((name, i) => (
                      <span key={i} className="key-char-badge">{name}</span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {(delta?.new_nodes?.length > 0 || delta?.new_edges?.length > 0) && (
        <div className="new-in-chapter-section">
          <div className="section-title">New In This Chapter</div>
          {delta.new_nodes.length > 0 && (
            <div className="new-list">
              <div className="new-list-label">Characters</div>
              {delta.new_nodes.slice(0, 8).map((nid) => (
                <button
                  key={nid}
                  className="new-item new-item-node"
                  onClick={() => jumpToNode(nid)}
                  title={`Jump to ${characters[nid]?.name || titleCase(nid.replace(/-/g, " "))}`}
                >
                  <span className="dot new" />
                  <span className="new-item-name">
                    {characters[nid]?.name || titleCase(nid.replace(/-/g, " "))}
                  </span>
                </button>
              ))}
              {delta.new_nodes.length > 8 && (
                <div className="new-more">and {delta.new_nodes.length - 8} more&hellip;</div>
              )}
            </div>
          )}
          {delta.new_edges.length > 0 && (
            <div className="new-list">
              <div className="new-list-label">Relationships</div>
              {delta.new_edges.slice(0, 8).map((e, i) => {
                const srcName = characters[e.source]?.name || titleCase(e.source.replace(/-/g, " "));
                const tgtName = characters[e.target]?.name || titleCase(e.target.replace(/-/g, " "));
                const srcShort = srcName.split(" ")[0];
                const tgtShort = tgtName.split(" ")[0];
                return (
                  <button
                    key={`${e.source}-${e.target}-${i}`}
                    className="new-item new-item-edge"
                    onClick={() => {
                      const cy = cyRef.current;
                      if (!cy) return;
                      const s = cy.getElementById(e.source);
                      const t = cy.getElementById(e.target);
                      const eles = s.union(t);
                      if (eles.length > 0) {
                        cy.animate({ fit: { eles, padding: 120 }, duration: 400 });
                        s.select();
                        t.select();
                      }
                    }}
                    title={`${srcName} \u2194 ${tgtName}${e.label ? ` (${e.label})` : ""}`}
                  >
                    <span className="dot new" />
                    <span className="new-item-name">
                      {srcShort} &mdash; {tgtShort}
                      {e.label && <span className="new-item-label"> ({e.label})</span>}
                    </span>
                  </button>
                );
              })}
              {delta.new_edges.length > 8 && (
                <div className="new-more">and {delta.new_edges.length - 8} more&hellip;</div>
              )}
            </div>
          )}
        </div>
      )}

      {mode === "chapters" && (
        <div className="chapter-progress-section">
          <div className="section-title">Progress</div>
          <div className="progress-bar-container">
            <div
              className="progress-bar-fill"
              style={{ width: `${(chapterNum / chapters.length) * 100}%` }}
            />
          </div>
          <div className="progress-label">
            Chapter {chapterNum} of {chapters.length}
          </div>
        </div>
      )}

      <div className="options-section">
        <div className="section-title">View Options</div>
        <label className="option-row">
          <input
            type="checkbox"
            checked={focusMode}
            onChange={(e) => {
              setFocusMode(e.target.checked);
              if (!e.target.checked) setFocusNodeId(null);
            }}
          />
          <span>Core cast only<span className="option-hint"> (hides minor characters)</span></span>
        </label>
        <label className="option-row">
          <input type="checkbox" checked={showMinor} onChange={(e) => setShowMinor(e.target.checked)} disabled={focusMode} />
          <span>Show minor characters</span>
        </label>
        <label className="option-row">
          <input type="checkbox" checked={showUnnamed} onChange={(e) => setShowUnnamed(e.target.checked)} />
          <span>Show unnamed / roles</span>
        </label>
      </div>
    </>
  );

  // ── Right panel ──
  const rightPanelContent = (
    <>
      {!selected && (
        <div className="detail-empty">
          <div className="detail-empty-icon">&#9998;</div>
          <p>Click any character or relationship in the graph to see details.</p>
          {focusMode && <p className="focus-hint">Focus mode active. Click a node to isolate its neighborhood.</p>}
        </div>
      )}
      {selected?.type === "node" && (
        <div className="detail-panel">
          <h2 className="detail-name">{selected.name}</h2>
          {selected.aliases.length > 0 && (
            <div className="aliases">
              <span className="aliases-label">Also known as:</span> {selected.aliases.join(", ")}
            </div>
          )}
          <p className="detail-description">{selected.description}</p>
          {focusMode && (
            <button className="focus-node-btn" onClick={() => setFocusNodeId(selected.id)}>
              Focus on {selected.name.split(" ")[0]}
            </button>
          )}
          <div className="section-title">Connections ({selected.neighbors.length})</div>
          <div className="connection-list">
            {selected.neighbors.map((n, i) => (
              <div key={i} className="connection-item" onClick={() => jumpToNode(n.id)} title={n.description || `${n.name} - ${n.relation}`}>
                <span className={`dot ${n.isNew ? "new" : ""}`} />
                <span className="conn-name">{n.name}</span>
                <span className="conn-rel">{n.relation}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {selected?.type === "edge" && (
        <div className="detail-panel">
          <h2 className="detail-name">{selected.sourceName}</h2>
          <div className="relationship-arrow">&#8597; {selected.label}</div>
          <h2 className="detail-name">{selected.targetName}</h2>
          <p className="detail-description">{selected.description}</p>
          {selected.isNew && <span className="badge new">New this chapter</span>}
          <div className="edge-actions">
            <button className="edge-jump-btn" onClick={() => jumpToNode(selected.sourceId)}>Go to {selected.sourceName.split(" ")[0]}</button>
            <button className="edge-jump-btn" onClick={() => jumpToNode(selected.targetId)}>Go to {selected.targetName.split(" ")[0]}</button>
          </div>
        </div>
      )}
    </>
  );

  // ── Graph ──
  const graphContent = (
    <>
      {elements.length > 0 ? (
        <div className={`graph-wrap ${graphReady ? "ready" : "booting"}`}>
          {layouting && <div className="graph-overlay">Laying out&hellip;</div>}
          <CytoscapeComponent
            elements={elements}
            stylesheet={cyStylesheet}
            layout={{ name: "preset" }}
            cy={handleCyMount}
            style={{ width: "100%", height: "100%", position: "relative", zIndex: 1 }}
            wheelSensitivity={0.3}
          />
        </div>
      ) : (
        <div className="graph-empty"><p>No data to display for this chapter.</p></div>
      )}
    </>
  );

  return (
    <div className={`app-shell ${isMobile ? "mobile" : ""}`}>
      <header className="topbar">
        <button className="library-back-btn" onClick={goToLibrary} aria-label="Back to Library">
          &larr; Library
        </button>
        <span className="brand">{bookTitle}</span>
        {bookAuthor && <span className="brand-author">{bookAuthor}</span>}

        <div className="topbar-center">
          {mode === "chapters" && (
            <div className="nav-controls">
              <button className="nav-btn" onClick={goPrev} disabled={chapterNum <= 1} title="Previous chapter" aria-label="Previous chapter">
                <span className="nav-btn-full">&larr; Prev</span>
                <span className="nav-btn-compact">&larr;</span>
              </button>
              <select className="chapter-select" value={chapterNum} onChange={(e) => setChapterNum(Number(e.target.value))} aria-label="Select chapter">
                {chapters.map((c) => (
                  <option key={c.chapter} value={c.chapter}>
                    {String(c.chapter).padStart(3, "0")} &mdash; {c.title}
                  </option>
                ))}
              </select>
              <button className="nav-btn" onClick={goNext} disabled={chapterNum >= chapters.length} title="Next chapter" aria-label="Next chapter">
                <span className="nav-btn-full">Next &rarr;</span>
                <span className="nav-btn-compact">&rarr;</span>
              </button>
            </div>
          )}
          {mode === "whole-book" && (
            <span className="mode-label">Whole Book View (chapter data not yet available)</span>
          )}
        </div>

        <div className="topbar-right">
          <button className="layout-btn" onClick={resetView} title="Reset view" aria-label="Reset view">Reset</button>
          <button className="layout-btn" onClick={handleRelayout} title="Re-run graph layout" aria-label="Re-run layout">Re-layout</button>
          <button className="layout-btn" onClick={handleFit} title="Fit graph to view" aria-label="Fit">Fit</button>
          <div className="search-box">
            <input type="text" placeholder="Search characters..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="search-input" aria-label="Search characters" />
            {searchQuery && (
              <button className="search-clear" onClick={() => setSearchQuery("")} aria-label="Clear search">&times;</button>
            )}
          </div>
          <button
            className={`focus-btn ${focusMode ? "active" : ""}`}
            onClick={() => { const next = !focusMode; setFocusMode(next); if (!next) setFocusNodeId(null); }}
            title={focusMode ? "Exit focus mode" : "Focus: core cast only"}
            aria-label={focusMode ? "Exit focus mode" : "Enter focus mode"}
          >
            {focusMode ? "Exit Focus" : "Focus"}
          </button>
        </div>
      </header>

      {isMobile && (
        <nav className="mobile-tabs" role="tablist">
          <button className={`mobile-tab ${mobileView === "graph" ? "active" : ""}`} onClick={() => setMobileView("graph")} role="tab" aria-selected={mobileView === "graph"}>Graph</button>
          <button className={`mobile-tab ${mobileView === "summary" ? "active" : ""}`} onClick={() => setMobileView("summary")} role="tab" aria-selected={mobileView === "summary"}>Summary</button>
          <button className={`mobile-tab ${mobileView === "detail" ? "active" : ""}`} onClick={() => setMobileView("detail")} role="tab" aria-selected={mobileView === "detail"}>Character</button>
        </nav>
      )}

      {!isMobile && (
        <>
          <aside className="sidebar-left">{leftPanelContent}</aside>
          <main className="graph-area">{graphContent}</main>
          <aside className="sidebar-right">{rightPanelContent}</aside>
        </>
      )}

      {isMobile && (
        <>
          {mobileView === "graph" && <main className="graph-area mobile-panel">{graphContent}</main>}
          {mobileView === "summary" && <aside className="sidebar-left mobile-panel">{leftPanelContent}</aside>}
          {mobileView === "detail" && <aside className="sidebar-right mobile-panel">{rightPanelContent}</aside>}
        </>
      )}
    </div>
  );
}
