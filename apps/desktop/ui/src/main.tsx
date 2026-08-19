import React from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

function App() {
  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">AETHERLIGHT <span>2.0</span></div>
        <nav>
          <button className="nav active">LIBRARY</button>
          <button className="nav">DEVELOP</button>
        </nav>
        <div className="actions"><button>Import</button><button>Export</button></div>
      </header>
      <main className="workspace">
        <aside className="leftbar"><div className="tool-title">TOOLS</div><button>Crop</button><button>Heal</button><button>Mask</button><button>Picker</button></aside>
        <section className="canvas"><div className="canvas-empty">Aetherlight 2.0<br/><span>GPU-first RAW photo development</span></div></section>
        <aside className="rightbar">
          <div className="panel-title">ADJUSTMENTS</div>
          <section><h3>BASIC</h3><div className="placeholder">Exposure · Contrast · Highlights · Shadows · Whites · Blacks</div></section>
          <section><h3>COLOR</h3><div className="placeholder">Temperature · Tint · Vibrance · Saturation</div></section>
          <section><h3>CURVES</h3><div className="placeholder">Luma · Red · Green · Blue</div></section>
          <section><h3>DETAIL</h3><div className="placeholder">Sharpening · Noise Reduction</div></section>
          <section><h3>MASKING</h3><div className="placeholder">Brush · Linear · Radial · AI</div></section>
        </aside>
      </main>
      <footer>ENGINE • READY &nbsp; | &nbsp; 0.1.0</footer>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);
