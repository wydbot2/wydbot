import { useEffect, useState } from 'react';
import { getWydAPI } from '../lib/electron-api';

export const useAppVersion = (): string => {
  const [version, setVersion] = useState<string>('');

  useEffect(() => {
    let cancelled = false;
    getWydAPI()
      ?.getAppVersion()
      .then((v) => {
        if (!cancelled) setVersion(v);
      })
      .catch(() => {
        if (!cancelled) setVersion('');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return version;
};
