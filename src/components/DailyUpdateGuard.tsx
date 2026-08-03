import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";

/**
 * Global component that triggers a page reload every day at 3 AM.
 * This ensures all active sessions are running the latest version of the app.
 */
export default function DailyUpdateGuard() {
  const { user } = useAuth();

  useEffect(() => {
    // Only apply for logged-in users
    if (!user) return;

    const checkAndUpdate = () => {
      const now = new Date();
      const hours = now.getHours();
      const minutes = now.getMinutes();

      // Check if it's exactly 3:00 AM (or 3:01 to be safe)
      if (hours === 3 && minutes === 0) {
        console.log("Daily update: Reloading application at 3:00 AM...");
        window.location.reload();
      }
    };

    // Check every minute
    const interval = setInterval(checkAndUpdate, 60000);
    
    // Also check immediately on mount
    checkAndUpdate();

    return () => clearInterval(interval);
  }, [user]);

  return null;
}
