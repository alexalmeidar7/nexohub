import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTheme } from "next-themes";
import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const PORTAL_ID = "nexo-sonner-portal";

function getPortalNode(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  let node = document.getElementById(PORTAL_ID);
  if (!node) {
    node = document.createElement("div");
    node.id = PORTAL_ID;
    // Container fixo no topo do <body>, fora de qualquer stacking context de Radix.
    node.style.position = "fixed";
    node.style.inset = "0";
    node.style.pointerEvents = "none";
    node.style.zIndex = "2147483647";
    document.body.appendChild(node);
  }
  return node;
}

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();
  const [portalNode, setPortalNode] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setPortalNode(getPortalNode());
    // Reanexa ao body caso alguém remova (ex: navegação de rota resetando DOM)
    const interval = setInterval(() => {
      const current = document.getElementById(PORTAL_ID);
      if (!current || current.parentElement !== document.body) {
        setPortalNode(getPortalNode());
      }
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  const toasterEl = (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      style={{ zIndex: 2147483647, pointerEvents: "auto" } as React.CSSProperties}
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );

  if (!portalNode) return null;
  return createPortal(toasterEl, portalNode);
};

export { Toaster, toast };
