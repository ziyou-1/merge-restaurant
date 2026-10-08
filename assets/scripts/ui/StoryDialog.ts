import { _decorator, BlockInputEvents, Color, Component, Graphics, Label, Node, UIOpacity, UITransform, Vec3, tween } from 'cc';
import type { StoryLine } from '../config/Decor';
import { Art } from './Art';
import { THEME, addLabel, drawRoundRect, hex, makeNode, makePanel, makeSprite } from './Theme';

const { ccclass } = _decorator;

/**
 * 剧情对话框：全屏遮罩 + 底部对话框，点一下下一句，说完自动关闭。
 * 多段剧情连续触发会排队。
 */
@ccclass('StoryDialog')
export class StoryDialog extends Component {
  private queue: StoryLine[] = [];
  private speakerLabel!: Label;
  private textLabel!: Label;
  private box!: Node;
  private portrait: Node | null = null;
  private tag!: Node;
  private boxW = 0;
  private boxH = 0;
  private opacity!: UIOpacity;
  private visible = false;
  /** 队列说完、对话框关闭时回调 */
  onDone: () => void = () => {};

  init(screenW: number, screenH: number): void {
    // 遮罩：挡住下面所有点击
    const g = this.node.addComponent(Graphics);
    drawRoundRect(g, screenW * 2, screenH * 2, 0, hex('#000000', 150));
    this.node.addComponent(BlockInputEvents);
    this.opacity = this.node.addComponent(UIOpacity);

    const boxW = Math.min(660, screenW - 40);
    const boxH = 230;
    this.boxW = boxW;
    this.boxH = boxH;
    this.box = makePanel('box', this.node, 'paper', boxW, boxH, 0, -screenH / 2 + boxH / 2 + 60, undefined, {
      fill: hex('#FFFDF9'),
      stroke: hex(THEME.accent),
      radius: 22,
      lineWidth: 4,
    });

    // 说话人名牌
    const tag = makePanel('speaker', this.box, 'button', 160, 40, -boxW / 2 + 100, boxH / 2 - 4, hex(THEME.accent), { fill: hex(THEME.accent), radius: 14 });
    this.tag = tag;
    this.speakerLabel = addLabel(tag, '', { size: 20, bold: true, color: Color.WHITE, w: 150, h: 40 });

    // 文字区留出左侧立绘的位置（没立绘时 next() 里会把文字区放宽）
    this.textLabel = addLabel(this.box, '', {
      size: 24,
      color: hex(THEME.text),
      align: 'left',
      w: boxW - 60,
      h: boxH - 90,
      y: -6,
    });
    addLabel(this.box, '点击继续 ▸', { size: 14, color: hex(THEME.textLight), x: boxW / 2 - 70, y: -boxH / 2 + 18 });

    this.node.on(Node.EventType.TOUCH_END, this.next, this);
    this.node.active = false;
  }

  get isShowing(): boolean {
    return this.visible;
  }

  show(lines: StoryLine[]): void {
    this.queue.push(...lines);
    if (!this.visible) this.next();
  }

  private next(): void {
    const line = this.queue.shift();
    if (!line) {
      this.hide();
      return;
    }
    if (!this.visible) {
      this.visible = true;
      this.node.active = true;
      this.opacity.opacity = 0;
      tween(this.opacity).to(0.15, { opacity: 255 }).start();
    }
    this.speakerLabel.string = line.speaker;
    this.textLabel.string = line.text;
    this.setPortrait(line.speaker);
    this.box.setScale(0.96, 0.96, 1);
    tween(this.box).to(0.1, { scale: new Vec3(1, 1, 1) }).start();
  }

  /** 左侧立绘：立绘高出对话框上沿，像从框后面探出来 */
  private setPortrait(speaker: string): void {
    this.portrait?.destroy();
    this.portrait = null;
    const frame = Art.story(speaker);
    const textNode = this.textLabel.node;
    const ut = textNode.getComponent(UITransform)!;
    if (!frame) {
      ut.setContentSize(this.boxW - 60, this.boxH - 90);
      textNode.setPosition(0, -6, 0);
      this.tag.setPosition(-this.boxW / 2 + 100, this.boxH / 2 - 4, 0);
      return;
    }
    const pw = 170;
    // 名牌挪到立绘右边，别被头挡住
    this.tag.setPosition(-this.boxW / 2 + pw + 90, this.boxH / 2 - 4, 0);
    this.portrait = makeSprite('portrait', this.box, frame, pw, pw, -this.boxW / 2 + pw / 2 + 6, 10);
    const tw = this.boxW - pw - 40;
    ut.setContentSize(tw, this.boxH - 90);
    textNode.setPosition(this.boxW / 2 - 20 - tw / 2, -6, 0);
  }

  private hide(): void {
    this.visible = false;
    this.onDone();
    tween(this.opacity)
      .to(0.15, { opacity: 0 })
      .call(() => {
        if (!this.visible) this.node.active = false;
      })
      .start();
  }
}
