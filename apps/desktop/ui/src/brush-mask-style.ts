const style = document.createElement("style");
style.textContent = `
.brush-mask-overlay,.brush-mask-data{position:absolute;z-index:40;pointer-events:auto;touch-action:none;max-width:none;max-height:none;transform:none;box-shadow:none;}
.brush-mask-data{display:none!important;}
.brush-mask-panel{position:fixed;z-index:2000;right:370px;top:68px;width:300px;max-height:calc(100vh - 100px);overflow:auto;background:rgba(25,27,30,.97);border:1px solid #3a3e44;border-radius:8px;box-shadow:0 18px 60px rgba(0,0,0,.55);padding:12px;color:#dfe2e6;font:10px Inter,system-ui,sans-serif;}
.brush-mask-title{display:flex;align-items:center;justify-content:space-between;padding-bottom:10px;border-bottom:1px solid #34373c;font-size:11px;letter-spacing:.7px;}
.brush-mask-title button{border:0;background:transparent;color:#aeb3ba;font-size:18px;width:26px;height:26px;border-radius:4px;}
.brush-mask-title button:hover{background:#2b2e32;color:#fff;}
.brush-mask-tools{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin:10px 0;}
.brush-mask-tools button{padding:7px 4px;border:1px solid #3a3e44;border-radius:4px;background:#202226;color:#c8ccd2;font-size:9px;}
.brush-mask-tools button:hover{background:#2b2e32;color:#fff;}
.brush-mask-section{padding:9px 0 12px;border-bottom:1px solid #34373c;}
.brush-mask-section h4{margin:0 0 9px;color:#8e949c;font-size:9px;letter-spacing:.8px;font-weight:600;}
.brush-control-row{display:grid;grid-template-columns:78px 1fr 38px;gap:7px;align-items:center;min-height:27px;}
.brush-control-row label{color:#aeb3ba;font-size:9px;}
.brush-control-row input{width:100%;accent-color:#c8ccd2;}
.brush-control-row span{text-align:right;color:#dfe2e6;font-size:9px;}
.brush-mask-cursor{position:fixed;z-index:3000;pointer-events:none;border:1px solid rgba(255,255,255,.9);border-radius:50%;box-shadow:0 0 0 1px rgba(0,0,0,.55);transform:translate(-50%,-50%);}
`;
document.head.appendChild(style);
