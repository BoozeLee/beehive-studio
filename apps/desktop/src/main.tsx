import React from "react";
import ReactDOM from "react-dom/client";
import JetBeeApp from "./JetBeeApp";
import "./styles/jetbee-theme.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <JetBeeApp />
  </React.StrictMode>
);
