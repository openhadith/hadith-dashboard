'use client';

import { AntdRegistry } from '@ant-design/nextjs-registry';
import { App, ConfigProvider } from 'antd';
import kuIQ from 'antd/locale/ku_IQ';
import type { ReactNode } from 'react';
import { studioTheme } from '@/lib/theme';

/**
 * Ant Design wiring for the studio.
 *
 * - `AntdRegistry` extracts AntD's CSS-in-JS during SSR. Without it the first
 *   paint in the App Router arrives unstyled and then snaps into place.
 * - `direction="rtl"` flips AntD's own layout logic — drawer sides, table
 *   alignment, icon mirroring — which CSS alone cannot do.
 * - AntD ships a Kurdish (ku_IQ) locale, so built-in strings (pagination,
 *   empty states, filter menus, date pickers) match the rest of the chrome
 *   instead of falling back to English.
 * - `<App>` supplies the context that `message`, `notification` and `Modal`
 *   need in order to inherit this theme; the static `message.success()` form
 *   does not and renders unthemed.
 */
export default function AntdProvider({ children }: { children: ReactNode }) {
  return (
    <AntdRegistry>
      <ConfigProvider theme={studioTheme} direction="rtl" locale={kuIQ}>
        <App component={false}>{children}</App>
      </ConfigProvider>
    </AntdRegistry>
  );
}
