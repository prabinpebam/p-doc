import { createRoot } from "react-dom/client";
import "@p-doc/tokens/tokens.css";
import "./styles/app.css";
import "./styles/primitives.css";
import "./styles/page.css";
import { App } from "./App.tsx";
import { getEditor } from "./session.ts";
import { setFocusHome } from "./ui/foundations/home.ts";

setFocusHome({
  owns: (el) => !!getEditor()?.view.dom.contains(el),
  focus: () => getEditor()?.view.focus(),
});

createRoot(document.getElementById("root")!).render(<App />);
