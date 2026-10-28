/**
 * Word's review marks on import (U67). Before mammoth reads `document.xml`, tracked insertions and deletions,
 * paragraph-mark changes and comment ranges are turned into private-use marker characters, which mammoth keeps
 * as text; after it, `applyReview` turns the markers into suggestion and comment marks. Formatting changes to text
 * (emphasis) and paragraphs (style) become formatting suggestions. Changes P-Doc can't hold as suggestions (moves,
 * table rows and table formatting) are applied as Word shows them and kept as comments on the text they touch.
 */
import type { JSONContent } from "@tiptap/core";
import type { CommentReply, CommentThread } from "./format.ts";

const REV = "\uE000";
const REV_END = "\uE002";
const C_START = "\uE003";
const C_END = "\uE004";
const PARA = "\uE005";
const SEP = "\uE001";
const FMT = "\uE006";
const FMT_END = "\uE007";
const P_FMT = "\uE008";
const MARKERS = /\uE000([^\uE001]*)\uE001|\uE002|\uE003([^\uE001]*)\uE001|\uE004([^\uE001]*)\uE001|\uE005([^\uE001]*)\uE001|\uE006([^\uE001]*)\uE001|\uE007|\uE008([^\uE001]*)\uE001/g;

type MarkJSON = { type: string; attrs?: Record<string, unknown> };

/** A tracked formatting change to a run: the marks it had, of those P-Doc reads from Word. */
interface FormatRevision {
  id: string;
  author: string;
  time: string;
  old: MarkJSON[];
}

/** A tracked change to a paragraph's properties: the style and alignment it had. */
interface BlockRevision {
  id: string;
  author: string;
  time: string;
  type: "paragraph" | "heading";
  level: number | null;
  textStyle: "title" | "subtitle" | null;
  textAlign: string | null;
}

interface Revision {
  kind: "insertion" | "deletion";
  id: string;
  author: string;
  time: string;
}

interface Kept {
  id: string;
  author: string;
  time: string;
  body: string;
}

export interface ReviewPrep {
  xml: string;
  revisions: Revision[];
  formats: FormatRevision[];
  blocks: BlockRevision[];
  kept: Kept[];
}

const on = (rPr: string, tag: string) => {
  const m = new RegExp(`<w:${tag}\\b([^>]*)/?>`).exec(rPr);
  return !!m && !/w:val="(?:0|false|none)"/.test(m[1]!);
};

/** The marks of an old `w:rPr` that P-Doc reads from Word on import (fonts, sizes and colours it doesn't). */
function oldMarks(rPr: string): MarkJSON[] {
  const out: MarkJSON[] = [];
  if (on(rPr, "b")) out.push({ type: "bold" });
  if (on(rPr, "i")) out.push({ type: "italic" });
  if (on(rPr, "strike")) out.push({ type: "strike" });
  const va = /<w:vertAlign\b[^>]*w:val="(\w+)"/.exec(rPr)?.[1];
  if (va === "superscript") out.push({ type: "superscript" });
  if (va === "subscript") out.push({ type: "subscript" });
  return out;
}

const JC: Record<string, string> = { center: "center", right: "right", end: "right", both: "justify", distribute: "justify", left: "left", start: "left" };

/** The style and alignment of an old `w:pPr`. */
function oldBlock(pPr: string): Pick<BlockRevision, "type" | "level" | "textStyle" | "textAlign"> {
  const style = /<w:pStyle\b[^>]*w:val="([^"]*)"/.exec(pPr)?.[1] ?? "";
  const h = /^heading\s?([1-6])$/i.exec(style);
  const jc = /<w:jc\b[^>]*w:val="(\w+)"/.exec(pPr)?.[1];
  return {
    type: h ? "heading" : "paragraph",
    level: h ? Number(h[1]) : null,
    textStyle: /^title$/i.test(style) ? "title" : /^subtitle$/i.test(style) ? "subtitle" : null,
    textAlign: jc ? (JC[jc] ?? null) : null,
  };
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const unescape = (s: string) => s.replace(/&(amp|lt|gt|quot|apos);/g, (_, e: string) => ENTITIES[e]!).replace(/&#(x?)([0-9a-f]+);/gi, (_, x: string, n: string) => String.fromCodePoint(parseInt(n, x ? 16 : 10)));
const attr = (tag: string, name: string) => {
  const m = new RegExp(`${name}="([^"]*)"`).exec(tag);
  return m ? unescape(m[1]!) : "";
};
const run = (text: string) => `<w:r><w:t xml:space="preserve">${text}</w:t></w:r>`;
const who = (tag: string) => attr(tag, "w:author") || "Word";

/** Wraps the first paragraph at or after `from` in a kept comment's range. */
function anchorFrom(xml: string, from: number, id: string): string {
  const open = /<w:p\b[^>]*?(\/?)>/g;
  open.lastIndex = from;
  const m = open.exec(xml);
  if (!m || m[1]) return xml;
  const close = xml.indexOf("</w:p>", m.index);
  if (close < 0) return xml;
  const pPrEnd = xml.indexOf("</w:pPr>", m.index);
  const at = pPrEnd >= 0 && pPrEnd < close ? pPrEnd + 8 : m.index + m[0].length;
  return xml.slice(0, at) + run(`${C_START}${id}${SEP}`) + xml.slice(at, close) + run(`${C_END}${id}${SEP}`) + xml.slice(close);
}

/** Marks the review parts of a `document.xml` for `applyReview`. */
export function prepareReview(source: string): ReviewPrep {
  const revisions: Revision[] = [];
  const formats: FormatRevision[] = [];
  const blocks: BlockRevision[] = [];
  const kept: Kept[] = [];
  const keep = (tag: string, body: string) => {
    const id = `k${kept.length}`;
    kept.push({ id, author: who(tag), time: attr(tag, "w:date"), body });
    return id;
  };
  let xml = source;

  // Table rows inserted or deleted, and table formatting changes: a comment on the row's (or table's) first paragraph.
  const anchors: { at: number; id: string }[] = [];
  for (const m of xml.matchAll(/<w:tr\b[^>]*>[\s\S]*?<\/w:tr>/g)) {
    const trPr = /<w:trPr>([\s\S]*?)<\/w:trPr>/.exec(m[0])?.[1] ?? "";
    const ins = /<w:ins\b[^>]*\/>/.exec(trPr)?.[0];
    const del = /<w:del\b[^>]*\/>/.exec(trPr)?.[0];
    const fmt = /<w:(?:trPrChange|tcPrChange)\b[^>]*>/.exec(m[0])?.[0];
    if (ins) anchors.push({ at: m.index!, id: keep(ins, `Row inserted by ${who(ins)}.`) });
    else if (del) anchors.push({ at: m.index!, id: keep(del, `Row deleted by ${who(del)}.`) });
    else if (fmt) anchors.push({ at: m.index!, id: keep(fmt, `Table formatting changed by ${who(fmt)}.`) });
  }
  for (const m of xml.matchAll(/<w:(?:tblPrChange|tblGridChange)\b[^>]*>/g)) anchors.push({ at: m.index!, id: keep(m[0], `Table formatting changed by ${who(m[0])}.`) });
  for (const a of anchors.sort((x, y) => y.at - x.at)) xml = anchorFrom(xml, a.at, a.id);

  xml = xml.replace(/<w:p\b([^>]*?)(\/>|>([\s\S]*?)<\/w:p>)/g, (whole, open: string, end: string, inner: string | undefined) => {
    if (end === "/>" || inner == null) return whole;
    let body = inner;
    const pPr = /^\s*<w:pPr>[\s\S]*?<\/w:pPr>/.exec(body)?.[0] ?? "";
    // A move keeps the text where it went, as Word shows it, with a comment there; the text it left goes.
    const movedAway = /<w:moveFrom\b/.test(pPr);
    body = body.replace(/<w:moveFrom\b[^>]*?(?:\/>|>[\s\S]*?<\/w:moveFrom>)/g, (t) => (t.endsWith("/>") ? t : ""));
    if (movedAway && !/<w:(?:t|delText)\b/.test(body.slice(pPr.length))) return "";
    body = body.replace(/<w:moveTo\b([^>]*?)(?:\/>|>([\s\S]*?)<\/w:moveTo>)/g, (t, a: string, content: string | undefined) => {
      if (content == null) return t;
      const id = keep(a, `Moved by ${who(a)}.`);
      return run(`${C_START}${id}${SEP}`) + content + run(`${C_END}${id}${SEP}`);
    });
    // Formatting changes are formatting suggestions: a paragraph's old style, and each run's old emphasis.
    let start = "";
    const pChange = /<w:pPrChange\b([^>]*?)(?:\/>|>([\s\S]*?)<\/w:pPrChange>)/.exec(pPr);
    if (pChange) {
      blocks.push({ id: attr(pChange[1]!, "w:id"), author: who(pChange[1]!), time: attr(pChange[1]!, "w:date"), ...oldBlock(pChange[2] ?? "") });
      start = run(`${P_FMT}${blocks.length - 1}${SEP}`);
    }
    body = pPr + body.slice(pPr.length).replace(/<w:r\b[^>]*>[\s\S]*?<\/w:r>/g, (r) => {
      const c = /<w:rPrChange\b([^>]*?)(?:\/>|>([\s\S]*?)<\/w:rPrChange>)/.exec(r);
      if (!c) return r;
      formats.push({ id: attr(c[1]!, "w:id"), author: who(c[1]!), time: attr(c[1]!, "w:date"), old: oldMarks(c[2] ?? "") });
      return run(`${FMT}${formats.length - 1}${SEP}`) + r + run(FMT_END);
    });
    // An inserted or deleted paragraph mark: the boundary after this paragraph.
    const mark = /<w:rPr>[\s\S]*?<\/w:rPr>/.exec(pPr)?.[0] ?? "";
    const pm = /<w:(ins|del)\b[^>]*\/>/.exec(mark);
    let after = "";
    if (pm) {
      revisions.push({ kind: pm[1] === "ins" ? "insertion" : "deletion", id: attr(pm[0], "w:id"), author: who(pm[0]), time: attr(pm[0], "w:date") });
      after = run(`${PARA}${revisions.length - 1}${SEP}`);
    }
    return `<w:p${open}>${pPr}${start}${body.slice(pPr.length)}${after}</w:p>`;
  });

  xml = xml.replace(/<w:(ins|del)\b([^>]*?)(\/>|>([\s\S]*?)<\/w:\1>)/g, (whole, kind: string, a: string, end: string, content: string | undefined) => {
    if (end === "/>" || content == null) return whole;
    revisions.push({ kind: kind === "ins" ? "insertion" : "deletion", id: attr(a, "w:id"), author: who(a), time: attr(a, "w:date") });
    const text = kind === "del" ? content.replace(/<w:delText\b/g, "<w:t").replace(/<\/w:delText>/g, "</w:t>") : content;
    return run(`${REV}${revisions.length - 1}${SEP}`) + text + run(REV_END);
  });

  xml = xml
    .replace(/<w:commentRangeStart\b[^>]*?w:id="(\d+)"[^>]*\/>/g, (_, id: string) => run(`${C_START}w${id}${SEP}`))
    .replace(/<w:commentRangeEnd\b[^>]*?w:id="(\d+)"[^>]*\/>/g, (_, id: string) => run(`${C_END}w${id}${SEP}`));
  return { xml, revisions, formats, blocks, kept };
}

interface WordComment extends CommentReply {
  wid: string;
  paraId: string;
  parent?: string;
  done: boolean;
}

/** Word's comments (`comments.xml`) with their threads and resolved state (`commentsExtended.xml`). */
export function readWordComments(commentsXml: string | null, extendedXml: string | null): WordComment[] {
  if (!commentsXml) return [];
  const out: WordComment[] = [];
  for (const m of commentsXml.matchAll(/<w:comment\b([^>]*)>([\s\S]*?)<\/w:comment>/g)) {
    const paras = [...m[2]!.matchAll(/<w:p\b([^>]*)>([\s\S]*?)<\/w:p>/g)];
    const body = paras.map((p) => [...p[2]!.matchAll(/<w:t\b[^>]*>([^<]*)<\/w:t>/g)].map((t) => unescape(t[1]!)).join("")).join("\n");
    const wid = attr(m[1]!, "w:id");
    out.push({ wid, id: `c-w${wid}`, author: who(m[1]!), created: attr(m[1]!, "w:date"), body, paraId: paras.length ? attr(paras.at(-1)![1]!, "w14:paraId") : "", done: false });
  }
  const byPara = new Map(out.filter((c) => c.paraId).map((c) => [c.paraId, c]));
  for (const m of (extendedXml ?? "").matchAll(/<w15:commentEx\b([^>]*)\/>/g)) {
    const c = byPara.get(attr(m[1]!, "w15:paraId"));
    if (!c) continue;
    c.done = attr(m[1]!, "w15:done") === "1";
    const parent = byPara.get(attr(m[1]!, "w15:paraIdParent"));
    if (parent && parent !== c) c.parent = parent.wid;
  }
  return out;
}

type Mark = NonNullable<JSONContent["marks"]>[number];

/**
 * Turns the markers into suggestions and comments. Returns the content and the comment threads, each thread's
 * quote being the text it was anchored on.
 */
export function applyReview(content: JSONContent, prep: ReviewPrep, word: WordComment[]): { content: JSONContent; comments: CommentThread[] } {
  const byWid = new Map(word.map((c) => [c.wid, c]));
  const root = (c: WordComment): WordComment => {
    const seen = new Set<string>();
    while (c.parent && byWid.has(c.parent) && !seen.has(c.wid)) {
      seen.add(c.wid);
      c = byWid.get(c.parent)!;
    }
    return c;
  };
  const threadOf = (marker: string): string | null => {
    if (marker.startsWith("k")) return prep.kept.some((k) => k.id === marker) ? `c-${marker}` : null;
    const c = byWid.get(marker.slice(1));
    return c ? root(c).id : null;
  };
  const quotes = new Map<string, string>();
  let rev: Revision | null = null;
  const open = new Set<string>();
  let pending: Revision | null = null;
  let fmt: FormatRevision | null = null;
  let block: BlockRevision | null = null;
  const takeBlock = (): BlockRevision | null => {
    const b = block;
    block = null;
    return b;
  };
  const revMark = (r: Revision): Mark => ({ type: r.kind, attrs: { id: `s-w${r.id}`, author: r.author, time: r.time } });
  const READ = new Set(["bold", "italic", "strike", "superscript", "subscript"]);
  const sig = (marks: MarkJSON[]) => marks.filter((m) => READ.has(m.type)).map((m) => m.type).sort().join(",");

  const inline = (nodes: JSONContent[]): JSONContent[] => {
    const out: JSONContent[] = [];
    for (const n of nodes) {
      if (n.type !== "text") {
        out.push(n.content ? { ...n, content: walk(n.content) } : n);
        continue;
      }
      const text = n.text ?? "";
      let last = 0;
      const emit = (s: string) => {
        if (!s) return;
        const marks: Mark[] = [...(n.marks ?? [])];
        if (rev) marks.push(revMark(rev));
        // Only what P-Doc reads from Word can be told apart: a change to anything else shows as no change.
        else if (fmt && sig(fmt.old) !== sig(marks as MarkJSON[])) marks.push({ type: "formatChange", attrs: { id: `s-w${fmt.id}`, author: fmt.author, time: fmt.time, old: [...(n.marks ?? []).filter((m) => !READ.has(m.type) && m.type !== "link" && m.type !== "code"), ...fmt.old] } });
        for (const id of open) {
          marks.push({ type: "comment", attrs: { id } });
          quotes.set(id, (quotes.get(id) ?? "") + s);
        }
        out.push({ ...n, text: s, ...(marks.length ? { marks } : { marks: undefined }) });
      };
      for (const m of text.matchAll(MARKERS)) {
        emit(text.slice(last, m.index));
        last = m.index! + m[0].length;
        if (m[1] != null) rev = prep.revisions[Number(m[1])] ?? null;
        else if (m[0] === REV_END) rev = null;
        else if (m[2] != null) {
          const t = threadOf(m[2]);
          if (t) open.add(t);
        } else if (m[3] != null) {
          const t = threadOf(m[3]);
          if (t) open.delete(t);
        } else if (m[4] != null) pending = prep.revisions[Number(m[4])] ?? null;
        else if (m[5] != null) fmt = prep.formats[Number(m[5])] ?? null;
        else if (m[0] === FMT_END) fmt = null;
        else if (m[6] != null) block = prep.blocks[Number(m[6])] ?? null;
      }
      emit(text.slice(last));
    }
    return out.filter((n) => n.type !== "text" || n.text);
  };

  const walk = (blocks: JSONContent[]): JSONContent[] =>
    blocks.map((b) => {
      const isText = b.type === "paragraph" || b.type === "heading" || b.type === "codeBlock";
      let next: JSONContent = b;
      if (isText && pending) {
        const r: Revision = pending;
        pending = null;
        next = { ...b, attrs: { ...b.attrs, [r.kind === "insertion" ? "split" : "join"]: { id: `s-w${r.id}`, author: r.author, time: r.time } } };
      }
      if (!next.content) return next;
      if (!isText) return { ...next, content: walk(next.content) };
      takeBlock();
      const content = inline(next.content);
      const b0 = takeBlock();
      if (!b0) return { ...next, content };
      const attrs: Record<string, unknown> = { ...next.attrs };
      const now = { type: next.type, level: next.type === "heading" ? Number(attrs.level ?? 1) : null, textStyle: attrs.textStyle ?? null, textAlign: attrs.textAlign ?? null };
      const was = { type: b0.type, level: b0.level, textStyle: b0.textStyle, textAlign: b0.textAlign ?? now.textAlign };
      if (JSON.stringify(now) === JSON.stringify(was)) return { ...next, content };
      const oldAttrs: Record<string, unknown> = { ...attrs, textStyle: was.textStyle, textAlign: was.textAlign };
      delete oldAttrs.split;
      delete oldAttrs.join;
      delete oldAttrs.formatChange;
      delete oldAttrs.id;
      if (was.type === "heading") oldAttrs.level = was.level;
      else delete oldAttrs.level;
      return { ...next, content, attrs: { ...attrs, formatChange: { id: `s-w${b0.id}`, author: b0.author, time: b0.time, old: { type: was.type, attrs: oldAttrs } } } };
    });

  const result = { ...content, content: walk(content.content ?? []) };
  const comments: CommentThread[] = [];
  for (const c of word.filter((w) => !w.parent || !byWid.has(w.parent))) {
    const replies = word.filter((w) => w !== c && root(w) === c).map(({ id, author, created, body }) => ({ id, author, created, body }));
    comments.push({ id: c.id, author: c.author, created: c.created, body: c.body, resolved: c.done, quote: quotes.get(c.id) ?? "", replies });
  }
  for (const k of prep.kept) comments.push({ id: `c-${k.id}`, author: k.author, created: k.time, body: k.body, resolved: false, quote: quotes.get(`c-${k.id}`) ?? "", replies: [] });
  return { content: result, comments };
}

/** Removes any marker left in text (inside parts `applyReview` doesn't reach). */
export const stripMarkers = (s: string) => s.replace(MARKERS, "");
