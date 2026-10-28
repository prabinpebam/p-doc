/** The app's dialogs (V7, V10). */
import { useEffect, useMemo, useState } from "react";
import { COMMANDS, MENU_PATH, MENUS, labelOf, shownChord } from "../commands.ts";
import { moveDoc } from "../ops.ts";
import { restoreVersion } from "../versions.ts";
import { deleteComment } from "../review.ts";
import { getEditor, renameDoc } from "../session.ts";
import { sameRef } from "../../shared/api.ts";
import { anchorsOf, eachImage } from "@p-doc/core";
import type { JSONContent } from "@tiptap/core";
import { app, closeDialog, updateSettings, type Dialog as DialogState } from "../state.ts";
import type { Theme } from "../../shared/api.ts";
import { Dialog } from "./Dialog.tsx";
import { countWords } from "./StatusBar.tsx";
import { HeaderFooterDialog, PageSetupDialog } from "./PageDialogs.tsx";
import { ConnectDialog, GitHubSection, SyncProblemDialog } from "./GitHubSettings.tsx";
import { ImageAltDialog, ImageOptionsDialog } from "./ImageDialogs.tsx";
import { ParagraphDialog } from "./ParagraphDialog.tsx";
import { SortDialog } from "./SortDialog.tsx";
import { NotesDialog } from "./NotesDialog.tsx";
import { BookmarkDialog } from "./BookmarkDialog.tsx";

export function Dialogs() {
  const d = app.use((s) => s.dialog);
  if (!d) return null;
  switch (d.kind) {
    case "wordCount":
      return <WordCount />;
    case "shortcuts":
      return <Shortcuts />;
    case "link":
      return <LinkDialog />;
    case "specialChars":
      return <SpecialChars />;
    case "settings":
      return <Settings />;
    case "about":
      return <About />;
    case "rename":
      return <Rename d={d} />;
    case "move":
      return <Move d={d} />;
    case "restoreVersion":
      return <RestoreVersion d={d} />;
    case "deleteComment":
      return <DeleteComment d={d} />;
    case "pageSetup":
      return <PageSetupDialog />;
    case "headerFooter":
      return <HeaderFooterDialog />;
    case "connect":
      return <ConnectDialog />;
    case "syncProblem":
      return <SyncProblemDialog />;
    case "imageAlt":
      return <ImageAltDialog />;
    case "imageOptions":
      return <ImageOptionsDialog />;
    case "paragraph":
      return <ParagraphDialog tab={d.tab} />;
    case "sort":
      return <SortDialog />;
    case "notes":
      return <NotesDialog />;
    case "bookmark":
      return <BookmarkDialog />;
  }
}

const Cancel = ({ label = "Cancel" }: { label?: string }) => (
  <button type="button" className="btn" onClick={closeDialog}>
    {label}
  </button>
);

function stats(text: string, blocks: number) {
  return { words: countWords(text), chars: text.replace(/\n/g, "").length, charsNoSpaces: text.replace(/\s/g, "").length, paragraphs: blocks };
}

function WordCount() {
  const e = getEditor();
  const s = useMemo(() => {
    if (!e) return null;
    const { doc, selection } = e.state;
    let blocks = 0;
    let selBlocks = 0;
    doc.descendants((n, pos) => {
      if (!n.isTextblock) return true;
      if (n.textContent.trim()) {
        blocks++;
        if (!selection.empty && pos < selection.to && pos + n.nodeSize > selection.from) selBlocks++;
      }
      return false;
    });
    const all = stats(doc.textBetween(0, doc.content.size, "\n", " "), blocks);
    const sel = selection.empty ? null : stats(doc.textBetween(selection.from, selection.to, "\n", " "), selBlocks);
    return { all, sel };
  }, [e]);
  if (!s) return null;
  const row = (label: string, k: keyof typeof s.all) => (
    <tr key={k}>
      <th scope="row">{label}</th>
      {s.sel ? <td>{s.sel[k].toLocaleString()}</td> : null}
      <td data-testid={`count-${k}`}>{s.all[k].toLocaleString()}</td>
    </tr>
  );
  return (
    <Dialog title="Word count" onClose={closeDialog} onSubmit={closeDialog} actions={<button className="btn primary" type="submit" data-autofocus>Close</button>}>
      <table className="stats">
        {s.sel ? (
          <thead>
            <tr>
              <td />
              <th scope="col">Selection</th>
              <th scope="col">Document</th>
            </tr>
          </thead>
        ) : null}
        <tbody>
          {row("Words", "words")}
          {row("Characters", "chars")}
          {row("Characters excluding spaces", "charsNoSpaces")}
          {row("Paragraphs", "paragraphs")}
        </tbody>
      </table>
    </Dialog>
  );
}

function Shortcuts() {
  const [q, setQ] = useState("");
  const groups = MENUS.map((m) => ({
    label: m.label,
    rows: [...COMMANDS.values()]
      .filter((c) => shownChord(c) && (MENU_PATH.get(c.id) ?? "").split(" › ")[0] === m.label)
      .filter((c) => !q || `${labelOf(c)} ${shownChord(c)}`.toLowerCase().includes(q.toLowerCase())),
  }));
  const other = [...COMMANDS.values()].filter((c) => shownChord(c) && !MENU_PATH.has(c.id)).filter((c) => !q || `${labelOf(c)} ${shownChord(c)}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <Dialog title="Keyboard shortcuts" wide onClose={closeDialog} actions={<Cancel label="Close" />}>
      <input className="field" type="search" data-autofocus aria-label="Search shortcuts" placeholder="Search shortcuts" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="shortcut-groups">
        {[...groups, { label: "Other", rows: other }]
          .filter((g) => g.rows.length)
          .map((g) => (
            <section key={g.label} aria-label={g.label}>
              <h3 className="group-title">{g.label}</h3>
              <dl className="shortcut-list">
                {g.rows.map((c) => (
                  <div key={c.id} className="shortcut-row">
                    <dt>{labelOf(c)}</dt>
                    <dd>
                      {[...(c.keys ?? (c.hint ? [c.hint] : []))].map((k) => (
                        <kbd key={k}>{k}</kbd>
                      ))}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        {groups.every((g) => !g.rows.length) && !other.length ? <p className="empty">No shortcuts match.</p> : null}
      </div>
    </Dialog>
  );
}

function normaliseUrl(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  if (/^(https?:|mailto:)/i.test(v) || v.startsWith("#")) return v;
  if (/^[\w-]+(\.[\w-]+)+(\/|$)/.test(v)) return `https://${v}`;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return `mailto:${v}`;
  return null;
}

function LinkDialog() {
  const e = getEditor();
  const initial = useMemo(() => {
    if (!e) return { text: "", href: "", existing: false };
    if (e.isActive("link")) e.chain().extendMarkRange("link").run();
    const { from, to } = e.state.selection;
    return { text: e.state.doc.textBetween(from, to, " "), href: (e.getAttributes("link").href as string) ?? "", existing: e.isActive("link") };
  }, [e]);
  const [text, setText] = useState(initial.text);
  const [href, setHref] = useState(initial.href);
  const [error, setError] = useState<string | null>(null);
  const anchors = useMemo(() => (e ? anchorsOf(e.state.doc) : []), [e]);
  const headings = anchors.filter((a) => a.kind === "heading" && a.label);
  const marks = anchors.filter((a) => a.kind === "bookmark");
  const apply = () => {
    if (!e) return;
    const url = normaliseUrl(href);
    if (!url) return setError("Enter a web address or an email address, or choose a heading or bookmark.");
    const label = text.trim() || url;
    const { from, to, empty } = e.state.selection;
    const original = e.state.doc.textBetween(from, to, " ");
    if (empty || label !== original) {
      e.chain()
        .focus()
        .insertContentAt({ from, to }, { type: "text", text: label, marks: [{ type: "link", attrs: { href: url } }] })
        .run();
    } else e.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
    closeDialog();
  };
  return (
    <Dialog
      title={initial.existing ? "Edit link" : "Insert link"}
      onClose={closeDialog}
      onSubmit={apply}
      actions={
        <>
          {initial.existing ? (
            <button
              type="button"
              className="btn subtle"
              onClick={() => {
                e?.chain().focus().extendMarkRange("link").unsetLink().run();
                closeDialog();
              }}
            >
              Remove link
            </button>
          ) : null}
          <span className="fill" />
          <Cancel />
          <button type="submit" className="btn primary">
            Apply
          </button>
        </>
      }
    >
      <label className="form-row">
        <span>Text</span>
        <input className="field" value={text} onChange={(ev) => setText(ev.target.value)} data-autofocus={!initial.text || undefined} />
      </label>
      <label className="form-row">
        <span>Link</span>
        <input
          className="field"
          value={href}
          placeholder="https://example.com"
          aria-invalid={!!error}
          aria-describedby={error ? "link-error" : undefined}
          data-autofocus={!!initial.text || undefined}
          onChange={(ev) => {
            setHref(ev.target.value);
            setError(null);
          }}
        />
      </label>
      {headings.length || marks.length ? (
        <label className="form-row">
          <span>Headings and bookmarks</span>
          <select
            className="field"
            value={anchors.some((a) => `#${a.id}` === href) ? href : ""}
            onChange={(ev) => {
              const a = anchors.find((x) => `#${x.id}` === ev.target.value);
              if (!a) return;
              setHref(ev.target.value);
              setError(null);
              if (!text.trim()) setText(a.label);
            }}
          >
            <option value="">Choose…</option>
            {headings.length ? (
              <optgroup label="Headings">
                {headings.map((a) => (
                  <option key={a.id} value={`#${a.id}`}>
                    {a.label}
                  </option>
                ))}
              </optgroup>
            ) : null}
            {marks.length ? (
              <optgroup label="Bookmarks">
                {marks.map((a) => (
                  <option key={a.id} value={`#${a.id}`}>
                    {a.label}
                  </option>
                ))}
              </optgroup>
            ) : null}
          </select>
        </label>
      ) : null}
      {error ? (
        <p id="link-error" className="form-error" role="alert">
          {error}
        </p>
      ) : null}
    </Dialog>
  );
}

const CHARS: [string, [string, string][]][] = [
  [
    "Punctuation",
    [
      ["—", "em dash"],
      ["–", "en dash"],
      ["…", "ellipsis"],
      ["‘", "left single quote"],
      ["’", "right single quote apostrophe"],
      ["“", "left double quote"],
      ["”", "right double quote"],
      ["«", "left guillemet"],
      ["»", "right guillemet"],
      ["•", "bullet"],
      ["·", "middle dot"],
      ["¡", "inverted exclamation"],
      ["¿", "inverted question"],
      ["§", "section"],
      ["¶", "pilcrow paragraph"],
      ["†", "dagger"],
      ["‡", "double dagger"],
      ["\u00a0", "no-break space"],
    ],
  ],
  [
    "Symbols",
    [
      ["©", "copyright"],
      ["®", "registered"],
      ["™", "trademark"],
      ["°", "degree"],
      ["✓", "check mark tick"],
      ["✗", "cross ballot x"],
      ["★", "black star"],
      ["☆", "white star"],
      ["♥", "heart"],
      ["→", "right arrow"],
      ["←", "left arrow"],
      ["↑", "up arrow"],
      ["↓", "down arrow"],
      ["↔", "left right arrow"],
      ["⇒", "double right arrow implies"],
    ],
  ],
  [
    "Currency",
    [
      ["€", "euro"],
      ["£", "pound"],
      ["¥", "yen yuan"],
      ["₹", "rupee"],
      ["¢", "cent"],
      ["₩", "won"],
      ["₽", "ruble"],
      ["₿", "bitcoin"],
    ],
  ],
  [
    "Maths",
    [
      ["±", "plus minus"],
      ["×", "multiply times"],
      ["÷", "divide"],
      ["≈", "almost equal approximately"],
      ["≠", "not equal"],
      ["≤", "less than or equal"],
      ["≥", "greater than or equal"],
      ["∞", "infinity"],
      ["√", "square root"],
      ["∑", "sum sigma"],
      ["∏", "product"],
      ["π", "pi"],
      ["µ", "micro mu"],
      ["½", "one half fraction"],
      ["¼", "one quarter fraction"],
      ["¾", "three quarters fraction"],
      ["²", "superscript two squared"],
      ["³", "superscript three cubed"],
    ],
  ],
  [
    "Greek",
    [
      ["α", "alpha"],
      ["β", "beta"],
      ["γ", "gamma"],
      ["δ", "delta"],
      ["ε", "epsilon"],
      ["θ", "theta"],
      ["λ", "lambda"],
      ["σ", "sigma"],
      ["φ", "phi"],
      ["ω", "omega"],
      ["Δ", "capital delta"],
      ["Ω", "capital omega ohm"],
    ],
  ],
];

function SpecialChars() {
  const [q, setQ] = useState("");
  const e = getEditor();
  const groups = CHARS.map(([g, list]) => [g, list.filter(([c, n]) => !q || n.includes(q.toLowerCase()) || c === q)] as const).filter(([, l]) => l.length);
  return (
    <Dialog title="Special characters" wide onClose={closeDialog} actions={<Cancel label="Close" />}>
      <input className="field" type="search" data-autofocus aria-label="Search characters" placeholder="Search by name, such as arrow or euro" value={q} onChange={(ev) => setQ(ev.target.value)} />
      <div className="char-groups">
        {groups.map(([g, list]) => (
          <section key={g} aria-label={g}>
            <h3 className="group-title">{g}</h3>
            <div className="char-grid">
              {list.map(([c, n]) => (
                <button key={c} type="button" className="char" title={n} aria-label={`Insert ${n}`} onClick={() => e?.chain().focus().insertContent(c).run()}>
                  {c === "\u00a0" ? "⍽" : c}
                </button>
              ))}
            </div>
          </section>
        ))}
        {!groups.length ? <p className="empty">No characters match.</p> : null}
      </div>
    </Dialog>
  );
}

function Settings() {
  const settings = app.use((s) => s.settings);
  const info = app.use((s) => s.info);
  const [name, setName] = useState(settings?.identity.name ?? "");
  const [version, setVersion] = useState("");
  useEffect(() => void window.pdoc.app.version().then(setVersion), []);
  if (!settings) return null;
  const theme = (t: Theme, label: string) => (
    <label className="radio">
      <input type="radio" name="theme" checked={settings.theme === t} onChange={() => void updateSettings({ theme: t })} />
      {label}
    </label>
  );
  return (
    <Dialog title="Settings" wide onClose={closeDialog} actions={<Cancel label="Close" />}>
      <section className="settings-section" aria-labelledby="set-appearance">
        <h3 id="set-appearance" className="group-title">
          Appearance
        </h3>
        <div role="radiogroup" aria-labelledby="set-appearance" className="radio-row">
          {theme("light", "Light")}
          {theme("dark", "Dark")}
          {theme("system", "System")}
        </div>
      </section>
      <section className="settings-section" aria-labelledby="set-editing">
        <h3 id="set-editing" className="group-title">
          Editing
        </h3>
        <label className="check">
          <input type="checkbox" checked={settings.spelling} onChange={(e) => void updateSettings({ spelling: e.target.checked })} />
          Check spelling as you type
        </label>
        <label className="form-row">
          <span>Your name on suggestions and versions</span>
          <input
            className="field"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => name.trim() && name.trim() !== settings.identity.name && void updateSettings({ identity: { ...settings.identity, name: name.trim() } })}
          />
        </label>
      </section>
      <section className="settings-section" aria-labelledby="set-storage">
        <h3 id="set-storage" className="group-title">
          Storage
        </h3>
        <p className="muted">Library folder</p>
        <p className="path">{info?.root}</p>
        <button type="button" className="btn" onClick={() => void window.pdoc.library.showRoot()}>
          Show in folder
        </button>
        <p className="muted">{info?.git ? `Versions use Git ${info.git}.` : "Install Git to keep versions."}</p>
      </section>
      <section className="settings-section" aria-labelledby="set-github">
        <h3 id="set-github" className="group-title">
          GitHub
        </h3>
        <GitHubSection />
      </section>
      <section className="settings-section" aria-labelledby="set-about">
        <h3 id="set-about" className="group-title">
          About
        </h3>
        <p className="muted">P-Doc {version}</p>
      </section>
    </Dialog>
  );
}

function About() {
  const [version, setVersion] = useState("");
  useEffect(() => void window.pdoc.app.version().then(setVersion), []);
  return (
    <Dialog title="About P-Doc" onClose={closeDialog} actions={<Cancel label="Close" />}>
      <p>P-Doc {version}</p>
      <p className="muted">Write documents you own. Every version kept, online or not.</p>
      <p className="muted">Built with Electron, React, TipTap, ProseMirror and Fluent UI icons, each under the MIT licence.</p>
    </Dialog>
  );
}

function Rename({ d }: { d: Extract<DialogState, { kind: "rename" }> }) {
  const [title, setTitle] = useState(d.title);
  const submit = () => {
    if (title.trim()) void renameDoc(d.ref, title);
    closeDialog();
  };
  return (
    <Dialog
      title="Rename"
      onClose={closeDialog}
      onSubmit={submit}
      actions={
        <>
          <Cancel />
          <button type="submit" className="btn primary">
            Rename
          </button>
        </>
      }
    >
      <label className="form-row">
        <span>Title</span>
        <input className="field" data-autofocus value={title} onFocus={(e) => e.target.select()} onChange={(e) => setTitle(e.target.value)} />
      </label>
    </Dialog>
  );
}

/** The different pictures in content. */
function imageCount(content: JSONContent | undefined): number {
  const srcs = new Set<string>();
  eachImage(content, (n) => {
    if (n.attrs?.src) srcs.add(String(n.attrs.src));
  });
  return srcs.size;
}

function Move({ d }: { d: Extract<DialogState, { kind: "move" }> }) {
  const toPublic = d.to === "public";
  const [images, setImages] = useState(0);
  useEffect(() => {
    if (!toPublic) return;
    const e = getEditor();
    if (e && sameRef(app.get().current, d.ref)) return setImages(imageCount(e.getJSON()));
    let live = true;
    window.pdoc.library.open(d.ref).then(
      (o) => live && setImages(imageCount(o.doc.content)),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [d.ref, toPublic]);
  const submit = () => {
    closeDialog();
    void moveDoc(d.ref, d.to);
  };
  return (
    <Dialog
      title={toPublic ? `Make "${d.title}" public?` : `Move "${d.title}" to Private?`}
      onClose={closeDialog}
      onSubmit={submit}
      actions={
        <>
          <Cancel />
          <button type="submit" className={`btn ${toPublic ? "warning" : "primary"}`} data-autofocus={!toPublic || undefined}>
            {toPublic ? "Move to Public" : "Move to Private"}
          </button>
        </>
      }
    >
      <p>{toPublic ? "Anyone can read it and its history on GitHub from the next sync." : "Copies already synced stay in the public repository's history."}</p>
      {toPublic && images ? <p data-testid="move-images">{images === 1 ? "Its image becomes public too." : `Its ${images} images become public too.`}</p> : null}
    </Dialog>
  );
}

function RestoreVersion({ d }: { d: Extract<DialogState, { kind: "restoreVersion" }> }) {
  return (
    <Dialog
      title={`Restore the version from ${d.time}?`}
      onClose={closeDialog}
      onSubmit={() => void restoreVersion(d.sha, d.time)}
      actions={
        <>
          <Cancel />
          <button type="submit" className="btn primary" data-autofocus>
            Restore
          </button>
        </>
      }
    >
      <p>The current version stays in history.</p>
    </Dialog>
  );
}

function DeleteComment({ d }: { d: Extract<DialogState, { kind: "deleteComment" }> }) {
  const reply = d.reply != null;
  return (
    <Dialog
      title={reply ? "Delete this reply?" : "Delete this comment?"}
      onClose={closeDialog}
      onSubmit={() => deleteComment(d.thread, d.reply)}
      actions={
        <>
          <Cancel />
          <button type="submit" className="btn primary" data-autofocus>
            Delete
          </button>
        </>
      }
    >
      <p>{reply ? "The reply is removed from the thread." : "The comment and its replies are removed, and the text loses its highlight."}</p>
    </Dialog>
  );
}
