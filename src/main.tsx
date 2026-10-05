import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// Register the service worker for built/deployed copies only. During `npm run dev`
// we skip it so the live preview never serves a stale shell (a stale shell was one
// of the reasons the engine appeared to "hang forever" in development).
// Update is versioned via sw.js CACHE name; old caches are purged on activate.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    // Relative to the page, so the worker is found and scoped correctly
    // whether the app sits at the root or in a sub-folder.
    const base = new URL(".", window.location.href);
    navigator.serviceWorker
      .register(new URL("sw.js", base), { scope: base.pathname })
      .catch(() => {});
  });
}
