import { Button, Color, Graphics, Label, Layers, Node, Sprite, SpriteFrame, UITransform } from 'cc';
import { Art } from './Art';
import { Audio } from './Audio';

/** 配色，和棋盘、卡片、按钮共用 */
export const THEME = {
  bg: '#F3E9DF',
  boardBg: '#E6D3C1',
  cell: '#FBF4EC',
  cellStroke: '#D9C3AE',
  card: '#FFFFFF',
  cardReady: '#DFF5E1',
  cardReadyStroke: '#4CAF50',
  text: '#4A3728',
  textLight: '#8C7462',
  accent: '#F08A4B',
  accentDark: '#C9652B',
  energy: '#5CB8E6',
  xp: '#8BC34A',
  danger: '#E05A5A',
};

export function hex(h: string, alpha = 255): Color {
  const c = new Color();
  c.fromHEX(h);
  c.a = alpha;
  return c;
}

/** 颜色变暗，生成器用 */
export function darken(h: string, factor = 0.72): Color {
  const c = hex(h);
  c.r = Math.round(c.r * factor);
  c.g = Math.round(c.g * factor);
  c.b = Math.round(c.b * factor);
  return c;
}

/** 新建一个带 UITransform 的 UI 节点并挂到 parent 下 */
export function makeNode(name: string, parent: Node, w = 0, h = 0, x = 0, y = 0): Node {
  const n = new Node(name);
  n.layer = Layers.Enum.UI_2D;
  const ut = n.addComponent(UITransform);
  ut.setContentSize(w, h);
  ut.setAnchorPoint(0.5, 0.5);
  n.setPosition(x, y, 0);
  parent.addChild(n);
  return n;
}

/** 以节点中心为原点画圆角矩形 */
export function drawRoundRect(g: Graphics, w: number, h: number, r: number, fill: Color, stroke?: Color, lineWidth = 3): void {
  g.clear();
  g.roundRect(-w / 2, -h / 2, w, h, r);
  g.fillColor = fill;
  g.fill();
  if (stroke) {
    g.lineWidth = lineWidth;
    g.strokeColor = stroke;
    g.stroke();
  }
}

export interface LabelOpts {
  size?: number;
  color?: Color;
  bold?: boolean;
  /** 给了宽高就用 SHRINK 模式把字缩进框里 */
  w?: number;
  h?: number;
  x?: number;
  y?: number;
  align?: 'left' | 'center' | 'right';
  outline?: Color;
}

export function addLabel(parent: Node, text: string, o: LabelOpts = {}): Label {
  const n = makeNode('label', parent, o.w ?? 0, o.h ?? 0, o.x ?? 0, o.y ?? 0);
  const l = n.addComponent(Label);
  l.string = text;
  l.fontSize = o.size ?? 24;
  l.lineHeight = (o.size ?? 24) + 6;
  l.color = o.color ?? hex(THEME.text);
  l.isBold = o.bold ?? false;
  l.horizontalAlign =
    o.align === 'left' ? Label.HorizontalAlign.LEFT : o.align === 'right' ? Label.HorizontalAlign.RIGHT : Label.HorizontalAlign.CENTER;
  l.verticalAlign = Label.VerticalAlign.CENTER;
  if (o.w && o.h) {
    l.overflow = Label.Overflow.SHRINK;
    l.enableWrapText = true;
  } else {
    l.overflow = Label.Overflow.NONE;
  }
  if (o.outline) {
    l.enableOutline = true;
    l.outlineColor = o.outline;
    l.outlineWidth = 2;
  }
  return l;
}

export type PanelKind = 'panel' | 'card' | 'tray' | 'slot' | 'button' | 'paper';

export interface PanelFallback {
  fill: Color;
  stroke?: Color;
  radius?: number;
  lineWidth?: number;
}

/**
 * 九宫格面板节点：有 UI 图时用 Sprite(SLICED) 拉伸，可用 tint 染色（按钮底是浅灰白，乘上颜色就是彩色按钮）；
 * 没图时退回 Graphics 圆角矩形。
 */
export function makePanel(name: string, parent: Node, kind: PanelKind, w: number, h: number, x = 0, y = 0, tint?: Color, fallback?: PanelFallback): Node {
  const n = makeNode(name, parent, w, h, x, y);
  const frame = Art.ui(kind);
  if (frame) {
    const sp = n.addComponent(Sprite);
    sp.type = Sprite.Type.SLICED;
    sp.sizeMode = Sprite.SizeMode.CUSTOM;
    sp.trim = false;
    sp.spriteFrame = frame;
    if (tint) sp.color = tint;
  } else {
    const g = n.addComponent(Graphics);
    const fb = fallback ?? { fill: tint ?? hex('#FFFFFF') };
    drawRoundRect(g, w, h, fb.radius ?? 16, fb.fill, fb.stroke, fb.lineWidth ?? 3);
  }
  return n;
}

/** 小图标节点，缺图返回 null */
export function makeIcon(name: string, parent: Node, size: number, x = 0, y = 0): Node | null {
  const frame = Art.icon(name);
  if (!frame) return null;
  return makeSprite('icon-' + name, parent, frame, size, size, x, y);
}

/** 圆角矩形按钮：按钮底图染色 + 文字 */
export function makeButton(parent: Node, text: string, w: number, h: number, color: string, onClick: () => void, x = 0, y = 0): Node {
  const n = makePanel('button', parent, 'button', w, h, x, y, hex(color), { fill: hex(color), radius: Math.min(18, h / 2) });
  addLabel(n, text, { size: Math.min(26, h * 0.42), color: Color.WHITE, bold: true, w: w - 16, h, outline: hex('#000000', 60) });
  const btn = n.addComponent(Button);
  btn.transition = Button.Transition.SCALE;
  btn.zoomScale = 0.94;
  n.on(Button.EventType.CLICK, () => {
    Audio.play('click');
    onClick();
  });
  return n;
}

/** 新建一个 Sprite 节点，等比缩放到 maxW×maxH 之内（不裁剪、不拉伸） */
export function makeSprite(name: string, parent: Node, frame: SpriteFrame, maxW: number, maxH: number, x = 0, y = 0): Node {
  const n = makeNode(name, parent, maxW, maxH, x, y);
  const sp = n.addComponent(Sprite);
  sp.sizeMode = Sprite.SizeMode.CUSTOM;
  sp.trim = false;
  sp.spriteFrame = frame;
  fitSprite(n, frame, maxW, maxH);
  return n;
}

/** 按 frame 的宽高比把节点尺寸缩到 maxW×maxH 之内 */
export function fitSprite(n: Node, frame: SpriteFrame, maxW: number, maxH: number): void {
  const r = frame.rect;
  const s = Math.min(maxW / r.width, maxH / r.height);
  n.getComponent(UITransform)!.setContentSize(r.width * s, r.height * s);
}
