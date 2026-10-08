import { AREAS, CHAPTERS, TOTAL_TASKS, areasOfChapter, findTask } from '../config/Decor';
import type { DecorArea, DecorTask, TaskRef } from '../config/Decor';
import type { Board } from './Board';

export interface DecorJSON {
  done: string[];
}

export interface TaskCheck {
  ok: boolean;
  coinsOk: boolean;
  itemsOk: boolean;
}

/**
 * 装修进度：记录完成了哪些任务。
 * 规则：区域内任务按顺序做；区域要等它 requires 的任务完成才开放。
 */
export class Decor {
  private done: string[] = [];

  isDone(taskId: string): boolean {
    return this.done.includes(taskId);
  }

  /** 区域已完成任务数 = 装修等级 */
  areaLevel(areaId: string): number {
    const area = AREAS.find((a) => a.id === areaId);
    if (!area) return 0;
    return area.tasks.filter((t) => this.done.includes(t.id)).length;
  }

  isAreaUnlocked(area: DecorArea): boolean {
    return !area.requires || this.isDone(area.requires);
  }

  isAreaFinished(area: DecorArea): boolean {
    return area.tasks.every((t) => this.done.includes(t.id));
  }

  /** 区域当前待做的任务；没开放或做完了返回 null */
  nextTask(area: DecorArea): TaskRef | null {
    if (!this.isAreaUnlocked(area)) return null;
    const index = area.tasks.findIndex((t) => !this.done.includes(t.id));
    if (index < 0) return null;
    return { area, task: area.tasks[index], index };
  }

  /** 每个已开放区域的下一个任务，按区域配置顺序；传 chapter 只看该章 */
  currentTasks(chapter?: number): TaskRef[] {
    const out: TaskRef[] = [];
    for (const area of AREAS) {
      if (chapter !== undefined && area.chapter !== chapter) continue;
      const t = this.nextTask(area);
      if (t) out.push(t);
    }
    return out;
  }

  /** 章节里有任何区域开放就算章节开放 */
  isChapterUnlocked(chapter: number): boolean {
    return areasOfChapter(chapter).some((a) => this.isAreaUnlocked(a));
  }

  isChapterFinished(chapter: number): boolean {
    const areas = areasOfChapter(chapter);
    return areas.length > 0 && areas.every((a) => this.isAreaFinished(a));
  }

  /** 章节进度：已完成 / 总任务 */
  chapterProgress(chapter: number): { done: number; total: number } {
    let done = 0;
    let total = 0;
    for (const a of areasOfChapter(chapter)) {
      total += a.tasks.length;
      done += a.tasks.filter((t) => this.done.includes(t.id)).length;
    }
    return { done, total };
  }

  /** 当前最靠后的已开放章节（餐厅页默认显示它） */
  latestChapter(): number {
    let latest = CHAPTERS[0].id;
    for (const c of CHAPTERS) if (this.isChapterUnlocked(c.id)) latest = c.id;
    return latest;
  }

  /** 完成某任务会让哪些区域新开放（用来播区域引子剧情） */
  areasUnlockedBy(taskId: string): DecorArea[] {
    return AREAS.filter((a) => a.requires === taskId);
  }

  /** 这个任务现在能不能做（必须是所在区域的下一个任务） */
  isCurrent(taskId: string): boolean {
    const ref = findTask(taskId);
    if (!ref) return false;
    const next = this.nextTask(ref.area);
    return !!next && next.task.id === taskId;
  }

  check(task: DecorTask, coins: number, board: Board): TaskCheck {
    const coinsOk = coins >= task.coins;
    const itemsOk = board.hasItems(task.items);
    return { ok: coinsOk && itemsOk, coinsOk, itemsOk };
  }

  /** 只负责记账，资源扣除由 GameState 做 */
  markDone(taskId: string): void {
    if (!this.done.includes(taskId)) this.done.push(taskId);
  }

  get doneCount(): number {
    return this.done.length;
  }

  get totalCount(): number {
    return TOTAL_TASKS;
  }

  toJSON(): DecorJSON {
    return { done: [...this.done] };
  }

  static fromJSON(d: DecorJSON | undefined): Decor {
    const x = new Decor();
    // 存档里可能有已经被删掉的任务 id，过滤掉
    x.done = (d?.done ?? []).filter((id) => !!findTask(id));
    return x;
  }
}
