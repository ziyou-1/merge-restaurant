import { _decorator, Component, Game, Label, Layers, Node, ResolutionPolicy, Sprite, UITransform, Vec3, director, game, sys, tween, view } from 'cc';
import { INTRO_STORY } from './config/Decor';
import { BOARD_COLS, BOARD_ROWS, DEBUG_TOOLS, LEVEL_UP_REWARD, OFFLINE_HINT_MIN_MS, SHARE, itemName, sellPrice } from './config/GameConfig';
import { GameState } from './core/GameState';
import { clearSave, readSaveJSON, writeSaveJSON } from './core/Save';
import type { GameJSON } from './core/GameState';
import { clearCloudSave, flushCloudSave, newerSave, pullCloudSave, pushCloudSave } from './platform/CloudSave';
import { Popup } from './ui/Popup';
import type { KeyValueStore } from './core/Save';
import { initCloud, now, setupShare, syncServerTime, topInset, vibrateShort } from './platform/Wx';
import { Art } from './ui/Art';
import { Audio } from './ui/Audio';
import { BoardView } from './ui/BoardView';
import { DailyPanel, makeDailyBadge } from './ui/DailyPanel';
import { EnergyPanel } from './ui/EnergyPanel';
import { Hud } from './ui/Hud';
import { OrderPanel } from './ui/OrderPanel';
import { RestaurantView } from './ui/RestaurantView';
import { StoryDialog } from './ui/StoryDialog';
import { TaskPanel } from './ui/TaskPanel';
import { Tutorial } from './ui/Tutorial';
import { THEME, addLabel, hex, makeButton, makeNode, makeSprite } from './ui/Theme';
import { Toast } from './ui/Toast';

const { ccclass } = _decorator;

const DESIGN_W = 750;
const DESIGN_H = 1334;
const SIDE = 20;

type Page = 'board' | 'restaurant';

/**
 * 入口：挂在场景 Canvas/Game 节点上。
 * 负责：读档/新档、搭 UI（两页：棋盘页 / 餐厅页）、把 GameState 的事件接到各视图、定时 tick、自动存档。
 * 所有 UI 节点都是代码创建的，不依赖预制体，正式美术进来时逐个替换即可。
 */
@ccclass('GameManager')
export class GameManager extends Component {
  private gs!: GameState;
  private store!: KeyValueStore;
  private hud!: Hud;
  private toast!: Toast;
  private story!: StoryDialog;

  private boardPage!: Node;
  private boardView!: BoardView;
  private orderPanel!: OrderPanel;
  private sellBtn!: Node;
  private restaurantBtn!: Node;
  private dailyBadge!: { node: Node; setDot: (v: boolean) => void };
  private dailyPanel!: DailyPanel;
  private energyPanel!: EnergyPanel;
  /** 读档时算出的离线信息，boot 后提示 */
  private offline: { ms: number; energyGained: number } | null = null;

  private restaurantPage!: Node;
  private restaurantView!: RestaurantView;
  private taskPanel!: TaskPanel;
  private tutorial!: Tutorial;
  private ordersNode!: Node;
  private hudNode!: Node;

  private page: Page = 'board';
  private selectedId = -1;
  private resetting = false;
  private resetPopup: Popup | null = null;

  onLoad(): void {
    view.setDesignResolutionSize(DESIGN_W, DESIGN_H, ResolutionPolicy.FIXED_WIDTH);
    this.store = sys.localStorage;
    initCloud();
    Audio.init(this.node);
    const local = readSaveJSON(this.store);

    // 三件事并行：美术、校时、拉云存档。哪件失败都不影响开局，只是退回本地。
    const loading = addLabel(this.node, '加载中…', { size: 28, color: hex(THEME.textLight) });
    Promise.all([
      Art.load().catch((e) => console.warn('[Art] 美术资源加载失败，使用占位画法', e)),
      syncServerTime(),
      pullCloudSave(),
    ]).then(([, , cloud]) => {
      const chosen = newerSave(local, cloud);
      // 云端更新 → 落到本地，换手机也能接着玩
      if (chosen && chosen !== local) writeSaveJSON(this.store, chosen);
      this.gs = chosen ? GameState.fromJSON(chosen, { now }) : GameState.newGame({ now });
      if (chosen) {
        // fromJSON 里已经把离线期间的体力结算掉了，这里只算差值用来提示
        const ms = now() - (chosen.savedAt ?? now());
        this.offline = { ms, energyGained: Math.max(0, this.gs.energy.value - chosen.energy.value) };
      }
      loading.node.destroy();
      this.boot(!chosen);
      // 校时成功、本地又比云端新：现在就推一份
      void flushCloudSave(chosen && chosen === local ? local : undefined);
    });
  }

  /** 美术就绪后真正开始（不能叫 start，那是 Component 的生命周期钩子） */
  private boot(isNewGame: boolean): void {
    this.buildUI();
    this.bindEvents();
    this.schedule(this.onSecond, 1);
    game.on(Game.EVENT_HIDE, this.onHide, this);
    game.on(Game.EVENT_SHOW, this.onShow, this);

    setupShare(SHARE.title, SHARE.imageUrl);

    if (isNewGame) {
      // 剧情遮罩会盖住提示，说完再弹
      this.story.onDone = () => {
        this.story.onDone = () => {};
        this.toast.show('拖动两个相同物品合成，点击生成器产出');
      };
      this.story.show(INTRO_STORY);
      return;
    }
    // 老玩家回来：离线提示 + 可签到就弹签到
    const off = this.offline;
    if (off && off.ms >= OFFLINE_HINT_MIN_MS) {
      const h = Math.floor(off.ms / 3600000);
      const m = Math.floor((off.ms % 3600000) / 60000);
      const when = h > 0 ? `${h} 小时 ${m} 分` : `${m} 分钟`;
      this.toast.show(off.energyGained > 0 ? `离开了 ${when}，体力恢复 +${off.energyGained}` : `欢迎回来，离开了 ${when}`);
    }
    if (this.gs.daily.canClaim(now())) this.scheduleOnce(() => this.dailyPanel.open(), 0.6);
  }

  onDestroy(): void {
    game.off(Game.EVENT_HIDE, this.onHide, this);
    game.off(Game.EVENT_SHOW, this.onShow, this);
  }

  /** 切后台：本地存一份，云端立刻推 */
  private onHide(): void {
    if (this.resetting) return;
    const json = this.gs.toJSON();
    writeSaveJSON(this.store, json);
    void flushCloudSave(json);
  }

  /** 回前台：重新校时，再把离线期间的恢复结算掉；校过时了就把攒着的存档推上去 */
  private onShow(): void {
    void syncServerTime().then((ok) => {
      this.gs.tick();
      if (ok) void flushCloudSave();
    });
  }

  // ---------- UI ----------
  private buildUI(): void {
    const visH = view.getVisibleSize().height;
    const contentW = DESIGN_W - SIDE * 2;
    const cell = 96;
    const hudH = 100;
    const ordersH = 190;
    const boardH = BOARD_ROWS * cell + 20;
    const boardW = BOARD_COLS * cell + 20;
    const barH = 90;
    const gap = 12;
    const safeTop = Math.max(40, topInset(DESIGN_W)); // 微信里避开胶囊按钮
    const bodyH = ordersH + gap + boardH; // 两页共用的中间区域高度
    const total = safeTop + hudH + gap + bodyH + gap + barH + 20;

    // 屏幕比设计高度矮（iPad 等）时整体缩小
    const scale = Math.min(1, visH / total);
    this.node.setScale(scale, scale, 1);

    const top = total / 2 - safeTop;
    const hudY = top - hudH / 2;
    const bodyTop = top - hudH - gap;
    const barY = bodyTop - bodyH - gap - barH / 2;

    // 全屏壁纸：挂在 Canvas 下、最底层、按“覆盖”方式缩放，不受 Game 节点缩放影响
    const wallpaper = Art.background();
    if (wallpaper && this.node.parent) {
      const visW = view.getVisibleSize().width;
      const bg = new Node('wallpaper');
      bg.layer = Layers.Enum.UI_2D;
      const ut = bg.addComponent(UITransform);
      const r = wallpaper.rect;
      const s = Math.max(visW / r.width, visH / r.height);
      ut.setContentSize(r.width * s, r.height * s);
      const sp = bg.addComponent(Sprite);
      sp.sizeMode = Sprite.SizeMode.CUSTOM;
      sp.trim = false;
      sp.spriteFrame = wallpaper;
      this.node.parent.addChild(bg);
      bg.setSiblingIndex(0);
    }

    // 顶栏（两页共用）
    const hudNode = makeNode('hud', this.node, contentW, hudH, 0, hudY);
    this.hudNode = hudNode;
    this.hud = hudNode.addComponent(Hud);
    this.hud.init(this.gs, contentW, hudH);

    // ===== 棋盘页 =====
    this.boardPage = makeNode('page-board', this.node, DESIGN_W, total);
    const ordersNode = makeNode('orders', this.boardPage, contentW, ordersH, 0, bodyTop - ordersH / 2);
    this.ordersNode = ordersNode;
    this.orderPanel = ordersNode.addComponent(OrderPanel);
    this.orderPanel.init(this.gs, contentW, ordersH);

    const boardNode = makeNode('board', this.boardPage, boardW, boardH, 0, bodyTop - ordersH - gap - boardH / 2);
    this.boardView = boardNode.addComponent(BoardView);
    this.boardView.init(this.gs, cell);
    this.boardView.onSelect = (id) => {
      this.selectedId = id;
      this.updateSellButton();
    };

    const bar = makeNode('bar', this.boardPage, contentW, barH, 0, barY);
    let x = -contentW / 2;
    this.dailyBadge = makeDailyBadge(bar, x + 45, 0, () => this.dailyPanel.open());
    x += 90 + gap;
    this.restaurantBtn = makeButton(bar, '餐厅', 120, 60, THEME.accentDark, () => this.showPage('restaurant'), x + 60);
    x += 120 + gap;
    makeButton(bar, '补充体力', 190, 60, THEME.energy, () => this.energyPanel.open(), x + 95);
    x += 190 + gap;
    this.sellBtn = makeButton(bar, '出售', contentW / 2 - x, 60, THEME.accent, () => this.onSell(), x + (contentW / 2 - x) / 2);
    this.sellBtn.active = false;

    // ===== 餐厅页 =====
    this.restaurantPage = makeNode('page-restaurant', this.node, DESIGN_W, total);
    const restH = 520;
    const restNode = makeNode('restaurant', this.restaurantPage, contentW, restH, 0, bodyTop - restH / 2);
    this.restaurantView = restNode.addComponent(RestaurantView);
    this.restaurantView.init(this.gs, contentW, restH);

    const taskH = bodyH - restH - gap;
    const taskNode = makeNode('tasks', this.restaurantPage, contentW, taskH, 0, bodyTop - restH - gap - taskH / 2);
    this.taskPanel = taskNode.addComponent(TaskPanel);
    this.taskPanel.init(this.gs, contentW, taskH);
    this.taskPanel.onGoBoard = () => this.showPage('board');
    this.taskPanel.setChapter(this.restaurantView.chapter);
    this.restaurantView.onChapterChange = (ch) => this.taskPanel.setChapter(ch);

    const bar2 = makeNode('bar', this.restaurantPage, contentW, barH, 0, barY);
    makeButton(bar2, '返回棋盘', 300, 60, THEME.accentDark, () => this.showPage('board'), -contentW / 2 + 150);
    makeButton(bar2, '补充体力', 300, 60, THEME.energy, () => this.energyPanel.open(), contentW / 2 - 150);
    this.restaurantPage.active = false;

    // 页脚：调试用清档（发布前把 DEBUG_TOOLS 关掉），点了要在弹窗里再确认
    if (DEBUG_TOOLS) {
      const footer = makeButton(this.node, '调试：清档重开', 200, 26, '#D9C3AE', () => this.resetPopup?.open(), 0, -total / 2 - 6);
      const fl = footer.getChildByName('label')?.getComponent(Label);
      if (fl) fl.fontSize = 12;
    }

    // 新手引导（箭头 + 提示），在棋盘页里，随页面一起显示/隐藏
    const tutorialNode = makeNode('tutorial', this.boardPage, DESIGN_W, total, 0, 0);
    this.tutorial = tutorialNode.addComponent(Tutorial);
    this.tutorial.init(this.gs, { boardView: this.boardView, boardNode, ordersNode, orderPanel: this.orderPanel, restaurantBtn: this.restaurantBtn });

    const popupW = view.getVisibleSize().width / scale;
    const popupH = visH / scale;
    const dailyNode = makeNode('daily', this.node, popupW, popupH, 0, 0);
    this.dailyPanel = dailyNode.addComponent(DailyPanel);
    this.dailyPanel.init(this.gs, DESIGN_W, total);
    const energyNode = makeNode('energy', this.node, popupW, popupH, 0, 0);
    this.energyPanel = energyNode.addComponent(EnergyPanel);
    this.energyPanel.init(this.gs, DESIGN_W, total);
    this.energyPanel.toast = (t) => this.toast.show(t);

    const storyNode = makeNode('story', this.node, view.getVisibleSize().width / scale, visH / scale, 0, 0);
    this.story = storyNode.addComponent(StoryDialog);
    this.story.init(DESIGN_W, total);

    if (DEBUG_TOOLS) {
      const resetNode = makeNode('reset', this.node, popupW, popupH, 0, 0);
      this.resetPopup = resetNode.addComponent(Popup);
      this.resetPopup.init(DESIGN_W, total, 480, 240, '清档重开');
      addLabel(this.resetPopup.content, '本地和云端存档都会删掉，不能恢复', { size: 18, color: hex(THEME.textLight), y: 30 });
      makeButton(this.resetPopup.content, '确认清档', 220, 56, THEME.danger, () => this.onReset(), 0, -40);
    }

    // 最后创建，保证盖在弹窗和剧情遮罩上面
    const toastNode = makeNode('toast', this.node, 560, 56, 0, 0);
    this.toast = toastNode.addComponent(Toast);
    this.toast.init(560);
  }

  private bindEvents(): void {
    const ev = this.gs.events;
    ev.on('toast', (t) => this.toast.show(t));
    ev.on('merge', () => {
      vibrateShort();
      Audio.play('merge');
    });
    ev.on('levelup', (lv) => {
      Audio.play('levelup');
      this.toast.show(`升到 ${lv} 级！体力 +${LEVEL_UP_REWARD.energy}，金币 +${LEVEL_UP_REWARD.coinsPerLevel * lv}`);
    });
    ev.on('delivered', (d) => {
      Audio.play('coin');
      this.toast.show(`${d.order.customer} 很满意 +${d.order.coins} 金币`);
      this.flyCoins(this.ordersNode.position, Math.min(8, 3 + Math.floor(d.order.coins / 40)));
    });
    ev.on('taskDone', (t) => {
      Audio.play('task');
      this.toast.show(`「${t.task.name}」完成 +${t.task.xp} 经验`);
    });
    ev.on('story', (lines) => this.story.show(lines));
    ev.on('dailyClaimed', (e) => {
      const parts = [e.reward.coins ? `金币 +${e.reward.coins}` : '', e.reward.energy ? `体力 +${e.reward.energy}` : ''].filter(Boolean);
      this.toast.show(`第 ${e.day} 天签到：${parts.join('，')}`);
    });
    ev.on('change', () => {
      this.updateSellButton();
      this.updateRestaurantBadge();
      this.dailyBadge.setDot(this.gs.daily.canClaim(now()));
      this.markDirty();
    });
    this.dailyBadge.setDot(this.gs.daily.canClaim(now()));
    // 体力 / 充能的定时结算只需要存档，数字由 onSecond 每秒刷新
    ev.on('tick', () => this.markDirty());
    this.updateRestaurantBadge();
  }

  private showPage(p: Page): void {
    this.page = p;
    this.boardView.cancelDrag();
    if (p === 'restaurant') this.tutorial.onRestaurantOpened();
    this.boardPage.active = p === 'board';
    this.restaurantPage.active = p === 'restaurant';
    if (p === 'restaurant') this.boardView.select(-1);
  }

  private updateSellButton(): void {
    const entry = this.gs.board.entries().find((e) => e.item.id === this.selectedId);
    if (!entry || entry.item.kind !== 'item') {
      this.selectedId = -1;
      this.sellBtn.active = false;
      return;
    }
    const label = this.sellBtn.getChildByName('label')?.getComponent(Label);
    if (label) label.string = `出售 ${itemName(entry.item.chain, entry.item.level)} +${sellPrice(entry.item.level)}`;
    this.sellBtn.active = true;
  }

  /** 餐厅按钮上显示现在能做几个装修任务 */
  private updateRestaurantBadge(): void {
    const g = this.gs;
    const ready = g.decor.currentTasks().filter((t) => g.decor.check(t.task, g.player.coins, g.board).ok).length;
    const label = this.restaurantBtn.getChildByName('label')?.getComponent(Label);
    if (label) label.string = ready > 0 ? `餐厅 (${ready})` : '餐厅';
  }

  // ---------- 按钮 ----------
  private onSell(): void {
    const entry = this.gs.board.entries().find((e) => e.item.id === this.selectedId);
    if (!entry) return;
    this.gs.sell(entry.idx);
    Audio.play('sell');
    this.boardView.select(-1);
  }

  private onReset(): void {
    if (this.resetting) return;
    this.resetting = true;
    this.unschedule(this.saveNow);
    clearSave(this.store);
    // 云端那份也删掉，不然重开后又会把旧档拉回来
    void clearCloudSave().finally(() => director.loadScene(director.getScene()!.name));
  }

  /** 几枚金币从 from 飞到顶栏金币图标，到了弹一下 */
  private flyCoins(from: Vec3, count: number): void {
    const frame = Art.icon('coin');
    if (!frame) return;
    const target = new Vec3(this.hudNode.position.x + this.hud.coinLocal.x, this.hudNode.position.y + this.hud.coinLocal.y, 0);
    for (let i = 0; i < count; i++) {
      const c = makeSprite('coin-fly', this.node, frame, 34, 34, from.x + (Math.random() - 0.5) * 160, from.y + (Math.random() - 0.5) * 60);
      c.setScale(0.6, 0.6, 1);
      tween(c)
        .delay(i * 0.05)
        .to(0.12, { scale: new Vec3(1, 1, 1) })
        .to(0.45, { position: target, scale: new Vec3(0.5, 0.5, 1) }, { easing: 'quadIn' })
        .call(() => {
          c.destroy();
          this.hud.bumpCoin();
        })
        .start();
    }
  }

  // ---------- 定时 / 存档 ----------
  private onSecond(): void {
    this.gs.tick();
    const t = now();
    this.hud.refresh(t);
    if (this.page === 'board') {
      this.boardView.refresh(t);
      this.orderPanel.refreshSkip(t);
    }
    this.dailyBadge.setDot(this.gs.daily.canClaim(t));
  }

  private markDirty(): void {
    this.unschedule(this.saveNow);
    this.scheduleOnce(this.saveNow, 0.5);
  }

  private saveNow(): void {
    if (this.resetting) return;
    const json: GameJSON = this.gs.toJSON();
    writeSaveJSON(this.store, json);
    pushCloudSave(json);
  }
}
