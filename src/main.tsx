import React from "react";
import ReactDOM from "react-dom/client";
import { ThemeProvider, CssBaseline } from "@mui/material";
import { HashRouter } from "react-router-dom";
import { theme } from "./theme";
import App from "./App";
import { AnalyticsTracker } from "./analytics";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <HashRouter>
        <AnalyticsTracker />
        <App />
      </HashRouter>
    </ThemeProvider>
  </React.StrictMode>,
);
