// server/handlers/index.js — 게임 핸들러 레지스트리
module.exports = new Map([
  ['chess',       require('./chess')],
  ['omok',        require('./omok')],
  ['connect4',    require('./connect4')],
  ['othello',     require('./othello')],
  ['checkers',    require('./checkers')],
  ['indianpoker', require('./indianpoker')],
  ['applegame',   require('./applegame')],
  ['battleship',  require('./battleship')],
  ['backgammon',  require('./backgammon')],
]);
