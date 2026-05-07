/* global React, ReactDOM, TweaksPanel, useTweaks, TweakSection, TweakRadio, TweakColor, TweakToggle, TweakSelect */

const { useState, useEffect, useRef, useMemo } = React;

// ------------- Card data -------------
const PASTELS = [
  { name: "mint",     css: "var(--pastel-mint)" },
  { name: "lavender", css: "var(--pastel-lavender)" },
  { name: "peach",    css: "var(--pastel-peach)" },
  { name: "sky",      css: "var(--pastel-sky)" },
  { name: "butter",   css: "var(--pastel-butter)" },
  { name: "rose",     css: "var(--pastel-rose)" },
];

const PROJECTS = [
  {
    tag: "FOUNDER · 2024 →",
    title: "Sim10.ai",
    titleItalic: "the simulation co.",
    blurb: "An LLM-powered sports simulation engine. Plays out entire seasons, narrates the highlights, surfaces the human stories underneath the box scores. Currently in private beta with a handful of fantasy leagues.",
    cta: "ENTER THE SIM",
    color: PASTELS[3].css,
    type: "company",
    year: "2024 →",
  },
  {
    tag: "AGENTIC WORKFLOWS",
    title: "Profound",
    titleItalic: "agents at work.",
    blurb: "Built and shipped a suite of agentic workflows for enterprise research — automating multi-step competitive analysis, brand monitoring, and synthesis tasks that previously ate analyst weeks.",
    cta: "READ THE WRITE-UP",
    color: PASTELS[1].css,
    type: "work",
    year: "2024",
  },
  {
    tag: "PRODUCT · LAUNCH",
    title: "Crypto.com MCP",
    titleItalic: "model context, on-chain.",
    blurb: "Helped launch the Model Context Protocol integration — letting AI assistants safely query wallets, prices, and on-chain data through a single typed interface. Shipped to millions.",
    cta: "VIEW PROTOCOL",
    color: PASTELS[0].css,
    type: "product",
    year: "2024",
  },
  {
    tag: "TOOL · OPEN SOURCE",
    title: "Review Scraper",
    titleItalic: "the agent that listens.",
    blurb: "An agentic workflow that scrapes app store reviews across iOS + Android, clusters complaints, and writes the bug ticket for you. The PMs at three startups now use it weekly.",
    cta: "SEE THE PIPELINE",
    color: PASTELS[2].css,
    type: "tool",
    year: "2025",
  },
  {
    tag: "ESSAY",
    title: "Notes on Building",
    titleItalic: "agents that don't lie.",
    blurb: "A long-running set of notes on the actual practice of shipping agentic systems — what works, what gets you fired, the unglamorous middle. Updated whenever I learn something new.",
    cta: "READ ESSAY",
    color: PASTELS[4].css,
    type: "writing",
    year: "ONGOING",
  },
  {
    tag: "EXPERIMENT",
    title: "Tiny Forecasts",
    titleItalic: "predictions, smaller.",
    blurb: "A weekend project: a calibration trainer that gives you 100 micro-predictions a day across sports, weather, and politics, then grades you over time. Not a betting app. (Mostly.)",
    cta: "TRY IT",
    color: PASTELS[5].css,
    type: "side project",
    year: "2025",
  },
  {
    tag: "TALK",
    title: "On Simulation",
    titleItalic: "why fake worlds matter.",
    blurb: "A talk I gave on why simulation — sports, economies, weather — is the underrated frontier for LLMs. Covers Sim10's architecture and what we got wrong twice before getting it right.",
    cta: "WATCH",
    color: PASTELS[3].css,
    type: "talk",
    year: "2025",
  },
  {
    tag: "PROTOTYPE",
    title: "Box Score Bot",
    titleItalic: "stats, but human.",
    blurb: "A prototype that turns dry box scores into the kind of recap your funniest friend would text you after the game. Trained on a decade of beat-writer columns and group chats.",
    cta: "SEE EXAMPLES",
    color: PASTELS[2].css,
    type: "prototype",
    year: "2024",
  },
  {
    tag: "ARCHIVE",
    title: "Old Things",
    titleItalic: "a graveyard of side projects.",
    blurb: "Every weekend project I've shipped, abandoned, or accidentally turned into a real company since 2019. Browse the wreckage; some of it still works.",
    cta: "ENTER THE ARCHIVE",
    color: PASTELS[1].css,
    type: "archive",
    year: "2019 — 2024",
  },
  {
    tag: "PHOTO",
    title: "Quiet Cities",
    titleItalic: "a photo series.",
    blurb: "Photographs of cities at the hour when they almost belong to no one — taken between 4 and 6 a.m. across NYC, Tokyo, and Lisbon. Shot on a Ricoh GR III. Updated when I travel.",
    cta: "VIEW SERIES",
    color: PASTELS[0].css,
    type: "photo",
    year: "ONGOING",
  },
  {
    tag: "NEWSLETTER",
    title: "The Sunday Note",
    titleItalic: "weekly, brief, occasionally good.",
    blurb: "A short Sunday email about whatever I've been thinking about — usually agents, usually sports, occasionally the economics of sandwiches. ~2,400 readers, no growth strategy.",
    cta: "SUBSCRIBE",
    color: PASTELS[4].css,
    type: "writing",
    year: "ONGOING",
  },
  {
    tag: "ABOUT",
    title: "Colophon",
    titleItalic: "how this site was made.",
    blurb: "Notes on the type, the spacing, the small decisions. Set in Instrument Serif and JetBrains Mono. Hand-written HTML, no framework, no analytics, no cookie banner. Made on a Tuesday.",
    cta: "READ COLOPHON",
    color: PASTELS[5].css,
    type: "meta",
    year: "2026",
  },
];

// row pattern: 1, 2, 1, 2 repeating
function buildRows(items) {
  const rows = [];
  let i = 0;
  let pattern = 0;
  while (i < items.length) {
    const isOne = pattern % 2 === 0;
    if (isOne) {
      rows.push({ kind: "one", items: [items[i]] });
      i += 1;
    } else {
      const pair = [items[i], items[i + 1]].filter(Boolean);
      rows.push({ kind: "two", items: pair });
      i += pair.length;
    }
    pattern += 1;
  }
  return rows;
}

// ------------- Card component -------------
function Card({ item, index, kind }) {
  const aspect = kind === "one" ? (index % 4 === 0 ? "full" : "tall") : "square";
  const num = String(index + 1).padStart(2, "0");
  return (
    <article
      className={`card ${aspect}`}
      style={{ "--card-color": item.color }}
      data-comment-anchor={`card-${item.title}`}
    >
      <div className="card-bg"></div>

      <div className="card-tag">{item.tag}</div>
      <div className="card-num">⁄{num}</div>

      <div className="card-foot">
        <span>{item.type.toUpperCase()}</span>
        <span>{item.year}</span>
      </div>

      <div className="card-overlay">
        <h3>
          {item.title}<br/>
          <span className="ital">{item.titleItalic}</span>
        </h3>
        <p>{item.blurb}</p>
        <span className="cta">{item.cta} →</span>
      </div>
    </article>
  );
}

// ------------- Grid with infinite scroll -------------
function Grid() {
  const [pages, setPages] = useState(1);
  const sentinelRef = useRef(null);

  const items = useMemo(() => {
    const out = [];
    for (let p = 0; p < pages; p++) {
      PROJECTS.forEach((proj, i) => {
        out.push({ ...proj, _key: `${p}-${i}` });
      });
    }
    return out;
  }, [pages]);

  const rows = useMemo(() => buildRows(items), [items]);

  // count display
  useEffect(() => {
    const el = document.getElementById("count-num");
    if (el) el.textContent = String(items.length);
  }, [items.length]);

  // infinite scroll loader
  useEffect(() => {
    const loader = document.getElementById("loader");
    if (!loader) return;
    const obs = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting && pages < 5) {
          setPages((p) => p + 1);
        }
      });
    }, { rootMargin: "400px" });
    obs.observe(loader);
    return () => obs.disconnect();
  }, [pages]);

  let runningIndex = 0;
  return (
    <>
      {rows.map((row, rIdx) => {
        const cards = row.items.map((it) => {
          const idx = runningIndex++;
          return (
            <Card
              key={it._key + "-" + idx}
              item={it}
              index={idx}
              kind={row.kind}
            />
          );
        });
        return (
          <div className={`row ${row.kind}`} key={`row-${rIdx}`}>
            {cards}
          </div>
        );
      })}
    </>
  );
}

// ------------- Tweaks -------------
const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "hover": "overlay",
  "palette": "pastel",
  "headline": "hi-im-justin",
  "showFooter": true
}/*EDITMODE-END*/;

const PALETTES = {
  pastel: {
    "--pastel-mint":     "#c9e4d4",
    "--pastel-lavender": "#d9d2ee",
    "--pastel-peach":    "#f5d6c6",
    "--pastel-sky":      "#cfe0ee",
    "--pastel-butter":   "#efe7c7",
    "--pastel-rose":     "#ecd2d8",
  },
  warm: {
    "--pastel-mint":     "#e8d9c4",
    "--pastel-lavender": "#e6c7b8",
    "--pastel-peach":    "#f0d4b8",
    "--pastel-sky":      "#dcc9b3",
    "--pastel-butter":   "#eddcc0",
    "--pastel-rose":     "#e6cbc1",
  },
  mono: {
    "--pastel-mint":     "#e2e2df",
    "--pastel-lavender": "#d6d6d2",
    "--pastel-peach":    "#cccac5",
    "--pastel-sky":      "#dadad6",
    "--pastel-butter":   "#e5e5e1",
    "--pastel-rose":     "#cfceca",
  },
  acid: {
    "--pastel-mint":     "#d4f0a0",
    "--pastel-lavender": "#c7b8f0",
    "--pastel-peach":    "#ffc89a",
    "--pastel-sky":      "#a8d8f5",
    "--pastel-butter":   "#fff09a",
    "--pastel-rose":     "#ffb3c1",
  },
};

function applyPalette(name) {
  const p = PALETTES[name] || PALETTES.pastel;
  const root = document.documentElement;
  Object.entries(p).forEach(([k, v]) => root.style.setProperty(k, v));
}

function applyHeadline(kind) {
  const h1 = document.querySelector(".hero h1");
  if (!h1) return;
  if (kind === "hi-im-justin") {
    h1.innerHTML = `HI! <span class="ital">I'm</span><br/><span class="punch">JUSTIN.</span>`;
  } else if (kind === "justin") {
    h1.innerHTML = `<span class="ital">it's</span><br/>JUSTIN.`;
  } else if (kind === "hello") {
    h1.innerHTML = `Hello, <span class="ital">stranger.</span><br/>I'm <span class="punch">Justin.</span>`;
  }
}

function Tweaks() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);

  useEffect(() => { document.body.dataset.hover = t.hover; }, [t.hover]);
  useEffect(() => { applyPalette(t.palette); }, [t.palette]);
  useEffect(() => { applyHeadline(t.headline); }, [t.headline]);
  useEffect(() => {
    const f = document.querySelector("footer");
    if (f) f.style.display = t.showFooter ? "" : "none";
  }, [t.showFooter]);

  return (
    <TweaksPanel title="Tweaks">
      <TweakSection title="Hover reveal">
        <TweakRadio
          label="Style"
          value={t.hover}
          onChange={(v) => setTweak("hover", v)}
          options={[
            { value: "overlay", label: "Desat" },
            { value: "slide",   label: "Slide" },
            { value: "corner",  label: "Corner" },
          ]}
        />
      </TweakSection>

      <TweakSection title="Palette">
        <TweakRadio
          label="Card colors"
          value={t.palette}
          onChange={(v) => setTweak("palette", v)}
          options={[
            { value: "pastel", label: "Cool" },
            { value: "warm",   label: "Warm" },
            { value: "mono",   label: "Mono" },
            { value: "acid",   label: "Acid" },
          ]}
        />
      </TweakSection>

      <TweakSection title="Headline">
        <TweakSelect
          label="Treatment"
          value={t.headline}
          onChange={(v) => setTweak("headline", v)}
          options={[
            { value: "hi-im-justin", label: "HI! I'm JUSTIN." },
            { value: "justin",       label: "it's JUSTIN." },
            { value: "hello",        label: "Hello, stranger." },
          ]}
        />
      </TweakSection>

      <TweakSection title="Layout">
        <TweakToggle
          label="Show footer"
          value={t.showFooter}
          onChange={(v) => setTweak("showFooter", v)}
        />
      </TweakSection>
    </TweaksPanel>
  );
}

// ------------- Mount -------------
const gridRoot = ReactDOM.createRoot(document.getElementById("grid"));
gridRoot.render(<Grid />);

const tweakHost = document.createElement("div");
document.body.appendChild(tweakHost);
const tweakRoot = ReactDOM.createRoot(tweakHost);
tweakRoot.render(<Tweaks />);
