import { _decorator, Color, Component, Graphics, Node } from 'cc';
import { DAILY_REWARDS } from '../config/GameConfig';
import type { GameState } from '../core/GameState';
import { Audio } from './Audio';
import { Popup } from './Popup';
import { THEME, addLabel, hex, makeButton, makeIcon, makeNode, makePanel } from './Theme';

const { ccclass } = _decorator;

/** 每日签到：7 个格子 + 领取按钮 */
@ccclass('DailyPanel')
export class DailyPanel extends Component {
  private game!: GameState;
  private popup!: Popup;

  init(game: GameState, screenW: number, screenH: number): void {
    this.game = game;
    this.popup = this.node.addComponent(Popup);
    this.popup.init(screenW, screenH, 640, 420, '每日签到');
  }

  get isOpen(): boolean {
    return this.popup.isOpen;
  }

  open(): void {
    this.rebuild();
    this.popup.open();
  }

  private rebuild(): void {
    this.popup.clear();
    const c = this.popup.content;
    const g = this.game;
    const now = g.now();
    const today = g.daily.todayIndex(now); // 本轮第几天（1..7）
    const claimable = g.daily.canClaim(now);

    addLabel(c, claimable ? `今天是连续第 ${today} 天，领取奖励吧` : `今天已签到，连续 ${Math.max(1, g.daily.streak)} 天`, {
      size: 18,
      color: hex(THEME.textLight),
      y: 150,
    });

    // 7 个格子：4 + 3 两行
    const size = 120;
    const gap = 14;
    DAILY_REWARDS.forEach((r, i) => {
      const day = i + 1;
      const row = i < 4 ? 0 : 1;
      const col = i < 4 ? i : i - 4;
      const perRow = row === 0 ? 4 : 3;
      const x = -((perRow - 1) * (size + gap)) / 2 + col * (size + gap);
      const y = 70 - row * (size + gap);
      const isToday = claimable && day === today;
      const done = claimable ? day < today : day <= today;
      const tile = makePanel('day-' + day, c, 'card', size, size, x, y, isToday ? hex(THEME.cardReady) : done ? hex('#EFE8E0') : undefined, {
        fill: isToday ? hex(THEME.cardReady) : hex('#FFFFFF'),
        stroke: hex(isToday ? THEME.cardReadyStroke : THEME.cellStroke),
      });
      addLabel(tile, `第${day}天`, { size: 14, color: hex(THEME.textLight), y: size / 2 - 16 });
      const iconName = r.coins ? 'coin' : 'energy';
      makeIcon(iconName, tile, 40, 0, 8);
      const text = [r.coins ? `${r.coins}金币` : '', r.energy ? `${r.energy}体力` : ''].filter(Boolean).join('+');
      addLabel(tile, text, { size: 13, bold: true, color: hex(THEME.text), y: -size / 2 + 18, w: size - 6, h: 18 });
      if (done) makeIcon('check', tile, 30, size / 2 - 18, size / 2 - 18);
    });

    makeButton(c, claimable ? '领取' : '明天再来', 240, 60, claimable ? THEME.accent : '#CFC4B8', () => {
      if (!claimable) return;
      const reward = g.claimDaily();
      if (reward) {
        Audio.play('reward');
        this.rebuild();
      }
    }, 0, -150);
  }
}

/** 顶栏上的小签到按钮：可领时带红点 */
export function makeDailyBadge(parent: Node, x: number, y: number, onClick: () => void): { node: Node; setDot: (v: boolean) => void } {
  const n = makeButton(parent, '签到', 90, 60, THEME.accentDark, onClick, x, y);
  const dot = makeNode('dot', n, 18, 18, 38, 22);
  const gfx = dot.addComponent(Graphics);
  gfx.circle(0, 0, 8);
  gfx.fillColor = hex(THEME.danger);
  gfx.fill();
  gfx.lineWidth = 2;
  gfx.strokeColor = Color.WHITE;
  gfx.stroke();
  return { node: n, setDot: (v: boolean) => (dot.active = v) };
}
