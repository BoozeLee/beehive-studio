import { useState, useEffect } from "react";
import { listPlugins, type PluginMetadata, installPlugin } from "../../api/mixhiveBridge";

export function PluginMarketplace() {
  const [plugins, setPlugins] = useState<PluginMetadata[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [installing, setInstalling] = useState<string | null>(null);

  useEffect(() => {
    fetchPlugins();
  }, []);

  const fetchPlugins = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await listPlugins();
      setPlugins(data);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleInstall = async (pluginId: string) => {
    setInstalling(pluginId);
    try {
      await installPlugin(pluginId);
      alert(`Plugin installed!`);
    } catch (err) {
      alert(`Failed to install plugin: ${err}`);
    } finally {
      setInstalling(null);
    }
  };

  if (loading) return <div style={{ padding: 8 }}>Loading marketplace...</div>;
  if (error) return <div style={{ padding: 8, color: "red" }}>Error: {error}</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: 8 }}>
      <h3 style={{ margin: 0, color: "var(--jb-text)" }}>WASM Plugin Marketplace</h3>
      <button onClick={fetchPlugins} className="jetbee-toolbtn" style={{ alignSelf: "flex-start" }}>
        Refresh
      </button>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {plugins.length === 0 ? (
          <div style={{ fontSize: 12, opacity: 0.7 }}>No plugins found.</div>
        ) : (
          plugins.map((plugin) => (
            <div
              key={plugin.id}
              style={{
                border: "1px solid var(--jb-border)",
                borderRadius: 4,
                padding: 8,
                background: "var(--jb-surface-1)"
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontWeight: "bold", fontSize: 14 }}>{plugin.name}</div>
                  <div style={{ fontSize: 12, opacity: 0.8 }}>by {plugin.author}</div>
                </div>
                <div style={{ fontSize: 12, background: "var(--jb-surface-2)", padding: "2px 4px", borderRadius: 2 }}>
                  {plugin.category}
                </div>
              </div>
              <p style={{ fontSize: 12, margin: "8px 0", opacity: 0.9 }}>{plugin.description}</p>
              
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontSize: 12, color: "var(--jb-primary)" }}>
                  {"Free" in plugin.price ? "Free" : "Paid"}
                </div>
                <button
                  className="jetbee-toolbtn"
                  onClick={() => handleInstall(plugin.id)}
                  disabled={installing === plugin.id}
                >
                  {installing === plugin.id ? "Installing..." : "Install"}
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
