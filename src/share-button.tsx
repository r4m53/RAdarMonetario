import { useState } from "react";
import { Fab, Snackbar } from "@mui/material";
import { Share } from "@mui/icons-material";
import { trackEvent } from "./analytics-events";

export function ShareButton() {
  const [message, setMessage] = useState("");
  const share = async () => {
    const url = window.location.href;
    const module = window.location.hash.split(/[/?]/)[1] || "inicio";
    if (navigator.share) {
      try {
        await navigator.share({ title: document.title, text: "Consulta esta vista en Radar Monetario.", url });
        trackEvent("share_view", { module, method: "native", page_path: window.location.hash });
        return;
      } catch (error) {
        if ((error as DOMException).name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setMessage("Enlace copiado");
      trackEvent("share_view", { module, method: "clipboard", page_path: window.location.hash });
    } catch {
      setMessage("No fue posible copiar el enlace");
    }
  };
  return <><Fab color="primary" variant="extended" onClick={share} aria-label="Compartir esta vista" sx={{position:"fixed",right:{xs:16,md:28},bottom:{xs:56,md:44},zIndex:1200}}><Share sx={{mr:1}}/>Compartir</Fab><Snackbar open={Boolean(message)} autoHideDuration={2500} onClose={() => setMessage("")} message={message}/></>;
}
