/** Insert > Bookmark… (U52, spec §4.12): names the caret's place; with a bookmark selected, renames or removes it. */
import { useState } from "react";
import { bookmarkAt, removeBookmark, setBookmark, suggestedBookmarkName } from "../../editor/refs.ts";
import { getEditor } from "../../session.ts";
import { closeDialog } from "../../state.ts";
import { Dialog } from "../components/Dialog.tsx";

export function BookmarkDialog() {
  const e = getEditor();
  const [initial] = useState(() => (e ? (bookmarkAt(e.state) ?? { pos: -1, name: suggestedBookmarkName(e.state) }) : null));
  const [name, setName] = useState(initial?.name ?? "");
  const [error, setError] = useState<string | null>(null);
  if (!e || !initial) return null;
  const existing = initial.pos >= 0;
  const apply = () => {
    const v = name.trim();
    if (!v) return setError("Enter a name for the bookmark.");
    closeDialog();
    setBookmark(e, v);
  };
  return (
    <Dialog
      title="Bookmark"
      onClose={closeDialog}
      onSubmit={apply}
      actions={
        <>
          {existing ? (
            <button
              type="button"
              className="btn subtle"
              onClick={() => {
                closeDialog();
                removeBookmark(e);
              }}
            >
              Remove bookmark
            </button>
          ) : null}
          <span className="fill" />
          <button type="button" className="btn" onClick={closeDialog}>
            Cancel
          </button>
          <button type="submit" className="btn primary">
            Apply
          </button>
        </>
      }
    >
      <label className="form-row">
        <span>Name</span>
        <input
          className="field"
          data-autofocus
          value={name}
          aria-invalid={!!error}
          aria-describedby={error ? "bookmark-error" : undefined}
          onChange={(ev) => {
            setName(ev.target.value);
            setError(null);
          }}
        />
      </label>
      {error ? (
        <p id="bookmark-error" className="form-error" role="alert">
          {error}
        </p>
      ) : null}
    </Dialog>
  );
}