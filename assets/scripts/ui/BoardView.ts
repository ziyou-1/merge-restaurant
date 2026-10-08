import { _decorator, Component, EventTouch, Node, Tween, UITransform, Vec2, Vec3, tween } from 'cc';
import type { BoardItem } from '../core/Board';
import type { GameState } from '../core/GameState';
import { Audio } from './Audio';
import { ItemView } from './ItemView';
import { THEME, hex, makeNode, makePanel } from './Theme';

const { ccclass } = _decorator;

/** 手指移动超过这个距离(设计像素)算拖拽，否则算点击 */
const TAP_THRESHOLD = 10;

interface DragState {
  /** 触摸 id，第二根手指不能接管第一根的拖拽 */
  id: number;
  idx: number;
  view: ItemView;
  start: Vec2;
  moved: boolean;
}

/**
 * 棋盘视图：画格子、维护物品视图、处理拖拽 / 点击。
 * 它只把操作转给 GameState，并在收到 change 事件后按棋盘数据同步显示（数据驱动，不自己改状态）。
 */
@ccclass('BoardView')
export class BoardView extends Component {
  private game!: GameState;
  private cell = 96;
  private pad = 10;
  private boardW = 0;
  private boardH = 0;
  private itemLayer!: Node;
  private ui!: UITransform;
  /** item.id → 视图 */
  private views = new Map<number, ItemView>();
  private drag: DragState | null = null;
  private selectedId = -1;
  /** 刚生成的物品从哪个格子飞出来（item.id → 生成器格） */
  private spawnFrom = new Map<number, number>();

  /** 选中普通物品时回调 item.id，取消选中回调 -1（用 id 而不是格子，因为物品会被拖走） */
  onSelect: (itemId: number) => void = () => {};

  init(game: GameState, cell: number): void {
    this.game = game;
    this.cell = cell;
    const b = game.board;
    this.boardW = b.cols * cell + this.pad * 2;
    this.boardH = b.rows * cell + this.pad * 2;

    this.ui = this.node.getComponent(UITransform)!;
    this.ui.setContentSize(this.boardW, this.boardH);

    // 木托盘 + 每格一个空槽（无图时退回色块）
    makePanel('tray', this.node, 'tray', this.boardW, this.boardH, 0, 0, undefined, { fill: hex(THEME.boardBg), radius: 22 });
    for (let idx = 0; idx < b.size; idx++) {
      const p = this.cellPos(idx);
      const s = cell - 6;
      makePanel('slot', this.node, 'slot', s, s, p.x, p.y, undefined, { fill: hex(THEME.cell), stroke: hex(THEME.cellStroke), radius: 12, lineWidth: 2 });
    }

    this.itemLayer = makeNode('items', this.node, this.boardW, this.boardH);

    this.node.on(Node.EventType.TOUCH_START, this.onTouchStart, this);
    this.node.on(Node.EventType.TOUCH_MOVE, this.onTouchMove, this);
    this.node.on(Node.EventType.TOUCH_END, this.onTouchEnd, this);
    this.node.on(Node.EventType.TOUCH_CANCEL, this.onTouchCancel, this);

    game.events.on('spawn', (e) => this.spawnFrom.set(e.item.id, e.from));
    game.events.on('change', () => this.sync());
    this.sync();
  }

  // ---------- 坐标 ----------
  /** 格子中心在棋盘节点局部坐标里的位置 */
  cellPos(idx: number): Vec3 {
    const { x, y } = this.game.board.coords(idx);
    return new Vec3(
      -this.boardW / 2 + this.pad + (x + 0.5) * this.cell,
      this.boardH / 2 - this.pad - (y + 0.5) * this.cell,
      0,
    );
  }

  /** 局部坐标 → 格子下标，不在棋盘内返回 -1 */
  cellAt(x: number, y: number): number {
    const cx = Math.floor((x + this.boardW / 2 - this.pad) / this.cell);
    const cy = Math.floor((this.boardH / 2 - this.pad - y) / this.cell);
    const b = this.game.board;
    return b.inBounds(cx, cy) ? b.index(cx, cy) : -1;
  }

  private toLocal(e: EventTouch): Vec2 {
    const p = e.getUILocation();
    const v = this.ui.convertToNodeSpaceAR(new Vec3(p.x, p.y, 0));
    return new Vec2(v.x, v.y);
  }

  // ---------- 触摸 ----------
  private onTouchStart(e: EventTouch): void {
    if (this.drag) return;
    const p = this.toLocal(e);
    const idx = this.cellAt(p.x, p.y);
    if (idx < 0) return;
    const item = this.game.board.get(idx);
    if (!item) {
      this.select(-1);
      return;
    }
    const view = this.views.get(item.id);
    if (!view) return;
    this.drag = { id: e.getID() ?? 0, idx, view, start: p, moved: false };
    Tween.stopAllByTarget(view.node);
    view.node.setSiblingIndex(this.itemLayer.children.length - 1);
    view.node.setScale(1.12, 1.12, 1);
  }

  private onTouchMove(e: EventTouch): void {
    const d = this.drag;
    if (!d || (e.getID() ?? 0) !== d.id) return;
    const p = this.toLocal(e);
    if (!d.moved && Vec2.distance(p, d.start) > TAP_THRESHOLD) d.moved = true;
    if (d.moved) d.view.node.setPosition(p.x, p.y, 0);
  }

  private onTouchEnd(e: EventTouch): void {
    const d = this.drag;
    if (!d || (e.getID() ?? 0) !== d.id) return;
    this.drag = null;
    if (!d.view.node.isValid) return;
    d.view.node.setScale(1, 1, 1);

    if (!d.moved) {
      // 点击：先把可能还在飞行中的视图放回格子，再处理点击（onTap 里会停掉该节点的 tween）
      d.view.node.setPosition(this.cellPos(d.idx));
      this.onTap(d.idx);
      return;
    }
    const p = this.toLocal(e);
    const to = this.cellAt(p.x, p.y);
    if (to < 0 || to === d.idx) {
      this.moveTo(d.view, d.idx);
      return;
    }
    this.select(-1);
    const res = this.game.drop(d.idx, to);
    // change 事件已触发 sync；没发生任何事时把视图弹回去
    if (res.type === 'none') this.moveTo(d.view, d.idx);
  }

  /** 系统打断触摸（来电、切后台、多指冲突）：放弃拖拽，物品回原格，不提交移动 */
  private onTouchCancel(e: EventTouch): void {
    const d = this.drag;
    if (!d || (e.getID() ?? 0) !== d.id) return;
    this.cancelDrag();
  }

  /** 页面切走 / 组件禁用时中止进行中的拖拽 */
  cancelDrag(): void {
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    if (!d.view.node.isValid) return;
    d.view.node.setScale(1, 1, 1);
    this.moveTo(d.view, d.idx);
  }

  onDisable(): void {
    this.cancelDrag();
  }

  private onTap(idx: number): void {
    const item = this.game.board.get(idx);
    if (!item) return;
    if (item.kind === 'generator') {
      this.select(-1);
      Audio.play(this.game.spawn(idx) ? 'tap' : 'error');
      // 点一下生成器弹一下
      const v = this.views.get(item.id);
      if (v) {
        Tween.stopAllByTarget(v.node);
        v.node.setScale(1, 1, 1);
        tween(v.node).to(0.06, { scale: new Vec3(0.92, 0.92, 1) }).to(0.08, { scale: new Vec3(1, 1, 1) }).start();
      }
      return;
    }
    this.select(this.selectedId === item.id ? -1 : idx);
  }

  /** 选中/取消选中普通物品 */
  select(idx: number): void {
    const item = idx >= 0 ? this.game.board.get(idx) : null;
    const newId = item && item.kind === 'item' ? item.id : -1;
    if (newId === this.selectedId) return;
    this.views.get(this.selectedId)?.setSelected(false);
    this.selectedId = newId;
    this.views.get(newId)?.setSelected(true);
    this.onSelect(newId);
  }

  // ---------- 同步 ----------
  /** 按棋盘数据增删/移动视图 */
  sync(): void {
    const b = this.game.board;
    const alive = new Set<number>();
    for (const { idx, item } of b.entries()) {
      alive.add(item.id);
      let view = this.views.get(item.id);
      if (!view) {
        view = this.createView(item, idx);
      } else {
        view.item = item;
        if (this.drag?.view !== view) this.moveTo(view, idx);
      }
    }
    for (const [id, view] of this.views) {
      if (alive.has(id)) continue;
      this.views.delete(id);
      if (id === this.selectedId) this.select(-1);
      // 正在拖的物品被卖掉 / 交付 / 合掉了：拖拽作废
      if (this.drag?.view === view) this.drag = null;
      Tween.stopAllByTarget(view.node);
      tween(view.node)
        .to(0.1, { scale: new Vec3(0.2, 0.2, 1) })
        .call(() => view.node.destroy())
        .start();
    }
  }

  /** 每秒刷新生成器倒计时 */
  refresh(now: number): void {
    for (const v of this.views.values()) v.refresh(this.game.board, now);
  }

  private createView(item: BoardItem, idx: number): ItemView {
    const n = makeNode('item', this.itemLayer, this.cell, this.cell);
    const view = n.addComponent(ItemView);
    view.setup(item, this.cell - 10);
    this.views.set(item.id, view);

    const target = this.cellPos(idx);
    const from = this.spawnFrom.get(item.id);
    this.spawnFrom.delete(item.id);
    if (from !== undefined) {
      // 从生成器飞到目标格
      n.setPosition(this.cellPos(from));
      n.setScale(0.5, 0.5, 1);
      tween(n)
        .to(0.18, { position: target, scale: new Vec3(1, 1, 1) }, { easing: 'quadOut' })
        .start();
    } else {
      // 合成产物 / 读档：原地弹出
      n.setPosition(target);
      n.setScale(0.6, 0.6, 1);
      tween(n)
        .to(0.1, { scale: new Vec3(1.15, 1.15, 1) })
        .to(0.08, { scale: new Vec3(1, 1, 1) })
        .start();
    }
    return view;
  }

  private moveTo(view: ItemView, idx: number): void {
    const target = this.cellPos(idx);
    const n = view.node;
    if (Vec3.distance(n.position, target) < 1) {
      n.setPosition(target);
      return;
    }
    // 可能打断的是“生成飞入”那条同时改位置和缩放的 tween，所以这里把缩放也一并归 1
    Tween.stopAllByTarget(n);
    tween(n).to(0.12, { position: target, scale: new Vec3(1, 1, 1) }, { easing: 'quadOut' }).start();
  }
}
