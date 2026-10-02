import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@/ui/index.css";
import { App } from "@/ui/app/App";

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("index.html has no #root element");

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
