import { useState } from "react";

export default function AlertSettings() {
  const [notifyHigh, setNotifyHigh] = useState(true);
  const [notifyMed, setNotifyMed] = useState(false);
  const [browserPush, setBrowserPush] = useState(true);
  const [audioPing, setAudioPing] = useState(false);

  return (
    <div className="glass-card">
      <h2>Alert Settings</h2>
      <div className="settings-list">
        
        <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", lineHeight: "1.4", marginBottom: "0.4rem" }}>
          Configure forecast warnings and threshold alerts for Delhi-NCR receptor limits.
        </p>

        <div className="settings-item">
          <span>Alert on High Risk (AQI &gt; 200)</span>
          <label className="toggle-switch">
            <input 
              type="checkbox" 
              checked={notifyHigh} 
              onChange={() => setNotifyHigh(!notifyHigh)} 
            />
            <span className="toggle-slider"></span>
          </label>
        </div>

        <div className="settings-item">
          <span>Alert on Moderate Risk (AQI &gt; 100)</span>
          <label className="toggle-switch">
            <input 
              type="checkbox" 
              checked={notifyMed} 
              onChange={() => setNotifyMed(!notifyMed)} 
            />
            <span className="toggle-slider"></span>
          </label>
        </div>

        <div className="settings-item">
          <span>Enable Browser Notifications</span>
          <label className="toggle-switch">
            <input 
              type="checkbox" 
              checked={browserPush} 
              onChange={() => setBrowserPush(!browserPush)} 
            />
            <span className="toggle-slider"></span>
          </label>
        </div>

        <div className="settings-item">
          <span>Acoustic Wind/Arrival Ping</span>
          <label className="toggle-switch">
            <input 
              type="checkbox" 
              checked={audioPing} 
              onChange={() => setAudioPing(!audioPing)} 
            />
            <span className="toggle-slider"></span>
          </label>
        </div>

      </div>
    </div>
  );
}
