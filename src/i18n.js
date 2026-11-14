// UI strings (English / Russian) and a tiny translation helper.

export const STRINGS = {
  en: {
    pageTitle: 'Black cat',
    loading: 'The cat is waking up…',
    defaultName: 'Chernushka',
    subtitle: 'A black Scottish Fold. Click the name to rename her.',
    togglePanel: 'Show / hide panel',
    poses: 'Poses',
    'pose.stand': 'Stand',
    'pose.sit': 'Sit',
    'pose.loaf': 'Loaf',
    'pose.sphinx': 'Sphinx',
    'pose.side': 'Lie on side',
    'pose.sleep': 'Sleep',
    'pose.back': 'Belly up',
    actions: 'Actions',
    'act.sniff': 'Sniff a sock',
    'act.yawn': 'Yawn',
    'act.meow': 'Meow',
    'act.blep': 'Blep',
    'act.wash': 'Wash',
    'act.stretch': 'Stretch',
    games: 'Games',
    laser: 'Laser',
    toy: 'Throw a mouse',
    settings: 'Settings',
    collar: 'Collar',
    'collar.pink': 'pink',
    'collar.green': 'green',
    'collar.none': 'no collar',
    life: 'Lives her own life',
    sound: 'Sound',
    fur: 'Fluffy fur',
    language: 'Language',
    hint: '<b>Pet her</b> — hold the mouse button on her head or back and move.<br>' +
      '<b>Nose</b> — click for a boop. <b>Tail</b> — better not touch it.<br>' +
      'When she lies <b>belly up</b>, try rubbing the belly…<br>' +
      '<b>Laser</b> — move the mouse over the rug, hold still and she pounces.<br>' +
      'Rotate the camera by dragging empty space, zoom with the wheel.',
    'e.meow': 'meow!',
    'e.blep': 'blep',
    'e.sniff': 'sniff sniff',
    'e.boop': 'boop!',
    'e.tail': "don't touch the tail!",
    'e.trap': 'gotcha!',
    'e.chirp': 'mrr?',
    'e.wake': 'mm?',
    'e.wiggle': 'wiggle…',
    'e.pounce': 'pounce!',
    'e.caught': 'got it!',
    'e.purr': 'purr',
    'e.zzz': 'Z z z',
  },
  ru: {
    pageTitle: 'Чёрная кошка',
    loading: 'Кошка просыпается…',
    defaultName: 'Чернушка',
    subtitle: 'Чёрная вислоушка. Имя можно поменять — просто нажми на него.',
    togglePanel: 'Скрыть / показать панель',
    poses: 'Позы',
    'pose.stand': 'Стоять',
    'pose.sit': 'Сесть',
    'pose.loaf': 'Буханочка',
    'pose.sphinx': 'Сфинкс',
    'pose.side': 'Лечь на бок',
    'pose.sleep': 'Спать',
    'pose.back': 'Пузиком кверху',
    actions: 'Действия',
    'act.sniff': 'Понюхать носок',
    'act.yawn': 'Зевнуть',
    'act.meow': 'Мяукнуть',
    'act.blep': 'Блеп',
    'act.wash': 'Умыться',
    'act.stretch': 'Потянуться',
    games: 'Игры',
    laser: 'Лазер',
    toy: 'Кинуть мышку',
    settings: 'Настройки',
    collar: 'Ошейник',
    'collar.pink': 'розовый',
    'collar.green': 'зелёный',
    'collar.none': 'без ошейника',
    life: 'Живёт своей жизнью',
    sound: 'Звук',
    fur: 'Пушистый мех',
    language: 'Язык',
    hint: '<b>Погладь</b> — зажми кнопку мыши на голове или спинке и води.<br>' +
      '<b>Нос</b> — клик = буп. <b>Хвост</b> — лучше не трогать.<br>' +
      'Когда лежит <b>пузиком кверху</b> — попробуй почесать живот…<br>' +
      '<b>Лазер</b> — води мышкой по коврику, замри — и она прыгнет.<br>' +
      'Крутить камеру — тяни за пустое место, колесо — зум.',
    'e.meow': 'мяу!',
    'e.blep': 'блеп',
    'e.sniff': 'нюх-нюх',
    'e.boop': 'буп!',
    'e.tail': 'не трогай хвост!',
    'e.trap': 'попался!',
    'e.chirp': 'мр?',
    'e.wake': 'м?',
    'e.wiggle': 'вжух…',
    'e.pounce': 'цап!',
    'e.caught': 'поймала!',
    'e.purr': 'мурр',
    'e.zzz': 'Z z z',
  },
};

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } },
};

// Russian by default; a language picked in the settings is remembered
let lang = store.get('lang') || 'ru';
if (!STRINGS[lang]) lang = 'en';

export const getLang = () => lang;
export const t = (key) => STRINGS[lang][key] ?? STRINGS.en[key] ?? key;

/** Switch language, persist it and re-render every [data-i18n] element. */
export function setLang(next) {
  if (!STRINGS[next]) return;
  lang = next;
  store.set('lang', next);
  applyI18n();
}

export function applyI18n(root = document) {
  document.documentElement.lang = lang;
  document.title = t('pageTitle');
  root.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  root.querySelectorAll('[data-i18n-html]').forEach((el) => { el.innerHTML = t(el.dataset.i18nHtml); });
  root.querySelectorAll('[data-i18n-title]').forEach((el) => { el.title = t(el.dataset.i18nTitle); });
}

export { store };
