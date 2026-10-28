/** The page area (V4): the grey canvas and the page with the live editor, laid out as sheets in Pages mode. */
import { useEffect, type CSSProperties } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import { headerFooterText, styleCss, TEXT_WIDTH, CSS_PX_PER_INCH, type PDocFile } from "@p-doc/core";
import { editorExtensions, insertImageFiles } from "../editor/setup.ts";
import { jumpToBlock } from "../editor/blocks.ts";
import { geometry, pageLayout, setPageSetup, type Layout } from "../editor/pages.ts";
import { attachEditor, changed, detachEditor, getEditor } from "../session.ts";
import { app, openDialog, toast } from "../state.ts";
import { FindBar } from "./FindBar.tsx";

/** The first page's header and the last page's footer; the ones between are drawn by sheet breaks. */
function HfOverlay({ cls, which, page, pages }: { cls: string; which: "header" | "footer"; page: number; pages: number }) {
  const p = app.use((s) => s.doc?.page);
  if (!p) return null;
  return (
    <div className={`${cls} pd-hf`} data-hf={which} data-page={page} data-align={which === "header" ? p.headerAlign : p.footerAlign}>
      <span className="pd-hf-text">{headerFooterText(p, which, page, pages)}</span>
    </div>
  );
}

let tickQueued = false;
/** Views that follow the content re-render at most once a frame. */
export function bumpTick(): void {
  if (tickQueued) return;
  tickQueued = true;
  requestAnimationFrame(() => {
    tickQueued = false;
    app.set((s) => ({ tick: s.tick + 1 }));
  });
}

const tooLarge = () => toast("This image is larger than 2 MB. Make it smaller and try again.", { tone: "error" });

function DocEditor({ doc }: { doc: PDocFile }) {
  const author = app.use((s) => s.settings?.identity.name ?? "Me");
  const spelling = app.use((s) => s.settings?.spelling ?? true);
  const editor = useEditor(
    {
      extensions: editorExtensions({ author, onImageTooLarge: tooLarge }),
      content: doc.content,
      immediatelyRender: true,
      shouldRerenderOnTransaction: false,
      editorProps: {
        attributes: { class: "pd-content", "aria-label": "Document", spellcheck: String(spelling) },
        handleDOMEvents: {
          click(view, event) {
            const a = (event.target as HTMLElement).closest("a");
            if (!a) return false;
            const href = a.getAttribute("href") ?? "";
            if (a.closest(".pd-toc") && href.startsWith("#")) {
              event.preventDefault();
              const id = href.slice(1);
              let index = -1;
              view.state.doc.forEach((b, _o, i) => {
                if (b.type.name === "heading" && b.attrs.id === id) index = i;
              });
              const e = getEditor();
              if (e && index >= 0) jumpToBlock(e, index);
              return true;
            }
            if (event.ctrlKey && /^https:\/\//i.test(href)) {
              event.preventDefault();
              void window.pdoc.app.openExternal(href);
              return true;
            }
            event.preventDefault();
            return false;
          },
        },
      },
      onCreate: ({ editor }) => {
        attachEditor(editor);
        bumpTick();
      },
      onUpdate: ({ transaction }) => {
        if (transaction.getMeta("pdoc-toc")) return;
        changed();
      },
      onTransaction: () => bumpTick(),
    },
    [],
  );

  useEffect(() => {
    if (editor && !editor.isDestroyed) editor.view.dom.setAttribute("spellcheck", String(spelling));
  }, [editor, spelling]);

  useEffect(() => {
    if (!editor) return;
    // Focus the page at once: a new document is ready for typing (U1).
    requestAnimationFrame(() => editor.isDestroyed || editor.commands.focus("start"));
    return () => detachEditor(editor);
  }, [editor]);

  return <EditorContent editor={editor} className="pd-editor" />;
}

function pageStyle(doc: PDocFile, layout: Layout | null): CSSProperties {
  const p = doc.page;
  const px = (inches: number) => `${Math.round(inches * CSS_PX_PER_INCH)}px`;
  const pageless = p.mode === "pageless";
  const tw = TEXT_WIDTH[p.textWidth];
  const g = geometry(p);
  const span = layout ? layout.sheets.reduce((n, s) => n + s.span, 0) : 1;
  return {
    "--page-width": pageless ? (tw ? `${tw + 2 * CSS_PX_PER_INCH * 0.5}px` : "100%") : `${g.width}px`,
    "--page-height": pageless ? "auto" : `${g.height}px`,
    "--page-pad-top": pageless ? px(0.5) : `${g.top}px`,
    "--page-pad-bottom": pageless ? px(0.5) : `${g.bottom}px`,
    "--page-pad-left": pageless ? px(0.5) : `${g.left}px`,
    "--page-pad-right": pageless ? px(0.5) : `${g.right}px`,
    "--page-color": p.color,
    "--doc-font": doc.styles.normal.fontFamily,
    "--sheets": layout?.sheets.length ?? 1,
    "--fill-height": `${span * g.content}px`,
  } as CSSProperties;
}

export function PageArea() {
  const doc = app.use((s) => s.doc);
  const session = app.use((s) => s.session);
  const zoom = app.use((s) => s.settings?.zoom ?? 100);
  const layout = pageLayout.use((s) => s.layout);
  const page = doc?.page ?? null;
  useEffect(() => setPageSetup(page), [page]);
  if (!doc) return <main className="canvas" aria-busy="true" />;
  const p = doc.page;
  const paged = p.mode === "pages";
  const shown = paged ? layout : null;
  return (
    <main className="canvas" data-region aria-label="Page">
      <FindBar />
      <div
        className="page-scroll"
        onMouseDown={(e) => {
          // A click on the grey canvas below the text puts the cursor at the end, as on paper.
          if (e.target === e.currentTarget) {
            e.preventDefault();
            getEditor()?.commands.focus("end");
          }
        }}
      >
        <style>{styleCss(doc.styles, ".page .pd-content")}</style>
        <div className="page-stack" style={{ zoom: zoom / 100 }}>
          <article
            className={`page${paged ? " paged" : " pageless"}`}
            style={pageStyle(doc, shown)}
            data-testid="page"
            data-pages={shown?.pages}
            onDoubleClick={(e) => {
              if ((e.target as HTMLElement).closest("[data-hf]")) {
                e.preventDefault();
                openDialog({ kind: "headerFooter" });
              }
            }}
          >
            {shown && <HfOverlay cls="page-head" which="header" page={1} pages={shown.pages} />}
            <DocEditor key={session} doc={doc} />
            {shown && <HfOverlay cls="page-foot" which="footer" page={shown.pages} pages={shown.pages} />}
          </article>
        </div>
      </div>
      <input
        id="image-file"
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp,image/bmp,image/svg+xml"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          const ed = getEditor();
          if (f && ed) void insertImageFiles(ed.view, [f], null, tooLarge).then(() => ed.commands.focus());
          e.target.value = "";
        }}
      />
    </main>
  );
}
