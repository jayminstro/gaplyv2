import { Toaster as Sonner, ToasterProps } from "sonner";

const Toaster = ({ ...props }: ToasterProps) => {
  // Use system theme detection for React app
  const theme = "dark"; // Fixed for mobile app which uses dark theme

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      style={
        {
          "--normal-bg": "rgba(30, 41, 59, 0.95)",
          "--normal-text": "white",
          "--normal-border": "rgba(71, 85, 105, 0.3)",
          "--success-bg": "rgba(16, 185, 129, 0.9)",
          "--success-text": "white",
          "--error-bg": "rgba(239, 68, 68, 0.9)",
          "--error-text": "white",
          "--warning-bg": "rgba(245, 158, 11, 0.9)",
          "--warning-text": "white",
          "--info-bg": "rgba(59, 130, 246, 0.9)",
          "--info-text": "white",
        } as React.CSSProperties
      }
      toastOptions={{
        className: "ios-toast",
        style: {
          background: 'var(--normal-bg)',
          border: '1px solid var(--normal-border)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          color: 'var(--normal-text)',
          borderRadius: '12px',
          fontSize: '14px',
          fontWeight: '500',
          lineHeight: '1.4',
          padding: '12px 16px',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.25), 0 1px 3px rgba(0, 0, 0, 0.1)',
          minHeight: '48px',
          display: 'flex',
          alignItems: 'center',
          maxWidth: '350px',
          width: 'calc(100vw - 32px)',
          margin: '0 auto',
          position: 'relative',
          zIndex: 9999,
        },
        ...props.toastOptions,
      }}
      {...props}
    />
  );
};

export { Toaster };
