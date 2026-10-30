# P-Doc interaction rules

Cross-cutting rules for the UI, interaction, functionality and behaviour of every feature. Tokens are in [tokens.md](tokens.md) and words in [copy-glossary.md](copy-glossary.md); product rules are in the [spec](../product/spec.md).

## Behaviour contract process (PERMANENT, owner 2026-10-30 14:34)

The owner's words:

> "It's not about me pointing out three things and you fixing those 3 things... It's about having a system where you go through a systematic, deliberate and thorough approach to addressing every aspect of the implementation... The interaction patterns are already established. Refer Figma and MS Word... Make sure no aspect about the UI, interaction, functionality and behaviour is missed."

This applies to every feature: the rectangle first, then polygon, star, line, arrow and every later feature.

1. **Contract.** Write `docs/research/<feature>-behaviour-contract.md`: a matrix with one row per control × input or state, giving the expected behaviour, its Figma or Word source and a test ID. It also has an explicit out-of-scope list, with a reason for each item.
2. **Completeness critic.** An independent critic checks the contract against Figma and Word, section by section, and lists the gaps. The contract is complete only when the critic finds no gaps.
3. **Build and test 1:1.** One test per contract row. A coverage report shows that 100% of in-scope rows pass.
4. **Adversarial review.** An independent reviewer tries the build without seeing the contract. Each difference they find becomes a new row, which is built, tested and reviewed again.
5. **Delivery.** Only then does the owner get a link, with the row count, the pass count and the out-of-scope list.

**Time box.** If a cycle runs past about 45 minutes, deliver the tested subset with a "not yet covered" list.

**Owner fixes.** A fix the owner points out goes into the contract as a row (and through steps 2–5). It is never patched on its own.

## Testing safety (PERMANENT, owner 2026-10-30 15:50)

The owner's words:

> "Do not hijack my mouse or window focus when you are testing."

1. **Headless only.** Automated tests run with `headless: true`, a fresh temporary profile and no visible window. They never move the OS cursor, take focus or raise any window.
2. **No visible browser tools.** The host editor's visible browser tools (`openBrowserPage`, `clickElement`, `dragElement`, `hoverElement`, `typeInPage` and the like) are banned for testing.
3. **Pre-flight.** Before every run the harness checks that no window appears; if one does, the run fails. The result of the check is recorded with the run.
4. **Pointer Lock (number-field scrub), Figma's way.** Request the lock only after a drag passes about 3 px from the press; a plain click never locks. Always release the lock on `pointerup`, Esc, `blur`, `visibilitychange` and `pointercancel`. If a lock is granted after the drag has already ended, release it at once. The lock is never left held, and the cursor reappears where the drag started. Each exit has a test.

The same rule is in the [spec](../product/spec.md).
## Number fields

Every number field follows the PERMANENT number-field rule in the [spec](../product/spec.md#rectangle-document-placement-addendum-owner-root218-2026-10-30-1315) (scrubbing by default, Pointer Lock, arrow steps of 1 and 10, one shared component, a test for each field).
