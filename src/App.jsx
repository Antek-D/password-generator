import React, { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";

/**
 * Password Generator — Internal Tool (B2B/FinTech)
 *
 * Design goals:
 * - Use cryptographically secure randomness (`window.crypto`) instead of `Math.random`.
 * - “Easy to Read” mode removes visually ambiguous characters (useful for print/SMS).
 * - Enforce at least one character from each selected category to avoid weak edge cases.
 * - Persist user preferences in `localStorage` for a frictionless daily workflow.
 * - Keep a small session history (last 3) to recover from accidental re-generation.
 */

const DEFAULT_LENGTH = 12;
const MIN_LENGTH = 8;
const MAX_LENGTH = 32;
const STORAGE_KEY = "password-generator-settings";

// Characters that are visually ambiguous in common fonts (critical for printed passwords).
const AMBIGUOUS = new Set(["1", "l", "I", "0", "O", "o"]);

const CHARSETS = {
  upper: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  lower: "abcdefghijklmnopqrstuvwxyz",
  digits: "0123456789",
  symbols: "!@#$%^&*()-_=+[]{};:,.?/",
};

function sanitizeCharset(str, easyToRead) {
  if (!easyToRead) return str;
  return [...str].filter((ch) => !AMBIGUOUS.has(ch)).join("");
}

function cryptoRandomInt(maxExclusive) {
  // Secure random integer in [0, maxExclusive) using Web Crypto.
  if (maxExclusive <= 0) return 0;
  const arr = new Uint32Array(1);
  window.crypto.getRandomValues(arr);
  return arr[0] % maxExclusive;
}

function shuffleCrypto(array) {
  // Fisher–Yates shuffle powered by Web Crypto (unbiased and predictable-order resistant).
  const a = [...array];
  for (let i = a.length - 1; i > 0; i--) {
    const j = cryptoRandomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildPools({ useUpper, useLower, useDigits, useSymbols, easyToRead }) {
  const pools = [];
  if (useUpper) pools.push(sanitizeCharset(CHARSETS.upper, easyToRead));
  if (useLower) pools.push(sanitizeCharset(CHARSETS.lower, easyToRead));
  if (useDigits) pools.push(sanitizeCharset(CHARSETS.digits, easyToRead));
  if (useSymbols) pools.push(sanitizeCharset(CHARSETS.symbols, easyToRead));

  // Remove any empty pools (defensive: should not happen, but protects against misconfiguration).
  return pools.filter((p) => p.length > 0);
}

function generatePassword(length, options) {
  const pools = buildPools(options);
  if (pools.length === 0) return "";

  // Ensure at least one character from each selected category (security/UX expectation).
  const required = pools.map((pool) => pool[cryptoRandomInt(pool.length)]);

  // Use the combined pool to fill the remaining length.
  const combined = pools.join("");
  const remainingCount = Math.max(0, length - required.length);

  const remaining = Array.from({ length: remainingCount }, () => {
    return combined[cryptoRandomInt(combined.length)];
  });

  // Shuffle to avoid predictable placement of category-guaranteed characters.
  return shuffleCrypto([...required, ...remaining]).join("");
}

function estimateStrength({ length, poolsCount, hasSymbols }) {
  // Simple, explainable heuristic suitable for internal tools (not a formal entropy calculator).
  const lenScore = Math.min(60, (length - 6) * 6); // length 6..16 -> up to ~60
  const varietyScore = poolsCount * 12; // up to 48
  const symbolsBonus = hasSymbols ? 10 : 0;

  const score = Math.max(0, Math.min(100, lenScore + varietyScore + symbolsBonus));

  if (score < 45) return { label: "Słabe", level: 1, score };
  if (score < 75) return { label: "Średnie", level: 2, score };
  return { label: "Silne", level: 3, score };
}

export default function App() {
  const [length, setLength] = useState(DEFAULT_LENGTH);
  const [useUpper, setUseUpper] = useState(true);
  const [useLower, setUseLower] = useState(true);
  const [useDigits, setUseDigits] = useState(true);
  const [useSymbols, setUseSymbols] = useState(false);
  const [easyToRead, setEasyToRead] = useState(true);

  const [password, setPassword] = useState("");
  const [history, setHistory] = useState([]);
  const [copyStatus, setCopyStatus] = useState("idle");

  const passwordRef = useRef(null);
  const toastTimerRef = useRef(null);

  // Derived values

  const poolsCount = useMemo(() => {
    return [useUpper, useLower, useDigits, useSymbols].filter(Boolean).length;
  }, [useUpper, useLower, useDigits, useSymbols]);

  const effectiveMinLength = useMemo(() => {
    // Must be at least the number of enabled categories to satisfy the "one from each" rule.
    return Math.max(MIN_LENGTH, poolsCount);
  }, [poolsCount]);

  // Load persisted user preferences once on startup.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;

      const saved = JSON.parse(raw);

      if (typeof saved.length === "number") setLength(saved.length);
      if (typeof saved.useUpper === "boolean") setUseUpper(saved.useUpper);
      if (typeof saved.useLower === "boolean") setUseLower(saved.useLower);
      if (typeof saved.useDigits === "boolean") setUseDigits(saved.useDigits);
      if (typeof saved.useSymbols === "boolean") setUseSymbols(saved.useSymbols);
      if (typeof saved.easyToRead === "boolean") setEasyToRead(saved.easyToRead);
    } catch {
      // Ignore corrupted storage values — never break the UI.
    }
  }, []);

  // Persist preferences whenever the user changes generator options.
  useEffect(() => {
    const payload = {
      length,
      useUpper,
      useLower,
      useDigits,
      useSymbols,
      easyToRead,
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }, [length, useUpper, useLower, useDigits, useSymbols, easyToRead]);

  useEffect(() => {
    if (length < effectiveMinLength) setLength(effectiveMinLength);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveMinLength]);

  const strength = useMemo(() => {
    const hasSymbolsNow = useSymbols;
    return estimateStrength({ length, poolsCount, hasSymbols: hasSymbolsNow });
  }, [length, poolsCount, useSymbols]);

  const canGenerate = poolsCount > 0 && length >= effectiveMinLength;

  function handleGenerate() {
    if (!canGenerate) return;

    const next = generatePassword(length, {
      useUpper,
      useLower,
      useDigits,
      useSymbols,
      easyToRead,
    });

    setPassword(next);
    setHistory((prev) => {
      const updated = [next, ...prev.filter((p) => p !== next)];
      return updated.slice(0, 3);
    });

    // Keep focus on the output field for quick copy workflows.
    requestAnimationFrame(() => passwordRef.current?.focus());
  }

  async function handleCopy() {
    if (!password) return;

    try {
      await navigator.clipboard.writeText(password);
      setCopyStatus("copied");

      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
      toastTimerRef.current = window.setTimeout(() => setCopyStatus("idle"), 1500);
    } catch {
      setCopyStatus("error");
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
      toastTimerRef.current = window.setTimeout(() => setCopyStatus("idle"), 1800);
    }
  }

  function handleSelectAll() {
    passwordRef.current?.select?.();
  }

  function handleUseHistory(p) {
    setPassword(p);
    requestAnimationFrame(() => passwordRef.current?.focus());
  }

  // Generate immediately on load so the tool is ready without extra clicks.
  useEffect(() => {
    handleGenerate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const warningText = useMemo(() => {
    if (poolsCount === 0) return "Wybierz przynajmniej jeden zestaw znaków.";
    if (length < effectiveMinLength)
      return `Długość musi być ≥ ${effectiveMinLength} (dla wybranych opcji).`;
    return "";
  }, [poolsCount, length, effectiveMinLength]);

  return (
    <div className="appShell">
      <div className="app">
        <header className="topbar">
          <div className="titleBlock">
            <h1>Password Generator — Internal Tool</h1>
            <p className="subtitle">
              Narzędzie B2B do generowania silnych haseł dla klientów — z trybem{" "}
              <span className="emph">Easy to Read</span> (bez znaków niejednoznacznych).
            </p>
          </div>
        </header>

        <main className="grid">
          <section className="card card--main" aria-label="Generator haseł">
            <div className="cardHead">
              <h2>Generator</h2>
              <div className="meta">
                Domyślnie: {DEFAULT_LENGTH} znaków • Zabezpieczone przez{" "}
                <span className="mono">window.crypto</span>
              </div>
            </div>

            <div className="controls">
              <div className="controlRow">
                <div className="lengthControl">
                  <div className="rowTop">
                    <label htmlFor="len">Długość hasła</label>
                    <div className="lengthValue">
                      <span className="mono">{length}</span>
                      <span className="muted"> znaków</span>
                    </div>
                  </div>

                  <input
                    id="len"
                    className="range"
                    type="range"
                    min={effectiveMinLength}
                    max={MAX_LENGTH}
                    value={length}
                    onChange={(e) => setLength(Number(e.target.value))}
                  />

                  <div className="rangeTicks">
                    <span>{effectiveMinLength}</span>
                    <span>{MAX_LENGTH}</span>
                  </div>
                </div>

                <div className="strength">
                  <div className="rowTop">
                    <span className="label">Siła hasła</span>
                    <span className={`strengthLabel s${strength.level}`}>{strength.label}</span>
                  </div>

                  <div
                    className="meter"
                    role="meter"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={strength.score}
                  >
                    <div className={`meterFill s${strength.level}`} style={{ width: `${strength.score}%` }} />
                  </div>

                  <div className="strengthHint">
                    Dłuższe hasło + więcej typów znaków = większa odporność na ataki.
                  </div>
                </div>
              </div>

              <div className="checkboxGrid" role="group" aria-label="Opcje znaków">
                <label className="check">
                  <input
                    type="checkbox"
                    checked={useUpper}
                    onChange={(e) => setUseUpper(e.target.checked)}
                  />
                  <span>Wielkie litery</span>
                </label>

                <label className="check">
                  <input
                    type="checkbox"
                    checked={useLower}
                    onChange={(e) => setUseLower(e.target.checked)}
                  />
                  <span>Małe litery</span>
                </label>

                <label className="check">
                  <input
                    type="checkbox"
                    checked={useDigits}
                    onChange={(e) => setUseDigits(e.target.checked)}
                  />
                  <span>Cyfry</span>
                </label>

                <label className="check">
                  <input
                    type="checkbox"
                    checked={useSymbols}
                    onChange={(e) => setUseSymbols(e.target.checked)}
                  />
                  <span>Znaki specjalne</span>
                </label>

                <label className="check check--accent">
                  <input
                    type="checkbox"
                    checked={easyToRead}
                    onChange={(e) => setEasyToRead(e.target.checked)}
                  />
                  <span>
                    Easy to Read{" "}
                    <span className="hint">(wyklucz: 1, l, I, 0, O, o)</span>
                  </span>
                </label>
              </div>

              {warningText ? (
                <div className="alert" role="alert">
                  {warningText}
                </div>
              ) : null}

              <div className="actions">
                <button className="btn" onClick={handleGenerate} disabled={!canGenerate}>
                  Generuj hasło
                </button>

                <button className="btn btn--ghost" onClick={handleCopy} disabled={!password}>
                  Kopiuj
                </button>
              </div>

              <div className="output">
                <label htmlFor="out">Wygenerowane hasło</label>
                <div className="outputRow">
                  <input
                    id="out"
                    ref={passwordRef}
                    className="outputInput mono"
                    value={password}
                    readOnly
                    onFocus={handleSelectAll}
                    aria-label="Wygenerowane hasło"
                  />
                  <button className="iconBtn" onClick={handleCopy} aria-label="Kopiuj hasło">
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                  </button>
                </div>

              </div>
            </div>
          </section>

          <section className="card" aria-label="Historia">
            <div className="cardHead">
              <h2>Historia sesji</h2>
              <div className="meta">3 ostatnio wygenerowane hasła</div>
            </div>

            {history.length === 0 ? (
              <div className="empty">Brak historii. Wygeneruj pierwsze hasło.</div>
            ) : (
              <div className="history">
                {history.map((p, idx) => (
                  <button key={`${p}-${idx}`} className="historyItem" onClick={() => handleUseHistory(p)}>
                    <span className="mono">{p}</span>
                    <span className="pill">{idx === 0 ? "ostatnie" : "historia"}</span>
                  </button>
                ))}
              </div>
            )}

            <div className="divider" />

            <div className="policy">
              <div className="policyTitle">Rekomendacja bezpieczeństwa</div>
              <ul>
                <li>Nie wysyłaj haseł w tym samym kanale co login.</li>
                <li>Do PDF: preferuj min. 12–16 znaków.</li>
                <li>Rozważ „Znaki specjalne” dla bankowości/szyfrowania.</li>
              </ul>
            </div>
          </section>
        </main>

        <footer className="footer">
          <span>© {new Date().getFullYear()} Antoni Darczuk • Portfolio • Secure Password Generator</span>
        </footer>

        <div
          className={`toast ${copyStatus === "copied" ? "isOn" : ""}`}
          role="status"
          aria-live="polite"
        >
          Skopiowano!
        </div>

        <div
          className={`toast toast--error ${copyStatus === "error" ? "isOn" : ""}`}
          role="status"
          aria-live="polite"
        >
          Nie udało się skopiować (sprawdź uprawnienia przeglądarki).
        </div>
      </div>
    </div>
  );
}