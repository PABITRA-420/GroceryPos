import { useEffect, useState } from 'react';
import { isTauriEnvironment, tauriService } from '../services/tauriService';
import type { SystemInfo } from '../types';

export function useTauriBridge() {
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isNative, setIsNative] = useState<boolean>(false);

  useEffect(() => {
    let isMounted = true;

    async function loadInfo() {
      setIsNative(isTauriEnvironment());
      try {
        const info = await tauriService.getSystemInfo();
        if (isMounted) {
          setSystemInfo(info);
          setIsLoading(false);
        }
      } catch (err) {
        if (isMounted) {
          console.error('Error fetching system info:', err);
          setIsLoading(false);
        }
      }
    }

    loadInfo();

    return () => {
      isMounted = false;
    };
  }, []);

  return {
    systemInfo,
    isLoading,
    isNative,
  };
}
