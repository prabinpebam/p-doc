import { createRoot } from "react-dom/client";
import "@p-doc/tokens/tokens.css";
import "./styles/app.css";
import "./styles/page.css";
import { App } from "./App.tsx";

createRoot(document.getElementById("root")!).render(<App />);
