'use client';

import { App } from 'antd';
import { useCallback } from 'react';

type Tone = 'ok' | 'warn' | 'error';

/**
 * Feedback toasts, on AntD's message API.
 *
 * Deliberately goes through `App.useApp()` rather than the static
 * `message.success()` export: the static form renders outside the
 * ConfigProvider tree and so ignores the studio theme, arriving in AntD's
 * default blue on white.
 */
export function useToast() {
  const { message } = App.useApp();

  return useCallback(
    (text: string, tone: Tone = 'ok') => {
      if (tone === 'error') message.error(text);
      else if (tone === 'warn') message.warning(text);
      else message.success(text);
    },
    [message],
  );
}
