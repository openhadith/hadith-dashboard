import type { ThemeConfig } from 'antd';
import { c, shell } from './tokens';

/**
 * Ant Design theme, mapped onto the studio palette.
 *
 * The point of this file is that AntD should not announce itself. Every colour
 * below comes from `tokens.ts`, which came from the ui-design comps, so a Table
 * or a Modal lands in the same warm paper/emerald world as the hand-built
 * screens rather than AntD's default blue.
 *
 * Only tokens that genuinely differ from AntD's defaults are set; leaving the
 * rest alone keeps us on AntD's own algorithm for derived states (hover, active,
 * disabled), which is more consistent than hand-picking every shade.
 */
export const studioTheme: ThemeConfig = {
  token: {
    // --- brand
    colorPrimary: c.emerald,
    colorInfo: c.blue,
    colorSuccess: c.emerald,
    colorWarning: c.gold,
    colorError: c.rust,
    colorLink: c.emerald,
    colorLinkHover: c.emeraldDeep,

    // Status surfaces. Left to AntD these are derived algorithmically from the
    // brand colours above and come out slate-blue and grey-green — close, but
    // visibly off-palette in every Alert and status Tag. Pinning them to the
    // comps' soft tints keeps those components in the same family.
    colorSuccessBg: c.emeraldTint,
    colorSuccessBorder: '#cfe3d7',
    colorInfoBg: c.blueSoft,
    colorInfoBorder: '#d6dfeb',
    colorWarningBg: c.goldSoft,
    colorWarningBorder: '#ecdcb3',
    colorErrorBg: c.rustSoft,
    colorErrorBorder: '#e8cdc5',

    // --- surfaces
    colorBgLayout: shell.canvas,
    colorBgContainer: shell.card,
    colorBgElevated: shell.card,
    colorBgSpotlight: c.inkStrong,

    // --- ink
    colorText: c.ink,
    colorTextSecondary: c.inkMuted,
    colorTextTertiary: c.inkFaint,
    colorTextQuaternary: c.inkPale,
    colorTextHeading: c.inkStrong,

    // --- hairlines
    colorBorder: shell.cardBorder,
    colorBorderSecondary: shell.cardBorderSoft,
    colorSplit: shell.cardBorderSoft,

    /*
     * --- shape and rhythm
     *
     * Sized to read, not to cram. The comps were drawn at a 12–13px scale that
     * looks right in a static mockup but is genuinely hard to read in a tool
     * someone uses all day, so the base follows the public site instead: the
     * same family, the same 1.7 line-height, one step down from its 16px
     * because a dashboard carries more chrome per screen than an article does.
     *
     * Controls grow with the text — AntD's 32px default control is cramped
     * around 15px type.
     */
    fontSize: 16,
    fontSizeSM: 14,
    fontSizeLG: 18,
    fontSizeHeading1: 32,
    fontSizeHeading2: 24,
    fontSizeHeading3: 19,
    fontSizeHeading4: 17,
    fontSizeHeading5: 16,
    // Tight corners, as the house dashboards use — 11px reads soft and toylike
    // next to a hairline card.
    borderRadius: 8,
    borderRadiusLG: 12,
    borderRadiusSM: 6,
    borderRadiusXS: 4,
    controlHeight: 38,
    controlHeightSM: 32,
    controlHeightLG: 46,
    lineHeight: 1.65,

    // Near-invisible: a card is defined by its hairline, with the shadow only
    // lifting it a fraction off the surface.
    boxShadow: shell.shadowSm,
    boxShadowSecondary: shell.shadowMd,

    // AntD's defaults are tuned for a 14px base; at 16px they read as cramped.
    padding: 20,
    paddingLG: 26,
    paddingSM: 14,
    paddingXS: 10,
    margin: 20,
    marginLG: 26,
    marginSM: 14,

    /**
     * Outfit leads for Latin and the numerals; Vazirmatn, drawn for Persian,
     * carries the Kurdish. The browser picks per glyph, so a Kurdish label with
     * a Latin id inside it gets both without any markup.
     */
    fontFamily:
      "var(--font-outfit), var(--font-vazir), 'Noto Sans Arabic', system-ui, sans-serif",

    wireframe: false,
  },

  components: {
    Pagination: { itemSize: 32, fontSize: 14.5 },
    Tooltip: { fontSize: 14, borderRadius: 5 },
    Table: {
      headerBg: shell.sunken,
      headerColor: c.inkFaint,
      headerSplitColor: shell.cardBorderSoft,
      rowHoverBg: shell.sunken,
      rowSelectedBg: c.emeraldSoft,
      rowSelectedHoverBg: c.emeraldTint,
      borderColor: shell.cardBorderSoft,
      cellPaddingBlock: 16,
      cellPaddingInline: 13,
      fontSize: 15,
    },
    Card: { headerBg: 'transparent', boxShadow: 'none', colorBorderSecondary: shell.cardBorder },
    Tabs: {
      itemColor: c.inkBody,
      itemSelectedColor: c.emerald,
      itemHoverColor: c.emeraldDeep,
      inkBarColor: c.emerald,
      horizontalMargin: '0 0 20px 0',
    },
    Tag: { defaultBg: shell.sunken, defaultColor: c.inkMuted, borderRadiusSM: 4, fontSize: 13.5 },
    Button: {
      primaryShadow: 'none',
      defaultShadow: 'none',
      dangerShadow: 'none',
      fontWeight: 600,
    },
    Input: { activeShadow: `0 0 0 2px ${c.emerald}1f` },
    Select: { optionSelectedBg: c.emeraldSoft },
    Modal: { headerBg: shell.card, contentBg: shell.card, titleFontSize: 18, borderRadiusLG: 12 },
    Drawer: { footerPaddingBlock: 16, footerPaddingInline: 24 },
Statistic: { titleFontSize: 14, contentFontSize: 32 },
    Descriptions: { labelBg: c.sunken, titleMarginBottom: 8 },
    Segmented: { itemSelectedBg: shell.card, itemSelectedColor: c.emerald, trackBg: '#f1eee7', borderRadius: 5 },
    Progress: { defaultColor: c.emerald, remainingColor: c.line },
Badge: { textFontSize: 13 },
    Alert: { withDescriptionPadding: '16px 20px', borderRadiusLG: 8 },
  },
};
