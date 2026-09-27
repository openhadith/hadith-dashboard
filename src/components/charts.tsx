'use client';

import { useState, type ReactNode } from 'react';
import { Card, Empty, Segmented, Table, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { BarChartOutlined, TableOutlined } from '@ant-design/icons';
import { c, toAr, shell } from '@/lib/tokens';

/**
 * Minimal chart kit for the studio.
 *
 * Plain HTML rather than a charting library: the studio needs bars and
 * columns only, and hand-built marks follow the house specs exactly —
 * ≤24px bars with a 4px rounded data end and a square baseline, a 2px
 * surface gap between touching segments, hairline solid gridlines, values
 * at the bar tip in ink (never in the bar colour), and hover targets that
 * cover the whole row or band rather than the thin mark itself.
 *
 * Every chart sits in a ChartCard that can flip to a table, so no figure is
 * reachable only by hovering or only by colour.
 */

const { Text } = Typography;
const BAR = 14;
const RADIUS = 4;

export function ChartCard<T extends object>({
  title, subtitle, table, children, empty,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  table: { columns: ColumnsType<T>; data: T[]; rowKey: keyof T & string };
  children: ReactNode;
  empty?: boolean;
}) {
  const [mode, setMode] = useState<'chart' | 'table'>('chart');
  return (
    <Card
      size="small"
      title={
        <div style={{ lineHeight: 1.4, paddingBlock: 4 }}>
          <div>{title}</div>
          {subtitle && <Text type="secondary" style={{ fontSize: 15, fontWeight: 400 }}>{subtitle}</Text>}
        </div>
      }
      extra={
        <Segmented
          size="small"
          value={mode}
          onChange={(v) => setMode(v as 'chart' | 'table')}
          options={[
            { value: 'chart', icon: <BarChartOutlined />, title: 'نەخشە' },
            { value: 'table', icon: <TableOutlined />, title: 'خشتە' },
          ]}
        />
      }
    >
      {empty ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="هێشتا داتا نییە" />
      ) : mode === 'chart' ? (
        children
      ) : (
        <Table<T>
          size="small"
          rowKey={table.rowKey}
          columns={table.columns}
          dataSource={table.data}
          pagination={table.data.length > 10 ? { pageSize: 10, showSizeChanger: false } : false}
        />
      )}
    </Card>
  );
}

export interface BarRow {
  key: string;
  label: ReactNode;
  /** Small identity mark beside the label (status dot, team colour). */
  marker?: string;
  value: number;
  /** When set, the bar is drawn as value-of-total with a neutral remainder. */
  total?: number;
  /** Text at the tip; defaults to the value. */
  tip?: ReactNode;
  tooltip?: ReactNode;
}

/** Horizontal bars growing from the inline-start baseline. */
export function BarList({ rows, labelWidth = 150 }: { rows: BarRow[]; labelWidth?: number }) {
  const max = Math.max(1, ...rows.map((r) => r.total ?? r.value));
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {rows.map((r) => {
        const full = ((r.total ?? r.value) / max) * 100;
        const filled = r.total ? (r.value / r.total) * full : full;
        const remainder = r.total ? full - filled : 0;
        return (
          <Tooltip key={r.key} title={r.tooltip} placement="top">
            {/* The whole row is the hit target, not the 14px bar. */}
            <div
              style={{
                display: 'grid', gridTemplateColumns: `${labelWidth}px 1fr`, alignItems: 'center',
                gap: 10, padding: '6px 4px', borderRadius: 6, cursor: 'default',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = c.sunken; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                {r.marker && (
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: r.marker, flex: 'none' }} />
                )}
                <Text ellipsis style={{ fontSize: 16 }}>{r.label}</Text>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 2, height: BAR }}>
                  {filled > 0 && (
                    <div
                      style={{
                        width: `${filled}%`, height: BAR, background: c.emerald,
                        // Square at the baseline; the data end is rounded only if
                        // nothing continues past it.
                        borderStartEndRadius: remainder > 0 ? 0 : RADIUS,
                        borderEndEndRadius: remainder > 0 ? 0 : RADIUS,
                      }}
                    />
                  )}
                  {remainder > 0 && (
                    <div
                      style={{
                        width: `calc(${remainder}% - 2px)`, height: BAR, background: c.line,
                        borderStartEndRadius: RADIUS, borderEndEndRadius: RADIUS,
                      }}
                    />
                  )}
                  {/* Value at the tip, in ink. */}
                  <Text strong style={{ fontSize: 15, marginInlineStart: 6, whiteSpace: 'nowrap' }}>
                    {r.tip ?? toAr(r.value)}
                  </Text>
                </div>
              </div>
            </div>
          </Tooltip>
        );
      })}
    </div>
  );
}

export interface ColumnPoint {
  key: string;
  /** Axis label; shown only where `showLabel` is set, to keep the axis quiet. */
  label: string;
  showLabel?: boolean;
  value: number;
  tooltip: ReactNode;
}

/** Vertical columns from a common baseline — a time series. */
export function ColumnChart({ points, height = 150 }: { points: ColumnPoint[]; height?: number }) {
  const max = Math.max(1, ...points.map((p) => p.value));
  const peak = points.reduce((best, p, i) => (p.value > points[best].value ? i : best), 0);
  const last = points.length - 1;

  return (
    <div>
      <div style={{ position: 'relative', height, display: 'flex', alignItems: 'flex-end' }}>
        {/* Recessive hairline grid: the max and the midline. */}
        {[1, 0.5].map((f) => (
          <div
            key={f}
            style={{
              position: 'absolute', insetInline: 0, bottom: `${f * (height - 18)}px`,
              borderTop: `1px solid ${c.lineSoft}`,
            }}
          >
            <Text style={{ position: 'absolute', insetInlineEnd: 0, top: -9, fontSize: 14, color: c.inkGhost, background: c.raised, paddingInline: 3 }}>
              {toAr(Math.round(max * f))}
            </Text>
          </div>
        ))}

        {points.map((p, i) => {
          const h = Math.round((p.value / max) * (height - 18));
          // Direct labels are selective: the peak and the latest day only.
          const labelled = (i === peak || i === last) && p.value > 0;
          return (
            <Tooltip key={p.key} title={p.tooltip}>
              {/* The full-height band is the hit target. */}
              <div
                style={{
                  flex: 1, height: '100%', display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'flex-end', paddingInline: 1, cursor: 'default',
                  position: 'relative', zIndex: 1,
                }}
              >
                {labelled && (
                  <Text strong style={{ fontSize: 14.5, marginBottom: 2 }}>{toAr(p.value)}</Text>
                )}
                <div
                  style={{
                    width: '100%', maxWidth: 24, height: Math.max(p.value ? 2 : 0, h),
                    background: c.emerald,
                    borderStartStartRadius: RADIUS, borderStartEndRadius: RADIUS,
                  }}
                />
              </div>
            </Tooltip>
          );
        })}
      </div>
      <div style={{ borderTop: `1px solid ${shell.cardBorder}`, display: 'flex' }}>
        {points.map((p) => (
          <div key={p.key} style={{ flex: 1, textAlign: 'center', paddingTop: 4 }}>
            {p.showLabel && <Text style={{ fontSize: 14, color: c.inkDim, whiteSpace: 'nowrap' }}>{p.label}</Text>}
          </div>
        ))}
      </div>
    </div>
  );
}
