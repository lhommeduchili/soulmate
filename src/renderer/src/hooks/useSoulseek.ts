import { useState, useEffect } from "react";

export function useSoulseek() {
  const [isConnected, setIsConnected] = useState(false);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let mounted = true;

    const checkStatus = async () => {
      try {
        const status = await window.api.slskd.status();
        // Check if state is Connected or LoggedIn
        // Slskd /application returns { server: { state: 'Connected, LoggedIn', isLoggedIn: true } }
        const connected =
          status.server?.isLoggedIn ||
          status.server?.state?.includes("Connected") ||
          status.state === "Connected";

        if (mounted) {
          const isConn = !!connected;
          setIsConnected(isConn);
          if (isConn) {
            setIsReady(true);
          }
        }
      } catch (_e) {
        if (mounted) {
          setIsConnected(false);
        }
      }
    };

    checkStatus();
    const interval = setInterval(checkStatus, 1000);

    // Safety fallback: allow workspace interaction if network/daemon handshake is slow
    const timeout = setTimeout(() => {
      if (mounted) {
        setIsReady(true);
      }
    }, 4000);

    return () => {
      mounted = false;
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, []);

  return { isConnected, isReady };
}
