/**
 * 装修系统的全部内容配置：区域 → 任务 → 花费 / 奖励 / 解锁 / 剧情。
 * 策划加内容只改这个文件。任务 id 会写进存档，改 id 等于让玩家重做。
 */
import type { ItemReq } from '../core/Board';

export interface StoryLine {
  speaker: string;
  text: string;
}

export interface DecorTask {
  id: string;
  name: string;
  /** 花费金币 */
  coins: number;
  /** 犒劳工人要交的菜（从棋盘扣） */
  items: ItemReq[];
  /** 完成给的经验 */
  xp: number;
  /** 完成后解锁的合成链（会往棋盘放对应生成器） */
  unlockChain?: string;
  /** 完成后的剧情 */
  story?: StoryLine[];
}

export interface DecorArea {
  id: string;
  name: string;
  /** 所属章节，餐厅页按章节分页显示 */
  chapter: number;
  /** 区域主色，装修等级越高越鲜艳 */
  color: string;
  /** 需要先完成的任务 id；不填一开始就开放 */
  requires?: string;
  /** 区域刚开放时播的引子剧情 */
  intro?: StoryLine[];
  /** 顺序完成 */
  tasks: DecorTask[];
}

export interface ChapterDef {
  id: number;
  name: string;
  /** 章节标语，显示在餐厅页信息格 */
  slogan: string;
}

export const CHAPTERS: ChapterDef[] = [
  { id: 1, name: '重开餐厅', slogan: '把外婆的餐厅修回来' },
  { id: 2, name: '生意兴隆', slogan: '客人越来越多，餐厅要长大了' },
];

/** 新档开场剧情 */
export const INTRO_STORY: StoryLine[] = [
  { speaker: '小美', text: '这就是外婆留下的餐厅……去年那场火之后就一直荒着。' },
  { speaker: '小美', text: '招牌烧焦了，桌椅也塌了一半。不过，厨房的炉子好像还能用？' },
  { speaker: '小美', text: '先把东西合起来做几道菜卖给街坊，攒点钱，一点一点把它修回来吧！' },
];

export const AREAS: DecorArea[] = [
  {
    id: 'facade',
    chapter: 1,
    name: '门面',
    color: '#E8A25B',
    tasks: [
      {
        id: 'facade-1',
        name: '清理废墟',
        coins: 20,
        items: [],
        xp: 10,
        story: [
          { speaker: '小美', text: '门口的焦木头总算清出去了，终于能看见门牌了。' },
          { speaker: '隔壁老王', text: '哟，小美回来啦？你外婆的手艺我可惦记了一整年。' },
        ],
      },
      { id: 'facade-2', name: '修补招牌', coins: 30, items: [{ chain: 'bread', level: 2, count: 1 }], xp: 15 },
      { id: 'facade-3', name: '刷新门漆', coins: 60, items: [{ chain: 'veg', level: 3, count: 1 }], xp: 25 },
      {
        id: 'facade-4',
        name: '挂上花篮',
        coins: 120,
        items: [{ chain: 'drink', level: 4, count: 1 }],
        xp: 40,
        story: [{ speaker: '小美', text: '花篮挂好了。路过的人开始探头往里看，快开门营业吧！' }],
      },
    ],
  },
  {
    id: 'hall',
    chapter: 1,
    name: '大堂',
    color: '#D98C6B',
    requires: 'facade-1',
    tasks: [
      {
        id: 'hall-1',
        name: '清理桌椅',
        coins: 30,
        items: [{ chain: 'bread', level: 2, count: 1 }],
        xp: 15,
        story: [{ speaker: '工人师傅', text: '桌椅还能修，就是得管饭。你这面粉揉的面包，不赖！' }],
      },
      { id: 'hall-2', name: '换新桌布', coins: 50, items: [{ chain: 'bread', level: 3, count: 2 }], xp: 25 },
      {
        id: 'hall-3',
        name: '装上吊灯',
        coins: 110,
        items: [
          { chain: 'drink', level: 3, count: 1 },
          { chain: 'veg', level: 3, count: 1 },
        ],
        xp: 40,
      },
      {
        id: 'hall-4',
        name: '挂上壁画',
        coins: 160,
        items: [{ chain: 'bread', level: 5, count: 1 }],
        xp: 60,
        story: [{ speaker: '小美', text: '这幅画是外婆年轻时画的海边。挂回原来的位置，大堂就完整了。' }],
      },
    ],
  },
  {
    id: 'kitchen',
    chapter: 1,
    name: '厨房',
    color: '#C97B7B',
    requires: 'hall-1',
    tasks: [
      {
        id: 'kitchen-1',
        name: '修好炉灶',
        coins: 50,
        items: [{ chain: 'veg', level: 2, count: 2 }],
        xp: 20,
        unlockChain: 'meat',
        story: [
          { speaker: '工人师傅', text: '炉灶通了！火力足得很，烤个肉不在话下。' },
          { speaker: '小美', text: '太好了，终于能做肉菜了。棋盘上多了个新生成器，去看看！' },
        ],
      },
      { id: 'kitchen-2', name: '添置厨具', coins: 100, items: [{ chain: 'meat', level: 3, count: 1 }], xp: 40 },
      {
        id: 'kitchen-3',
        name: '装大烤箱',
        coins: 180,
        items: [{ chain: 'meat', level: 5, count: 1 }],
        xp: 70,
        story: [{ speaker: '小美', text: '大烤箱到位，整只烤鸡也不成问题了。街坊们有口福了。' }],
      },
    ],
  },
  {
    id: 'bar',
    chapter: 1,
    name: '吧台',
    color: '#7BA7C9',
    requires: 'kitchen-1',
    tasks: [
      {
        id: 'bar-1',
        name: '修好吧台',
        coins: 80,
        items: [{ chain: 'drink', level: 3, count: 2 }],
        xp: 30,
        unlockChain: 'dessert',
        story: [
          { speaker: '美食博主', text: '有吧台了？那甜品和饮品一定要配上，我帮你发条推荐！' },
          { speaker: '小美', text: '甜品生成器解锁了，先从方糖开始合吧。' },
        ],
      },
      { id: 'bar-2', name: '装上酒架', coins: 150, items: [{ chain: 'drink', level: 5, count: 1 }], xp: 50 },
      {
        id: 'bar-3',
        name: '霓虹灯牌',
        coins: 240,
        items: [{ chain: 'dessert', level: 4, count: 1 }],
        xp: 80,
        story: [{ speaker: '小美', text: '灯牌亮起来的那一刻，整条街都看过来了。' }],
      },
    ],
  },
  {
    id: 'garden',
    chapter: 1,
    name: '花园',
    color: '#7FBF7F',
    requires: 'facade-3',
    tasks: [
      {
        id: 'garden-1',
        name: '除掉杂草',
        coins: 60,
        items: [{ chain: 'veg', level: 2, count: 1 }],
        xp: 20,
        story: [{ speaker: '小美', text: '杂草底下居然还有外婆种的薄荷，闻着就想起小时候。' }],
      },
      { id: 'garden-2', name: '砌个花坛', coins: 120, items: [{ chain: 'veg', level: 4, count: 1 }], xp: 40 },
      {
        id: 'garden-3',
        name: '装上秋千',
        coins: 200,
        items: [
          { chain: 'dessert', level: 3, count: 1 },
          { chain: 'drink', level: 4, count: 1 },
        ],
        xp: 80,
        story: [
          { speaker: '隔壁老王', text: '秋千也装回来了？你外婆当年就坐在这儿看你在院子里跑。' },
          { speaker: '小美', text: '嗯。餐厅回来了，外婆的味道也回来了。（第一章 完）' },
        ],
      },
    ],
  },

  // ===================== 第二章：生意兴隆 =====================
  {
    id: 'terrace',
    chapter: 2,
    name: '露台',
    color: '#E29A5C',
    requires: 'garden-3',
    intro: [
      { speaker: '美食博主', text: '我那条视频火了！评论区都在问你们家在哪儿。' },
      { speaker: '小美', text: '客人都排到门口了……后面那块空地，能不能改成露台？' },
    ],
    tasks: [
      {
        id: 'terrace-1',
        name: '铺露台地板',
        coins: 200,
        items: [{ chain: 'bread', level: 4, count: 2 }],
        xp: 90,
        story: [{ speaker: '工人师傅', text: '木板铺好了，踩上去咚咚响，结实得很！' }],
      },
      { id: 'terrace-2', name: '露台桌椅', coins: 260, items: [{ chain: 'veg', level: 5, count: 1 }], xp: 100 },
      {
        id: 'terrace-3',
        name: '撑起遮阳伞',
        coins: 320,
        items: [
          { chain: 'drink', level: 5, count: 1 },
          { chain: 'meat', level: 4, count: 1 },
        ],
        xp: 120,
      },
      {
        id: 'terrace-4',
        name: '挂露台灯串',
        coins: 400,
        items: [{ chain: 'dessert', level: 5, count: 1 }],
        xp: 150,
        story: [{ speaker: '隔壁老王', text: '晚上亮起来像过节似的，老头子我也要来坐坐。' }],
      },
    ],
  },
  {
    id: 'coffee',
    chapter: 2,
    name: '咖啡角',
    color: '#B07A4F',
    requires: 'terrace-1',
    intro: [{ speaker: '美食博主', text: '有露台没咖啡？那可不行，我帮你联系了一台二手咖啡机。' }],
    tasks: [
      {
        id: 'coffee-1',
        name: '装咖啡机',
        coins: 240,
        items: [{ chain: 'dessert', level: 3, count: 2 }],
        xp: 100,
        unlockChain: 'coffee',
        story: [{ speaker: '小美', text: '咖啡机到了！棋盘上多了个新生成器，先从咖啡豆合起吧。' }],
      },
      { id: 'coffee-2', name: '咖啡豆架', coins: 300, items: [{ chain: 'coffee', level: 3, count: 1 }], xp: 110 },
      { id: 'coffee-3', name: '手冲吧台', coins: 380, items: [{ chain: 'coffee', level: 5, count: 1 }], xp: 130 },
      {
        id: 'coffee-4',
        name: '招牌拉花',
        coins: 450,
        items: [
          { chain: 'coffee', level: 5, count: 1 },
          { chain: 'dessert', level: 4, count: 1 },
        ],
        xp: 160,
        story: [{ speaker: '美食博主', text: '这杯拉花我要发首页！' }],
      },
    ],
  },
  {
    id: 'kids',
    chapter: 2,
    name: '儿童角',
    color: '#F2C94C',
    requires: 'terrace-2',
    intro: [{ speaker: '王阿姨', text: '带孙子来吃饭，他老往桌底下钻，要是有个地方玩就好了。' }],
    tasks: [
      { id: 'kids-1', name: '铺软垫地板', coins: 260, items: [{ chain: 'bread', level: 3, count: 2 }], xp: 100 },
      {
        id: 'kids-2',
        name: '摆绘本架',
        coins: 320,
        items: [
          { chain: 'dessert', level: 4, count: 1 },
          { chain: 'veg', level: 4, count: 1 },
        ],
        xp: 120,
      },
      {
        id: 'kids-3',
        name: '装小滑梯',
        coins: 420,
        items: [
          { chain: 'meat', level: 5, count: 1 },
          { chain: 'drink', level: 4, count: 1 },
        ],
        xp: 150,
        story: [{ speaker: '豆豆', text: '滑梯！我要天天来！' }],
      },
    ],
  },
  {
    id: 'delivery',
    chapter: 2,
    name: '外卖窗口',
    color: '#E5533D',
    requires: 'coffee-1',
    intro: [{ speaker: '外卖小哥', text: '你们家单子多得我都跑不过来，开个窗口让我直接取多好。' }],
    tasks: [
      { id: 'delivery-1', name: '开外卖窗口', coins: 300, items: [{ chain: 'meat', level: 3, count: 2 }], xp: 110 },
      { id: 'delivery-2', name: '装保温柜', coins: 380, items: [{ chain: 'veg', level: 5, count: 1 }], xp: 130 },
      {
        id: 'delivery-3',
        name: '搭电动车棚',
        coins: 450,
        items: [
          { chain: 'bread', level: 5, count: 1 },
          { chain: 'coffee', level: 4, count: 1 },
        ],
        xp: 160,
        story: [{ speaker: '外卖小哥', text: '有棚子下雨也不怕了，谢了老板！' }],
      },
    ],
  },
  {
    id: 'room',
    chapter: 2,
    name: '二楼包间',
    color: '#C0392B',
    requires: 'delivery-2',
    intro: [{ speaker: '小美', text: '楼上是外婆以前招待老朋友的地方，火灾之后我一直不敢上去。' }],
    tasks: [
      {
        id: 'room-1',
        name: '修好楼梯',
        coins: 420,
        items: [{ chain: 'bread', level: 5, count: 2 }],
        xp: 150,
        story: [{ speaker: '工人师傅', text: '楼梯稳了。上面那间屋子，收拾收拾还是好地方。' }],
      },
      {
        id: 'room-2',
        name: '包间装修',
        coins: 560,
        items: [
          { chain: 'meat', level: 5, count: 1 },
          { chain: 'dessert', level: 5, count: 1 },
        ],
        xp: 180,
      },
      {
        id: 'room-3',
        name: '美食节宴席',
        coins: 720,
        items: [
          { chain: 'coffee', level: 6, count: 1 },
          { chain: 'drink', level: 5, count: 1 },
          { chain: 'veg', level: 5, count: 1 },
        ],
        xp: 250,
        story: [
          { speaker: '李老板', text: '街道美食节的压轴宴席，就定你家二楼了。' },
          { speaker: '小美', text: '外婆，今天楼上又坐满了。（第二章 完）' },
        ],
      },
    ],
  },
];

/** 某章节的全部区域 */
export function areasOfChapter(chapter: number): DecorArea[] {
  return AREAS.filter((a) => a.chapter === chapter);
}

export const AREA_MAP: Record<string, DecorArea> = Object.fromEntries(AREAS.map((a) => [a.id, a]));

export interface TaskRef {
  area: DecorArea;
  task: DecorTask;
  /** 在区域里的序号，0 起 */
  index: number;
}

const TASK_INDEX: Record<string, TaskRef> = {};
for (const area of AREAS) {
  area.tasks.forEach((task, index) => {
    TASK_INDEX[task.id] = { area, task, index };
  });
}

export function findTask(id: string): TaskRef | undefined {
  return TASK_INDEX[id];
}

export const TOTAL_TASKS = AREAS.reduce((n, a) => n + a.tasks.length, 0);
