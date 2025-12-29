import React, { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";

/**
 * Corporate Trust / FinTech Password Generator
 * - Pure JS generation
 * - Easy-to-Read mode removes ambiguous characters
 * - Strength meter
 * - One-click copy with toast
 * - Session history (last 3)
 */

const DEFAULT_LENGTH = 12;
const MIN_LENGTH = 8;
const MAX_LENGTH = 32;

// Ambiguous characters commonly confused on paper:
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
  // Secure random int in [0, maxExclusive)
  if (maxExclusive <= 0) return 0;
  const arr = new Uint32Array(1);
  window.crypto.getRandomValues(arr);
  return arr[0] % maxExclusive;
}

function shuffleCrypto(array) {
  // Fisher-Yates with crypto RNG
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

  // Remove any empty pools (could happen if easy-to-read filtered everything, though unlikely)
  return pools.filter((p) => p.length > 0);
}

function generatePassword(length, options) {
  const pools = buildPools(options);
  if (pools.length === 0) return "";

  // Guarantee at least 1 char from each selected pool:
  const required = pools.map((pool) => pool[cryptoRandomInt(pool.length)]);

  // Combined pool for remaining:
  const combined = pools.join("");
  const remainingCount = Math.max(0, length - required.length);

  const remaining = Array.from({ length: remainingCount }, () => {
    return combined[cryptoRandomInt(combined.length)];
  });

  // Shuffle to avoid predictable placement of required chars
  return shuffleCrypto([...required, ...remaining]).join("");
}

function estimateStrength({ length, poolsCount, hasSymbols }) {
  // Simple, explainable heuristic for B2B tool:
  // - length weight
  // - variety (poolsCount)
  // - symbols bonus
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
  const [history, setHistory] = useState([]); // last 3
  const [copyStatus, setCopyStatus] = useState("idle"); // idle | copied | error

  const passwordRef = useRef(null);
  const toastTimerRef = useRef(null);

  const poolsCount = useMemo(() => {
    return [useUpper, useLower, useDigits, useSymbols].filter(Boolean).length;
  }, [useUpper, useLower, useDigits, useSymbols]);

  const effectiveMinLength = useMemo(() => {
    // Ensure we can include at least one from each selected pool.
    return Math.max(MIN_LENGTH, poolsCount);
  }, [poolsCount]);

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

    // Keep focus on output for quick copy
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

  // Generate once on initial load (useful as a tool)
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
            <h1>Secure Password Generator</h1>
            <p className="subtitle">
              Narzędzie B2B do generowania silnych haseł dla klientów — z trybem{" "}
              <span className="emph">Easy to Read</span> (bez znaków niejednoznacznych).
            </p>
          </div>

          <div className="badge">
            <span className="badgeDot" aria-hidden="true" />
            <span>Corporate Trust</span>
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

                  <div className="meter" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={strength.score}>
                    <div className={`meterFill s${strength.level}`} style={{ width: `${strength.score}%` }} />
                  </div>

                  <div className="strengthHint">
                    Dłuższe hasło + więcej typów znaków = większa odporność na ataki.
                  </div>
                </div>
              </div>

              <div className="checkboxGrid" role="group" aria-label="Opcje znaków">
                <label className="check">
                  <input type="checkbox" checked={useUpper} onChange={(e) => setUseUpper(e.target.checked)} />
                  <span>Wielkie litery</span>
                </label>

                <label className="check">
                  <input type="checkbox" checked={useLower} onChange={(e) => setUseLower(e.target.checked)} />
                  <span>Małe litery</span>
                </label>

                <label className="check">
                  <input type="checkbox" checked={useDigits} onChange={(e) => setUseDigits(e.target.checked)} />
                  <span>Cyfry</span>
                </label>

                <label className="check">
                  <input type="checkbox" checked={useSymbols} onChange={(e) => setUseSymbols(e.target.checked)} />
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
                  <button className="iconBtn" onClick={handleCopy} disabled={!password} title="Kopiuj do schowka">
                    ⧉
                  </button>
                </div>

                <div className="outputHint">
                  Wskazówka: w biurze rachunkowym często przekazujesz hasła na papierze — tryb{" "}
                  <span className="emph">Easy to Read</span> minimalizuje pomyłki.
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