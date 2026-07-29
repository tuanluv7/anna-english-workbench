/* ============================================================
 * extra.js — 补充 app.js 引用但 data.js 缺失的常量
 * 这些常量缺失会导致「复习中心 / 学习看板 / 雅思专项(upgrade·speak)」
 * 在打开时抛 ReferenceError 而整页空白。此处补齐，独立维护，不改动 data.js。
 * ============================================================ */

/* 易混淆单词对比复习本（复习中心使用） */
const CONFUSABLES = [
  { a:"affect", b:"effect", am:"动词：影响（动词用 a 开头）", bm:"名词：结果/影响（名词用 e 开头）", tip:"动词记 affect（a→action）；名词记 effect（e→end result）。", inLib:[] },
  { a:"principle", b:"principal", am:"名词：原则、原理", bm:"形容词/名词：主要的；校长", tip:"principal 含 a-l 像 pal（朋友/人）→ 指人（校长）；principle 指原则。", inLib:[] },
  { a:"advice", b:"advise", am:"名词：建议（不可数）", bm:"动词：建议", tip:"名词以 -ce 结尾，动词以 -se 结尾。", inLib:[] },
  { a:"compliment", b:"complement", am:"称赞、恭维", bm:"补充、补足（使完整）", tip:" compliment 含 i（我夸你）；complement 含 e（完整 complete）。", inLib:[] },
  { a:"except", b:"accept", am:"介词：除……之外", bm:"动词：接受", tip:"accept 含 ac-（朝向）→ 接受；except 含 ex-（出去）→ 排除。", inLib:[] },
  { a:"quite", b:"quiet", am:"副词：相当、十分", bm:"形容词：安静的", tip:"quite 表程度；quiet 表安静。", inLib:[] },
  { a:"loose", b:"lose", am:"形容词：松的、宽松的", bm:"动词：丢失、输掉", tip:"loose 双 o（松）；lose 单 o（丢）。", inLib:[] },
  { a:"desert", b:"dessert", am:"沙漠（名词）", bm:"甜点（名词）", tip:"甜点 dessert 多一个 s（甜到想吃两份）。", inLib:[] },
  { a:"economical", b:"economic", am:"节约的、划算的", bm:"经济上的、经济学的", tip:"economical 强调省钱；economic 指经济领域。", inLib:[] },
  { a:"rise", b:"raise", am:"不及物：升起（太阳rise）", bm:"及物：举起、提高（raise hand）", tip:"rise 自动上升；raise 需宾语。", inLib:[] }
];

/* 学习成就打卡（看板 + unlock 使用） */
const ACHIEVEMENTS = [
  { id:"first_word", icon:"🎯", name:"初窥门径", desc:"将第一个单词加入复习库" },
  { id:"lib20", icon:"📗", name:"小有积累", desc:"复习库累计 20 个单词" },
  { id:"lib50", icon:"📚", name:"词汇渐丰", desc:"复习库累计 50 个单词" },
  { id:"ielts_star", icon:"⭐", name:"真题猎手", desc:"掌握 10 个雅思真题高频星标词" },
  { id:"master10", icon:"💤", name:"休眠大师", desc:"将 10 个单词标记为已掌握（休眠）" },
  { id:"streak3", icon:"🔥", name:"三日之约", desc:"连续学习打卡 3 天" },
  { id:"streak7", icon:"⚡", name:"一周坚持", desc:"连续学习打卡 7 天" },
  { id:"quiz_perfect", icon:"🏆", name:"满分一刻", desc:"单次章节练习全部答对" },
  { id:"first_review", icon:"🔄", name:"复习启程", desc:"完成第一次批量复习" },
  { id:"chapter_done", icon:"✍️", name:"妙笔生花", desc:"完成第一次章节仿写归档" }
];

/* 雅思写作加分替换词库（雅思专项·upgrade 标签页使用） */
const WRITING_UPGRADES = [
  { basic:"good", up:"beneficial", note:"有益的（比 good 更书面）" },
  { basic:"bad", up:"detrimental", note:"有害的（正式替代 bad）" },
  { basic:"important", up:"crucial", note:"关键的（强调重要性）" },
  { basic:"many", up:"a multitude of", note:"大量的（避免泛泛而谈）" },
  { basic:"think", up:"contend", note:"主张、认为（学术写作）" },
  { basic:"show", up:"demonstrate", note:"证明、展示（更严谨）" },
  { basic:"use", up:"utilize", note:"利用、使用（书面化）" },
  { basic:"big", up:"substantial", note:"巨大的（形容数量/影响）" },
  { basic:"get", up:"obtain", note:"获得（替代口语 get）" },
  { basic:"help", up:"facilitate", note:"促进、使便利" },
  { basic:"problem", up:"dilemma", note:"困境、难题（更精准）" },
  { basic:"more and more", up:"an increasing number of", note:"越来越多的（避免口语化）" },
  { basic:"because", up:"owing to", note:"由于（书面因果）" },
  { basic:"happy", up:"content", note:"满意的（写作情绪描写）" }
];

/* 雅思口语跟读训练包（雅思专项·speak 标签页使用） */
const SPEAKING_PACKS = [
  { topic:"Hometown 家乡", words:["excuse","umbrella","ticket"],
    dialog:"A: Where is your hometown?\nB: It's a small coastal city. The weather is mild, but we always carry an umbrella in spring.\nA: Sounds lovely. Do you miss it?\nB: Yes, especially the local food and the friendly people there." },
  { topic:"Hobby 爱好", words:["book","handbag","ticket"],
    dialog:"A: What do you do in your free time?\nB: I enjoy reading books and sometimes I go to the cinema with a friend.\nA: Any collection?\nB: I have a small handbag collection from different cities I visited." },
  { topic:"Study 学习", words:["pencil","umbrella","ticket"],
    dialog:"A: What subject are you studying?\nB: I'm preparing for the IELTS exam. I take notes with a pencil every day.\nA: That's disciplined!\nB: Thank you. A ticket to a good university is worth the effort." }
];
