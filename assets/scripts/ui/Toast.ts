import { _decorator, Color, Component, Graphics, Label, Tween, UIOpacity, Vec3, tween } from 'cc';
import { addLabel, drawRoundRect, hex } from './Theme';

const { ccclass } = _decorator;

/** 屏幕中部的一行提示，淡入停留淡出 */
@ccclass('Toast')
export class Toast extends Component {
  private label!: Label;
  private bg!: Graphics;
  private opacity!: UIOpacity;
  private w = 0;
  private h = 56;

  init(w: number): void {
    this.w = w;
    this.bg = this.node.addComponent(Graphics);
    drawRoundRect(this.bg, w, this.h, this.h / 2, hex('#000000', 170));
    this.label = addLabel(this.node, '', { size: 22, color: Color.WHITE, w: w - 30, h: this.h });
    this.opacity = this.node.addComponent(UIOpacity);
    this.opacity.opacity = 0;
    this.node.active = false;
  }

  show(text: string): void {
    this.label.string = text;
    this.node.active = true;
    Tween.stopAllByTarget(this.opacity);
    Tween.stopAllByTarget(this.node);
    this.opacity.opacity = 0;
    this.node.setScale(0.9, 0.9, 1);
    tween(this.node).to(0.12, { scale: new Vec3(1, 1, 1) }).start();
    tween(this.opacity)
      .to(0.12, { opacity: 255 })
      .delay(1.4)
      .to(0.25, { opacity: 0 })
      .call(() => (this.node.active = false))
      .start();
  }
}
