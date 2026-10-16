const current = [
  ['jp_porcelain', '日瓷'], ['eu_porcelain', '欧瓷'], ['incense', '线香'], ['antique_art', '古美术'],
  ['local_craft', '本地特色'], ['anime_toy', '动漫玩具'], ['otaku_goods', '二次元周边'], ['luxury', '奢侈品'],
  ['vintage_jewelry', '中古首饰'], ['game_console', '游戏机'], ['walkman', '随身听'], ['ccd', 'CCD'],
  ['media_record', '音像制品'], ['playback_device', '播放设备'], ['home_appliance', '家用电器'], ['hobby', '兴趣爱好'], ['other', '其他']
];
const labels = Object.freeze(Object.assign({ porcelain: '瓷器', stationery: '文房四宝', lacquerware: '漆器', bronze: '铜器', woodcraft: '木器', textile: '织物/布艺', jewelry: '首饰/饰品', painting: '书画' },
  current.reduce((all, pair) => Object.assign(all, { [pair[0]]: pair[1] }), {})));
const OPTIONS = Object.freeze([['', '全部分类']].concat(current).map(pair => Object.freeze({ code: pair[0], label: pair[1] })));
const ipValues = {
  jp_porcelain: ['品牌窑口', '工艺技法', '器型用途', '花纹寓意', '年代鉴定', '场景搭配'], eu_porcelain: ['品牌', '工艺', '器型', '花纹', '年代'], incense: ['品牌', '香型', '用途场景'],
  antique_art: ['书画', '漆器', '铜器', '木器', '织物'], local_craft: ['闽南瓷', '茶器', '手作'], anime_toy: ['高达', '圣斗士', '假面骑士', '战队', '怪兽', '食玩'],
  otaku_goods: ['手办', '景品', '徽章', '挂件', '同人'], luxury: ['包袋', '服饰', '配饰', '腕表'], vintage_jewelry: ['项链', '戒指', '胸针', '耳饰', '手链'],
  game_console: ['任天堂', '索尼', '世嘉', '掌机', '卡带'], walkman: ['Walkman 磁带', 'Discman', 'MD', '数码'], ccd: ['索尼', '佳能', '卡西欧', '富士', '奥林巴斯'],
  media_record: ['黑胶', '磁带', 'CD', 'DVD'], playback_device: ['黑胶机', '卡带机', 'CD 机', '收音机'], home_appliance: ['电视', '收音', '厨电', '灯具'], hobby: ['文具', '香水', '烟具', '户外']
};
const allIps = Object.freeze([Object.freeze({ code: '', label: '全部 IP' })]);
const ips = Object.freeze(Object.keys(ipValues).reduce((all, key) => { all[key] = Object.freeze(allIps.concat(ipValues[key].map(value => Object.freeze({ code: value, label: value })))); return all; }, {}));
function ipOptions(category) { return Object.prototype.hasOwnProperty.call(ips, category) ? ips[category] : allIps; }
function label(value) { return typeof value === 'string' ? (Object.prototype.hasOwnProperty.call(labels, value) ? labels[value] : value) : ''; }
function selection(value, options = OPTIONS) {
  if (typeof value !== 'number' && typeof value !== 'string' || !/^(0|[1-9]\d*)$/.test(String(value))) return null;
  return options[Number(value)] || null;
}
module.exports = { OPTIONS, label, selection, ipOptions };
