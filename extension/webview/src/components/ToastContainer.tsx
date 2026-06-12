import { useAppStore } from "../stores/appStore";

const colors: Record<string, string> = {
  info: "var(--vscode-button-background)",
  success: "#16a34a",
  warning: "#ca8a04",
  error: "#dc2626",
};

export function ToastContainer() {
  const { notifications, removeNotification } = useAppStore();

  if (notifications.length === 0) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: 16,
        right: 16,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        zIndex: 1000,
      }}
    >
      {notifications.map((toast) => (
        <div
          key={toast.id}
          style={{
            padding: "8px 12px",
            borderRadius: 4,
            backgroundColor: colors[toast.type] || colors.info,
            color: "#fff",
            boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
            cursor: "pointer",
            maxWidth: 320,
          }}
          onClick={() => removeNotification(toast.id)}
        >
          {toast.message}
        </div>
      ))}
    </div>
  );
}
