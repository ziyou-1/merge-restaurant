import { _decorator, BlockInputEvents, Color, Component, Graphics, Node, UIOpacity, Vec3, tween } from 'cc';
import { THEME, addLabel, drawRoundRect, hex, makeButton, makeNode, makePanel } from './Theme';

const { ccclass } = _decorator;

/**
 * 通用弹窗：全屏遮罩 + 居中纸面板 + 标题 + 关闭按钮。
 * 子类 / 调用方往 content 里塞东西，每次 open 前可以 clear 重建。
 */
@ccclass('Popup')
export class Popup extends Component {
  content!: Node;
  private box!: Node;
  private opacity!: UIOpacity;
  private titleNode: Node | null = null;
  private w = 0;
  private h = 0;
  /** 关闭后回调 */
  onClose: () => void = () => {};

  init(screenW: number, screenH: number, w: number, h: number, title: string): void {
    this.w = w;
    this.h = h;
    const g = this.node.addComponent(Graphics);
    drawRoundRect(g, screenW * 2, screenH * 2, 0, hex('#000000', 150));
    this.node.addComponent(BlockInputEvents);
    this.opacity = this.node.addComponent(UIOpacity);

    this.box = makePanel('box', this.node, 'paper', w, h, 0, 0, undefined, {
      fill: hex('#FFFDF9'),
      stroke: hex(THEME.accent),
      radius: 22,
      lineWidth: 4,
    });
    this.titleNode = addLabel(this.box, title, { size: 28, bold: true, color: hex(THEME.text), y: h / 2 - 34 }).node;
    this.content = makeNode('content', this.box, w, h - 70, 0, -20);
    makeButton(this.box, '✕', 48, 48, '#B9AEA2', () => this.close(), w / 2 - 34, h / 2 - 34);
    this.node.active = false;
  }

  get isOpen(): boolean {
    return this.node.active;
  }

  setTitle(t: string): void {
    const l = this.titleNode?.getComponent('cc.Label') as { string: string } | null;
    if (l) l.string = t;
  }

  /** 清空内容区，重新画 */
  clear(): void {
    this.content.removeAllChildren();
  }

  open(): void {
    if (this.node.active) return;
    this.node.active = true;
    this.opacity.opacity = 0;
    this.box.setScale(0.9, 0.9, 1);
    tween(this.opacity).to(0.15, { opacity: 255 }).start();
    tween(this.box).to(0.15, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' }).start();
  }

  close(): void {
    if (!this.node.active) return;
    tween(this.opacity)
      .to(0.12, { opacity: 0 })
      .call(() => {
        this.node.active = false;
        this.onClose();
      })
      .start();
  }
}

/** 弹窗里常用的一行：左边文字，右边按钮 */
export function popupRow(parent: Node, y: number, w: number, text: string, sub: string, btnText: string, btnColor: string, enabled: boolean, onClick: () => void): Node {
  const row = makePanel('row', parent, 'card', w, 76, 0, y, undefined, { fill: hex('#FFFFFF'), stroke: hex(THEME.cellStroke) });
  addLabel(row, text, { size: 22, bold: true, align: 'left', x: -w / 2 + 20 + 150, y: 12, w: 300, h: 28, color: hex(THEME.text) });
  addLabel(row, sub, { size: 14, align: 'left', x: -w / 2 + 20 + 150, y: -14, w: 300, h: 20, color: hex(THEME.textLight) });
  const btn = makeButton(row, btnText, 150, 50, enabled ? btnColor : '#CFC4B8', () => enabled && onClick(), w / 2 - 20 - 75, 0);
  if (!enabled) {
    const l = btn.getChildByName('label')?.getComponent('cc.Label') as { color: Color } | null;
    if (l) l.color = hex('#FFFFFF', 200);
  }
  return row;
}
