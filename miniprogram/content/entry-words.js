// Explicit meanings and targets, never automatic links for matching characters.
module.exports = {
  still: [['止', 'order'], ['目标', 'order']],
  order: [['本末', 'still'], ['先后', 'begin']],
  near: [['道', 'begin'], ['日常生活', 'renewal']],
  self: [['己', 'blame'], ['要求自己', 'repair']],
  time: [['逝者', 'renewal'], ['流水', 'renewal']],
  renewal: [['日新', 'repair'], ['更新', 'begin']],
  haste: [['速', 'order'], ['求快', 'finish']],
  heart: [['养其性', 'self'], ['保存本心', 'near']],
  harmony: [['不同', 'respect'], ['不同的看法', 'reciprocity']],
  reciprocity: [['不愿', 'respect'], ['不愿承受', 'harmony']],
  respect: [['敬人', 'reciprocity'], ['尊重', 'harmony']],
  blame: [['责于人', 'reciprocity'], ['反省', 'self']],
  seen: [['知人', 'respect'], ['了解别人', 'harmony']],
  repair: [['改', 'renewal'], ['改正', 'begin']],
  begin: [['不行不至', 'finish'], ['不做', 'order']],
  finish: [['有终', 'begin'], ['坚持', 'haste']],
};
