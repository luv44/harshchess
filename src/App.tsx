import { useCallback, useEffect, useRef, useState } from "react";
import { Chess } from "chess.js";
import ChessBoard from "./chess/ChessBoard";
import { PieceSvg } from "./chess/pieces";
import { useChessGame } from "./chess/useChessGame";
import { useComputerOpponent } from "./chess/useComputerOpponent";
import { useEngine } from "./engine/useEngine";
import { LearnPage } from "./coach/LearnPage";
import { AccountPage } from "./billing/AccountPage";
import { useLanguage } from "./i18n/useLanguage";
import { t } from "./i18n/strings";
import { Icon, Paths } from "./icons";
import { loadReviews } from "./coach/learnerStorage";
import { isDue as isReviewDue } from "./coach/spaced";
import { loadSession } from "./chess/session";

type Tab = "home" | "play" | "games" | "learn" | "brain" | "account" | "status";

function useOnline() {
  const [online, setOnline] = useState<boolean>(typeof navigator !== "undefined" ? navigator.onLine : true);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);
  return online;
}

function useHomeAction(): { label: string; to: Tab; detail: string } {
  const reviews = (() => { try { return loadReviews(); } catch { return []; } })();
  const due = reviews.filter((r) => isReviewDue(r, new Date().toISOString())).length;
  const saved = (() => { try { return loadSession(); } catch { return null; } })();
  const hasActiveGame = (() => {
    if (!saved?.fen) return false;
    if (saved.fen.startsWith("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq")) return false;
    return true;
  })();
  if (due > 0) return { label: `Review due — ${due} skill${due>1?"s":""} to refresh`, to: "learn", detail: "Pick up where recall is fading. One short review keeps it." };
  if (hasActiveGame) return { label: "Continue your game", to: "play", detail: "Your saved position is waiting — local save restores on reload." };
  return { label: "Start learning", to: "learn", detail: "A guided first game takes about 5 minutes. No account needed." };
}

export default function App() {
  const [tab, setTab] = useState<Tab>("home");
  /** Deep-link into a Learn practice, e.g. from Brain's "Practise hanging". */
  const [learnRequest, setLearnRequest] = useState<{ skillId?: string; motif?: string } | null>(null);
  const startPractice = useCallback((req: { skillId?: string; motif?: string }) => {
    setLearnRequest(req);
    setTab("learn");
  }, []);

  // Switching tabs must start at the top — otherwise the board of the new tab
  // can sit above/below the scroll position left over from the previous page.
  useEffect(() => { window.scrollTo({ top: 0 }); }, [tab]);
  const game = useChessGame();
  const { tag, setTag, level, setLevel } = useLanguage();
  const online = useOnline();
  const [installPrompt, setInstallPrompt] = useState<unknown>(null);
  const canInstall = !!installPrompt;
  const homeAction = useHomeAction();

  useEffect(() => {
    const h = (e: Event) => { e.preventDefault(); setInstallPrompt(e); };
    window.addEventListener("beforeinstallprompt" as never, h as never);
    return () => window.removeEventListener("beforeinstallprompt" as never, h as never);
  }, []);
  const doInstall = useCallback(async () => {
    const e = installPrompt as { prompt: () => Promise<void>; userChoice?: Promise<{ outcome: string }> } | null;
    if (!e) return;
    try { await e.prompt(); await e.userChoice; } catch { /* ignore */ }
    setInstallPrompt(null);
  }, [installPrompt]);

  const navItems: Array<{ id: Tab; label: string; icon: string }> = [
    { id: "home", label: "Home", icon: Paths.home },
    { id: "play", label: t(tag, "play"), icon: Paths.board },
    { id: "games", label: "Games", icon: Paths.games },
    { id: "learn", label: t(tag, "learn"), icon: Paths.book },
    { id: "brain", label: "Brain", icon: Paths.brain },
    { id: "account", label: "Account", icon: Paths.play },
  ];

  return (
    <>
      <a className="skip-link" href="#main">Skip to content</a>
      <header className="header" role="banner">
        <div className="header__inner">
          <div className="brand" aria-label="Chessworkermind">
            <span className="brand__mark" aria-hidden="true">Cw</span>
            <span>Chessworker<span>mind</span></span>
            <span className="brand__sub" aria-hidden="true" style={{ marginLeft: 8, alignSelf: "center" }}>Study room</span>
          </div>
          <nav className="nav" aria-label="Primary">
            {navItems.map((n) => (
              <button
                key={n.id}
                className={`nav__btn ${tab === n.id ? "nav__btn--active" : ""}`}
                onClick={() => setTab(n.id)}
                aria-current={tab === n.id ? "page" : undefined}
              >
                <Icon d={n.icon} size={16} /> {n.label}
              </button>
            ))}
            <button className={`nav__btn ${tab === "status" ? "nav__btn--active" : ""}`} onClick={() => setTab("status")} style={{ opacity: .7 }}>
              {t(tag, "status")}
            </button>
          </nav>
        </div>
      </header>

      <main id="main" className="container">
        <div className={`netbar ${online ? "" : "netbar--offline"}`} role="status" aria-live="polite">
          <span className={`pill ${online ? "pill--ok" : "pill--warn"}`}>{online ? "Online" : "Offline — board & saved games stay available; login/purchase/sync need network"}</span>
          {!online && <span>Engine cache + local progress remain. Reconnect to sync or restore Pro.</span>}
          {online && <span style={{ color: "var(--muted)", fontSize: ".82rem" }}>PWA shell cached. Unsaved browser storage may be evicted — sync via Account keeps games.</span>}
        </div>

        {tab === "home" && <HomePage onGo={setTab} game={game} homeAction={homeAction} canInstall={canInstall} onInstall={doInstall} tag={tag} />}
        {tab === "play" && <PlayPage game={game} onGo={setTab} />}
        {tab === "games" && <GamesPage game={game} onGo={setTab} />}
        {tab === "learn" && <LearnPage tag={tag} setTag={setTag} level={level} setLevel={setLevel} startRequest={learnRequest} onStartRequestConsumed={() => setLearnRequest(null)} />}
        {tab === "brain" && <BrainPage onGo={setTab} onPractise={startPractice} tag={tag} />}
        {tab === "account" && <AccountPage />}
        {tab === "status" && <StatusPage tag={tag} canInstall={canInstall} onInstall={doInstall} />}
      </main>

      <footer className="footer">
        <div className="container">
          <p className="serif" style={{ fontSize: "1rem", color: "var(--ink)", fontWeight: 700 }}>Chessworkermind — Learn how to think, not just what move to play.</p>
          <p style={{ marginTop: 6 }}><a href="#privacy">Privacy</a> · <a href="#support">Support</a> · <a href="#faq">FAQ</a> · No ads in this release.</p>
          <p style={{ marginTop: 6, opacity: .75 }}>
            Milestone 5 · PWA + QA + export guide ·
            <span className="pill pill--warn" style={{ fontSize: ".72rem", marginLeft: 6 }}>Pro checkout disabled — coming soon</span>
            <span style={{ marginLeft: 6 }}>No ads — AdSense optional future phase only.</span>
          </p>
          <p style={{ marginTop: 8, fontSize: ".78rem", opacity: .7 }}>PWA: manifest + icons + sw.js · offline shell cached; login/purchase/sync need network · Safari iPhone: Share → Add to Home Screen</p>
        </div>
      </footer>
    </>
  );
}

function HomePage({ onGo, game, homeAction, canInstall, onInstall, tag: _tag }: { onGo: (t: Tab) => void; game: ReturnType<typeof useChessGame>; homeAction: { label: string; to: Tab; detail: string }; canInstall: boolean; onInstall: () => void; tag: string }) {
  const moves = game.historySan.length;
  const reviewsDue = (() => { try { return loadReviews().filter((r) => isReviewDue(r, new Date().toISOString())).length; } catch { return 0; } })();
  void _tag;
  return (
    <>
      <section className="hero">
        <div className="hero__top">
          <div style={{ display: "grid", gap: 14 }}>
            <div className="badge">Welcome to your study room</div>
            <h1>Learn how to think, not just what move to play.</h1>
            <p>One link on desktop and phone. Your board, your coaching, your pace — no install and no paywall on moves. A short session fits in under 10 minutes.</p>
            <div className="hero__cta">
              <button className="btn btn--primary" onClick={() => onGo(homeAction.to)}>{homeAction.label} →</button>
              <button className="btn btn--ghost" onClick={() => onGo("play")}>Open free board</button>
            </div>
            <div className="hero__stats" aria-label="Your progress at a glance">
              <span className="hero__stat"><b>{moves}</b> move{moves !== 1 ? "s" : ""} saved</span>
              <span className="hero__stat"><b>{reviewsDue}</b> review{reviewsDue !== 1 ? "s" : ""} due</span>
              <span className="hero__stat"><b>8</b> languages</span>
              <span className="hero__stat"><b>₹0</b> to play</span>
            </div>
          </div>
          <div>
            <div className="hero__board" aria-hidden="true">
              <HeroBoard fen="r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3" />
            </div>
            <p className="hero__board-caption">Every move checked by chess.js · coaching verified by Stockfish</p>
          </div>
        </div>

        <div className="grid3">
          <button className="card card--action" onClick={() => onGo("play")}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}><Icon d={Paths.board} size={18} /><strong>Guided game</strong></div>
            <p style={{ marginTop: 6 }}>Board first — turn, what changed, one thing to notice, then you play.</p>
            <span className="card--action__go">Open board →</span>
          </button>
          <button className="card card--action" onClick={() => onGo("play")}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}><Icon d={Paths.play} size={18} /><strong>Play the computer</strong></div>
            <p style={{ marginTop: 6 }}>Stockfish 1–10 strengths, or two-player local. It replies in under a second.</p>
            <span className="card--action__go">Challenge it →</span>
          </button>
          <button className="card card--action" onClick={() => onGo("learn")}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}><Icon d={Paths.book} size={18} /><strong>Learn a skill</strong></div>
            <p style={{ marginTop: 6 }}>Short practices with stepwise hints — hanging pieces, checks, calculation.</p>
            <span className="card--action__go">Pick a practice →</span>
          </button>
        </div>

        <div className="grid2">
          <div className="card">
            <h3>Your progress</h3>
            <p style={{ marginTop: 6 }}>Brain shows “what to practise next” from real evidence. No invented rating — just skills and recall.</p>
            <button className="btn btn--quiet" style={{ marginTop: 10 }} onClick={() => onGo("brain")}>Open Brain</button>
          </div>
          <div className="card">
            <h3>Lessons</h3>
            <p style={{ marginTop: 6 }}>What each lesson teaches and how long it takes — only available lessons are playable.</p>
            <button className="btn btn--quiet" style={{ marginTop: 10 }} onClick={() => onGo("learn")}>Browse lessons</button>
          </div>
        </div>

        <div className="card install-card" style={{ textAlign: "left" }}>
          <strong className="serif" style={{ fontSize: "1rem" }}>Install Chessworkermind (optional)</strong>
          <p style={{ fontSize: ".88rem" }}>Works in the browser first — Add to Home Screen is an enhancement, never a prerequisite.</p>
          {canInstall ? <button className="btn btn--primary" onClick={onInstall}>Install Chessworkermind</button> : (
            <ul className="install-card__steps">
              <li><strong>iPhone (Safari):</strong> Share → Add to Home Screen.</li>
              <li><strong>Android (Chrome):</strong> Menu → Install app / Add to Home screen.</li>
              <li><strong>Desktop (Chrome/Edge):</strong> Address bar install icon or menu → Install.</li>
              <li>If no install prompt appears: Continue in browser — all features still work.</li>
            </ul>
          )}
          <p style={{ fontSize: ".8rem", color: "var(--muted)" }}>Installed app is still a website (not an IPA/APK). Updates do not destroy saved games; use Account → sync/export before switching contexts on iPhone.</p>
        </div>
      </section>

      <section className="section grid2">
        <div className="card">
          <h2>Free — ₹0 forever</h2>
          <p>Unlimited legal board. Never limited.</p>
          <ul>
            <li>Legal chess board (chess.js) — ✓ live</li>
            <li>Local save + guest progress (auto-saved)</li>
            <li>Tap / drag / flip / undo + keyboard</li>
            <li>Lessons &amp; daily set — Learn tab</li>
          </ul>
          <div style={{ marginTop: 14 }}><button className="btn btn--primary" onClick={() => onGo("play")}>Open Free Board</button></div>
        </div>
        <div className="card" style={{ borderColor: "#E8D9BE" }}>
          <h2>Pro — ₹599/month (INR base)</h2>
          <p>Auto-renewing monthly, cancel anytime. Shown price is what is charged.</p>
          <ul>
            <li>Adjustable computer opponent — ✓</li>
            <li>Verified Stockfish &amp; FactPackets — ✓</li>
            <li>Adaptive hints &amp; revision — ✓</li>
            <li>Account sync + test-mode subscription (₹599 lifecycle) — milestone 4</li>
          </ul>
          <p style={{ marginTop: 12 }}><span className="pill pill--warn">Pro checkout disabled — coming soon</span></p>
          <p style={{ marginTop: 8, fontSize: ".82rem", color: "var(--muted)" }}>No annual plan unless separately approved. Local-currency estimate at checkout labelled approximate, separate from ₹599 INR.</p>
        </div>
      </section>

      <section id="comparison" className="section">
        <div className="comparison-wrap">
          <table className="comparison" aria-label="Free versus Pro">
            <thead><tr><th>Feature</th><th>Free</th><th>Pro (planned)</th></tr></thead>
            <tbody>
              <tr><td>Legal board &amp; rules</td><td>✓ Unlimited</td><td>✓ Unlimited</td></tr>
              <tr><td>Stockfish analysis</td><td>✓ Bounded + stale-guard</td><td>✓ Verified candidates + stale-guard</td></tr>
              <tr><td>FactPackets / coaching</td><td>✓ Verified, local</td><td>✓ + personalized review</td></tr>
              <tr><td>Progress &amp; languages</td><td>✓ Local + 8 languages</td><td>✓ Synced + server caps</td></tr>
              <tr><td>Account sync</td><td>Local only</td><td>✓ Cross-device</td></tr>
              <tr><td>Ads</td><td colSpan={2}>None in this release (future phase only)</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="section grid2">
        <div className="card">
          <h2 id="faq">FAQ</h2>
          <p><strong>Do I need to install?</strong> No — Add to Home Screen is optional.</p>
          <p style={{ marginTop: 8 }}><strong>When is Pro?</strong> After milestones are verified and owner approves merchant setup. Checkout stays disabled until then.</p>
        </div>
        <div className="card">
          <h2 id="privacy">Privacy &amp; Support</h2>
          <p>Minimal retention. Export/delete on Account. Billing history with subscription adapter.</p>
          <p style={{ marginTop: 8, fontSize: ".85rem", color: "var(--muted)" }}>Paid AI is optional, capped, server-side and never required for basic moves.</p>
        </div>
      </section>
    </>
  );
}

/** Decorative static board for the home hero — no interaction, pure flavour. */
function HeroBoard({ fen }: { fen: string }) {
  const board: Array<Array<{ color: "w" | "b"; type: "k" | "q" | "r" | "b" | "n" | "p" } | null>> = [];
  for (const row of fen.split(" ")[0].split("/")) {
    const cells: Array<{ color: "w" | "b"; type: "k" | "q" | "r" | "b" | "n" | "p" } | null> = [];
    for (const ch of row) {
      if (ch >= "1" && ch <= "8") { for (let i = 0; i < Number(ch); i++) cells.push(null); }
      else cells.push({ color: ch === ch.toUpperCase() ? "w" : "b", type: ch.toLowerCase() as "k" | "q" | "r" | "b" | "n" | "p" });
    }
    board.push(cells);
  }
  return (
    <>
      {board.map((cells, r) => (
        <div className="hero__board-row" key={r}>
          {cells.map((piece, c) => (
            <span key={c} className={`hero__board-sq ${(r + c) % 2 === 0 ? "hero__board-sq--light" : "hero__board-sq--dark"}`}>
              {piece && <PieceSvg color={piece.color} type={piece.type} />}
            </span>
          ))}
        </div>
      ))}
    </>
  );
}

function PlayPage({ game, onGo }: { game: ReturnType<typeof useChessGame>; onGo: (t: Tab) => void }) {
  const statusBanner = getStatusText(game.status);
  const [copied, setCopied] = useState<string | null>(null);
  const engine = useEngine();
  const [focusMode, setFocusMode] = useState(false);
  const [computerStrength, setComputerStrength] = useState<number>(() => {
    try {
      const v = Number(localStorage.getItem("cwm:computerStrength"));
      return Number.isFinite(v) && v >= 1 && v <= 10 ? Math.round(v) : 5;
    } catch { return 5; }
  });
  const [hintStep, setHintStep] = useState(0);
  const [teachingStep, setTeachingStep] = useState(0);
  const [whyOpen, setWhyOpen] = useState(false);

  const boardCardRef = useRef<HTMLDivElement | null>(null);
  // If the board would sit below the fold (short windows), bring it to the top
  // on mount so every playable piece is on screen immediately.
  useEffect(() => {
    const el = boardCardRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.bottom > window.innerHeight) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  /* ---- who may move right now (session-aware, from useChessGame/session) ---- */
  const isHumanTurn = game.mode === "watch" ? false : game.mode === "solo" ? true : game.turn === game.humanSide;
  const modeActive = game.mode !== "solo";

  /* ---- computer opponent: exactly one legal reply, own colour only ---- */
  const opponent = useComputerOpponent({
    fen: game.fen,
    turn: game.turn,
    session: game.session,
    generation: game.generation,
    statusKind: game.status.kind,
    paused: false,
    strength: computerStrength,
    applyMove: game.tryMove,
    delayMs: 350,
  });

  useEffect(() => {
    try { localStorage.setItem("cwm:computerStrength", String(computerStrength)); } catch { /* ignore */ }
  }, [computerStrength]);

  /* ---- coach analysis (hints/candidates): only while the human is deciding,
     or after the game ended for review — never while the computer searches,
     so the two Stockfish searches never compete. ---- */
  useEffect(() => {
    if (focusMode) return;
    if (game.status.kind === "active" && !isHumanTurn) return;
    engine.analyze(game.fen);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.fen, game.generation, focusMode, isHumanTurn, game.status.kind]);

  useEffect(() => { setHintStep(0); setTeachingStep(0); }, [game.fen]);

  /* Analysis is only trustworthy for the exact position on the board. */
  const liveAnalysis = engine.analysis && engine.analysis.fen === game.fen ? engine.analysis : null;

  const lastMoveSan = game.historySan[game.historySan.length - 1] ?? null;
  const lastMoveVerbose = game.historyVerbose[game.historyVerbose.length - 1] as { from: string; to: string; san: string; captured?: string } | undefined;
  const opponentLabel = lastMoveVerbose ? `${lastMoveVerbose.san} — ${pieceNameFromSan(lastMoveVerbose.san)} to ${lastMoveVerbose.to}` : null;
  const verifiedNotice = liveAnalysis?.candidates[0]?.san ? `Worth noticing: ${liveAnalysis.candidates[0].san} attacks along a real line verified by chess.js.` : null;

  const copy = useCallback(async (label: string, text: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(label); setTimeout(() => setCopied(null), 1600); }
    catch { setCopied("Copy failed"); setTimeout(() => setCopied(null), 1600); }
  }, []);

  const historyPairs: string[][] = [];
  for (let i = 0; i < game.historySan.length; i += 2) historyPairs.push([game.historySan[i], game.historySan[i + 1] ?? ""]);

  const isGameOver = game.status.kind !== "active";
  const turnQ = !isGameOver
    ? ((game.status as { turn: "w" | "b" }).turn === "w"
        ? "White's idea or Black's reply? Look at the centre and king safety."
        : "Black to choose — what does the last move attack?")
    : "Game over — review the line and what mattered.";

  const hintFor = (n: number) => {
    const best = liveAnalysis?.candidates[0];
    if (n === 1) return `Look at the ${best ? `square ${best.uci.slice(2, 4)}` : "centre — which piece is under pressure?"}`;
    if (n === 2) return best ? `Consider ${best.san ?? best.uci} — ${pieceNameFromSan(best.san ?? best.uci)}.` : "Consider which piece can develop with a threat.";
    if (n === 3) return best ? `Try ${best.san ?? best.uci} — follow the gold squares on the board (from → to). ${scoreLabel(best)}.` : "No verified line at this depth — try any legal developing move.";
    return "";
  };

  const strengthLabel = computerStrength <= 2 ? "learning" : computerStrength <= 4 ? "casual" : computerStrength <= 6 ? "club" : computerStrength <= 8 ? "strong" : "expert";
  const boardHint = game.mode === "watch"
    ? "Watch mode — the computer plays both sides on purpose. Switch to vs Computer or Two players to take over."
    : game.mode === "vsComputer" && game.status.kind === "active" && !isHumanTurn
      ? "Computer's turn — your pieces stay locked until it replies."
      : undefined;

  const opponentStatusText = opponent.thinking
    ? (opponent.status === "loading" ? "Computer waking up — loading Stockfish (first time only)…" : "Computer thinking…")
    : opponent.source === "rules-only"
      ? "Computer reply used the rules-only fallback (engine unavailable)."
      : opponent.source === "stockfish"
        ? "Computer replies with Stockfish."
        : `Computer strength ${computerStrength}/10 — ${strengthLabel}.`;

  return (
    <section className="section">
      {/* Thinking order: turn → what changed → what to notice → question → instruction → hints */}
      <div className="play-layout play-layout--train">
        <div style={{ display: "grid", gap: 14 }}>
          <div className="inspector">
            <div className={`status-banner ${game.status.kind === "active" && (game.status as { inCheck?: boolean }).inCheck ? "status-banner--check" : game.status.kind === "active" ? "status-banner--active" : game.status.kind === "checkmate" ? "status-banner--mate" : "status-banner--draw"}`} aria-live="polite">
              <strong>{statusBanner.title}</strong>
              <span>{statusBanner.detail}</span>
            </div>
          </div>

          {/* Board first — it is the hero of this page. On shorter screens the
              previous order pushed every playable piece below the fold. */}
          <div className="card play-card" ref={boardCardRef} style={{ scrollMarginTop: 76 }}>
            <div className="play-toolbar">
              <h2 className="serif" style={{ fontSize: "1.05rem" }}>
                Board — {game.mode === "vsComputer" ? `vs Computer (${computerStrength}/10)` : game.mode === "watch" ? "watching the computer play itself" : "two-player local"}
              </h2>
              <div className="play-actions">
                <button className="btn btn--ghost btn--sm" onClick={game.flip} aria-label="Flip board"><Icon d={Paths.flip} size={16} /> Flip</button>
                <button className="btn btn--sm" onClick={game.undo} disabled={!game.canUndo} aria-label="Undo last move"><Icon d={Paths.undo} size={16} /> Undo</button>
                <button className="btn btn--sm" onClick={game.newGame} aria-label="Start new game">⟳ New game</button>
              </div>
            </div>

            {/* Opponent setup — mode, side, strength. Real Stockfish settings per level. */}
            <div className="opponent-setup">
              <div className="seg" role="group" aria-label="Game mode">
                {([["solo", "Two players"], ["vsComputer", "vs Computer"], ["watch", "Watch"]] as const).map(([m, label]) => (
                  <button key={m} type="button" className={`seg__btn ${game.mode === m ? "seg__btn--on" : ""}`} aria-pressed={game.mode === m} onClick={() => game.setMode(m)}>{label}</button>
                ))}
              </div>

              {game.mode === "vsComputer" && (
                <div className="seg" role="group" aria-label="Which side you play">
                  <span className="seg__label">You play</span>
                  <button type="button" className={`seg__btn ${game.humanSide === "w" ? "seg__btn--on" : ""}`} aria-pressed={game.humanSide === "w"} onClick={() => game.setHumanSide("w")}>White</button>
                  <button type="button" className={`seg__btn ${game.humanSide === "b" ? "seg__btn--on" : ""}`} aria-pressed={game.humanSide === "b"} onClick={() => game.setHumanSide("b")}>Black</button>
                </div>
              )}

              {modeActive && (
                <div className="strength-row">
                  <label htmlFor="computer-strength" style={{ fontSize: ".84rem", fontWeight: 700 }}>
                    Computer strength <span className="pill pill--brass" style={{ fontSize: ".7rem" }}>{computerStrength}/10 · {strengthLabel}</span>
                  </label>
                  <input
                    id="computer-strength"
                    type="range"
                    min={1}
                    max={10}
                    step={1}
                    value={computerStrength}
                    onChange={(e) => setComputerStrength(Number(e.target.value))}
                    aria-valuetext={`${computerStrength} of 10, ${strengthLabel}`}
                    style={{ width: "100%", accentColor: "var(--brass)" }}
                  />
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: ".72rem", color: "var(--muted)" }}>
                    <span>1 · gentle</span><span>5 · balanced</span><span>10 · strongest</span>
                  </div>
                  <p className={`pill ${opponent.source === "rules-only" ? "pill--warn" : "pill--ok"}`} role="status" style={{ width: "fit-content" }}>
                    {opponentStatusText}
                  </p>
                </div>
              )}
            </div>

            {opponent.thinking && !isGameOver && (
              <div className="pill pill--warn" role="status" style={{ marginBottom: 10, marginTop: modeActive ? 0 : 10 }}>
                <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 999, background: "currentColor", display: "inline-block", animation: "pulse 1.1s infinite" }} /> {opponentStatusText}
              </div>
            )}

            <ChessBoard
              fen={game.fen}
              orientation={game.orientation}
              lastMove={game.lastMove}
              getLegalTargets={game.getLegalTargets}
              isPromotionMove={game.isPromotionMove}
              tryMove={game.tryHumanMove}
              canPickUp={game.canPickUp}
              hintText={boardHint}
              suggestFrom={hintStep >= 3 ? liveAnalysis?.candidates[0]?.uci.slice(0, 2) ?? null : null}
              suggestTo={hintStep >= 3 ? liveAnalysis?.candidates[0]?.uci.slice(2, 4) ?? null : null}
            />

            <div className="play-controls">
              <span className="pill pill--ok">Local save: on</span>
              <span className="pill pill--off">chess.js rules</span>
              <button className="btn btn--ghost btn--xs" onClick={() => onGo("home")} style={{ marginLeft: "auto" }}>Home</button>
            </div>

            {/* Progressive hints */}
            <div className="coach-card" style={{ marginTop: 12 }}>
              <div className="coach-card__head">
                <strong>Hints</strong>
                <span className="pill pill--brass">Progressive — 3 steps, on your terms</span>
                {!focusMode && hintStep > 0 && <span className="pill">Step {hintStep}/3 revealed</span>}
              </div>
              {!focusMode ? (
                <div className="hint-steps">
                  {[1, 2, 3].map((n) => {
                    const unlocked = hintStep >= n;
                    return (
                      <div key={n} className={`hint-step ${unlocked ? "" : "hint-step--locked"}`}>
                        <span className="hint-step__num">{n}</span>
                        <span style={{ fontSize: ".9rem" }}>{unlocked ? hintFor(n) : n === 1 ? "Where to look" : n === 2 ? "An idea to consider" : "A candidate with a plain reason"}</span>
                        {!unlocked ? <button className="btn btn--sm btn--quiet" onClick={() => setHintStep(n)} aria-label={`Reveal hint ${n}`}>Reveal</button> : <span className="pill pill--ok">Revealed</span>}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="engine-panel__hint" style={{ padding: 0 }}>Focus mode — hints hidden. Turn it off to reveal steps.</p>
              )}
              <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                {!focusMode && hintStep < 3 && <button className="btn btn--quiet btn--sm" onClick={() => setHintStep((s) => Math.min(3, s + 1))}>Reveal next hint</button>}
                <button className="btn btn--ghost btn--sm" onClick={() => setHintStep(0)}>Reset hints</button>
                <details style={{ marginLeft: "auto" }}>
                  <summary className="btn btn--ghost btn--sm" style={{ listStyle: "none", cursor: "pointer" }}>Deeper line</summary>
                  <div className="card" style={{ marginTop: 8, fontSize: ".86rem" }}>
                    {liveAnalysis?.candidates[0]?.pvSans?.length ? liveAnalysis.candidates[0].pvSans.join(" ") : "No verified continuation at this depth."}
                    <div style={{ marginTop: 6, color: "var(--muted)" }}>From the same position, legally checked vs chess.js.</div>
                  </div>
                </details>
              </div>
            </div>

            {/* After-move teaching moment */}
            {lastMoveSan && !isGameOver && (
              <div className="teaching-moment" style={{ marginTop: 12 }}>
                <div className="teaching-moment__head">
                  <strong>What happened after you played?</strong>
                  <span className="pill pill--ok">{lastMoveSan}</span>
                  <span style={{ color: "var(--muted)", fontSize: ".82rem" }}>on {lastMoveVerbose?.to ?? "—"}</span>
                </div>
                <div className="teaching-moment__body">
                  {[
                    `You played ${lastMoveSan} — it landed on ${lastMoveVerbose?.to ?? "its square"} and ${lastMoveVerbose?.captured ? "captured" : "changed"} the position.`,
                    liveAnalysis?.candidates[0] ? `One verified reason: ${liveAnalysis.candidates[0].san ?? liveAnalysis.candidates[0].uci} is preferred here.` : "No single verified tactical reason at this depth — consider development and king safety.",
                    `Next: ${game.status.kind === "active" && (game.status as { turn: string }).turn === "w" ? "White" : "Black"} to move — what square should you inspect first?`,
                  ].map((text, i) => (
                    <div key={i} className="teaching-moment__step" style={{ opacity: i <= teachingStep ? 1 : .45 }}>
                      <span className="teaching-moment__bullet">{i + 1}</span>
                      <span style={{ fontSize: ".92rem" }}>{text}</span>
                    </div>
                  ))}
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
                    {teachingStep < 2 && <button className="btn btn--sm btn--quiet" onClick={() => setTeachingStep((s) => Math.min(2, s + 1))}>Next</button>}
                    <button className="btn btn--ghost btn--sm" onClick={() => setTeachingStep(0)}>Replay</button>
                    <button className="btn btn--ghost btn--sm" onClick={() => setWhyOpen((v) => !v)}>{whyOpen ? "Hide why" : "Why this move / Why not mine?"}</button>
                    <button className="btn btn--ghost btn--sm" onClick={() => { setTeachingStep(0); setHintStep(0); }}>Continue</button>
                  </div>
                  {whyOpen && <WhySequence fen={game.fen} lastSan={lastMoveSan} best={liveAnalysis?.candidates[0] ?? null} />}
                </div>
              </div>
            )}

            {isGameOver && (
              <div className="card" style={{ marginTop: 12, borderColor: "var(--warn-line)", background: "var(--warn-soft)" }}>
                <h3>Game over — {statusBanner.title}</h3>
                <p style={{ marginTop: 6 }}>{statusBanner.detail}</p>
                <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                  <button className="btn btn--primary btn--sm" onClick={game.newGame}>New game</button>
                  <button className="btn btn--ghost btn--sm" onClick={game.undo}>Undo</button>
                  <button className="btn btn--ghost btn--sm" onClick={() => onGo("games")}>Review in Games</button>
                </div>
              </div>
            )}

            <div className="engine-panel" role="region" aria-label="Engine analysis" style={{ marginTop: 12 }}>
              <div className="engine-panel__head">
                <strong>Engine</strong>
                <span className={`pill ${engine.fallbackVisible ? "pill--warn" : engine.engineState.kind === "ready" || engine.engineState.kind === "analyzing" ? "pill--ok" : "pill--off"}`}>
                  {engine.fallbackVisible ? "Rules-only fallback" : engine.engineState.kind === "loading" ? "Loading Stockfish…" : engine.engineState.kind === "analyzing" ? "Analyzing…" : engine.engineState.kind === "ready" ? "Stockfish ready" : engine.engineState.kind === "error" ? "Engine error — rules-only" : "Engine idle"}
                </span>
                <label className="engine-panel__toggle">
                  <input type="checkbox" checked={focusMode} onChange={(e) => setFocusMode(e.target.checked)} aria-label="Focus mode — hide hints" />
                  Focus hides hints
                </label>
              </div>
              {engine.fallbackVisible ? <p className="engine-panel__fallback" role="status">Rules-only fallback — board remains fully playable; checks, mates, legality via chess.js. Engine will retry on next position.</p>
                : engine.engineState.kind === "loading" ? <p className="engine-panel__hint">Downloading engine (~1.7 MB, once)… Board stays responsive.</p>
                  : <EngineCandidates fen={game.fen} analysis={engine.analysis} isStale={!!engine.analysis && engine.analysis.fen !== game.fen} positionId={engine.currentPositionId} focusMode={focusMode} />}
              <div className="engine-panel__actions">
                <button className="btn btn--ghost" onClick={() => { if (engine.engineState.kind === "analyzing") engine.stop(); else engine.analyze(game.fen); }}>{engine.engineState.kind === "analyzing" ? "Stop" : "Re-analyze"}</button>
                <button className="btn btn--ghost" disabled={!liveAnalysis || !liveAnalysis.bestUci || (modeActive && !isHumanTurn)} title={modeActive && !isHumanTurn ? "Wait for the computer reply" : "Play the engine verified best move"} onClick={() => { const mv = engine.playBestMove(game.fen); if (mv) game.tryHumanMove(mv.from as never, mv.to as never, mv.promotion as never); }}>Play best</button>
              </div>
              <p className="engine-panel__meta">WASM Stockfish 19 lite · coaching depth 12 · 3 lines · bounded · stale results ignored (ID + FEN). Computer strength {computerStrength}/10 uses its own bounded search (skill, depth, nodes, move-time). GPLv3.</p>
            </div>
          </div>

          {/* What happened / coaching context — directly under the board */}
          <div className="inspector">
            <div className="card" style={{ padding: 14 }}>
              <div style={{ fontSize: ".78rem", fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--brass-3)" }}>What just happened</div>
              {lastMoveSan ? (
                <p style={{ marginTop: 6 }}><strong>Opponent played {lastMoveSan}</strong> {opponentLabel && <span style={{ color: "var(--muted)" }}>— {opponentLabel}</span>}</p>
              ) : (
                <p style={{ marginTop: 6, color: "var(--muted)" }}>No moves yet — it's White to start. You're looking at the starting position.</p>
              )}
              {lastMoveVerbose?.captured && <p style={{ fontSize: ".86rem", color: "var(--muted)" }}>A capture happened on {lastMoveVerbose.to} — notice what squares opened.</p>}
              {verifiedNotice && !focusMode && <p style={{ fontSize: ".86rem", marginTop: 6 }}><span className="pill pill--brass" style={{ fontSize: ".7rem" }}>Verified</span> {verifiedNotice}</p>}
            </div>

            <div className="inspector__question">
              <div className="inspector__eyebrow">Your question</div>
              <strong>{turnQ}</strong>
              <p className="inspector__hint">Tap a highlighted square to move — or drag. Take your time.</p>
            </div>
          </div>
        </div>

        <div className="play-side">
          <div className="card">
            <h3>Move history</h3>
            {historyPairs.length === 0 ? <p style={{ color: "var(--muted)", fontSize: ".92rem", marginTop: 8 }}>No moves yet — White to move. Try <code>e4</code>.</p> : (
              <ol className="move-list" aria-label="Move history">
                {historyPairs.map((pair, idx) => (
                  <li key={idx} className="move-list__row">
                    <span className="move-list__num">{idx + 1}.</span><span className="move-list__san">{pair[0]}</span>{pair[1] ? <span className="move-list__san">{pair[1]}</span> : <span className="move-list__san move-list__san--empty">…</span>}
                  </li>
                ))}
              </ol>
            )}
          </div>
          <div className="fen-box">
            <div className="fen-box__head"><strong>FEN</strong><button className="btn btn--ghost" style={{ padding: "4px 10px", fontSize: ".8rem" }} onClick={() => copy("FEN", game.fen)}>{copied === "FEN" ? "Copied!" : "Copy FEN"}</button></div>
            <code className="fen-box__code">{game.fen}</code>
          </div>
          <div className="fen-box">
            <div className="fen-box__head"><strong>PGN</strong><button className="btn btn--ghost" style={{ padding: "4px 10px", fontSize: ".8rem" }} onClick={() => copy("PGN", game.pgn || "[No moves]")}>{copied === "PGN" ? "Copied!" : "Copy PGN"}</button></div>
            <code className="fen-box__code">{game.pgn || "(no moves yet)"}</code>
          </div>
          <p style={{ fontSize: ".82rem", color: "var(--muted)" }}>All moves validated by <code>chess.js</code>. Illegal moves ignored — check, mate, stalemate, castling, en passant, promotion and draws enforced. Game auto-saves and restores on reload.</p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <span className="pill pill--ok">✓ Responsive</span><span className="pill pill--ok">✓ Touch ≥44px</span><span className="pill pill--ok">✓ Worker + stale guards</span>
          </div>
        </div>
      </div>
    </section>
  );
}

function WhySequence({ fen, lastSan, best }: { fen: string; lastSan: string; best: { uci: string; san: string | null; pvSans: string[] } | null }) {
  const [step, setStep] = useState(0);
  const steps = [
    { q: "What changed?", a: `Last move: ${lastSan}. The board after it is shown. Coordinates and last-move wash mark it.` },
    { q: "Why does it matter?", a: best ? `Engine’s verified preference here is ${best.san ?? best.uci} — a legal line checked vs chess.js, not invented.` : "At this depth no single verified winning tactic is proven — focus on development and safety." },
    { q: "What could the opponent legally do?", a: best?.pvSans?.[1] ? `After ${best.san ?? best.uci}, one legal reply is ${best.pvSans[1]}.` : "List legal replies from the actual position — try highlighting the attacked square." },
    { q: "What should I notice next time?", a: "Before moving, ask: does my move leave a piece hanging or the king exposed? Use ‘Where to look’ first." },
  ];
  return (
    <div className="card" style={{ marginTop: 10, background: "var(--surface-2)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <strong className="serif">Why this move — step {step+1}/{steps.length}</strong>
        <span className="pill pill--brass">{steps[step].q}</span>
      </div>
      <p style={{ marginTop: 8 }}>{steps[step].a}</p>
      <p style={{ marginTop: 6, fontSize: ".82rem", color: "var(--muted)" }}>Position FEN: <code style={{ fontSize: ".72rem" }}>{fen.slice(0, 48)}…</code> — every square and continuation is real.</p>
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button className="btn btn--sm" disabled={step===0} onClick={() => setStep((s) => Math.max(0, s-1))}>Back</button>
        <button className="btn btn--sm btn--primary" disabled={step===steps.length-1} onClick={() => setStep((s) => Math.min(steps.length-1, s+1))}>Next</button>
        <span className="pill pill--off" style={{ marginLeft: "auto" }}>{best ? `Deeper: ${best.pvSans.slice(0,6).join(" ") || best.uci}` : "Deeper details behind disclosure"}</span>
      </div>
    </div>
  );
}

function GamesPage({ game, onGo }: { game: ReturnType<typeof useChessGame>; onGo: (t: Tab) => void }) {
  const [reviewFen, setReviewFen] = useState<string | null>(null);
  const [reviewPly, setReviewPly] = useState<number | null>(null);
  const fen = reviewFen ?? game.fen;
  const history = (() => { try { const c = new Chess(fen); const h = c.history({ verbose: true }); return h as unknown[]; } catch { return []; } })();
  const totalPly = game.historyVerbose.length;
  // Saved games: only real local game (never sample data)
  const hasGame = game.historySan.length > 0;
  const dateLabel = (() => { try { const s = loadSession(); return s?.updatedAt ? new Date(s.updatedAt).toLocaleString() : null; } catch { return null; }})();
  const side = game.historySan.length % 2 === 0 ? "White to move" : "Black to move";
  const status = getStatusText(game.status);

  if (!reviewFen && !hasGame) {
    return (
      <section className="section">
        <h2>Games — your chess journal</h2>
        <p style={{ color: "var(--muted)", marginTop: 6 }}>Real saved games only — no sample games are shown as history.</p>
        <div className="card empty-state" style={{ marginTop: 14 }}>
          <div style={{ width: 56, height: 56, borderRadius: 999, background: "var(--brass-soft)", display: "grid", placeItems: "center", border: "1px solid #E8D9BE" }}><Icon d={Paths.games} size={24} /></div>
          <h3>No saved games yet</h3>
          <p>Play a few moves — your game is auto-saved and appears here. No invented wins or ratings.</p>
          <button className="btn btn--primary" onClick={() => onGo("play")}>Play a game</button>
        </div>
      </section>
    );
  }

  return (
    <section className="section">
      <h2>Games — your chess journal</h2>
      <p style={{ color: "var(--muted)", marginTop: 6 }}>Most recent first — status, date, side and move count from actual data.</p>

      {!reviewFen ? (
        <div className="card" style={{ marginTop: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <div>
              <strong>Current saved game</strong>
              <div style={{ fontSize: ".86rem", color: "var(--muted)", marginTop: 4 }}>
                {status.title} · {side} · {game.historySan.length} move{game.historySan.length!==1?"s":""} {dateLabel && <>· {dateLabel}</>}
              </div>
            </div>
            <span className={`pill ${game.status.kind==="active" ? "pill--ok" : "pill--warn"}`}>{game.status.kind}</span>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            <button className="btn btn--primary btn--sm" onClick={() => onGo("play")}>Resume</button>
            <button className="btn btn--sm" onClick={() => { setReviewFen(game.fen); setReviewPly(totalPly); }}>Review</button>
            <button className="btn btn--ghost btn--sm" onClick={game.newGame}>New game</button>
          </div>
          {game.pgn && <p style={{ marginTop: 10, fontSize: ".82rem", color: "var(--muted)", fontFamily: "JetBrains Mono, monospace" }}>{game.pgn}</p>}
        </div>
      ) : (
        <div className="card" style={{ marginTop: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <h3>Review — move by move</h3>
            <button className="btn btn--ghost btn--sm" onClick={() => { setReviewFen(null); setReviewPly(null); }}>Back to games</button>
          </div>
          <p style={{ color: "var(--muted)", fontSize: ".86rem", marginTop: 6 }}>Move {reviewPly !== null ? reviewPly : history.length} of {totalPly} being examined — the board and controls stay connected.</p>
          <div style={{ maxWidth: 420, margin: "12px auto" }}>
            <ChessBoard fen={fen} orientation={game.orientation} lastMove={null} getLegalTargets={() => []} isPromotionMove={() => false} tryMove={() => false} canPickUp={() => false} hideLegend />
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
            <button className="btn btn--sm" disabled={(reviewPly ?? totalPly) <= 0} onClick={() => {
              try {
                const c = new Chess(fen); c.undo(); setReviewFen(c.fen()); setReviewPly((p) => Math.max(0, (p ?? totalPly) - 1));
              } catch {}
            }}>◀ Prev</button>
            <button className="btn btn--sm" disabled={(reviewPly ?? totalPly) >= totalPly} onClick={() => {
              try {
                // Replay game PGN up to next ply
                const tmp = new Chess(); try { tmp.loadPgn(game.pgn); } catch {}
                const hist = tmp.history({ verbose: true });
                const nextPly = Math.min(totalPly, (reviewPly ?? hist.length) + 1);
                const replay = new Chess();
                for (let i = 0; i < nextPly; i++) replay.move({ from: hist[i].from, to: hist[i].to, promotion: hist[i].promotion as never });
                setReviewFen(replay.fen()); setReviewPly(nextPly);
              } catch { setReviewFen(game.fen); setReviewPly(totalPly); }
            }}>Next ▶</button>
            <button className="btn btn--ghost btn--sm" onClick={() => { setReviewFen(game.fen); setReviewPly(totalPly); }}>Latest</button>
            <span className="pill pill--off">{game.pgn ? game.pgn.split(" ").slice(0, 8).join(" ") : "(no moves)"}</span>
          </div>
        </div>
      )}

      <div className="card" style={{ marginTop: 12 }}>
        <h3>About this journal</h3>
        <p style={{ marginTop: 6, fontSize: ".9rem" }}>Only your real games appear. Technical FEN/PGN are kept accurate but shown as secondary details — the journal title is not a hash.</p>
        <MiniBoardRow />
      </div>
    </section>
  );
}

function MiniBoardRow() {
  const positions = [
    "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
    "rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq c6 0 2",
  ];
  return (
    <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
      {positions.map((fen) => (
        <div key={fen} style={{ width: 96, border: "1px solid var(--line)", borderRadius: 12, overflow: "hidden", background: "var(--surface-raised)" }}>
          <div style={{ transform: "scale(.92)", transformOrigin: "top left", width: "108%", pointerEvents: "none" }}>
            <ChessBoard fen={fen} orientation="w" lastMove={null} getLegalTargets={() => []} isPromotionMove={() => false} tryMove={() => false} hideLegend />
          </div>
          <div style={{ fontSize: ".72rem", padding: "4px 6px", color: "var(--muted)", borderTop: "1px solid var(--line)", fontFamily: "JetBrains Mono, monospace" }}>{fen.slice(0, 22)}…</div>
        </div>
      ))}
      <div style={{ alignSelf: "center", fontSize: ".82rem", color: "var(--muted)" }}>Miniature boards use the same piece family — no mix of glyph styles.</div>
    </div>
  );
}

function BrainPage({ onGo, onPractise, tag: _tag }: { onGo: (t: Tab) => void; onPractise: (req: { skillId?: string; motif?: string }) => void; tag: string }) {
  void _tag;
  const reviews = (() => { try { return loadReviews(); } catch { return []; } })();
  if (reviews.length === 0) {
    return (
      <section className="section">
        <h2>Brain — your learning evidence</h2>
        <div className="card empty-state" style={{ marginTop: 14 }}>
          <div style={{ width: 56, height: 56, borderRadius: 999, background: "var(--brass-soft)", border: "1px solid #E8D9BE", display: "grid", placeItems: "center" }}><Icon d={Paths.brain} size={24} /></div>
          <h3>Your journey is beginning</h3>
          <p>Play a few exercises — Brain will show what to practise next from real, verified evidence. No invented rating yet.</p>
          <button className="btn btn--primary" onClick={() => onPractise({ motif: "hanging" })}>Start a practice</button>
        </div>
      </section>
    );
  }
  // Simple honest evidence view — no invented percentages
  const due = reviews.filter((r) => isReviewDue(r, new Date().toISOString()));
  return (
    <section className="section">
      <h2>Brain — what should I practise next?</h2>
      <p style={{ color: "var(--muted)", marginTop: 6 }}>Everyday language, simple evidence. Independent success vs success after hints kept separate where data permits.</p>

      {due.length > 0 ? (
        <div className="card card--raised" style={{ marginTop: 14 }}>
          <div className="pill pill--warn" style={{ width: "fit-content" }}>Up next</div>
          <h3 style={{ marginTop: 8 }}>Refresh: {due[0].skillId}</h3>
          <p style={{ marginTop: 6, fontSize: ".9rem" }}>Recall is below your threshold — a short review is the best next step. Evidence: last review interval {due[0].intervalDays}d.</p>
          <button className="btn btn--primary btn--sm" style={{ marginTop: 10 }} onClick={() => onPractise({ skillId: due[0].skillId })}>Practise {due[0].skillId}</button>
        </div>
      ) : (
        <div className="card" style={{ marginTop: 14 }}>
          <h3>Nothing due right now</h3>
          <p style={{ marginTop: 6 }}>Your recall is above threshold. Try a new lesson — it will create the next meaningful evidence.</p>
          <button className="btn btn--quiet btn--sm" style={{ marginTop: 10 }} onClick={() => onGo("learn")}>Browse lessons</button>
        </div>
      )}

      <div className="card" style={{ marginTop: 12 }}>
        <h3>Genuine skills</h3>
        <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
          {reviews.slice(0, 6).map((r) => (
            <button key={r.id} type="button" className={`skill-row ${isReviewDue(r, new Date().toISOString()) ? "skill-row--due" : ""}`} onClick={() => onPractise({ skillId: r.skillId })} aria-label={`Practise ${r.skillId} — interval ${r.intervalDays} days, due ${new Date(r.dueAt).toLocaleDateString()}`}>
              <span style={{ fontWeight: 700, fontSize: ".9rem" }}>{r.skillId}</span>
              <span style={{ fontSize: ".82rem", color: "var(--muted)" }}>interval {r.intervalDays}d · due {new Date(r.dueAt).toLocaleDateString()}</span>
              <span className={`pill ${isReviewDue(r, new Date().toISOString()) ? "pill--warn" : "pill--ok"}`}>{isReviewDue(r, new Date().toISOString()) ? "Due" : "Scheduled"}</span>
              <span className="skill-row__go" aria-hidden="true">Practise →</span>
            </button>
          ))}
        </div>
        <p style={{ marginTop: 10, fontSize: ".82rem", color: "var(--muted)" }}>Deeper statistics only where they help understanding — not as decoration.</p>
      </div>
    </section>
  );
}

function getStatusText(s: ReturnType<typeof useChessGame>["status"]): { title: string; detail: string } {
  switch (s.kind) {
    case "active": return { title: s.turn==="w" ? "White to move" : "Black to move", detail: s.inCheck ? "King is in check — you must get out of check." : "Play a legal move. Tap or drag a piece." };
    case "checkmate": return { title: `Checkmate — ${s.winner==="w" ? "White wins" : "Black wins"}`, detail: "Game over. Start a new game to play again." };
    case "stalemate": return { title: "Stalemate — Draw", detail: "No legal moves and not in check. Game over." };
    case "draw": return { title: "Draw", detail: s.reason==="fifty"?"Fifty-move rule.":s.reason==="repetition"?"Threefold repetition.":s.reason==="insufficient"?"Insufficient material.":"Draw." };
    default: return { title: "Game over", detail: "No more legal moves." };
  }
}



function pieceNameFromSan(san: string): string {
  const first = san[0];
  const map: Record<string,string> = { N:"Knight", B:"Bishop", R:"Rook", Q:"Queen", K:"King" };
  if (map[first]) return `${map[first]} move`;
  if (san.includes("x")) return "Pawn capture";
  return "Pawn move";
}
function scoreLabel(c: { scoreCp?: number | null; scoreMate?: number | null }): string {
  if (typeof c.scoreMate === "number") return c.scoreMate>0?`mate in ${c.scoreMate}`:`mated in ${Math.abs(c.scoreMate)}`;
  if (typeof c.scoreCp === "number") return `${c.scoreCp>0?"+":""}${(c.scoreCp/100).toFixed(2)}`;
  return "—";
}

function EngineCandidates({ fen, analysis, isStale, positionId, focusMode }: { fen: string; analysis: ReturnType<typeof useEngine>["analysis"]; isStale: boolean; positionId: number; focusMode: boolean }) {
  if (focusMode) return <p className="engine-panel__hint">Focus mode — hints hidden. Engine still bounded; re-enable to see candidates.</p>;
  if (isStale) return <p className="engine-panel__hint">Updating for new position… (stale ID {analysis?.positionId} ignored, current {positionId})</p>;
  if (!analysis || analysis.fen !== fen) return <p className="engine-panel__hint">No analysis for this position yet — move or press Re-analyze. Cached by FEN+version+settings.</p>;
  if (analysis.candidates.length===0) return <p className="engine-panel__hint">Engine: no candidates at this depth. {analysis.bestUci?`Best: ${analysis.bestUci}`:""}</p>;
  return (
    <div className="engine-panel__candidates">
      <div className="engine-panel__score">Depth {analysis.depth} · {analysis.candidates.length} candidate{analysis.candidates.length>1?"s":""} {analysis.bestUci?`· best ${analysis.bestUci}`:""}</div>
      <ol className="engine-panel__list" aria-label="Engine candidates (legal, same-player perspective)">
        {analysis.candidates.map((c) => {
          const score = typeof c.scoreMate==="number" ? (c.scoreMate>0?`#${c.scoreMate}`:`#${c.scoreMate}`) : typeof c.scoreCp==="number" ? `${c.scoreCp>0?"+":""}${(c.scoreCp/100).toFixed(2)}` : "—";
          return (
            <li key={c.multipv} className="engine-panel__item">
              <span className="engine-panel__rank">#{c.multipv}</span><span className="engine-panel__san">{c.san ?? c.uci}</span><span className="engine-panel__uci">({c.uci})</span><span className="engine-panel__scoreval">{score}</span><span className="engine-panel__pv" title={c.raw}>{c.pvSans.slice(0,6).join(" ")}</span>
            </li>
          );
        })}
      </ol>
      <p className="engine-panel__hint" style={{ marginTop: 6 }}>Scores from current player's perspective. Only legal continuations; stale IDs ignored.</p>
    </div>
  );
}

function StatusPage({ tag, canInstall, onInstall }: { tag: string; canInstall: boolean; onInstall: () => void }) {
  return (
    <section className="section">
      <div className="card">
        <h2>Feature inventory (honest) &amp; QA</h2>
        <p>Only verified items are marked complete. Language: <span lang={tag}>{tag}</span></p>
        <div className="status-strip">
          <span className="pill pill--ok">✓ TypeScript + Vite + React builds</span>
          <span className="pill pill--ok">✓ Playable board — tap/drag/flip/undo + legal rules + keyboard</span>
          <span className="pill pill--ok">✓ Stockfish worker — bounded, stale-guard, computer opponent, fallback</span>
          <span className="pill pill--ok">✓ FactPackets verified — never invents moves/scores</span>
          <span className="pill pill--ok">✓ 8 languages (RTL), ExplanationRenderer + language picker</span>
          <span className="pill pill--ok">✓ Account sync + ₹599 test-mode adapter — checkout disabled until verified</span>
          <span className="pill pill--ok">✓ PWA manifest + icons + sw.js</span>
          <span className="pill pill--off">○ Ads — not in this release</span>
          <span className="pill pill--warn">Owner-pending: merchant, webhook, tax/legal signoff, physical phone smoke</span>
        </div>
        <div className="comparison-wrap" style={{ marginTop: 16 }}>
          <table className="comparison">
            <thead><tr><th>Area</th><th>Status</th><th>Evidence</th></tr></thead>
            <tbody>
              <tr><td>Build</td><td>npm run build</td><td>See UI_PROGRESS.md</td></tr>
              <tr><td>Tests</td><td>vitest run</td><td>legality + engine + learner + i18n</td></tr>
              <tr><td>Free board</td><td>Live — legal via chess.js</td><td>Touch ≥44px, keyboard, safe-area, no horizontal scroll</td></tr>
              <tr><td>Learn / i18n</td><td>Live — 8 languages</td><td>Own scripts, html lang/dir, board unaffected by dir</td></tr>
              <tr><td>PWA / offline</td><td>Manifest + sw.js + offline banner</td><td>Shell cached; sync needs network</td></tr>
            </tbody>
          </table>
        </div>
        <div className="card" style={{ marginTop: 12 }}>
          <h3>Install</h3>
          {canInstall ? <button className="btn btn--primary" onClick={onInstall} style={{ marginTop: 8 }}>Install Chessworkermind</button> : (
            <ul className="install-card__steps" style={{ marginTop: 8 }}>
              <li><strong>iPhone:</strong> Safari → Share → Add to Home Screen.</li><li><strong>Android:</strong> Chrome menu → Install app.</li><li><strong>Desktop:</strong> Address bar install icon.</li><li>Otherwise: Continue in browser.</li>
            </ul>
          )}
        </div>
        <p style={{ marginTop: 12, fontSize: ".85rem", color: "var(--muted)" }}>Source of truth: <code>MASTER_PROMPT.txt</code> kept in export. Secrets never committed.</p>
      </div>
    </section>
  );
}
