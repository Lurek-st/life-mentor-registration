import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { LanguageProvider } from "./language";
import LoadBoundary from "./LoadBoundary";
import "./styles.css";
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <LoadBoundary>
      <LanguageProvider>
        <App />
      </LanguageProvider>
    </LoadBoundary>
  </React.StrictMode>,
);
