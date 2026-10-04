/**
 * Minimal human-reviewed strings for supported languages.
 * In real product, these would be reviewed translations; here they are
 * quality-controlled templates keyed by language. Cache via translationCache.
 */

export type StringKey =
  | "play"
  | "sales"
  | "status"
  | "learn"
  | "boardTitle"
  | "factWhat"
  | "factWhy"
  | "factWhyNot"
  | "factTry"
  | "hintStep"
  | "reveal"
  | "explainSimply"
  | "notEnoughData"
  | "fallbackNotice";

type Dict = Record<StringKey, string>;

const DICTS: Record<string, Dict> = {
  en: {
    play: "Play",
    sales: "Sales",
    status: "Status",
    learn: "Learn",
    boardTitle: "Free board — two-player local",
    factWhat: "What to notice",
    factWhy: "Why it worked/failed",
    factWhyNot: "Why not the alternative",
    factTry: "Try next",
    hintStep: "Hint",
    reveal: "Reveal",
    explainSimply: "Explain this again more simply",
    notEnoughData: "Not enough data",
    fallbackNotice: "Translation not available — showing fallback.",
  },
  "es-MX": {
    play: "Jugar",
    sales: "Ventas",
    status: "Estado",
    learn: "Aprender",
    boardTitle: "Tablero libre — local para dos jugadores",
    factWhat: "Qué observar",
    factWhy: "Por qué funcionó/falló",
    factWhyNot: "Por qué no la alternativa",
    factTry: "Siguiente intento",
    hintStep: "Pista",
    reveal: "Mostrar",
    explainSimply: "Explícalo más simple",
    notEnoughData: "Datos insuficientes",
    fallbackNotice: "Traducción no disponible — mostrando alternativa.",
  },
  hi: {
    play: "खेलें",
    sales: "बिक्री",
    status: "स्थिति",
    learn: "सीखें",
    boardTitle: "फ्री बोर्ड — दो खिलाड़ी",
    factWhat: "क्या देखें",
    factWhy: "यह क्यों सफल/विफल रहा",
    factWhyNot: "विकल्प क्यों नहीं",
    factTry: "अगला प्रयास",
    hintStep: "संकेत",
    reveal: "दिखाएँ",
    explainSimply: "इसे और सरल समझाएँ",
    notEnoughData: "पर्याप्त डेटा नहीं",
    fallbackNotice: "अनुवाद उपलब्ध नहीं — वैकल्पिक दिखाया जा रहा है।",
  },
  ar: {
    play: "العب",
    sales: "المبيعات",
    status: "الحالة",
    learn: "تعلّم",
    boardTitle: "لوحة مجانية — لاعبان محليًا",
    factWhat: "ما الذي تلاحظه",
    factWhy: "لماذا نجحت/فشلت",
    factWhyNot: "لماذا ليس البديل",
    factTry: "حاول التالي",
    hintStep: "تلميح",
    reveal: "اكشف",
    explainSimply: "اشرحها ببساطة أكثر",
    notEnoughData: "لا توجد بيانات كافية",
    fallbackNotice: "الترجمة غير متوفرة — يتم عرض البديل.",
  },
  "zh-Hant": {
    play: "開始對弈",
    sales: "銷售",
    status: "狀態",
    learn: "學習",
    boardTitle: "免費棋盤 — 雙人本地對弈",
    factWhat: "觀察重點",
    factWhy: "為何成功/失敗",
    factWhyNot: "為何不是另一著",
    factTry: "下一步嘗試",
    hintStep: "提示",
    reveal: "顯示答案",
    explainSimply: "再用更簡單的話解釋",
    notEnoughData: "資料不足",
    fallbackNotice: "翻譯不可用 — 顯示備援內容。",
  },
  ja: {
    play: "対局",
    sales: "販売",
    status: "ステータス",
    learn: "学ぶ",
    boardTitle: "フリーボード — 2人用ローカル",
    factWhat: "注目ポイント",
    factWhy: "なぜ成功/失敗したか",
    factWhyNot: "なぜ別の一手ではないか",
    factTry: "次の一手を試す",
    hintStep: "ヒント",
    reveal: "答えを見る",
    explainSimply: "もっと簡単に説明して",
    notEnoughData: "データが不足しています",
    fallbackNotice: "翻訳が利用できません — 代替を表示しています。",
  },
  sw: {
    play: "Cheza",
    sales: "Mauzo",
    status: "Hali",
    learn: "Jifunze",
    boardTitle: "Ubao wa bure — wachezaji wawili",
    factWhat: "Cha kuangalia",
    factWhy: "Kwa nini ilifaulu/ilifeli",
    factWhyNot: "Kwa nini si mbadala",
    factTry: "Jaribu inayofuata",
    hintStep: "Kidokezo",
    reveal: "Fichua",
    explainSimply: "Eleza tena kwa urahisi zaidi",
    notEnoughData: "Data haitoshi",
    fallbackNotice: "Tafsiri haipatikani — inaonyesha mbadala.",
  },
  fr: {
    play: "Jouer",
    sales: "Ventes",
    status: "Statut",
    learn: "Apprendre",
    boardTitle: "Échiquier gratuit — deux joueurs en local",
    factWhat: "Quoi observer",
    factWhy: "Pourquoi ça a marché/échoué",
    factWhyNot: "Pourquoi pas l'alternative",
    factTry: "Essayer la suite",
    hintStep: "Indice",
    reveal: "Révéler",
    explainSimply: "Explique plus simplement",
    notEnoughData: "Pas assez de données",
    fallbackNotice: "Traduction indisponible — affichage du contenu de repli.",
  },
};

export function t(tag: string, key: StringKey): string {
  const d = DICTS[tag] ?? DICTS.en;
  return d[key] ?? DICTS.en[key] ?? key;
}
