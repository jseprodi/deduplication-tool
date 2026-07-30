import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { EnvProvider } from "./lib/context.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <EnvProvider>
      <App />
    </EnvProvider>
  </StrictMode>
);
